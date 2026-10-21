from uuid import UUID

from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.schemas import error_response, error_responses
from rentals.meter import MeterReadingInputSerializer, MeterService
from rentals.serializer import (
    RentalFilterSerializer,
    RentalInputSerializer,
    RentalMeterReadingOutputSerializer,
    RentalOutputSerializer,
)
from rentals import policy
from rentals.services import RentalService

TAGS = ["Locações"]


def _context(request: Request) -> dict[str, object]:
    """`allowed_actions` depende de quem pergunta."""
    return {"user": request.user}
RENTAL_NOT_FOUND = error_response(404, "Locação não encontrada.")
INVALID_RENTAL = error_response(
    400, "Dados inválidos, período acima do limite do anúncio ou em conflito com outra reserva."
)


class RentalListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Listar locações",
        description="Retorna as locações (reservas), com filtros opcionais por anúncio, locatário ou locador dono do maquinário.",
        parameters=[RentalFilterSerializer],
        responses={200: RentalOutputSerializer(many=True), **error_responses(400)},
    )
    def get(self, request: Request) -> Response:
        rentals = RentalService.list(request.query_params, user=request.user)
        return Response(RentalOutputSerializer(rentals, many=True, context=_context(request)).data,
                        status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Criar locação (reserva)",
        description=(
            "Cria a reserva de um anúncio e, na mesma transação, o contrato correspondente com "
            "status `pending_signatures`. Não é necessário criar o contrato em uma chamada separada."
        ),
        request=RentalInputSerializer,
        responses={201: RentalOutputSerializer, 400: INVALID_RENTAL},
        examples=[
            OpenApiExample(
                "Nova Reserva de Trator",
                summary="Exemplo de criação de uma locação",
                value={
                    "postings": "f5e1c4a0-56d1-4b7c-9a1b-c1d4e6f8a9b2",
                    "lessee": "e6a2b8e5-3d71-4a9f-b98a-f4c78d0671f2",
                    "start_date": "2026-09-10T08:00:00Z",
                    "end_date": "2026-09-15T18:00:00Z",
                    "total_price": "8500.00",
                },
                request_only=True,
            )
        ],
    )
    def post(self, request: Request) -> Response:
        rental = RentalService.create(request.data, user=request.user)
        return Response(RentalOutputSerializer(rental, context=_context(request)).data, status=status.HTTP_201_CREATED)


class RentalDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Consultar locação",
        responses={200: RentalOutputSerializer, 404: RENTAL_NOT_FOUND},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        rental = RentalService.get(pk, user=request.user)
        return Response(RentalOutputSerializer(rental, context=_context(request)).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Substituir locação",
        request=RentalInputSerializer,
        responses={200: RentalOutputSerializer, 400: INVALID_RENTAL, 404: RENTAL_NOT_FOUND},
    )
    def put(self, request: Request, pk: UUID) -> Response:
        rental = RentalService.update(pk, request.data, user=request.user)
        return Response(RentalOutputSerializer(rental, context=_context(request)).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Atualizar locação parcialmente",
        description="Usado principalmente para avançar o status da locação (ex.: `active`, `completed`, `cancelled`).",
        request=RentalInputSerializer,
        responses={200: RentalOutputSerializer, 400: INVALID_RENTAL, 404: RENTAL_NOT_FOUND},
    )
    def patch(self, request: Request, pk: UUID) -> Response:
        rental = RentalService.update(pk, request.data, user=request.user, partial=True)
        return Response(RentalOutputSerializer(rental, context=_context(request)).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Excluir locação",
        responses={
            204: None,
            404: RENTAL_NOT_FOUND,
            409: error_response(409, "Existem registros dependentes (ex.: contrato)."),
        },
    )
    def delete(self, request: Request, pk: UUID) -> Response:
        RentalService.delete(pk, user=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class BookingPolicyView(APIView):
    @extend_schema(
        tags=TAGS,
        summary="Regras de reserva",
        description=(
            "Antecedência mínima aplicada pelo servidor à reserva avulsa, à troca de datas e à "
            "recorrência. A tela de reserva usa estes valores em vez de repetir a regra."
        ),
        responses={200: None},
    )
    def get(self, request: Request) -> Response:
        return Response({
            "antecedencia_minima_dias": policy.ANTECEDENCIA_MINIMA_DIAS,
            "data_minima_inicio": policy.earliest_start_date().isoformat(),
        }, status=status.HTTP_200_OK)


class RentalMeterReadingsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Leituras do horímetro da locação",
        description="Histórico das leituras de retirada e devolução, inclusive as corrigidas.",
        responses={200: RentalMeterReadingOutputSerializer(many=True), 404: RENTAL_NOT_FOUND},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        readings = MeterService.readings(pk, user=request.user)
        return Response(RentalMeterReadingOutputSerializer(readings, many=True).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Registrar leitura do horímetro",
        description=(
            "O locador registra a leitura de retirada (`check_in`) e a de devolução (`check_out`) de uma "
            "locação assinada, a partir do primeiro dia. Uma nova leitura do mesmo tipo corrige a anterior. "
            "As leituras são só métricas de uso: não alteram o valor, o pagamento nem a conclusão."
        ),
        request=MeterReadingInputSerializer,
        responses={
            201: None,
            400: error_response(400, "Leitura negativa, acima de 60.000 h ou de devolução menor que a de retirada."),
            403: error_response(403, "Somente o locador registra as leituras."),
            404: RENTAL_NOT_FOUND,
            409: error_response(409, "Locação ainda não assinada, já concluída ou antes do primeiro dia."),
        },
    )
    def post(self, request: Request, pk: UUID) -> Response:
        result = MeterService.record(pk, request.data, user=request.user)
        rental = RentalService.get(pk, user=request.user)
        return Response({
            "reading": RentalMeterReadingOutputSerializer(result.reading).data,
            "warnings": list(result.warnings),
            "rental": RentalOutputSerializer(rental, context=_context(request)).data,
        }, status=status.HTTP_201_CREATED)


class RentalCompleteView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Concluir locação",
        description=(
            "O locador conclui uma locação assinada pelas duas partes depois da data de fim. A leitura de "
            "devolução (`final_hour_meter`) é opcional e só informativa."
        ),
        request=None,
        responses={200: RentalOutputSerializer, 404: RENTAL_NOT_FOUND,
                   409: error_response(409, "Contrato sem as duas assinaturas ou período ainda em andamento.")},
    )
    def post(self, request: Request, pk: UUID) -> Response:
        rental = RentalService.complete(pk, request.data, user=request.user)
        rental = RentalService.get(rental.pk, user=request.user)
        return Response(RentalOutputSerializer(rental, context=_context(request)).data, status=status.HTTP_200_OK)


class MachineUsageView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Máquinas"],
        summary="Uso registrado da máquina",
        description=(
            "Locações concluídas, diárias e horas registradas pelo horímetro, com a média por diária ao lado "
            "da referência de 8 h. Só o dono da máquina consulta. Informativo: não altera preços."
        ),
        responses={200: None, 404: error_response(404, "Máquina não encontrada.")},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        return Response(MeterService.machine_usage(pk, user=request.user), status=status.HTTP_200_OK)
