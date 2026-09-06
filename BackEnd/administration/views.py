from django.utils import timezone
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from api.models import Rentals
from contracts.models import Contracts
from api.schemas import ErrorResponseSerializer, MessageResponseSerializer
from machines.models import Machines
from postings.models import Postings
from users.models import Users
from .models import PostingModeration
from .serializer import PostingRejectionSerializer

USER_NOT_FOUND = OpenApiResponse(description='Usuário não encontrado.')
POSTING_NOT_FOUND = OpenApiResponse(description='Anúncio não encontrado.')


def _moderator(request):
    """Retorna o usuário autenticado (moderador) ou None se anônimo."""
    user = getattr(request, "user", None)
    return user if getattr(user, "is_authenticated", False) else None


@extend_schema(
    tags=['Administração'],
    summary='Advertir usuário',
    description=(
        'Marca o usuário com o status `warned`. Serve como aviso formal antes de medidas '
        'mais severas e não altera anúncios ou locações em andamento.'
    ),
    request=None,
    responses={
        200: MessageResponseSerializer,
        400: OpenApiResponse(
            response=ErrorResponseSerializer,
            description='Usuário já está suspenso ou banido.',
        ),
        404: USER_NOT_FOUND,
    },
    examples=[
        OpenApiExample(
            'Advertência aplicada',
            value={'message': 'Advertência aplicada ao usuário João Silva.'},
            response_only=True,
        )
    ],
)
@api_view(['PUT'])
def warn_user(request, pk):
    try:
        user = Users.objects.get(pk=pk)
    except Users.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if user.status in ('suspended', 'banned'):
        return Response({'error': f'Usuário já está {user.status}.'}, status=status.HTTP_400_BAD_REQUEST)

    user.status = 'warned'
    user.save()
    return Response({'message': f'Advertência aplicada ao usuário {user.name}.'}, status=status.HTTP_200_OK)


@extend_schema(
    tags=['Administração'],
    summary='Suspender usuário',
    description=(
        'Suspende a conta e propaga o efeito na operação: os anúncios ativos do usuário passam '
        'a `suspended` e as locações em que ele é locatário com status `pending` são canceladas.'
    ),
    request=None,
    responses={
        200: MessageResponseSerializer,
        400: OpenApiResponse(
            response=ErrorResponseSerializer,
            description='Usuário já está banido.',
        ),
        404: USER_NOT_FOUND,
    },
)
@api_view(['PUT'])
def suspend_user(request, pk):
    try:
        user = Users.objects.get(pk=pk)
    except Users.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if user.status == 'banned':
        return Response({'error': 'Usuário já está banido.'}, status=status.HTTP_400_BAD_REQUEST)

    user.status = 'suspended'
    user.save()

    machine_ids = Machines.objects.filter(owner=user).values_list('id', flat=True)
    Postings.objects.filter(machinery_id__in=machine_ids, status='active').update(status='suspended')
    Rentals.objects.filter(lessee=user, status='pending').update(status='cancelled')

    return Response({'message': f'Usuário {user.name} suspenso.'}, status=status.HTTP_200_OK)


@extend_schema(
    tags=['Administração'],
    summary='Banir usuário',
    description=(
        'Bane a conta permanentemente. Todos os anúncios do usuário são inativados, as locações '
        '`pending` e `active` são canceladas e os contratos ainda pendentes de assinatura '
        'também passam a `cancelled`.'
    ),
    request=None,
    responses={
        200: MessageResponseSerializer,
        404: USER_NOT_FOUND,
    },
)
@api_view(['PUT'])
def ban_user(request, pk):
    try:
        user = Users.objects.get(pk=pk)
    except Users.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    user.status = 'banned'
    user.save()

    machine_ids = Machines.objects.filter(owner=user).values_list('id', flat=True)
    Postings.objects.filter(machinery_id__in=machine_ids).exclude(status='inactive').update(status='inactive')
    rental_ids = Rentals.objects.filter(lessee=user, status__in=['pending', 'active']).values_list('id', flat=True)
    Rentals.objects.filter(id__in=rental_ids).update(status='cancelled')
    Contracts.objects.filter(rental_id__in=rental_ids, status='pending_signatures').update(status='cancelled')

    return Response({'message': f'Usuário {user.name} banido permanentemente.'}, status=status.HTTP_200_OK)


# ── Moderação de Anúncios (RF17) ────────────────────────────────────────────
@extend_schema(
    tags=['Administração'],
    summary='Aprovar anúncio',
    description=(
        'Aprova o anúncio na moderação (RF17), deixando-o com status `active`, e registra a '
        'decisão no histórico de moderação junto com o administrador responsável.'
    ),
    request=None,
    responses={
        200: MessageResponseSerializer,
        404: POSTING_NOT_FOUND,
    },
)
@api_view(['PUT'])
def approve_posting(request, pk):
    try:
        posting = Postings.objects.get(pk=pk)
    except Postings.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    posting.status = 'active'
    posting.updated_at = timezone.now()
    posting.save()

    PostingModeration.objects.create(
        posting=posting,
        moderator=_moderator(request),
        action=PostingModeration.ACTION_APPROVED,
    )
    return Response({'message': 'Anúncio aprovado e mantido ativo.'}, status=status.HTTP_200_OK)


