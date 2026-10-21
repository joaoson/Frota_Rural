from uuid import UUID

from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.request import authenticated_user
from common.schemas import error_responses
from users.serializer import UserOutputSerializer
from users.services import UserPhotoService


class UserPhotoUploadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Usuários"],
        summary="Enviar ou substituir a foto de perfil",
        description="Foto do próprio usuário, em JPG, PNG ou WEBP, com até 5 MB.",
        request={
            "multipart/form-data": {
                "type": "object",
                "required": ["image"],
                "properties": {"image": {"type": "string", "format": "binary"}},
            }
        },
        responses={200: UserOutputSerializer, **error_responses(400, 401, 404, 502, 503)},
    )
    def post(self, request: Request, pk: UUID) -> Response:
        user = UserPhotoService.upload(
            pk,
            request.FILES.get("image"),
            content_type=request.content_type,
            actor=authenticated_user(request),
        )
        return Response(UserOutputSerializer(user).data)
