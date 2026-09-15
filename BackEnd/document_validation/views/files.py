from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.schemas import error_response, error_responses
from document_validation.serializer import (
    CnhValidationOutputSerializer,
    DocumentUrlOutputSerializer,
)
from document_validation.services import DocumentFileService

TAGS = ["Documentos"]
FILE_REQUEST = {
    "multipart/form-data": {
        "type": "object",
        "properties": {"file": {"type": "string", "format": "binary"}},
    }
}
INVALID_FILE = error_response(400, "Arquivo ausente, de tipo não suportado ou acima de 20 MB.")


class DocumentUploadView(APIView):
    @extend_schema(
        tags=TAGS,
        summary="Enviar arquivo de documento",
        description=(
            "Persiste o arquivo em `MEDIA_ROOT/documents/` com um nome único e devolve a URL "
            "pública. Use essa URL nos campos `file_url` (CNH) ou `media_url` (certificação)."
        ),
        request=FILE_REQUEST,
        responses={201: DocumentUrlOutputSerializer, 400: INVALID_FILE},
        examples=[
            OpenApiExample(
                "Arquivo salvo",
                value={"url": "/media/documents/6f1c9d0e-6d3b-4f6f-9f39-1f1a1b5c6d7e.jpg"},
                response_only=True,
            )
        ],
    )
    def post(self, request: Request) -> Response:
        url = DocumentFileService.upload(request.FILES.get("file"))
        return Response(
            DocumentUrlOutputSerializer({"url": url}).data, status=status.HTTP_201_CREATED
        )


class CnhValidationView(APIView):
    @extend_schema(
        tags=TAGS,
        summary="Validar CNH via Inteligência Artificial",
        description=(
            "Recebe o upload de uma imagem ou PDF e o processa com o modelo TensorFlow treinado "
            "(MobileNetV2) para identificar se o arquivo é uma CNH.\n\n"
            "A inferência roda em um interpretador Python isolado, chamado por `subprocess`. "
            "O endpoint apenas classifica o arquivo: não o armazena nem altera nenhum cadastro."
        ),
        request=FILE_REQUEST,
        responses={
            200: CnhValidationOutputSerializer,
            400: INVALID_FILE,
            500: error_response(500, "Erro no motor de classificação."),
            **error_responses(503),
        },
        examples=[
            OpenApiExample(
                "CNH reconhecida",
                value={"is_valid": True, "confidence": "high", "score": 0.9721},
                response_only=True,
            ),
            OpenApiExample(
                "Documento recusado",
                value={"is_valid": False, "confidence": "low", "score": 0.1043},
                response_only=True,
            ),
        ],
    )
    def post(self, request: Request) -> Response:
        result = DocumentFileService.classify_cnh(request.FILES.get("file"))
        return Response(CnhValidationOutputSerializer(result).data, status=status.HTTP_200_OK)
