from django.db import IntegrityError
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from api.schemas import ErrorResponseSerializer
from .models import OperatorLicense, Certification
from .serializer import (
    CertificationSerializer,
    CnhValidationResultSerializer,
    DocumentReviewSerializer,
    DocumentUrlSerializer,
    OperatorLicenseSerializer,
)
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiExample, OpenApiResponse, OpenApiParameter

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}

INVALID_FILE = OpenApiResponse(
    response=ErrorResponseSerializer,
    description='Arquivo ausente, de tipo não suportado ou acima de 20 MB.',
)
USER_FILTER = OpenApiParameter('user', type=str, description='Filtra pelo ID do usuário dono do documento.')
VALIDATION_STATUS_FILTER = OpenApiParameter(
    'validation_status',
    type=str,
    enum=['pending', 'approved', 'rejected'],
    description='Filtra pelo resultado da análise do documento.',
)


@extend_schema(
    tags=['Documentos'],
    summary="Validar CNH via Inteligência Artificial",
    description=(
        "Recebe o upload de uma imagem ou PDF e o processa com o modelo TensorFlow treinado "
        "(MobileNetV2) para identificar se o arquivo é uma CNH.\n\n"
        "A inferência roda em um interpretador Python isolado, chamado por `subprocess`. "
        "O endpoint apenas classifica o arquivo: não o armazena nem altera nenhum cadastro."
    ),
    request={"multipart/form-data": {"type": "object", "properties": {"file": {"type": "string", "format": "binary"}}}},
    responses={
        200: CnhValidationResultSerializer,
        400: INVALID_FILE,
        500: OpenApiResponse(
            response=ErrorResponseSerializer,
            description='Erro no motor de classificação.',
        ),
        503: OpenApiResponse(
            response=ErrorResponseSerializer,
            description='Ambiente de ML não configurado (venv ou modelo treinado ausente).',
        ),
    },
    examples=[
        OpenApiExample(
            'CNH reconhecida',
            value={'is_valid': True, 'confidence': 'high', 'score': 0.9721},
            response_only=True,
        ),
        OpenApiExample(
            'Documento recusado',
            value={'is_valid': False, 'confidence': 'low', 'score': 0.1043},
            response_only=True,
        ),
    ],
)
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


