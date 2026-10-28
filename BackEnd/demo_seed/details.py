"""Rich seed records, with local assets and no payment/signature provider calls."""

from datetime import timedelta

from django.db.models import Q

from chat.models import Messages
from contracts.models import Contracts
from machines.models import Machines
from payments.pricing import cotar
from postings.models import Postings, PostingsPhotos
from rentals import lifecycle
from rentals.models import RentalMeterReadings, Rentals
from reviews.models import Reviews
from users.models import Users

from . import catalog


def available_window(posting, start, days, now, finished, planned):
    """Find a slot without moving or overlapping any existing reservation."""
    occupied = list(Rentals.objects.filter(postings_id=posting['id']).filter(
        Q(status__in=lifecycle.OCCUPYING)
        | Q(status__in=lifecycle.PROVISIONAL, reservation_expires_at__gt=now)
    ).values_list('start_date', 'end_date'))
    occupied += planned.get(posting['id'], [])
    days = min(days, posting.get('max_reservation_days') or days)
    for _ in range(100):
        end = start + timedelta(days=days - 1, hours=9)
        in_range = ((not posting['availability_start'] or start >= posting['availability_start'])
                    and (not posting['availability_end'] or end <= posting['availability_end']))
        chronological = end < now if finished else start > now
        if in_range and chronological and not any(a <= end and b >= start for a, b in occupied):
            planned.setdefault(posting['id'], []).append((start, end))
            return start, end
        start += timedelta(days=-1 if finished else 1)
    raise ValueError('Sem janela livre para a locação de demonstração; revise a disponibilidade do anúncio.')


