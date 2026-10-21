"""Finite recurring reservations, using the same prices and holds as checkout."""
import calendar
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import APIException, NotFound

from api.models import RentalRecurrence
from rentals.models import Rentals
from rentals.serializer import validate_operator_assignment
from contracts.models import Contracts
from payments.availability import INTERVALO_DE_LIMPEZA, MINUTOS_DE_RESERVA, tem_conflito
from payments.pricing import cotar
from postings.models import Postings
from users.models import Users
from notifications.events import notify_rental_event


class RecurrenceConflict(APIException):
    status_code = 409
    default_detail = 'O período selecionado não está mais disponível.'
    default_code = 'conflict'


class RecurrencePreviewRequestSerializer(serializers.Serializer):
    first_start_date = serializers.DateField()
    frequency = serializers.ChoiceField(choices=RentalRecurrence.Frequency.choices)
    occurrences = serializers.IntegerField(min_value=2, max_value=12)

    def to_internal_value(self, data):
        if isinstance(data, dict):
            unknown = set(data) - set(self.fields)
            if unknown:
                raise serializers.ValidationError({
                    field: 'Este campo não pode ser definido na recorrência.'
                    for field in sorted(unknown)
                })
        return super().to_internal_value(data)


class RecurrenceCreateRequestSerializer(RecurrencePreviewRequestSerializer):
    idempotency_key = serializers.UUIDField()


def source_for_user(source_id, user):
    # Return 404 for another tenant's rental so it cannot be enumerated.
    source = Rentals.objects.select_related('postings__machinery', 'operator').filter(
        pk=source_id, lessee=user,
    ).first()
    if source is None:
        raise NotFound('Locação não encontrada.')
    return source


def _start_date(first_date, frequency, index):
    if frequency != RentalRecurrence.Frequency.MONTHLY:
        return first_date + timedelta(weeks=index * (2 if frequency == 'biweekly' else 1))
    # Anchor every date to the original day: Jan 31 -> Feb 28 -> Mar 31.
    absolute_month = first_date.year * 12 + first_date.month - 1 + index
    year, month_index = divmod(absolute_month, 12)
    month = month_index + 1
    day = min(first_date.day, calendar.monthrange(year, month)[1])
    return first_date.replace(year=year, month=month, day=day)


def build_preview(source, data, *, lock_operator=False):
    posting = source.postings
    if posting.status != 'active' or posting.machinery.status != 'active':
        raise serializers.ValidationError({'detail': 'O anúncio e a máquina precisam estar ativos.'})
    source.operator = validate_operator_assignment(source.operator, source.lessee, lock=lock_operator)
    if data['first_start_date'] <= timezone.localdate():
        raise serializers.ValidationError({'first_start_date': 'Escolha uma data futura.'})
    duration = source.end_date - source.start_date
    if duration < timedelta(0):
        raise serializers.ValidationError({'detail': 'A locação original possui um período inválido.'})

    source_start = timezone.localtime(source.start_date)
    dates = []
    for index in range(data['occurrences']):
        try:
            day = _start_date(data['first_start_date'], data['frequency'], index)
            start = datetime.combine(day, source_start.timetz())
            end = start + duration
            # Availability includes the turnaround day on either side.
            start - INTERVALO_DE_LIMPEZA
            end + INTERVALO_DE_LIMPEZA
        except (OverflowError, ValueError):
            raise serializers.ValidationError({'first_start_date': 'O calendário excede o limite de datas.'})

        days = (end.date() - start.date()).days + 1
        if posting.max_reservation_days and days > posting.max_reservation_days:
            raise serializers.ValidationError({
                'detail': f'Este anúncio permite reservas de no máximo {posting.max_reservation_days} dias.',
            })
        if (posting.availability_start and start < posting.availability_start) or (
            posting.availability_end and end > posting.availability_end
        ):
            raise RecurrenceConflict({'detail': 'Uma ocorrência está fora da disponibilidade do anúncio.',
                                      'occurrence': index + 1, 'start_date': str(day)})
        if dates and start <= dates[-1]['end_date'] + INTERVALO_DE_LIMPEZA:
            raise serializers.ValidationError({
                'frequency': 'As ocorrências se sobrepõem ou não respeitam o intervalo de limpeza de um dia.',
            })
        if tem_conflito(posting.pk, start, end):
            raise RecurrenceConflict({
                'detail': 'Uma ocorrência conflita com uma reserva ou com o intervalo de limpeza da máquina.',
                'occurrence': index + 1, 'start_date': str(day),
            })
        quote = cotar(posting, start, end)
        if quote.total <= 0 or quote.total > Decimal('99999999.99'):
            raise serializers.ValidationError({'detail': 'O anúncio precisa ter um preço válido para a reserva.'})
        dates.append({'start_date': start, 'end_date': end, 'total_price': quote.total, 'quote': quote})
    return {
        'source_rental': source.pk,
        'frequency': data['frequency'],
        'occurrences': data['occurrences'],
        'total_price': sum((row['total_price'] for row in dates), Decimal('0.00')),
        'dates': dates,
    }


