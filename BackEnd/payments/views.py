import logging
from datetime import datetime, timedelta, timezone as datetime_timezone
from decimal import Decimal

import stripe
from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.models import Rentals
from api.schemas import ErrorResponseSerializer
from postings.models import Postings

from .availability import MINUTOS_DE_RESERVA, periodos_ocupados, tem_conflito
from .models import Payments
from .pricing import calcular_total

RENTAL_NOT_FOUND = OpenApiResponse(description='Locação não encontrada.')
DATE_CONFLICT = OpenApiResponse(
    response=ErrorResponseSerializer,
    description='O período escolhido já está reservado.',
)
logger = logging.getLogger(__name__)


def _stripe():
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


@extend_schema(
    tags=['Pagamentos'],
    summary='Iniciar pagamento de uma locação',
    description=(
        'Confere se o período continua livre, recalcula o valor no servidor a partir '
        'da diária do anúncio e devolve a URL da página de pagamento do Stripe.'
    ),
    request=None,
    responses={
        200: OpenApiResponse(description='URL da sessão de pagamento.'),
        404: RENTAL_NOT_FOUND,
        409: DATE_CONFLICT,
        502: OpenApiResponse(description='Falha na comunicação com o provedor.'),
    },
)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def criar_checkout(request, pk):
    try:
        reference = Rentals.objects.get(pk=pk, lessee=request.user)
    except (Rentals.DoesNotExist, ValueError):
        return Response(status=status.HTTP_404_NOT_FOUND)

    # All booking paths lock the posting before checking/reserving its dates.
    posting = Postings.objects.select_for_update().select_related('machinery').get(pk=reference.postings_id)
    rental = Rentals.objects.select_for_update().get(pk=pk)
    rental.postings = posting
    if rental.status not in ('pending', 'awaiting_payment'):
        return Response({'detail': 'Esta reserva não está aguardando pagamento.'}, status=409)
    if rental.payments.filter(status__in=('approved', 'requires_review')).exists():
        return Response({'detail': 'Esta reserva já possui um pagamento recebido ou em análise.'}, status=409)
    if posting.status != 'active' or posting.machinery.status != 'active' or rental.start_date <= timezone.now():
        return Response({'detail': 'Esta reserva não está mais disponível para pagamento.'}, status=409)
    days = (rental.end_date.date() - rental.start_date.date()).days + 1
    if rental.end_date < rental.start_date or (
        posting.max_reservation_days and days > posting.max_reservation_days
    ) or (posting.availability_start and rental.start_date < posting.availability_start) or (
        posting.availability_end and rental.end_date > posting.availability_end
    ):
        return Response({'detail': 'O período não atende mais à disponibilidade do anúncio.'}, status=409)

    if tem_conflito(
        rental.postings_id, rental.start_date, rental.end_date, ignorar=rental.id
    ):
        return Response(
            {'detail': 'O período escolhido já está reservado.'},
            status=status.HTTP_409_CONFLICT,
        )

    total = calcular_total(rental)
    if not total.is_finite() or total <= 0 or total > Decimal('99999999.99'):
        return Response(
            {'detail': 'Não foi possível calcular o valor da locação.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    maquina = rental.postings.machinery
    descricao = ' '.join(
        filter(None, [getattr(maquina, 'brand', None), getattr(maquina, 'model', None)])
    ) or 'Maquinário'

    try:
        # Retry/double-click reuses an open checkout instead of charging twice.
        previous = Payments.objects.filter(rental=rental, status='pending').order_by('-created_at').first()
        if previous:
            existing = _stripe().checkout.Session.retrieve(previous.session_id)
            if existing.status == 'open':
                rental.status = 'awaiting_payment'
                rental.total_price = previous.amount
                rental.reservation_expires_at = datetime.fromtimestamp(existing.expires_at, datetime_timezone.utc)
                rental.updated_at = timezone.now()
                rental.save(update_fields=['status', 'total_price', 'reservation_expires_at', 'updated_at'])
                return Response({'url': existing.url, 'amount': str(previous.amount)})
            if existing.status == 'complete':
                return Response({'detail': 'O pagamento já foi enviado. Aguarde a confirmação.'}, status=409)
            previous.status = 'expired'
            previous.save(update_fields=['status', 'updated_at'])

        # Stripe's minimum expiry is 30 minutes from request processing. A small
        # margin avoids a session being rejected due to transit time.
        expires_at = int((timezone.now() + timedelta(minutes=MINUTOS_DE_RESERVA, seconds=60)).timestamp())
        sessao = _stripe().checkout.Session.create(
            mode='payment',
            expires_at=expires_at,
            line_items=[
                {
                    'price_data': {
                        'currency': 'brl',
                        'unit_amount': int(total * 100),
                        'product_data': {'name': f'Locação — {descricao}'},
                    },
                    'quantity': 1,
                }
            ],
            success_url=(
                f'{settings.FRONTEND_URL}/reservar/{rental.postings_id}'
                f'?locacao={rental.id}&pagamento=sucesso'
            ),
            cancel_url=(
                f'{settings.FRONTEND_URL}/reservar/{rental.postings_id}'
                f'?locacao={rental.id}&pagamento=cancelado'
            ),
            metadata={'rental_id': str(rental.id)},
        )
    except stripe.StripeError:
        return Response(
            {'detail': 'Não foi possível iniciar o pagamento.'},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    Payments.objects.create(rental=rental, session_id=sessao.id, amount=total)
    rental.total_price = total
    rental.status = 'awaiting_payment'
    rental.reservation_expires_at = datetime.fromtimestamp(sessao.expires_at, datetime_timezone.utc)
    rental.updated_at = timezone.now()
    rental.save(update_fields=['total_price', 'status', 'reservation_expires_at', 'updated_at'])

    return Response({'url': sessao.url, 'amount': str(total)}, status=status.HTTP_200_OK)


@extend_schema(
    tags=['Pagamentos'],
    summary='Consultar o pagamento de uma locação',
    responses={200: OpenApiResponse(description='Situação do pagamento.'), 404: RENTAL_NOT_FOUND},
)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def status_pagamento(request, pk):
    pagamento = (
        Payments.objects.filter(rental_id=pk, rental__lessee=request.user).order_by('-created_at').first()
    )
    if not pagamento:
        return Response(status=status.HTTP_404_NOT_FOUND)
    return Response(
        {
            'status': pagamento.status,
            'amount': str(pagamento.amount),
            'rental_status': pagamento.rental.status,
        },
        status=status.HTTP_200_OK,
    )


@extend_schema(
    tags=['Anúncios'],
    summary='Períodos já reservados de um anúncio',
    responses={200: OpenApiResponse(description='Lista de períodos indisponíveis.')},
)
@api_view(['GET'])
def ocupacao(request, pk):
    return Response({'ocupados': periodos_ocupados(pk)}, status=status.HTTP_200_OK)


@transaction.atomic
def _aprovar(session_id):
    pagamento = (
        Payments.objects.select_related('rental').filter(session_id=session_id).first()
    )
    if not pagamento:
        return
    Postings.objects.select_for_update().select_related('machinery').get(pk=pagamento.rental.postings_id)
    rental = Rentals.objects.select_for_update().get(pk=pagamento.rental_id)
    pagamento = Payments.objects.select_for_update().get(pk=pagamento.pk)
    if pagamento.status in ('approved', 'requires_review'):
        return
    # A delayed webhook cannot take dates already reserved by somebody else.
    if rental.status not in ('pending', 'awaiting_payment') or tem_conflito(
        rental.postings_id, rental.start_date, rental.end_date, ignorar=rental.id,
    ):
        pagamento.status = 'requires_review'
        pagamento.save(update_fields=['status', 'updated_at'])
        logger.error('Pagamento %s precisa de revisão: reserva indisponível.', pagamento.id)
        return
    pagamento.status = 'approved'
    pagamento.save(update_fields=['status', 'updated_at'])
    rental.status = 'active'
    rental.updated_at = timezone.now()
    rental.save(update_fields=['status', 'updated_at'])


@transaction.atomic
def _expirar(session_id):
    pagamento = (
        Payments.objects.select_related('rental').filter(session_id=session_id).first()
    )
    if not pagamento:
        return
    Postings.objects.select_for_update().select_related('machinery').get(pk=pagamento.rental.postings_id)
    rental = Rentals.objects.select_for_update().get(pk=pagamento.rental_id)
    pagamento = Payments.objects.select_for_update().get(pk=pagamento.pk)
    if pagamento.status != 'pending':
        return
    pagamento.status = 'expired'
    pagamento.save(update_fields=['status', 'updated_at'])
    if rental.status == 'awaiting_payment' and not rental.payments.filter(status='pending').exists():
        rental.status = 'cancelled'
        rental.updated_at = timezone.now()
        rental.save(update_fields=['status', 'updated_at'])


@csrf_exempt
def webhook(request):
    if request.method != 'POST':
        return HttpResponse(status=405)

    assinatura = request.headers.get('Stripe-Signature', '')
    if not settings.STRIPE_WEBHOOK_SECRET:
        return HttpResponse(status=503)

    try:
        evento = _stripe().Webhook.construct_event(
            request.body, assinatura, settings.STRIPE_WEBHOOK_SECRET
        )
    except (ValueError, stripe.SignatureVerificationError):
        return HttpResponse(status=400)

    tipo = evento['type']
    if tipo not in (
        'checkout.session.completed', 'checkout.session.async_payment_succeeded',
        'checkout.session.expired', 'checkout.session.async_payment_failed',
    ):
        return HttpResponse(status=200)

    try:
        sessao = evento['data']['object']
        session_id = sessao['id']
    except (KeyError, TypeError):
        return HttpResponse(status=200)

    if tipo in ('checkout.session.completed', 'checkout.session.async_payment_succeeded'):
        # Delayed payment methods may complete checkout before collecting money.
        if sessao.get('payment_status') == 'paid':
            _aprovar(session_id)
    else:
        _expirar(session_id)

    return HttpResponse(status=200)
