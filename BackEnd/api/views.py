import uuid

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from api.models import Rentals, Reviews
from api.serializer import RentalSerializer, ReviewSerializer
from contracts.models import Contracts


# --- REVIEWS ---

def _reviews_queryset():
    return Reviews.objects.all().select_related("reviewer", "reviewee")


@api_view(["GET", "POST"])
def reviews_list(request):
    if request.method == "GET":
        qs = _reviews_queryset().order_by("-created_at", "-id")
        reviewee_id = request.query_params.get("reviewee")
        if reviewee_id:
            qs = qs.filter(reviewee_id=reviewee_id)
        reviewer_id = request.query_params.get("reviewer")
        if reviewer_id:
            qs = qs.filter(reviewer_id=reviewer_id)
        rental_id = request.query_params.get("rental")
        if rental_id:
            qs = qs.filter(rental_id=rental_id)
            
        serializer = ReviewSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = ReviewSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    try:
        serializer.save()
    except IntegrityError:
        return Response(
            {"error": "Dados inválidos ou em conflito (ex.: avaliação já existe para este aluguel)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
def review_detail(request, pk):
    try:
        review = _reviews_queryset().get(pk=pk)
    except Reviews.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(ReviewSerializer(review).data, status=status.HTTP_200_OK)

    if request.method == "PUT":
        serializer = ReviewSerializer(review, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {"error": "Dados inválidos ou em conflito."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(serializer.data, status=status.HTTP_200_OK)

    if request.method == "PATCH":
        serializer = ReviewSerializer(review, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {"error": "Dados inválidos ou em conflito."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(serializer.data, status=status.HTTP_200_OK)

    try:
        review.delete()
    except IntegrityError:
        return Response(
            {"error": "Não é possível excluir esta avaliação."},
            status=status.HTTP_409_CONFLICT,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)


# --- RENTALS ---

@api_view(["GET", "POST"])
def rentals_list(request):
    if request.method == "GET":
        qs = Rentals.objects.all().select_related("lessee", "postings__machinery__owner", "contracts")
        posting_id = request.query_params.get("postings")
        if posting_id:
            qs = qs.filter(postings_id=posting_id)
        lessee_id = request.query_params.get("lessee")
        if lessee_id:
            qs = qs.filter(lessee_id=lessee_id)
        lessor_id = request.query_params.get("lessor")
        if lessor_id:
            qs = qs.filter(postings__machinery__owner_id=lessor_id)
        serializer = RentalSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = RentalSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    rental = serializer.save()
    
    # Automatically create matching Contract
    Contracts.objects.create(
        id=uuid.uuid4(),
        rental=rental,
        accepted_by_lessor=False,
        accepted_by_lessee=False,
        status="pending_signatures",
        created_at=timezone.now()
    )
    
    return Response(RentalSerializer(rental).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
def rental_detail(request, pk):
    try:
        rental = Rentals.objects.select_related("contracts").get(pk=pk)
    except Rentals.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(RentalSerializer(rental).data, status=status.HTTP_200_OK)

    if request.method == "PUT":
        serializer = RentalSerializer(rental, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    if request.method == "PATCH":
        serializer = RentalSerializer(rental, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    rental.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