@extend_schema_view(
    get=extend_schema(
        tags=['Documentos'],
        summary='Listar CNHs cadastradas',
        description='Retorna as CNHs de operadores, opcionalmente filtradas por usuário e por status de validação.',
        parameters=[USER_FILTER, VALIDATION_STATUS_FILTER],
        responses={200: OperatorLicenseSerializer(many=True)},
    ),
    post=extend_schema(
        tags=['Documentos'],
        summary='Cadastrar CNH',
        description=(
            'Cadastra a CNH de um operador. O documento entra com `validation_status` igual a '
            '`pending` até a análise de um administrador.'
        ),
        request=OperatorLicenseSerializer,
        responses={
            201: OperatorLicenseSerializer,
            400: OpenApiResponse(description='Dados inválidos ou em conflito com um registro existente.'),
        },
    ),
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


@extend_schema_view(
    get=extend_schema(
        tags=['Documentos'],
        summary='Consultar CNH',
        responses={200: OperatorLicenseSerializer, 404: OpenApiResponse(description='CNH não encontrada.')},
    ),
    put=extend_schema(
        tags=['Documentos'],
        summary='Substituir CNH',
        description='Atualiza todos os campos da CNH. A validação volta para `pending` e a nota de análise é limpa.',
        request=OperatorLicenseSerializer,
        responses={
            200: OperatorLicenseSerializer,
            400: OpenApiResponse(description='Dados inválidos ou em conflito.'),
            404: OpenApiResponse(description='CNH não encontrada.'),
        },
    ),
    patch=extend_schema(
        tags=['Documentos'],
        summary='Atualizar CNH parcialmente',
        description='Atualiza apenas os campos enviados. A validação volta para `pending`.',
        request=OperatorLicenseSerializer,
        responses={
            200: OperatorLicenseSerializer,
            400: OpenApiResponse(description='Dados inválidos ou em conflito.'),
            404: OpenApiResponse(description='CNH não encontrada.'),
        },
    ),
    delete=extend_schema(
        tags=['Documentos'],
        summary='Excluir CNH',
        responses={204: OpenApiResponse(description='CNH excluída.'), 404: OpenApiResponse(description='CNH não encontrada.')},
    ),
)
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


@extend_schema_view(
    get=extend_schema(
        tags=['Documentos'],
        summary='Listar certificações',
        description='Retorna as certificações declaradas pelos usuários (ex.: NR-31), com filtros opcionais.',
        parameters=[USER_FILTER, VALIDATION_STATUS_FILTER],
        responses={200: CertificationSerializer(many=True)},
    ),
    post=extend_schema(
        tags=['Documentos'],
        summary='Cadastrar certificação',
        description='Cadastra uma certificação. Ela entra com `validation_status` igual a `pending`.',
        request=CertificationSerializer,
        responses={
            201: CertificationSerializer,
            400: OpenApiResponse(description='Dados inválidos ou em conflito com um registro existente.'),
        },
    ),
)
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


@extend_schema_view(
    get=extend_schema(
        tags=['Documentos'],
        summary='Consultar certificação',
        responses={200: CertificationSerializer, 404: OpenApiResponse(description='Certificação não encontrada.')},
    ),
    put=extend_schema(
        tags=['Documentos'],
        summary='Substituir certificação',
        description='Atualiza todos os campos. A validação volta para `pending` e a nota de análise é limpa.',
        request=CertificationSerializer,
        responses={
            200: CertificationSerializer,
            400: OpenApiResponse(description='Dados inválidos ou em conflito.'),
            404: OpenApiResponse(description='Certificação não encontrada.'),
        },
    ),
    patch=extend_schema(
        tags=['Documentos'],
        summary='Atualizar certificação parcialmente',
        description='Atualiza apenas os campos enviados. A validação volta para `pending`.',
        request=CertificationSerializer,
        responses={
            200: CertificationSerializer,
            400: OpenApiResponse(description='Dados inválidos ou em conflito.'),
            404: OpenApiResponse(description='Certificação não encontrada.'),
        },
    ),
    delete=extend_schema(
        tags=['Documentos'],
        summary='Excluir certificação',
        responses={
            204: OpenApiResponse(description='Certificação excluída.'),
            404: OpenApiResponse(description='Certificação não encontrada.'),
        },
    ),
)
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


@extend_schema(
    tags=['Documentos'],
    summary='Enviar arquivo de documento',
    description=(
        'Persiste o arquivo em `MEDIA_ROOT/documents/` com um nome único e devolve a URL '
        'pública. Use essa URL nos campos `file_url` (CNH) ou `media_url` (certificação).'
    ),
    request={"multipart/form-data": {"type": "object", "properties": {"file": {"type": "string", "format": "binary"}}}},
    responses={201: DocumentUrlSerializer, 400: INVALID_FILE},
    examples=[
        OpenApiExample(
            'Arquivo salvo',
            value={'url': '/media/documents/6f1c9d0e-6d3b-4f6f-9f39-1f1a1b5c6d7e.jpg'},
            response_only=True,
        )
    ],
)
@api_view(["POST"])
def upload_document(request):
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

    import uuid
    import os
    from django.conf import settings

    ext = os.path.splitext(file.name)[1].lower() or ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    upload_dir = os.path.join(settings.MEDIA_ROOT, "documents")
    os.makedirs(upload_dir, exist_ok=True)

    filepath = os.path.join(upload_dir, filename)
    with open(filepath, "wb") as dest:
        for chunk in file.chunks():
            dest.write(chunk)

    url = f"{settings.MEDIA_URL}documents/{filename}"
    return Response({"url": url}, status=status.HTTP_201_CREATED)


VALID_STATUSES = {"approved", "rejected"}

@extend_schema(
    tags=['Documentos'],
    summary='Analisar CNH',
    description=(
        'Registra a análise manual de uma CNH. Ao rejeitar, `review_note` é obrigatório e a '
        'justificativa fica visível para o dono do documento.'
    ),
    request=DocumentReviewSerializer,
    responses={
        200: OperatorLicenseSerializer,
        400: OpenApiResponse(
            response=ErrorResponseSerializer,
            description='`validation_status` ausente/inválido ou rejeição sem justificativa.',
        ),
        404: OpenApiResponse(description='CNH não encontrada.'),
    },
    examples=[
        OpenApiExample(
            'Rejeição com justificativa',
            value={'validation_status': 'rejected', 'review_note': 'Imagem ilegível, reenvie a CNH aberta.'},
            request_only=True,
        )
    ],
)
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


@extend_schema(
    tags=['Documentos'],
    summary='Analisar certificação',
    description=(
        'Registra a análise manual de uma certificação. Ao rejeitar, `review_note` é obrigatório.'
    ),
    request=DocumentReviewSerializer,
    responses={
        200: CertificationSerializer,
        400: OpenApiResponse(
            response=ErrorResponseSerializer,
            description='`validation_status` ausente/inválido ou rejeição sem justificativa.',
        ),
        404: OpenApiResponse(description='Certificação não encontrada.'),
    },
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
