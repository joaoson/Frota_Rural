from dataclasses import dataclass
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from django.utils import timezone

from rentals.models import Rentals

HORAS_POR_DIARIA = 8
TAXA_PLATAFORMA = Decimal("0.05")
CENTAVOS = Decimal("0.01")


def calcular_diarias(inicio: datetime | None, fim: datetime | None) -> int:
    """Diárias cobradas: o dia de início e o de fim contam inteiros."""
    if not inicio or not fim:
        return 0
    dias = (fim.date() - inicio.date()).days
    if dias < 0:
        return 0
    return dias + 1


@dataclass(frozen=True)
class Cotacao:
    """Preço acordado de uma locação: diária fixa (tarifa × 8 h), sem horímetro."""

    tarifa_hora: Decimal
    valor_diaria: Decimal
    diarias: int
    subtotal: Decimal
    taxa_percentual: Decimal
    taxa_valor: Decimal
    total: Decimal

    @property
    def horas_por_diaria(self) -> int:
        return HORAS_POR_DIARIA

    def snapshot(self) -> dict[str, object]:
        """Campos de `Rentals` que congelam esta cotação na reserva."""
        return {
            "hourly_rate_snapshot": self.tarifa_hora,
            "daily_rate": self.valor_diaria,
            "billable_days": self.diarias,
            "subtotal": self.subtotal,
            "platform_fee_rate": self.taxa_percentual,
            "platform_fee": self.taxa_valor,
            "total_price": self.total,
            "priced_at": timezone.now(),
        }


def cotar(posting, inicio: datetime | None, fim: datetime | None) -> Cotacao:
    """Cotação calculada no servidor a partir da tarifa atual do anúncio."""
    tarifa = Decimal(posting.hourly_rate)
    diarias = calcular_diarias(inicio, fim)
    valor_diaria = tarifa * HORAS_POR_DIARIA
    subtotal = valor_diaria * diarias
    total = (subtotal * (Decimal("1") + TAXA_PLATAFORMA)).quantize(CENTAVOS, rounding=ROUND_HALF_UP)
    return Cotacao(
        tarifa_hora=tarifa,
        valor_diaria=valor_diaria,
        diarias=diarias,
        subtotal=subtotal,
        taxa_percentual=TAXA_PLATAFORMA,
        taxa_valor=total - subtotal,
        total=total,
    )


def calcular_total(rental: Rentals) -> Decimal:
    """Valor da locação recalculado no servidor, com a taxa da plataforma."""
    return cotar(rental.postings, rental.start_date, rental.end_date).total