@extend_schema(
    tags=['Administração'],
    summary='Reprovar anúncio',
    description=(
        'Reprova o anúncio na moderação (RF17). O motivo é obrigatório, fica gravado no '
        'histórico de moderação e o anúncio passa a ter status `rejected`.'
    ),
    request=PostingRejectionSerializer,
    responses={
        200: MessageResponseSerializer,
        400: OpenApiResponse(
            response=ErrorResponseSerializer,
            description='Motivo da reprovação não informado.',
        ),
        404: POSTING_NOT_FOUND,
    },
    examples=[
        OpenApiExample(
            'Reprovação por foto inválida',
            value={'reason': 'As fotos enviadas não mostram o maquinário anunciado.'},
            request_only=True,
        )
    ],
)
@api_view(['PUT'])
def reject_posting(request, pk):
    reason = (request.data.get('reason') or '').strip()
    if not reason:
        return Response(
            {'error': 'Informe o motivo da reprovação.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        posting = Postings.objects.get(pk=pk)
    except Postings.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    posting.status = 'rejected'
    posting.updated_at = timezone.now()
    posting.save()

    PostingModeration.objects.create(
        posting=posting,
        moderator=_moderator(request),
        action=PostingModeration.ACTION_REJECTED,
        reason=reason,
    )
    return Response({'message': 'Anúncio reprovado.'}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Moderação de mensagens do chat
# ---------------------------------------------------------------------------

from rest_framework.decorators import permission_classes  # noqa: E402
from rest_framework.permissions import IsAuthenticated  # noqa: E402

from chat.models import MessageReports, Messages  # noqa: E402
from chat.serializer import serialize_message, serialize_user  # noqa: E402
from chat.services import fan_out_hidden  # noqa: E402
from chat.threads import format_thread_id  # noqa: E402
from .permissions import IsPlatformAdmin  # noqa: E402
from .serializer import MessageModerationDecisionSerializer  # noqa: E402


def _message_thread_id(message):
    scope = 'rental' if message.rental_id else 'posting'
    scope_id = message.rental_id or message.posting_id
    return format_thread_id(scope, scope_id, message.sender_id, message.receiver_id)


@extend_schema(
    tags=['Administração'],
    summary='Fila de moderação de mensagens',
    description='Mensagens denunciadas por usuários ou sinalizadas por palavra bloqueada.',
    responses={200: OpenApiResponse(description='Fila de moderação.')},
)
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def chat_moderation_queue(request):
    status_filter = request.query_params.get('status', 'pending')
    source = request.query_params.get('source', 'all')
    limit = min(int(request.query_params.get('limit', 25) or 25), 100)
    offset = max(int(request.query_params.get('offset', 0) or 0), 0)

    qs = Messages.objects.filter(flagged_for_moderation=True)
    if status_filter == 'pending':
        qs = qs.filter(hidden_at__isnull=True, reports__resolution__isnull=True).distinct()
    elif status_filter == 'resolved':
        qs = qs.filter(hidden_at__isnull=False).distinct()

    if source == 'report':
        qs = qs.filter(reports__isnull=False).distinct()
    elif source == 'auto':
        qs = qs.filter(reports__isnull=True)

    total = qs.count()
    rows = qs.select_related('sender', 'receiver').order_by('-sent_at')[offset:offset + limit]

    results = []
    for message in rows:
        reports = list(message.reports.select_related('reported_by', 'resolved_by'))
        payload = serialize_message(message, thread_id=_message_thread_id(message),
                                    reveal_hidden=True)
        results.append({
            'message_id': payload['id'],
            'thread_id': payload['thread_id'],
            'content': payload['content'],
            'sent_at': payload['sent_at'],
            'hidden': payload['hidden'],
            'sender': serialize_user(message.sender),
            'receiver': serialize_user(message.receiver),
            'source': 'report' if reports else 'auto',
            'reports': [{
                'id': str(r.id),
                'reason': r.reason,
                'reported_by': serialize_user(r.reported_by),
                'created_at': r.created_at.isoformat().replace('+00:00', 'Z'),
                'resolution': r.resolution,
                'resolved_at': r.resolved_at.isoformat().replace('+00:00', 'Z') if r.resolved_at else None,
                'resolved_by': serialize_user(r.resolved_by),
            } for r in reports],
        })

    return Response({'count': total, 'limit': limit, 'offset': offset, 'results': results})


@extend_schema(
    tags=['Administração'],
    summary='Decide sobre uma mensagem denunciada',
    request=MessageModerationDecisionSerializer,
    responses={200: MessageResponseSerializer, 400: ErrorResponseSerializer},
)
@api_view(['PUT'])
@permission_classes([IsAuthenticated, IsPlatformAdmin])
def chat_moderation_resolve(request, pk):
    body = MessageModerationDecisionSerializer(data=request.data)
    if not body.is_valid():
        return Response({'error': 'Decisão inválida.'}, status=status.HTTP_400_BAD_REQUEST)

    message = Messages.objects.filter(id=pk).first()
    if message is None:
        return Response({'error': 'Mensagem não encontrada.'}, status=status.HTTP_404_NOT_FOUND)

    decision = body.validated_data['decision']
    note = body.validated_data.get('note') or None
    now = timezone.now()
    moderator = _moderator(request)

    open_reports = MessageReports.objects.filter(message=message, resolution__isnull=True)
    if decision == 'hide':
        Messages.objects.filter(id=message.id).update(hidden_at=now, flagged_for_moderation=True)
        open_reports.update(resolution=MessageReports.RESOLUTION_UPHELD, resolution_note=note,
                            resolved_by=moderator, resolved_at=now)
        fan_out_hidden(_message_thread_id(message), message.id)
        return Response({'message': 'Mensagem ocultada da conversa.'})

    Messages.objects.filter(id=message.id).update(flagged_for_moderation=False)
    open_reports.update(resolution=MessageReports.RESOLUTION_DISMISSED, resolution_note=note,
                        resolved_by=moderator, resolved_at=now)
    return Response({'message': 'Denúncia arquivada.'})
