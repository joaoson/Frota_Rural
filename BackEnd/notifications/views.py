from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.schemas import error_responses

from .models import Notification
from .serializers import (NotificationListQuerySerializer, NotificationPageSerializer,
                          NotificationReadAllSerializer, NotificationReadSerializer, NotificationSerializer)


def inbox(user):
    return Notification.objects.filter(recipient=user, dismissed_at__isnull=True)


@extend_schema(tags=['Notificações'], summary='Listar notificações',
               description='Caixa do usuário autenticado, sem avisos excluídos; filtros kind/unread e paginação limit/offset. unread_count representa toda a caixa, independente dos filtros.',
               parameters=[NotificationListQuerySerializer], responses={200: NotificationPageSerializer, **error_responses(400, 401)})
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def notifications_list(request):
    query = NotificationListQuerySerializer(data=request.query_params)
    query.is_valid(raise_exception=True)
    data = query.validated_data
    notifications = inbox(request.user)
    unread_count = notifications.filter(read_at__isnull=True).count()
    if 'kind' in data:
        notifications = notifications.filter(kind=data['kind'])
    if 'unread' in data:
        notifications = notifications.filter(read_at__isnull=data['unread'] == 'true')
    count = notifications.count()
    rows = notifications[data['offset']:data['offset'] + data['limit']]
    return Response({'results': NotificationSerializer(rows, many=True).data,
                     'count': count, 'unread_count': unread_count})


@extend_schema(methods=['PATCH'], tags=['Notificações'], summary='Alterar leitura da notificação',
               description='Marca ou desmarca leitura apenas de aviso do próprio usuário. Avisos excluídos não podem ser reabertos.',
               request=NotificationReadSerializer, responses={200: NotificationSerializer, **error_responses(400, 401, 404)})
@extend_schema(methods=['DELETE'], tags=['Notificações'], summary='Excluir da caixa de notificações',
               description='Oculta o aviso do próprio usuário. Operação repetível; eventos duplicados não fazem o aviso reaparecer.',
               request=None, responses={204: None, **error_responses(401, 404)})
@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
@transaction.atomic
def notification_detail(request, pk):
    notification = get_object_or_404(
        Notification.objects.select_for_update().filter(recipient=request.user), pk=pk,
    )
    if request.method == 'DELETE':
        if notification.dismissed_at is None:
            notification.dismissed_at = timezone.now()
            notification.save(update_fields=['dismissed_at'])
        return Response(status=204)
    if notification.dismissed_at is not None:
        return Response(status=404)
    serializer = NotificationReadSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    is_read = serializer.validated_data['is_read']
    notification.read_at = (notification.read_at or timezone.now()) if is_read else None
    notification.save(update_fields=['read_at'])
    return Response(NotificationSerializer(notification).data)


@extend_schema(tags=['Notificações'], summary='Marcar todas como lidas',
               description='Atualiza os avisos visíveis do usuário; devolve a quantidade alterada e a contagem de não lidos após a atualização.',
               request=None, responses={200: NotificationReadAllSerializer, **error_responses(401)})
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def notifications_read_all(request):
    updated = inbox(request.user).filter(read_at__isnull=True).update(read_at=timezone.now())
    # Count again: a concurrently committed event should still show as unread.
    return Response({'updated': updated, 'unread_count': inbox(request.user).filter(read_at__isnull=True).count()})
