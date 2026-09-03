import stripe
from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from api.models import Rentals
from api.schemas import ErrorResponseSerializer

from .availability import periodos_ocupados, tem_conflito
from .models import Payments
from .pricing import calcular_total

RENTAL_NOT_FOUND = OpenApiResponse(description='Locação não encontrada.')
DATE_CONFLICT = OpenApiResponse(
    response=ErrorResponseSerializer,
    description='O período escolhido já está reservado.',
)


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
def criar_checkout(request, pk):
    try:
        rental = Rentals.objects.select_related('postings__machinery').get(pk=pk)
    except (Rentals.DoesNotExist, ValueError):
        return Response(status=status.HTTP_404_NOT_FOUND)

    if tem_conflito(
        rental.postings_id, rental.start_date, rental.end_date, ignorar=rental.id
    ):
        return Response(
            {'detail': 'O período escolhido já está reservado.'},
            status=status.HTTP_409_CONFLICT,
        )

    total = calcular_total(rental)
    if total <= 0:
        return Response(
            {'detail': 'Não foi possível calcular o valor da locação.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    maquina = rental.postings.machinery
    descricao = ' '.join(
        filter(None, [getattr(maquina, 'brand', None), getattr(maquina, 'model', None)])
    ) or 'Maquinário'

    try:
        sessao = _stripe().checkout.Session.create(
            mode='payment',
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

    with transaction.atomic():
        Payments.objects.create(
            rental=rental, session_id=sessao.id, amount=total
        )
        rental.total_price = total
        rental.status = 'awaiting_payment'
        rental.save(update_fields=['total_price', 'status'])

    return Response({'url': sessao.url, 'amount': str(total)}, status=status.HTTP_200_OK)


@extend_schema(
    tags=['Pagamentos'],
    summary='Consultar o pagamento de uma locação',
    responses={200: OpenApiResponse(description='Situação do pagamento.'), 404: RENTAL_NOT_FOUND},
)
@api_view(['GET'])
def status_pagamento(request, pk):
    pagamento = (
        Payments.objects.filter(rental_id=pk).order_by('-created_at').first()
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


def _aprovar(session_id):
    pagamento = (
        Payments.objects.select_related('rental').filter(session_id=session_id).first()
    )
    if not pagamento or pagamento.status == 'approved':
        return
    with transaction.atomic():
        pagamento.status = 'approved'
        pagamento.save(update_fields=['status', 'updated_at'])
        rental = pagamento.rental
        rental.status = 'active'
        rental.save(update_fields=['status'])


def _expirar(session_id):
    pagamento = (
        Payments.objects.select_related('rental').filter(session_id=session_id).first()
    )
    if not pagamento or pagamento.status != 'pending':
        return
    with transaction.atomic():
        pagamento.status = 'expired'
        pagamento.save(update_fields=['status', 'updated_at'])
        rental = pagamento.rental
        if rental.status == 'awaiting_payment':
            rental.status = 'cancelled'
            rental.save(update_fields=['status'])


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
    if tipo not in ('checkout.session.completed', 'checkout.session.expired'):
        return HttpResponse(status=200)

    try:
        session_id = evento['data']['object']['id']
    except (KeyError, TypeError):
        return HttpResponse(status=200)

    if tipo == 'checkout.session.completed':
        _aprovar(session_id)
    else:
        _expirar(session_id)

    return HttpResponse(status=200)
