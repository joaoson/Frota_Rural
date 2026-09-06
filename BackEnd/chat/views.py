"""Endpoints REST do chat. O contrato está congelado em §3.2 do plano."""

import uuid

from django.db.models import Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.schemas import ErrorResponseSerializer, MessageResponseSerializer
from users.models import Users

from . import selectors, services
from .models import MessageReports, Messages
from .serializer import (
    ChatMessageSerializer,
    ChatThreadSerializer,
    MarkReadResponseSerializer,
    MarkReadSerializer,
    MessagePageSerializer,
    ReportMessageSerializer,
    ResolveThreadSerializer,
    SendMessageSerializer,
    ThreadPageSerializer,
    UnreadCountsSerializer,
    serialize_message,
    serialize_user,
)
from .threads import (
    SCOPE_POSTING,
    SCOPE_RENTAL,
    ThreadError,
    can_read,
    can_write,
    can_write_bool,
    format_thread_id,
    is_admin,
    load_scope,
    parse_thread_id,
    posting_owner_id,
    rental_participants,
)

TAG = 'Mensagens'


def _err(exc):
    return Response({'error': exc.message}, status=exc.status)


def _scope_label(scope, scope_obj):
    machinery = None
    if scope == SCOPE_RENTAL:
        posting = getattr(scope_obj, 'postings', None)
        machinery = getattr(posting, 'machinery', None) if posting else None
    else:
        machinery = getattr(scope_obj, 'machinery', None)
    if machinery:
        label = f'{machinery.brand or ""} {machinery.model or ""}'.strip()
        if label:
            return label
    if scope == SCOPE_RENTAL:
        return f'Locação #{str(scope_obj.id)[:8].upper()}'
    return 'Anúncio'


def _thread_payload(user, thread_id, scope, scope_id, lo, hi, scope_obj=None,
                    unread_count=None, last_message=None):
    scope_obj = scope_obj or load_scope(scope, scope_id)
    peer_id = hi if str(lo) == str(user.id) else lo
    peer = Users.objects.filter(id=peer_id).first()
    qs = _thread_qs(scope, scope_id, lo, hi)
    has_messages = last_message is not None or qs.exists()
    if unread_count is None:
        unread_count = qs.filter(receiver=user, read_at__isnull=True).count()
    if last_message is None:
        last_message = qs.order_by('-sent_at', '-id').first()
    return {
        'thread_id': thread_id,
        'scope': scope,
        'scope_id': str(scope_id),
        'scope_label': _scope_label(scope, scope_obj),
        'peer': serialize_user(peer),
        'can_write': can_write_bool(user, scope, scope_obj, {str(lo), str(hi)}, has_messages),
        'unread_count': unread_count,
        'last_message': (
            serialize_message(last_message, thread_id=thread_id, reveal_hidden=is_admin(user))
            if last_message is not None else None
        ),
    }


def _thread_qs(scope, scope_id, lo, hi):
    field = 'rental_id' if scope == SCOPE_RENTAL else 'posting_id'
    pair = Q(sender_id=lo, receiver_id=hi) | Q(sender_id=hi, receiver_id=lo)
    return Messages.objects.filter(**{field: scope_id}).filter(pair)


def _authorize(request, thread_id, write=False):
    """-> (scope, scope_id, lo, hi, scope_obj, qs). Levanta ThreadError."""
    scope, scope_id, lo, hi = parse_thread_id(thread_id)
    scope_obj = load_scope(scope, scope_id)
    participants = {str(lo), str(hi)}
    qs = _thread_qs(scope, scope_id, lo, hi)
    if write:
        can_write(request.user, scope, scope_obj, participants, qs.exists())
    else:
        can_read(request.user, scope, scope_obj, participants)
    return scope, scope_id, lo, hi, scope_obj, qs


@extend_schema(
    tags=[TAG],
    summary='Abre ou localiza uma conversa',
    description='Idempotente: não cria nada, apenas resolve o thread_id do par.',
    request=ResolveThreadSerializer,
    responses={200: ChatThreadSerializer, 400: ErrorResponseSerializer,
               403: ErrorResponseSerializer, 404: ErrorResponseSerializer},
)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def resolve_thread(request):
    body = ResolveThreadSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    scope = body.validated_data['scope']
    scope_id = body.validated_data['scope_id']
    peer_id = body.validated_data.get('peer_id')

    try:
        scope_obj = load_scope(scope, scope_id)
        if peer_id is None:
            peer_id = _derive_peer(request.user, scope, scope_obj)
        thread_id = format_thread_id(scope, scope_id, request.user.id, peer_id)
        _, _, lo, hi = parse_thread_id(thread_id)
        can_read(request.user, scope, scope_obj, {str(lo), str(hi)})
        return Response(_thread_payload(request.user, thread_id, scope, scope_id, lo, hi, scope_obj))
    except ThreadError as exc:
        return _err(exc)


