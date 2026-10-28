from uuid import UUID

from rentals.cancellation import CancellationInputSerializer, CancellationQuoteSerializer

from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.schemas import error_response, error_responses
from rentals.dashboard import LessorDashboardFilterSerializer, LessorDashboardService
from rentals.meter import MeterReadingInputSerializer, MeterService
from rentals.schema import (
    BookingPolicyOutputSerializer, LessorDashboardOutputSerializer, MachineUsageOutputSerializer,
    MeterRecordOutputSerializer, RentalCompleteInputSerializer, RentalCreateInputSerializer,
    RentalUpdateInputSerializer,
)
from rentals.serializer import (
    RentalFilterSerializer,
    RentalMeterReadingOutputSerializer,
    RentalOutputSerializer,
    TipoCulturaOutputSerializer,
)
from rentals import policy
from rentals.services import RentalService, TipoCulturaService

TAGS = ["Locações"]


def _context(request: Request) -> dict[str, object]:
    """`allowed_actions` depende de quem pergunta."""
    return {"user": request.user}
RENTAL_NOT_FOUND = error_response(404, "Locação não encontrada.")
INVALID_RENTAL = error_response(
    400, "Dados inválidos, período acima do limite do anúncio ou em conflito com outra reserva."
)
UPDATE_DESCRIPTION = (
    "O locatário pode editar observações. Datas e operador só mudam enquanto a reserva está "
    "`pending` e não há pagamento aberto; novas datas revalidam a agenda e recalculam a cotação. "
    "O operador deve estar ativo e vinculado à equipe do locatário. `postings` e `lessee` são "
    "imutáveis; `total_price` não é gravável. Enviar `status` retorna 409 (`use_rental_action`): "
    "use `/cancel` ou `/complete`. Para datas de uma locação paga, use aditivos do contrato."
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
            "status `pending_signatures`. A locação começa `pending`, com bloqueio temporário de "
            "30 minutos em `reservation_expires_at`.\n\n"
            "Use um anúncio e uma máquina ativos, de outro usuário, e `lessee` igual ao usuário "
            "autenticado. Consulte `/api/rentals/policy` e a disponibilidade do anúncio antes de "
            "escolher datas. O operador é opcional; se informado, deve estar ativo na equipe do "
            "locatário. Não envie `total_price`: o servidor calcula e preserva a cotação.\n\n"
            "No exemplo, substitua os UUIDs e escolha três dias disponíveis após a data mínima. "
            "Com tarifa de R$ 100/h, três diárias de 8 h e taxa de 5%, o total é R$ 2.520,00. "
            "Use `id` para checkout e `contract_id` para consultar o contrato."
        ),
        request=RentalCreateInputSerializer,
        responses={201: RentalOutputSerializer, 400: INVALID_RENTAL, **error_responses(401, 403)},
        examples=[
            OpenApiExample(
                "Nova Reserva de Trator",
                summary="Reserva de três diárias; preço calculado pelo servidor",
                description="Substitua os UUIDs por anúncio ativo e usuário autenticado; ajuste as datas à política e agenda.",
                value={
                    "postings": "f5e1c4a0-56d1-4b7c-9a1b-c1d4e6f8a9b2",
                    "lessee": "e6a2b8e5-3d71-4a9f-b98a-f4c78d0671f2",
                    "start_date": "2030-05-10T08:00:00-03:00",
                    "end_date": "2030-05-12T18:00:00-03:00",
                    "notes": "Retirada pela manhã; combinar entrega pelo chat.",
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
        description="Consulta uma reserva visível para o participante ou administrador, com preço acordado, contrato, leituras e ações permitidas.",
        responses={200: RentalOutputSerializer, 404: RENTAL_NOT_FOUND},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        rental = RentalService.get(pk, user=request.user)
        return Response(RentalOutputSerializer(rental, context=_context(request)).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Substituir locação",
        description=UPDATE_DESCRIPTION + " PUT exige início e fim; use PATCH para enviar somente os campos alterados.",
        request=RentalUpdateInputSerializer,
        responses={200: RentalOutputSerializer, 400: INVALID_RENTAL, 404: RENTAL_NOT_FOUND, **error_responses(401, 403, 409)},
    )
    def put(self, request: Request, pk: UUID) -> Response:
        rental = RentalService.update(pk, request.data, user=request.user)
        return Response(RentalOutputSerializer(rental, context=_context(request)).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Atualizar locação parcialmente",
        description=UPDATE_DESCRIPTION,
        request=RentalUpdateInputSerializer,
        responses={200: RentalOutputSerializer, 400: INVALID_RENTAL, 404: RENTAL_NOT_FOUND, **error_responses(401, 403, 409)},
        examples=[OpenApiExample("Atualizar observação", value={"notes": "Combinar retirada às 8h pelo chat."}, request_only=True)],
    )
    def patch(self, request: Request, pk: UUID) -> Response:
        rental = RentalService.update(pk, request.data, user=request.user, partial=True)
        return Response(RentalOutputSerializer(rental, context=_context(request)).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Exclusão bloqueada para preservar o histórico",
        description="Rota de compatibilidade: uma locação visível retorna 409 (`has_dependents`) para preservar seu histórico. Para cancelar e solicitar estorno, use POST /api/rentals/{id}/cancel.",
        responses={
            401: error_response(401),
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
        responses={200: BookingPolicyOutputSerializer},
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
            201: MeterRecordOutputSerializer,
            400: error_response(400, "Leitura negativa, acima de 60.000 h ou de devolução menor que a de retirada."),
            403: error_response(403, "Somente o locador registra as leituras."),
            404: RENTAL_NOT_FOUND,
            409: error_response(409, "Locação ainda não assinada, já concluída ou antes do primeiro dia."),
        },
        examples=[OpenApiExample("Retirada", value={"kind": "check_in", "value": 1250, "note": "Leitura conferida no painel."}, request_only=True)],
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
        request=RentalCompleteInputSerializer,
        examples=[
            OpenApiExample("Concluir sem leitura", value={}, request_only=True),
            OpenApiExample("Concluir com leitura de devolução", value={"final_hour_meter": 1274, "note": "Devolução conferida."}, request_only=True),
        ],
        responses={200: RentalOutputSerializer, 404: RENTAL_NOT_FOUND, **error_responses(400, 401, 403),
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
        responses={200: MachineUsageOutputSerializer, 404: error_response(404, "Máquina não encontrada.")},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        return Response(MeterService.machine_usage(pk, user=request.user), status=status.HTTP_200_OK)


LESSOR_DASHBOARD_EXAMPLE = {
    "period": {"months": 3, "start": "2026-08-01", "end": "2026-10-21", "time_zone": "America/Sao_Paulo"},
    "machine": None,
    "totals": {
        "revenue": "7560.00", "current_month_revenue": "2520.00", "completed_rentals": 3,
        "reviews": 2, "average_rating": "4.50", "open_rentals": 2, "rentals": 6,
    },
    "monthly": [
        {"month": "2026-08-01", "revenue": "0.00", "completed_rentals": 0, "reviews": 0, "average_rating": None},
        {"month": "2026-09-01", "revenue": "5040.00", "completed_rentals": 2, "reviews": 1, "average_rating": "5.00"},
        {"month": "2026-10-01", "revenue": "2520.00", "completed_rentals": 1, "reviews": 1, "average_rating": "4.00"},
    ],
    "status_breakdown": [
        {"status": "pending", "label": "Pendente", "total": 1},
        {"status": "awaiting_payment", "label": "Aguardando pagamento", "total": 0},
        {"status": "active", "label": "Ativa", "total": 0},
        {"status": "signed", "label": "Assinada", "total": 1},
        {"status": "completed", "label": "Concluída", "total": 3},
        {"status": "closed", "label": "Encerrada", "total": 0},
        {"status": "cancelled", "label": "Cancelada", "total": 1},
    ],
    "top_machines": [
        {"machine": "6d1f2c4e-8b7a-4f3e-9c21-5a0b7e3d9f10", "name": "John Deere 6110J",
         "completed_rentals": 2, "revenue": "5040.00"},
        {"machine": "0b9e7a52-3c4d-4e8f-a1b2-c3d4e5f60718", "name": "John Deere 6125J",
         "completed_rentals": 1, "revenue": "2520.00"},
    ],
}


class LessorDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Painéis"],
        summary="Indicadores do painel do locador",
        description=(
            "Série mensal de valores concluídos e avaliações recebidas, calculada pela rotina armazenada "
            "`lessor_dashboard_monthly` do PostgreSQL no fuso informado, com zero nos meses sem movimento. "
            "Situação das locações e máquinas de maior valor vêm de consultas agrupadas. Somente locadores; "
            "`machine` restringe os indicadores a uma máquina própria. Valores brutos, sem confirmação de repasse."
        ),
        parameters=[LessorDashboardFilterSerializer],
        examples=[OpenApiExample("Frota com dois tratores", value=LESSOR_DASHBOARD_EXAMPLE, response_only=True)],
        responses={
            200: LessorDashboardOutputSerializer,
            400: error_response(400, "Período fora de 1 a 24 meses, máquina ou fuso inválido."),
            401: error_response(401),
            403: error_response(403, "Somente locadores consultam o painel."),
            404: error_response(404, "Máquina não encontrada."),
        },
    )
    def get(self, request: Request) -> Response:
        summary = LessorDashboardService.summary(request.query_params, user=request.user)
        return Response(LessorDashboardOutputSerializer(summary).data, status=status.HTTP_200_OK)


class RentalCancellationView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=TAGS, summary="Simular cancelamento e estorno",
                   description="Calcula a elegibilidade, valor a devolver e retenção conforme a política preservada na reserva. Não cancela nem solicita estorno.",
                   responses={200: CancellationQuoteSerializer, 401: error_response(401), 404: error_response(404)})
    def get(self, request, pk):
        from rentals.cancellation import CancellationService
        rental = CancellationService.get(pk, user=request.user)
        return Response(policy.cancellation_quote(rental, request.user))


class RentalCancelView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=TAGS, summary="Cancelar locação e solicitar estorno",
                   description="Cancela e libera as datas; registra uma obrigação durável de estorno. O campo refunds distingue solicitação de devolução confirmada. Repetir não duplica a obrigação.",
                   request=CancellationInputSerializer,
                   examples=[OpenApiExample("Cancelamento pelo participante", value={"reason": "Alteração do planejamento de uso."}, request_only=True)],
                   responses={200: RentalOutputSerializer, 400: error_response(400), 401: error_response(401), 404: error_response(404), 409: error_response(409)})
    def post(self, request, pk):
        from rentals.cancellation import CancellationService
        rental = CancellationService.cancel(pk, request.data, user=request.user)
        return Response(RentalOutputSerializer(rental, context=_context(request)).data)


class TipoCulturaListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=TAGS,
        summary="Listar tipos de cultura",
        description="Opções da tabela `tipos_cultura` usadas na reserva.",
        responses={200: TipoCulturaOutputSerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        tipos = TipoCulturaService.list()
        return Response(TipoCulturaOutputSerializer(tipos, many=True).data, status=status.HTTP_200_OK)