def preview_response(preview):
    return {
        **preview,
        'total_price': str(preview['total_price']),
        'dates': [
            {'start_date': row['start_date'], 'end_date': row['end_date'], 'total_price': str(row['total_price'])}
            for row in preview['dates']
        ],
    }


@transaction.atomic
def create_recurrence(source_id, user, data):
    # Serialize keys for this tenant even when simultaneous requests use two
    # different source postings; the database constraint is a final safeguard.
    Users.objects.select_for_update(no_key=True).get(pk=user.pk)
    source = source_for_user(source_id, user)
    existing = RentalRecurrence.objects.filter(
        lessee=user, idempotency_key=data['idempotency_key'],
    ).first()
    if existing:
        if (existing.source_rental_id != source.pk
                or existing.first_start_date != data['first_start_date']
                or existing.frequency != data['frequency']
                or existing.occurrences != data['occurrences']):
            raise RecurrenceConflict('Esta chave já foi usada para uma programação diferente.')
        return existing

    # Single reservations and series lock this same row before their final
    # availability check, closing the check-then-insert race on PostgreSQL.
    posting = Postings.objects.select_for_update().select_related('machinery').get(pk=source.postings_id)
    source.postings = posting
    preview = build_preview(source, data, lock_operator=True)
    series = RentalRecurrence.objects.create(
        source_rental=source, lessee=user,
        first_start_date=data['first_start_date'], frequency=data['frequency'],
        occurrences=data['occurrences'], idempotency_key=data['idempotency_key'],
        total_price=preview['total_price'],
    )
    now = timezone.now()
    for index, row in enumerate(preview['dates'], start=1):
        rental = Rentals.objects.create(
            id=uuid.uuid4(), postings=posting, lessee=user, operator=source.operator,
            recurrence=series, recurrence_index=index,
            status='pending', created_at=now, updated_at=now,
            reservation_expires_at=now + timedelta(minutes=MINUTOS_DE_RESERVA),
            start_date=row['start_date'], end_date=row['end_date'],
            # Each occurrence keeps its own frozen quote, like a single booking.
            **row['quote'].snapshot(),
        )
        contract = Contracts.objects.create(
            id=uuid.uuid4(), rental=rental, accepted_by_lessor=False,
            accepted_by_lessee=False, status='pending_signatures', created_at=now,
        )
        notify_rental_event(rental, 'recurrence_created', event_key=f'rental:{rental.pk}:created', contract=contract)
    return series


def series_response(series):
    from rentals.serializer import RentalOutputSerializer

    rentals = series.rentals.select_related('lessee', 'postings__machinery__owner', 'contracts').order_by('recurrence_index')
    return {
        'id': series.pk,
        'source_rental': series.source_rental_id,
        'first_start_date': series.first_start_date,
        'frequency': series.frequency,
        'occurrences': series.occurrences,
        'total_price': str(series.total_price),
        'reservation_expires_at': series.created_at + timedelta(minutes=MINUTOS_DE_RESERVA),
        'rentals': RentalOutputSerializer(rentals, many=True).data,
    }