def _derive_peer(user, scope, scope_obj):
    if scope == SCOPE_POSTING:
        owner_id = posting_owner_id(scope_obj)
        if owner_id is None:
            raise ThreadError('Anúncio não encontrado.', status=404)
        if str(owner_id) == str(user.id):
            raise ThreadError('Informe com qual usuário deseja conversar.')
        return owner_id
    others = rental_participants(scope_obj) - {str(user.id)}
    if len(others) != 1:
        raise ThreadError('Informe com qual participante da locação deseja conversar.')
    return next(iter(others))


@extend_schema(
    tags=[TAG],
    summary='Busca uma conversa pelo thread_id',
    description=(
        'O inbox é derivado da tabela de mensagens, então uma conversa recém-'
        'aberta (zero mensagens) não aparece em GET /chat/threads/. Este '
        'endpoint existe para abrir uma conversa por link direto sem que o '
        'cliente precise interpretar o thread_id.'
    ),
    responses={200: ChatThreadSerializer, 400: ErrorResponseSerializer,
               403: ErrorResponseSerializer, 404: ErrorResponseSerializer},
)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_thread(request, thread_id):
    try:
        scope, scope_id, lo, hi, scope_obj, _qs = _authorize(request, thread_id)
        return Response(
            _thread_payload(request.user, thread_id, scope, scope_id, lo, hi, scope_obj)
        )
    except ThreadError as exc:
        return _err(exc)


@extend_schema(
    tags=[TAG],
    summary='Lista as conversas do usuário (inbox)',
    parameters=[
        OpenApiParameter('limit', int), OpenApiParameter('offset', int),
        OpenApiParameter('scope', str, description='rental | posting'),
    ],
    responses={200: ThreadPageSerializer},
)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_threads(request):
    limit = min(int(request.query_params.get('limit', 20) or 20), 50)
    offset = max(int(request.query_params.get('offset', 0) or 0), 0)
    scope = request.query_params.get('scope')

    rows, total = selectors.inbox_page(request.user.id, limit=limit, offset=offset, scope=scope)
    results = []
    for row in rows:
        try:
            results.append(_thread_payload(
                request.user, row['thread_id'], row['scope'], row['scope_id'],
                row['peer_lo'], row['peer_hi'],
                unread_count=row['unread_count'],
                last_message=row['last_message_obj'],
            ))
        except ThreadError:
            # Escopo apagado sob os pés (locação/anúncio removido): a thread
            # some do inbox em vez de derrubar a listagem inteira.
            continue
    return Response({'count': total, 'limit': limit, 'offset': offset, 'results': results})


def _list_messages(request, thread_id):
    """Helper puro: NÃO decorar com @api_view.

    Encadear duas views @api_view faz o DRF reautenticar sobre um request que
    já tem `user` setado, o SessionAuthentication casa e passa a exigir CSRF —
    quebrando todo POST real (o test client do Django desliga CSRF, então isso
    não aparece nos testes).
    """
    try:
        scope, scope_id, lo, hi, _obj, qs = _authorize(request, thread_id)
    except ThreadError as exc:
        return _err(exc)

    limit = min(int(request.query_params.get('limit', 50) or 50), 200)
    before, before_id = request.query_params.get('before'), request.query_params.get('before_id')
    after, after_id = request.query_params.get('after'), request.query_params.get('after_id')

    try:
        if before and not before_id:
            raise ThreadError('Informe before_id junto de before.')
        if after and not after_id:
            raise ThreadError('Informe after_id junto de after.')
        if after:
            qs = qs.filter(Q(sent_at__gt=after) | Q(sent_at=after, id__gt=uuid.UUID(after_id)))
            order, fields = 'asc', ['sent_at', 'id']
        else:
            if before:
                qs = qs.filter(
                    Q(sent_at__lt=before) | Q(sent_at=before, id__lt=uuid.UUID(before_id))
                )
            order, fields = 'desc', ['-sent_at', '-id']
    except (ValueError, ThreadError) as exc:
        if isinstance(exc, ThreadError):
            return _err(exc)
        return Response({'error': 'Cursor inválido.'}, status=400)

    rows = list(qs.order_by(*fields)[: limit + 1])
    has_more = len(rows) > limit
    rows = rows[:limit]
    reveal = is_admin(request.user)
    return Response({
        'results': [serialize_message(m, thread_id=thread_id, reveal_hidden=reveal) for m in rows],
        'has_more': has_more,
        'order': order,
    })


