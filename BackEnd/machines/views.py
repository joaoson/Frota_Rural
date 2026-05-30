from django.db import IntegrityError
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Machines
from .serializer import MachineSerializer

# Create your views here.
def _machines_queryset():
    return Machines.objects.all()


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