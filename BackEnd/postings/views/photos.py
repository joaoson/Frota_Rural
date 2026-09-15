from uuid import UUID

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.schemas import error_response, error_responses
from postings.serializer import PostingPhotoUploadOutputSerializer
from postings.services import PostingPhotoService


class PostingPhotoUploadView(APIView):
    @extend_schema(
        tags=["Anúncios"],
        summary="Enviar foto do anúncio",
        description=(
            "Envia uma foto para o anúncio via `multipart/form-data`. Marque `is_primary` como `true` "
            "para usá-la como imagem de capa nas listagens."
        ),
        request={
            "multipart/form-data": {
                "type": "object",
                "properties": {
                    "image": {"type": "string", "format": "binary"},
                    "is_primary": {"type": "boolean"},
                },
            }
        },
        responses={
            201: PostingPhotoUploadOutputSerializer,
            400: error_response(
                400, "Arquivo ausente, de tipo não suportado, acima de 5 MB ou fora de multipart."
            ),
            404: error_response(404, "Anúncio não encontrado."),
            **error_responses(502, 503),
        },
    )
    def post(self, request: Request, pk: UUID) -> Response:
        photo = PostingPhotoService.upload(
            pk,
            request.FILES.get("image"),
            request.data,
            content_type=request.content_type,
        )
        return Response(
            PostingPhotoUploadOutputSerializer(photo).data, status=status.HTTP_201_CREATED
        )