def _send_message(request, thread_id):
    """Helper puro — ver a nota em `_list_messages`."""
    body = SendMessageSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    try:
        scope, scope_id, lo, hi, _obj, _qs = _authorize(request, thread_id, write=True)
        services.check_rate_limit(request.user.id)
        receiver_id = hi if str(lo) == str(request.user.id) else lo
        payload, created = services.create_message(
            sender=request.user, receiver_id=receiver_id, scope=scope, scope_id=scope_id,
            content=body.validated_data['content'],
            client_id=body.validated_data['client_id'], thread_id=thread_id,
        )
    except ThreadError as exc:
        return _err(exc)
    if created:
        services.push_unread(receiver_id)
    return Response(payload, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@extend_schema(
    tags=[TAG], summary='Marca a conversa como lida',
    request=MarkReadSerializer,
    responses={200: MarkReadResponseSerializer, 403: ErrorResponseSerializer,
               404: ErrorResponseSerializer},
)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_read(request, thread_id):
    body = MarkReadSerializer(data=request.data)
    body.is_valid(raise_exception=True)
    try:
        _scope, _sid, _lo, _hi, _obj, qs = _authorize(request, thread_id)
    except ThreadError as exc:
        return _err(exc)

    now = timezone.now()
    pending = qs.filter(receiver=request.user, read_at__isnull=True)
    up_to = body.validated_data.get('up_to')
    if up_to:
        pending = pending.filter(sent_at__lte=up_to)
    ids = list(pending.values_list('id', flat=True)[:500])
    updated = pending.update(read_at=now)

    iso = now.isoformat().replace('+00:00', 'Z')
    if updated:
        services.fan_out_read(thread_id, request.user.id, iso, ids)
    counts = services.push_unread(request.user.id)
    return Response({'updated': updated, 'read_at': iso, 'unread_total': counts['unread_total']})


@extend_schema(tags=[TAG], summary='Contadores de não lidas para o badge',
               responses={200: UnreadCountsSerializer})
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def unread(request):
    return Response(selectors.unread_counts(request.user.id))


@extend_schema(
    tags=[TAG], summary='Denuncia uma mensagem',
    request=ReportMessageSerializer,
    responses={200: MessageResponseSerializer, 400: ErrorResponseSerializer,
               403: ErrorResponseSerializer, 404: ErrorResponseSerializer,
               409: ErrorResponseSerializer},
)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def report_message(request, pk):
    body = ReportMessageSerializer(data=request.data)
    if not body.is_valid():
        return Response({'error': 'Informe o motivo da denúncia.'}, status=400)

    message = Messages.objects.filter(id=pk).first()
    if message is None:
        return Response({'error': 'Mensagem não encontrada.'}, status=404)
    uid = str(request.user.id)
    if uid not in (str(message.sender_id), str(message.receiver_id)):
        return Response({'error': 'Você não participa desta conversa.'}, status=403)
    if uid == str(message.sender_id):
        return Response({'error': 'Você não pode denunciar a própria mensagem.'}, status=403)
    if MessageReports.objects.filter(message=message, reported_by=request.user).exists():
        return Response({'error': 'Você já denunciou esta mensagem.'}, status=409)

    MessageReports.objects.create(
        message=message, reported_by=request.user, reason=body.validated_data['reason']
    )
    Messages.objects.filter(id=message.id).update(flagged_for_moderation=True)
    return Response({'message': 'Mensagem denunciada. Nossa equipe vai analisar.'})


@extend_schema(
    tags=[TAG],
    summary='Histórico (GET) e envio (POST) da conversa',
    parameters=[
        OpenApiParameter('limit', int), OpenApiParameter('before', str),
        OpenApiParameter('before_id', str), OpenApiParameter('after', str),
        OpenApiParameter('after_id', str),
    ],
    request=SendMessageSerializer,
    responses={200: MessagePageSerializer, 201: ChatMessageSerializer,
               400: ErrorResponseSerializer, 403: ErrorResponseSerializer,
               404: ErrorResponseSerializer, 429: ErrorResponseSerializer},
)
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def messages_collection(request, thread_id):
    """Despacha por método: o contrato usa o mesmo path para ler e enviar."""
    if request.method == 'POST':
        return _send_message(request, thread_id)
    return _list_messages(request, thread_id)
