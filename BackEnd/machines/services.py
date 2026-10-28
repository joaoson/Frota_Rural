from collections.abc import Mapping
from typing import Any
from uuid import UUID, uuid4

from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from django.utils import timezone
from rest_framework.exceptions import NotFound

from common.db import enforce_constraints_now
from common.exceptions import Conflict
from machines.enums import MachineStatus
from machines.models import Machines
from users.models import Users
from machines.serializer import MachineFilterSerializer, MachineInputSerializer

CONFLICT_MESSAGE = "Dados em conflito com uma máquina já cadastrada (ex.: número Renagro)."


class MachineService:
    @staticmethod
    def get(machine_id: UUID, *, actor: Users | None = None) -> Machines:
        try:
            queryset = Machines.objects.all()
            if actor is not None:
                queryset = queryset.filter(owner=actor)
            return queryset.get(id=machine_id)
        except Machines.DoesNotExist as exc:
            raise NotFound("Máquina não encontrada.") from exc

    @staticmethod
    def list(filters: Mapping[str, Any]) -> QuerySet[Machines]:
        serializer = MachineFilterSerializer(data=filters)
        serializer.is_valid(raise_exception=True)
        params: dict[str, Any] = serializer.validated_data

        queryset = Machines.objects.order_by("-created_at", "-id")
        if "owner" in params:
            queryset = queryset.filter(owner_id=params["owner"])
        if "status" in params:
            queryset = queryset.filter(status=params["status"])
        if "brand" in params:
            queryset = queryset.filter(brand__iexact=params["brand"])
        if "model" in params:
            queryset = queryset.filter(model__iexact=params["model"])
        return queryset

    @staticmethod
    @transaction.atomic
    def create(data: Mapping[str, Any], *, actor: Users) -> Machines:
        serializer = MachineInputSerializer(data=data, context={"actor": actor})
        serializer.is_valid(raise_exception=True)
        now = timezone.now()
        if serializer.validated_data.get("hour_meter") is not None:
            serializer.validated_data["hour_meter_updated_at"] = now
        try:
            return serializer.save(
                id=uuid4(),
                status=serializer.validated_data.get("status") or MachineStatus.ACTIVE,
                created_at=now,
                updated_at=now,
            )
        except IntegrityError as exc:
            # O UniqueValidator já cobre o Renagro repetido; aqui sobra a corrida
            # entre duas requisições simultâneas.
            raise Conflict(CONFLICT_MESSAGE) from exc

    @staticmethod
    @transaction.atomic
    def update(machine_id: UUID, data: Mapping[str, Any], *, actor: Users, partial: bool = False) -> Machines:
        machine = MachineService.get(machine_id, actor=actor)
        serializer = MachineInputSerializer(machine, data=data, partial=partial, context={"actor": actor})
        serializer.is_valid(raise_exception=True)
        now = timezone.now()
        if "hour_meter" in serializer.validated_data and serializer.validated_data["hour_meter"] != machine.hour_meter:
            serializer.validated_data["hour_meter_updated_at"] = now
        try:
            return serializer.save(updated_at=now)
        except IntegrityError as exc:
            raise Conflict(CONFLICT_MESSAGE) from exc

    @staticmethod
    @transaction.atomic
    def delete(machine_id: UUID, *, actor: Users) -> None:
        machine = MachineService.get(machine_id, actor=actor)
        enforce_constraints_now()
        if machine.postings_set.exists():
            raise Conflict("A máquina possui anúncios vinculados e não pode ser excluída.", code="has_dependents")
        try:
            machine.delete()
        except IntegrityError as exc:
            raise Conflict(
                "Não é possível excluir esta máquina: existem registros dependentes (ex.: anúncios).",
                code="has_dependents",
            ) from exc
