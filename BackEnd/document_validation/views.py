from django.db import IntegrityError
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import OperatorLicense, Certification
from .serializer import OperatorLicenseSerializer, CertificationSerializer


MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}


@api_view(["POST"])
def validate_cnh_document(request):
    file = request.FILES.get("file")
    if not file:
        return Response(
            {"error": "Nenhum arquivo enviado."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if file.content_type not in ALLOWED_TYPES:
        return Response(
            {"error": "Tipo de arquivo não suportado. Envie JPG, PNG ou PDF."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if file.size > MAX_FILE_SIZE:
        return Response(
            {"error": "Arquivo excede o tamanho máximo de 20MB."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        from .services.cnh_classifier import CnhClassifier

        result = CnhClassifier.classify(file)
        return Response(result, status=status.HTTP_200_OK)
    except FileNotFoundError as e:
        return Response(
            {"error": str(e)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    except Exception:
        return Response(
            {"error": "Erro ao processar o documento."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET", "POST"])
def operator_licenses_list(request):
    if request.method == "GET":
        qs = OperatorLicense.objects.all().order_by("-created_at", "-id")
        user_id = request.query_params.get("user")
        if user_id:
            qs = qs.filter(user_id=user_id)
        validation_status = request.query_params.get("validation_status")
        if validation_status:
            qs = qs.filter(validation_status=validation_status)
        serializer = OperatorLicenseSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = OperatorLicenseSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    try:
        serializer.save()
    except IntegrityError:
        return Response(
            {"error": "Dados inválidos ou em conflito."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
def operator_license_detail(request, pk):
    try:
        license = OperatorLicense.objects.get(pk=pk)
    except OperatorLicense.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(OperatorLicenseSerializer(license).data, status=status.HTTP_200_OK)

    if request.method == "PUT":
        serializer = OperatorLicenseSerializer(license, data=request.data)
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
        serializer = OperatorLicenseSerializer(license, data=request.data, partial=True)
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

    license.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET", "POST"])
def certifications_list(request):
    if request.method == "GET":
        qs = Certification.objects.all().order_by("-created_at", "-id")
        user_id = request.query_params.get("user")
        if user_id:
            qs = qs.filter(user_id=user_id)
        validation_status = request.query_params.get("validation_status")
        if validation_status:
            qs = qs.filter(validation_status=validation_status)
        serializer = CertificationSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = CertificationSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    try:
        serializer.save()
    except IntegrityError:
        return Response(
            {"error": "Dados inválidos ou em conflito."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
def certification_detail(request, pk):
    try:
        certification = Certification.objects.get(pk=pk)
    except Certification.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(CertificationSerializer(certification).data, status=status.HTTP_200_OK)

    if request.method == "PUT":
        serializer = CertificationSerializer(certification, data=request.data)
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
        serializer = CertificationSerializer(certification, data=request.data, partial=True)
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

    certification.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


VALID_STATUSES = {"approved", "rejected"}

@api_view(["PATCH"])
def review_license(request, pk):
    try:
        license = OperatorLicense.objects.get(pk=pk)
    except OperatorLicense.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    validation_status = request.data.get("validation_status")
    if not validation_status or validation_status not in VALID_STATUSES:
        return Response(
            {"error": "Informe um validation_status válido (approved ou rejected)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    review_note = request.data.get("review_note")
    if validation_status == "rejected" and not review_note:
        return Response(
            {"error": "O motivo da rejeição é obrigatório."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from django.utils import timezone

    license.validation_status = validation_status
    license.review_note = review_note or None
    license.updated_at = timezone.now()
    license.save(update_fields=["validation_status", "review_note", "updated_at"])

    return Response(
        OperatorLicenseSerializer(license).data,
        status=status.HTTP_200_OK,
    )


@api_view(["PATCH"])
def review_certification(request, pk):
    try:
        certification = Certification.objects.get(pk=pk)
    except Certification.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    validation_status = request.data.get("validation_status")
    if not validation_status or validation_status not in VALID_STATUSES:
        return Response(
            {"error": "Informe um validation_status válido (approved ou rejected)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    review_note = request.data.get("review_note")
    if validation_status == "rejected" and not review_note:
        return Response(
            {"error": "O motivo da rejeição é obrigatório."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from django.utils import timezone

    certification.validation_status = validation_status
    certification.review_note = review_note or None
    certification.updated_at = timezone.now()
    certification.save(update_fields=["validation_status", "review_note", "updated_at"])

    return Response(
        CertificationSerializer(certification).data,
        status=status.HTTP_200_OK,
    )
