from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from api.validation import query_uuid
from rest_framework.response import Response
from .models import Machines
from api.schemas import ErrorResponseSerializer
from .serializer import MachineSerializer
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiExample, OpenApiResponse, OpenApiParameter

# Create your views here.
def _machines_queryset():
    return Machines.objects.all()


MACHINE_NOT_FOUND = OpenApiResponse(description="Máquina não encontrada.")
MACHINE_CONFLICT = OpenApiResponse(
    response=ErrorResponseSerializer,
    description="Dados inválidos ou em conflito (ex.: `renagro_number` já cadastrado).",
)


@extend_schema_view(
    get=extend_schema(
        tags=['Maquinário'],
        summary="Listar máquinas",
        description="Retorna as máquinas cadastradas, com filtros opcionais por proprietário, status, marca ou modelo.",
        parameters=[
            OpenApiParameter('owner', type=str, description='ID do proprietário'),
            OpenApiParameter('status', type=str, description='Status da máquina (active, maintenance)'),
            OpenApiParameter('brand', type=str, description='Marca da máquina'),
            OpenApiParameter('model', type=str, description='Modelo da máquina'),
        ],
        responses={200: MachineSerializer(many=True)},
    ),
    post=extend_schema(
        tags=['Maquinário'],
        summary="Cadastrar máquina",
        description=(
            "Cadastra uma máquina no inventário do locador. A máquina existe independentemente "
            "de anúncio: publicá-la para locação é um passo separado, em `/api/postings/`."
        ),
        request=MachineSerializer,
        responses={201: MachineSerializer, 400: MACHINE_CONFLICT},
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
        ],
    ),
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticatedOrReadOnly])
def machines_list(request):
    if request.method == "GET":
        qs = _machines_queryset().order_by("-created_at", "-id")
        owner_id = query_uuid(request, "owner")
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

    serializer = MachineSerializer(data=request.data, context={"request": request})
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


@extend_schema_view(
    get=extend_schema(
        tags=['Maquinário'],
        summary="Consultar máquina",
        responses={200: MachineSerializer, 404: MACHINE_NOT_FOUND},
    ),
    put=extend_schema(
        tags=['Maquinário'],
        summary="Substituir máquina",
        request=MachineSerializer,
        responses={200: MachineSerializer, 400: MACHINE_CONFLICT, 404: MACHINE_NOT_FOUND},
    ),
    patch=extend_schema(
        tags=['Maquinário'],
        summary="Atualizar máquina parcialmente",
        description="Usado, por exemplo, para mover a máquina para `maintenance` sem reenviar o cadastro inteiro.",
        request=MachineSerializer,
        responses={200: MachineSerializer, 400: MACHINE_CONFLICT, 404: MACHINE_NOT_FOUND},
    ),
    delete=extend_schema(
        tags=['Maquinário'],
        summary="Excluir máquina",
        description="Só é possível excluir uma máquina sem registros dependentes, como anúncios publicados.",
        responses={
            204: OpenApiResponse(description="Máquina excluída."),
            404: MACHINE_NOT_FOUND,
            409: OpenApiResponse(
                response=ErrorResponseSerializer,
                description="Existem registros dependentes (ex.: anúncios) impedindo a exclusão.",
            ),
        },
    ),
)
@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticatedOrReadOnly])
def machine_detail(request, pk):
    try:
        queryset = _machines_queryset()
        if request.method != "GET":
            queryset = queryset.filter(owner=request.user)
        machine = queryset.get(pk=pk)
    except Machines.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(MachineSerializer(machine).data, status=status.HTTP_200_OK)

    if request.method == "PUT":
        serializer = MachineSerializer(machine, data=request.data, context={"request": request})
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
        serializer = MachineSerializer(machine, data=request.data, partial=True, context={"request": request})
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
        if machine.postings_set.exists():
            return Response({"error": "A máquina possui anúncios vinculados e não pode ser excluída."}, status=409)
        with transaction.atomic():
            machine.delete()
    except IntegrityError:
        return Response(
            {
                "error": "Não é possível excluir esta máquina: existem registros dependentes (ex.: anúncios).",
            },
            status=status.HTTP_409_CONFLICT,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)