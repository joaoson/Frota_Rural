from django.db import IntegrityError
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Machines
from .serializer import MachineSerializer
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiExample, OpenApiResponse, OpenApiParameter

# Create your views here.
def _machines_queryset():
    return Machines.objects.all()


@extend_schema(
    summary="Listar ou Cadastrar Máquinas",
    description="Retorna as máquinas cadastradas, permitindo filtro por proprietário, status, marca ou modelo. Também permite cadastrar uma nova máquina no inventário (sem estar necessariamente anunciada).",
    parameters=[
        OpenApiParameter('owner', type=str, description='ID do proprietário'),
        OpenApiParameter('status', type=str, description='Status da máquina (active, maintenance)'),
        OpenApiParameter('brand', type=str, description='Marca da máquina'),
        OpenApiParameter('model', type=str, description='Modelo da máquina'),
    ],
    responses={
        200: MachineSerializer(many=True),
        201: MachineSerializer,
        400: OpenApiResponse(description="Dados inválidos ou Renagro já cadastrado")
    },
    examples=[
        OpenApiExample(
            'Trator John Deere',
            summary='Exemplo de cadastro de Trator',
            value={
                "owner": "123e4567-e89b-12d3-a456-426614174000",
                "renagro_number": "RNG-123456789",
                "brand": "John Deere",
                "model": "6135J",
                "year": 2021,
                "usage_purpose": "Preparo de solo",
                "status": "active"
            },
            request_only=True
        ),
        OpenApiExample(
            'Colheitadeira Valtra',
            summary='Exemplo de cadastro de Colheitadeira',
            value={
                "owner": "123e4567-e89b-12d3-a456-426614174000",
                "renagro_number": "RNG-987654321",
                "brand": "Valtra",
                "model": "BC6500",
                "year": 2019,
                "usage_purpose": "Colheita de Grãos",
                "status": "active"
            },
            request_only=True
        )
    ]
)
@api_view(["GET", "POST"])
def machines_list(request):
    if request.method == "GET":
        qs = _machines_queryset().order_by("-created_at", "-id")
        owner_id = request.query_params.get("owner")
        if owner_id:
            qs = qs.filter(owner_id=owner_id)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        brand = request.query_params.get("brand")
        if brand:
            qs = qs.filter(brand__iexact=brand)
        model = request.query_params.get("model")
        if model:
            qs = qs.filter(model__iexact=model)
        serializer = MachineSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = MachineSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    try:
        serializer.save()
    except IntegrityError:
        return Response(
            {"error": "Dados inválidos ou em conflito (ex.: renagro_number já cadastrado)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema(
    summary="Obter/Atualizar/Deletar Máquina",
    description="Retorna ou edita os dados de uma máquina específica pelo ID. Permite exclusão caso não existam anúncios vinculados.",
    methods=['GET', 'PUT', 'PATCH', 'DELETE'],
    responses={
        200: MachineSerializer,
        204: OpenApiResponse(description="Deletado com sucesso"),
        404: OpenApiResponse(description="Máquina não encontrada"),
        409: OpenApiResponse(description="Conflito (Existem registros dependentes)")
    }
)
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def machine_detail(request, pk):
    try:
        machine = _machines_queryset().get(pk=pk)
    except Machines.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(MachineSerializer(machine).data, status=status.HTTP_200_OK)

    if request.method == "PUT":
        serializer = MachineSerializer(machine, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {"error": "Dados inválidos ou em conflito (ex.: renagro_number já cadastrado)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(serializer.data, status=status.HTTP_200_OK)

    if request.method == "PATCH":
        serializer = MachineSerializer(machine, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {"error": "Dados inválidos ou em conflito (ex.: renagro_number já cadastrado)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(serializer.data, status=status.HTTP_200_OK)

    try:
        machine.delete()
    except IntegrityError:
        return Response(
            {
                "error": "Não é possível excluir esta máquina: existem registros dependentes (ex.: anúncios).",
            },
            status=status.HTTP_409_CONFLICT,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)