from uuid import UUID

from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.schemas import error_response, error_responses
from machines.serializer import (
    MachineFilterSerializer,
    MachineInputSerializer,
    MachineOutputSerializer,
)
from machines.services import MachineService

TAGS = ["Maquinário"]
MACHINE_NOT_FOUND = error_response(404, "Máquina não encontrada.")


class MachineListView(APIView):
    @extend_schema(
        tags=TAGS,
        summary="Listar máquinas",
        description="Retorna as máquinas cadastradas, com filtros opcionais por proprietário, status, marca ou modelo.",
        parameters=[MachineFilterSerializer],
        responses={200: MachineOutputSerializer(many=True), **error_responses(400)},
    )
    def get(self, request: Request) -> Response:
        machines = MachineService.list(request.query_params)
        return Response(
            MachineOutputSerializer(machines, many=True).data, status=status.HTTP_200_OK
        )

    @extend_schema(
        tags=TAGS,
        summary="Cadastrar máquina",
        description=(
            "Cadastra uma máquina no inventário do locador. A máquina existe independentemente "
            "de anúncio: publicá-la para locação é um passo separado, em `/api/postings/`."
        ),
        request=MachineInputSerializer,
        responses={201: MachineOutputSerializer, **error_responses(400, 409)},
        examples=[
            OpenApiExample(
                "Trator John Deere",
                summary="Exemplo de cadastro de Trator",
                value={
                    "owner": "123e4567-e89b-12d3-a456-426614174000",
                    "renagro_number": "RNG-123456789",
                    "brand": "John Deere",
                    "model": "6135J",
                    "year": 2021,
                    "usage_purpose": "Preparo de solo",
                    "status": "active",
                },
                request_only=True,
            ),
            OpenApiExample(
                "Colheitadeira Valtra",
                summary="Exemplo de cadastro de Colheitadeira",
                value={
                    "owner": "123e4567-e89b-12d3-a456-426614174000",
                    "renagro_number": "RNG-987654321",
                    "brand": "Valtra",
                    "model": "BC6500",
                    "year": 2019,
                    "usage_purpose": "Colheita de Grãos",
                    "status": "active",
                },
                request_only=True,
            ),
        ],
    )
    def post(self, request: Request) -> Response:
        machine = MachineService.create(request.data)
        return Response(MachineOutputSerializer(machine).data, status=status.HTTP_201_CREATED)


class MachineDetailView(APIView):
    @extend_schema(
        tags=TAGS,
        summary="Consultar máquina",
        responses={200: MachineOutputSerializer, 404: MACHINE_NOT_FOUND},
    )
    def get(self, request: Request, pk: UUID) -> Response:
        machine = MachineService.get(pk)
        return Response(MachineOutputSerializer(machine).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Substituir máquina",
        request=MachineInputSerializer,
        responses={
            200: MachineOutputSerializer,
            **error_responses(400, 409),
            404: MACHINE_NOT_FOUND,
        },
    )
    def put(self, request: Request, pk: UUID) -> Response:
        machine = MachineService.update(pk, request.data)
        return Response(MachineOutputSerializer(machine).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Atualizar máquina parcialmente",
        description="Usado, por exemplo, para mover a máquina para `maintenance` sem reenviar o cadastro inteiro.",
        request=MachineInputSerializer,
        responses={
            200: MachineOutputSerializer,
            **error_responses(400, 409),
            404: MACHINE_NOT_FOUND,
        },
    )
    def patch(self, request: Request, pk: UUID) -> Response:
        machine = MachineService.update(pk, request.data, partial=True)
        return Response(MachineOutputSerializer(machine).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=TAGS,
        summary="Excluir máquina",
        description="Só é possível excluir uma máquina sem registros dependentes, como anúncios publicados.",
        responses={
            204: None,
            404: MACHINE_NOT_FOUND,
            409: error_response(409, "Existem registros dependentes (ex.: anúncios)."),
        },
    )
    def delete(self, request: Request, pk: UUID) -> Response:
        MachineService.delete(pk)
        return Response(status=status.HTTP_204_NO_CONTENT)