def expand_plan(plan, seed_id, machines, now, asset_base_url):
    day = now.replace(hour=8, minute=0, second=0, microsecond=0)
    legacy = {(model, pk): dict(defaults) for model, pk, defaults in plan}
    by_key = {(model, pk): defaults for model, pk, defaults in plan}
    for i, (slug, address, city, state, cep) in enumerate(catalog.PROFILES):
        user = by_key.get((Users, seed_id('user', i)))
        if user is not None:
            user.update(profile_photo=f'{asset_base_url}/profiles/{slug}.png',
                        address=address, city=city, state=state, cep=cep)

    galleries = catalog.photos()
    for i, machine in enumerate(machines):
        machine_pk, posting_pk = seed_id('machine', i), seed_id('posting', i)
        machine_data = by_key[(Machines, machine_pk)]
        posting = by_key[(Postings, posting_pk)]
        machine_data['technical_specifications'] = catalog.specifications(i, machine)
        posting['description'] = catalog.description(i, machine, posting['location_address'], asset_base_url)
        stored_machine = Machines.objects.filter(pk=machine_pk).first()
        if stored_machine and (stored_machine.brand, stored_machine.model) != machine[:2]:
            continue  # A renamed machine must not acquire photos of its original demo model.
        has_photos = PostingsPhotos.objects.filter(postings_id=posting_pk).exists()
        for j, photo in enumerate(galleries[str(i)]):
            plan.append((PostingsPhotos, seed_id('photo', f'{i}:{j}'), {
                'postings_id': posting_pk, 'image_url': f"{asset_base_url}/{photo['file']}",
                'is_primary': j == 0 and not has_photos, 'created_at': now,
            }))

    for i in range(8):
        by_key[(Rentals, seed_id('rental', i))]['notes'] = catalog.rental_notes(i, i)

    planned = {}
    for model, _, row in plan:
        if model is Rentals and row['status'] in (*lifecycle.OCCUPYING, *lifecycle.PROVISIONAL):
            planned.setdefault(row['postings_id'], []).append((row['start_date'], row['end_date']))

    def add(model, identity_kind, index, **defaults):
        pk = seed_id(identity_kind, index)
        plan.append((model, pk, defaults))
        return pk

    for i in range(24):
        finished, cancelled = i < 12, i >= 20
        machine_index = 8 + i if finished else i - 12 if not cancelled else i - 4
        posting_pk = seed_id('posting', machine_index)
        posting = {'id': posting_pk, **by_key[(Postings, posting_pk)]}
        stored_posting = Postings.objects.filter(pk=posting_pk).values().first()
        if stored_posting:
            posting.update(stored_posting)
        owner_id = seed_id('user', 0 if machine_index % 2 == 0 else 3)
        stored_machine = Machines.objects.filter(pk=posting['machinery_id']).first()
        if stored_machine and stored_machine.owner_id != owner_id:
            raise ValueError('Uma máquina de demonstração mudou de proprietário; novas locações não foram criadas.')
        renter_id, operator_id = (seed_id('user', 1), seed_id('user', 2)) if i % 2 == 0 else (seed_id('user', 4), seed_id('user', 5))
        offset = (-75, -60, -45, -30, -15, -4)[i // 2] if finished else 60 + (i - 12) * 5 if not cancelled else 7 + i
        start = day + timedelta(days=offset)
        previous = Rentals.objects.filter(pk=seed_id('detailed-rental', i)).first()
        if previous:
            start, end = previous.start_date, previous.end_date
        elif cancelled:
            end = start + timedelta(days=1, hours=9)
        else:
            start, end = available_window(posting, start, 2 + i % 3, now, finished, planned)
        quote = cotar(Postings(hourly_rate=posting['hourly_rate']), start, end)
        created = start - timedelta(days=5) if finished else now - timedelta(days=3)
        meter = stored_machine.hour_meter if stored_machine else by_key[(Machines, seed_id('machine', machine_index))]['hour_meter']
        final_meter = max(100, (meter or 1000) - 10)
        initial_meter = max(0, final_meter - quote.diarias * 7 - i % 3)
        status = 'completed' if finished else 'cancelled' if cancelled else 'pending'
        rental_id = add(Rentals, 'detailed-rental', i, postings_id=posting_pk,
            lessee_id=renter_id, operator_id=operator_id, start_date=start, end_date=end,
            **quote.snapshot(), status=status, notes=catalog.rental_notes(i, machine_index),
            initial_hour_meter=initial_meter if finished else None,
            final_hour_meter=final_meter if finished else None,
            reservation_expires_at=now + timedelta(minutes=30) if status == 'pending' else None,
            cancelled_at=created + timedelta(hours=12) if cancelled else None,
            cancelled_by_id=renter_id if cancelled else None,
            cancellation_reason=f'DEMONSTRAÇÃO — {catalog.CANCELLATIONS[i - 20]}' if cancelled else '',
            created_at=created, updated_at=end if finished else now)
        if not finished:
            add(Contracts, 'detailed-contract', i, rental_id=rental_id,
                document_url=None, accepted_by_lessor=False, accepted_by_lessee=False,
                status='cancelled' if cancelled else 'pending_signatures', created_at=created)
        else:
            for kind, value, recorded in (('check_in', initial_meter, start), ('check_out', final_meter, end)):
                add(RentalMeterReadings, 'detailed-meter', f'{i}:{kind}', rental_id=rental_id,
                    kind=kind, value=value, recorded_by_id=owner_id, recorded_at=recorded,
                    note=f'DEMONSTRAÇÃO — conferência conjunta na {"retirada" if kind == "check_in" else "devolução"}; sem alteração da diária.')
            comments = (
                'Equipamento limpo e conferido na retirada. O operador conseguiu cumprir o planejamento do talhão; comunicação clara sobre transporte e combustível.',
                'Atendimento pontual e instruções de operação completas. Combinamos a janela de trabalho pelo chat e registramos as leituras na devolução.',
                'Máquina atendeu ao serviço previsto. Houve ajuste no horário de transporte, resolvido antes da retirada, sem comprometer a operação.',
            )
            for side, reviewer, reviewee in (('tenant', renter_id, owner_id), ('owner', owner_id, renter_id)):
                add(Reviews, 'detailed-review', f'{i}:{side}', rental_id=rental_id,
                    reviewer_id=reviewer, reviewee_id=reviewee, rating=(4, 5, 5)[i % 3],
                    comment='DEMONSTRAÇÃO — ' + (comments[i % 3] if side == 'tenant' else
                        'Produtor apresentou o acesso e o plano de trabalho com antecedência. Devolução limpa, comunicação ágil e conferência do horímetro sem divergências.'),
                    created_at=end + timedelta(hours=2 if side == 'tenant' else 3))
        messages = (
            (renter_id, owner_id, f'Olá! Planejamos {catalog.EQUIPMENT[machine_index][0].lower()} em {18 + i * 3} hectares. Podemos combinar o acesso e a retirada às 08h?'),
            (owner_id, renter_id, 'Podemos alinhar pelo chat. O acesso precisa receber a prancha. Vamos conferir níveis, pneus, acessórios e horímetro juntos antes da saída.'),
            (renter_id, owner_id, 'Combinado. O operador acompanhará a conferência; enviarei o ponto de descarga e confirmarei combustível e transporte antes da retirada.'),
            (owner_id, renter_id, 'Devolução conferida e equipamento limpo. Obrigado pela parceria!' if finished else
                catalog.CANCELLATIONS[i - 20] if cancelled else 'A reserva está pendente. Confira a cotação e as datas no aplicativo antes de seguir com o pagamento de teste.'),
        )
        for j, (sender, receiver, content) in enumerate(messages):
            sent = end + timedelta(minutes=20) if finished and j == 3 else created + timedelta(minutes=15 * j)
            add(Messages, 'detailed-message', f'{i}:{j}', rental_id=rental_id,
                sender_id=sender, receiver_id=receiver, content=f'DEMONSTRAÇÃO — {content}',
                sent_at=sent, flagged_for_moderation=False)
    return plan, legacy


def safe_enrichment(model, record, defaults, legacy):
    """Only fill empty or exact legacy demo text; never alter auth or business state."""
    allowed = {
        Users: ('profile_photo', 'address', 'city', 'state', 'cep'),
        Machines: ('technical_specifications',),
        Postings: ('description',),
        Rentals: ('notes',),
    }
    changes = {}
    for field in allowed.get(model, ()):
        if field not in defaults:
            continue
        current, wanted = getattr(record, field), defaults[field]
        if current != wanted and (current in (None, '') or (field in legacy and current == legacy[field])):
            changes[field] = wanted
    return changes
