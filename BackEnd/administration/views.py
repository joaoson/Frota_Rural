from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from api.models import Rentals, Contracts
from machines.models import Machines
from postings.models import Postings
from users.models import Users
from .models import PostingModeration


def _moderator(request):
    """Retorna o usuário autenticado (moderador) ou None se anônimo."""
    user = getattr(request, "user", None)
    return user if getattr(user, "is_authenticated", False) else None

# Create your views here.
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
