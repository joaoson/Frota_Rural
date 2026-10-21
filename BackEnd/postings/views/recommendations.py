from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.schemas import error_responses
from postings.recommendations import PostingRecommendationService
from postings.serializer import (
    RecommendationInputSerializer,
    RecommendationOutputSerializer,
)


class PostingRecommendationView(APIView):
    permission_classes = [AllowAny]
    # A public, read-only search must work independently of login/session state.
    authentication_classes = []

    @extend_schema(
        tags=["Anúncios"], summary="Encontrar máquinas pela busca guiada",
        request=RecommendationInputSerializer,
        responses={200: RecommendationOutputSerializer, **error_responses(400)},
    )
    def post(self, request: Request) -> Response:
        result = PostingRecommendationService.search(request.data)
        return Response(RecommendationOutputSerializer(result).data)
