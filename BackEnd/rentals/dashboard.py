"""Indicadores do painel do locador, agregados no banco.

A série mensal vem da rotina armazenada `lessor_dashboard_monthly` (migração
rentals.0007); a situação das locações e o ranking de máquinas são consultas
agrupadas do ORM (`values().annotate()` → GROUP BY). O navegador só desenha.
"""

from collections.abc import Mapping
from datetime import datetime, time
from decimal import Decimal
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, available_timezones

from django.db import connection
from django.db.models import Count, DecimalField, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import NotFound, PermissionDenied

from machines.models import Machines
from rentals import lifecycle
from rentals.enums import RentalStatus
from rentals.models import Rentals
from users.enums import UserRole

DEFAULT_TIME_ZONE = "America/Sao_Paulo"
TOP_MACHINES = 5
OPEN_STATUSES = tuple(
    status for status in RentalStatus if status not in lifecycle.FINISHED and status != RentalStatus.CANCELLED
)


class LessorDashboardFilterSerializer(serializers.Serializer):
    months = serializers.IntegerField(
        required=False, default=6, min_value=1, max_value=24,
        help_text="Meses da série, contando o mês atual (1 a 24).",
    )
    machine = serializers.UUIDField(required=False, help_text="Restringe os indicadores a uma máquina sua.")
    time_zone = serializers.CharField(
        required=False, default=DEFAULT_TIME_ZONE, max_length=64,
        help_text="Fuso IANA usado para separar os meses, por exemplo `America/Sao_Paulo`.",
    )

    def validate_time_zone(self, value: str) -> str:
        if value not in available_timezones():
            raise serializers.ValidationError("Fuso horário desconhecido.")
        return value


def _monthly(owner_id: UUID, months: int, time_zone: str, now: datetime, machine: UUID | None) -> list[dict[str, Any]]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT month, revenue, completed_rentals, rating_sum, reviews, average_rating "
            "FROM lessor_dashboard_monthly(%s, %s, %s, %s, %s)",
            [owner_id, months, time_zone, now, machine],
        )
        columns = [column.name for column in cursor.description]
        return [dict(zip(columns, row, strict=True)) for row in cursor.fetchall()]


class LessorDashboardService:
    @staticmethod
    def summary(params: Mapping[str, Any], *, user) -> dict[str, Any]:
        if user.role != UserRole.LESSOR:
            raise PermissionDenied("Somente locadores consultam o painel de locações.")
        filters = LessorDashboardFilterSerializer(data=params)
        filters.is_valid(raise_exception=True)
        months: int = filters.validated_data["months"]
        machine: UUID | None = filters.validated_data.get("machine")
        time_zone: str = filters.validated_data["time_zone"]
        if machine is not None and not Machines.objects.filter(pk=machine, owner=user).exists():
            raise NotFound("Máquina não encontrada.")

        now = timezone.now()
        monthly = _monthly(user.pk, months, time_zone, now, machine)
        start = datetime.combine(monthly[0]["month"], time.min, tzinfo=ZoneInfo(time_zone))

        rentals = Rentals.objects.filter(postings__machinery__owner=user)
        if machine is not None:
            rentals = rentals.filter(postings__machinery=machine)
        by_status = dict(
            rentals.exclude(status__isnull=True).values("status").annotate(total=Count("id")).values_list("status", "total")
        )
        top_machines = (
            rentals.filter(status__in=lifecycle.FINISHED, end_date__gte=start, end_date__lte=now)
            .values("postings__machinery", "postings__machinery__brand", "postings__machinery__model")
            .annotate(
                completed_rentals=Count("id"),
                revenue=Coalesce(Sum("total_price"), Value(Decimal("0")), output_field=DecimalField()),
            )
            .order_by("-revenue", "-completed_rentals", "postings__machinery__brand", "postings__machinery__model")
            [:TOP_MACHINES]
        )

        reviews = sum(row["reviews"] for row in monthly)
        rating_sum = sum(row["rating_sum"] for row in monthly)
        return {
            "period": {
                "months": months,
                "start": monthly[0]["month"],
                "end": timezone.localdate(now, ZoneInfo(time_zone)),
                "time_zone": time_zone,
            },
            "machine": machine,
            "totals": {
                "revenue": sum((row["revenue"] for row in monthly), Decimal("0")),
                "current_month_revenue": monthly[-1]["revenue"],
                "completed_rentals": sum(row["completed_rentals"] for row in monthly),
                "reviews": reviews,
                "average_rating": (Decimal(rating_sum) / reviews).quantize(Decimal("0.01")) if reviews else None,
                "open_rentals": sum(by_status.get(status, 0) for status in OPEN_STATUSES),
                "rentals": sum(by_status.values()),
            },
            "monthly": [
                {key: row[key] for key in ("month", "revenue", "completed_rentals", "reviews", "average_rating")}
                for row in monthly
            ],
            "status_breakdown": [
                {"status": status.value, "label": status.label, "total": by_status.get(status.value, 0)}
                for status in RentalStatus
            ],
            "top_machines": [
                {
                    "machine": row["postings__machinery"],
                    "name": " ".join(filter(None, [row["postings__machinery__brand"], row["postings__machinery__model"]])),
                    "completed_rentals": row["completed_rentals"],
                    "revenue": row["revenue"],
                }
                for row in top_machines
            ],
        }
