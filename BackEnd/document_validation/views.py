from django.db import IntegrityError
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import OperatorLicense, Certification
from .serializer import OperatorLicenseSerializer, CertificationSerializer


# ── OperatorLicense ────────────────────────────────────────────────────────

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


# ── Certification ──────────────────────────────────────────────────────────

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
