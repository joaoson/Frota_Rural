"""Motor determinístico da sugestão de valor/hora.

Este módulo não conversa com a IA, com o banco nem com a rede. Entra um
`PricingInputs`, sai um `PricingResult` — mesma entrada, mesma saída, sempre.
Toda a pesquisa de mercado acontece em `research.py` e chega aqui como número.

A separação é o ponto principal do desenho: o locador precisa poder perguntar
"por que R$ 192?" e receber uma decomposição auditável, não a opinião de um
modelo. Ela também torna a precificação testável sem chamar API nenhuma.

Unidades — a distinção que mais importa:

* **hora faturada**: o que a plataforma cobra. `payments.pricing` fatura 8 h por
  dia de calendário reservado. É a unidade de `hourly_rate`.
* **hora de motor**: o que o horímetro registra. É o que de fato desgasta a
  máquina, e é sempre menor. A ponte entre as duas é `load_factor`.

Confundir as duas subprecifica a máquina em cerca de 35%.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from . import params as P

# O motor calcula em float — as fórmulas têm exponencial e potência
# fracionária, que Decimal não faz. Decimal entra só na fronteira, ao converter
# em dinheiro, que é onde o arredondamento importa.
_CENTS = Decimal("0.01")


def _brl(value):
    return Decimal(str(value)).quantize(_CENTS, rounding=ROUND_HALF_UP)


class PricingError(Exception):
    """Insumo insuficiente ou incoerente para calcular uma sugestão."""


@dataclass(frozen=True)
class PricingInputs:
    category: str
    age_years: int
    used_value_brl: float
    new_value_brl: float
    hour_meter: int
    power_cv: int | None = None
    includes_fuel: bool = False
    includes_operator: bool = False


@dataclass(frozen=True)
class CostItem:
    key: str
    label: str
    brl_per_billed_hour: Decimal


@dataclass(frozen=True)
class PricingResult:
    suggested_brl_hour: Decimal
    """Tarifa bruta do locador — o que ele recebe, antes da taxa da plataforma."""

    range_min_brl_hour: Decimal
    range_max_brl_hour: Decimal
    cost_brl_hour: Decimal
    breakdown: list[CostItem]
    billable_hours_year: int
    engine_hours_year: int
    params_version: str
    within_sanity_band: bool


def annual_depreciation_rate(age_years):
    """Taxa de depreciação temporal no ano corrente da máquina.

    Decai exponencialmente com a idade até um piso: o primeiro ano de uma
    máquina custa caro em valor de revenda, o décimo quase não custa.
    """
    excess = P.DEPRECIATION_INITIAL_RATE - P.DEPRECIATION_FLOOR_RATE
    return P.DEPRECIATION_FLOOR_RATE + excess * math.exp(-P.DEPRECIATION_DECAY * age_years)


def marginal_repair_cost(new_value_brl, hour_meter, rf1, rf2):
    """Custo marginal de reparo na hora de motor atual (ASABE EP496).

    O custo acumulado é ``RC(h) = rf1 · V_novo · (h/1000)^rf2``; o que interessa
    para precificar *a próxima hora* é a derivada.

    É daqui que sai o resultado contra-intuitivo e correto: o custo por hora cai
    muito menos do que o valor da máquina. Um trator que hoje vale 38% do que
    valia ainda custa cerca de 63% por hora — o capital e a depreciação caem com
    o valor, mas a curva de reparo sobe e absorve boa parte da queda (a
    manutenção sai de ~4% para ~38% do custo horário).
    """
    hours_k = hour_meter / 1000.0
    return rf1 * rf2 * new_value_brl * (hours_k ** (rf2 - 1)) / 1000.0


def suggest_rate(inputs: PricingInputs) -> PricingResult:
    params = P.params_for(inputs.category)

    if inputs.used_value_brl <= 0 or inputs.new_value_brl <= 0:
        raise PricingError("Valores de mercado precisam ser positivos.")
    if inputs.used_value_brl > inputs.new_value_brl:
        raise PricingError(
            "O valor do usado não pode superar o do equivalente novo."
        )

    # --- Horas ---------------------------------------------------------------
    billable_hours = (
        params.bookable_days_year * params.target_occupancy * P.BILLED_HOURS_PER_DAY
    )
    engine_hours = billable_hours * params.load_factor
    if billable_hours <= 0:
        raise PricingError("Parâmetros de ocupação resultam em zero hora faturável.")

    # --- Custos fixos anuais (correm com a máquina parada) -------------------
    time_depreciation = (
        params.time_depreciation_share
        * annual_depreciation_rate(inputs.age_years)
        * inputs.used_value_brl
    )
    capital_cost = params.capital_rate * inputs.used_value_brl
    insurance_cost = params.insurance_rate * inputs.used_value_brl

    # --- Custos variáveis por hora de motor (causados por quem aluga) --------
    # Usa o valor de novo: a hora de vida útil consumida vale o que custa repor
    # aquela capacidade, não o que a máquina usada vale hoje.
    wear = inputs.new_value_brl * (1 - params.salvage_fraction) / params.life_hours
    repair = marginal_repair_cost(
        inputs.new_value_brl, inputs.hour_meter, params.rf1, params.rf2
    )

    fuel = 0.0
    if inputs.includes_fuel:
        if not inputs.power_cv:
            raise PricingError(
                "Combustível incluso exige a potência (cv) da máquina."
            )
        fuel = inputs.power_cv * P.DIESEL_LITERS_PER_CV_HOUR * P.DIESEL_PRICE_BRL

    operator = P.OPERATOR_COST_BRL_HOUR if inputs.includes_operator else 0.0

    # --- Montagem, tudo por hora faturada ------------------------------------
    lf = params.load_factor
    items = [
        ("depreciacao_tempo", "Depreciação (tempo)", time_depreciation / billable_hours),
        ("capital", "Custo de capital", capital_cost / billable_hours),
        ("seguro", "Seguro, tributos e guarda", insurance_cost / billable_hours),
        ("desgaste", "Desgaste (vida útil)", wear * lf),
        ("manutencao", "Manutenção e reparos", repair * lf),
    ]
    if inputs.includes_fuel:
        items.append(("combustivel", "Combustível", fuel * lf))
    if inputs.includes_operator:
        items.append(("operador", "Operador", operator * lf))

    cost_per_hour = sum(value for _, _, value in items)
    margin_value = cost_per_hour * params.margin
    items.append(
        (
            "margem",
            f"Margem do locador ({params.margin:.0%})",
            margin_value,
        )
    )

    suggested = cost_per_hour + margin_value

    # --- Guarda-corpo --------------------------------------------------------
    # Uma tarifa fora desta banda quase sempre significa insumo errado, não um
    # mercado exótico. O resultado ainda é devolvido — quem decide o que fazer
    # com ele é a camada de cima —, mas vai marcado.
    ratio = cost_per_hour / inputs.used_value_brl
    within_band = P.SANITY_MIN_RATIO <= ratio <= P.SANITY_MAX_RATIO

    return PricingResult(
        suggested_brl_hour=_brl(suggested),
        range_min_brl_hour=_brl(suggested * (1 - P.SUGGESTION_BAND)),
        range_max_brl_hour=_brl(suggested * (1 + P.SUGGESTION_BAND)),
        cost_brl_hour=_brl(cost_per_hour),
        breakdown=[CostItem(key, label, _brl(value)) for key, label, value in items],
        billable_hours_year=round(billable_hours),
        engine_hours_year=round(engine_hours),
        params_version=P.PARAMS_VERSION,
        within_sanity_band=within_band,
    )
