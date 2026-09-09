"""Orquestração da sugestão: insumos -> motor -> registro.

Responsabilidades, nesta ordem:

1. Resolver os insumos da máquina (categoria, idade, horímetro, potência);
2. Obter o valor de mercado — cache, senão pesquisa, senão comparáveis internos;
3. Rodar o motor determinístico;
4. Ancorar o resultado no mercado e nos anúncios da própria plataforma;
5. Gravar a sugestão para auditoria e calibração futura.

A cascata do passo 2 é deliberada e termina em "não sugerir". Preencher o campo
com um número inventado é pior do que deixar o locador digitar o dele.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from statistics import median

from django.utils import timezone

from machines.models import Machines
from postings.models import Postings

from . import params as P
from . import research as research_module
from .engine import PricingError, PricingInputs, suggest_rate
from .models import MachineValuations, PricingSuggestions

logger = logging.getLogger(__name__)

VALUATION_TTL_DAYS = 90

# Horas de motor por ano de uma máquina típica fora da plataforma. Usado só
# quando o locador não informou o horímetro — a curva de reparo precisa de
# alguma leitura, e idade × uso típico erra menos do que assumir zero.
TYPICAL_ENGINE_HOURS_PER_YEAR = 700

# Quantos anúncios comparáveis bastam para o sinal interno dominar a mistura.
MIN_COMPARABLES_FOR_WEIGHT = 5

# Faixas de semelhança para um anúncio contar como comparável.
COMPARABLE_YEAR_SPAN = 3
COMPARABLE_POWER_SPAN = 0.20


class SuggestionUnavailable(Exception):
    """Não há insumo confiável o bastante para sugerir um valor."""


@dataclass(frozen=True)
class Suggestion:
    suggested_hourly_rate: Decimal
    range_min: Decimal
    range_max: Decimal
    cost_hourly_rate: Decimal
    lessee_pays_hourly: Decimal
    daily_equivalent: Decimal
    breakdown: list
    assumptions: dict
    sources: list
    confidence: str
    source: str
    params_version: str
    suggestion_id: uuid.UUID
    search_suggestions_html: str | None = None


def _normalize(value):
    return (value or "").strip().lower()


def _cached_valuation(brand, model, year):
    entry = MachineValuations.objects.filter(
        brand=_normalize(brand), model=_normalize(model), year=year
    ).first()
    if entry and entry.expires_at > timezone.now():
        return entry
    return None


def _store_valuation(brand, model, year, result):
    now = timezone.now()
    payload = result.as_dict()
    MachineValuations.objects.update_or_create(
        brand=_normalize(brand),
        model=_normalize(model),
        year=year,
        # `id` só em `create_defaults`: em `defaults` ele reescreveria a chave
        # primária de um registro existente, o que o Django grava como INSERT e
        # estoura na unicidade de (marca, modelo, ano) ao renovar o cache.
        create_defaults={
            "id": uuid.uuid4(),
            "payload": payload,
            "confidence": result.confidence,
            "researched_at": now,
            "expires_at": now + timedelta(days=VALUATION_TTL_DAYS),
        },
        defaults={
            "payload": payload,
            "confidence": result.confidence,
            "researched_at": now,
            "expires_at": now + timedelta(days=VALUATION_TTL_DAYS),
        },
    )


def _comparable_postings(machine):
    """Anúncios ativos de máquinas semelhantes, para o sinal interno.

    Semelhante = mesma categoria de precificação, ano próximo e, quando ambas
    as potências são conhecidas, porte próximo. Potência ausente não descarta o
    comparável: no começo da base, descartar por campo vazio deixaria a amostra
    em zero.
    """
    category = P.category_for(machine.usage_purpose)
    qs = (
        Postings.objects.filter(status="active")
        .exclude(machinery_id=machine.id)
        .select_related("machinery")
    )
    if machine.year:
        qs = qs.filter(
            machinery__year__gte=machine.year - COMPARABLE_YEAR_SPAN,
            machinery__year__lte=machine.year + COMPARABLE_YEAR_SPAN,
        )

    rates = []
    for posting in qs:
        other = posting.machinery
        if P.category_for(other.usage_purpose) != category:
            continue
        if machine.power_cv and other.power_cv:
            low = machine.power_cv * (1 - COMPARABLE_POWER_SPAN)
            high = machine.power_cv * (1 + COMPARABLE_POWER_SPAN)
            if not (low <= other.power_cv <= high):
                continue
        rates.append(float(posting.hourly_rate))
    return rates


def _anchor(cost_rate, market_rates, internal_rates, confidence):
    """Mistura custo, mercado pesquisado e comparáveis internos.

    O peso interno cresce com a amostra de propósito: conforme a plataforma
    acumula anúncios, a própria base vira a melhor fonte de preço e a
    dependência da pesquisa externa cai.
    """
    market = median(market_rates) if market_rates else None
    internal = median(internal_rates) if internal_rates else None

    if internal is not None and len(internal_rates) >= MIN_COMPARABLES_FOR_WEIGHT:
        weights = {"custo": 0.30, "mercado": 0.25, "interno": 0.45}
    elif market is not None and confidence in ("alta", "media"):
        weights = {"custo": 0.55, "mercado": 0.45, "interno": 0.0}
    else:
        weights = {"custo": 1.0, "mercado": 0.0, "interno": 0.0}

    # Redistribui para o custo o peso de qualquer sinal que não existe, para os
    # pesos somarem 1 sem inventar uma fonte.
    total = float(cost_rate) * weights["custo"]
    used = weights["custo"]
    if market is not None and weights["mercado"]:
        total += market * weights["mercado"]
        used += weights["mercado"]
    if internal is not None and weights["interno"]:
        total += internal * weights["interno"]
        used += weights["interno"]
    return Decimal(str(total / used)).quantize(Decimal("0.01"))


def _machine_age(machine):
    current_year = timezone.now().year
    if not machine.year:
        return 0
    return max(0, current_year - machine.year)


def _estimated_hour_meter(machine, age_years):
    if machine.hour_meter is not None:
        return machine.hour_meter, True
    return age_years * TYPICAL_ENGINE_HOURS_PER_YEAR, False


def build_suggestion(machine, includes_fuel=False, includes_operator=False):
    """Gera e persiste uma sugestão de valor/hora para a máquina."""
    if not machine.brand or not machine.model:
        raise SuggestionUnavailable(
            "A máquina precisa de marca e modelo para a pesquisa de mercado."
        )

    age_years = _machine_age(machine)
    hour_meter, hour_meter_declared = _estimated_hour_meter(machine, age_years)
    category = P.category_for(machine.usage_purpose)

    # --- Valor de mercado: cache -> pesquisa -> nada --------------------------
    source = "cache"
    cached = _cached_valuation(machine.brand, machine.model, machine.year)
    if cached:
        data = cached.payload
    else:
        result = research_module.research_machine(
            machine.brand, machine.model, machine.year
        )
        if result is None:
            raise SuggestionUnavailable(
                "Não foi possível pesquisar o valor de mercado desta máquina."
            )
        _store_valuation(machine.brand, machine.model, machine.year, result)
        data = result.as_dict()
        source = "pesquisa"

    used_value = data.get("used_value_brl")
    new_value = data.get("new_value_brl")
    confidence = data.get("confidence") or "baixa"

    if not data.get("sources"):
        raise SuggestionUnavailable("A pesquisa não trouxe fontes verificáveis.")
    if not used_value:
        raise SuggestionUnavailable(
            "Não foi encontrado valor de mercado para este modelo e ano."
        )
    if not new_value:
        # Sem o valor de novo não há como calcular desgaste nem reparo. Estimar
        # a partir do usado seria inventar a base de dois dos cinco componentes.
        raise SuggestionUnavailable(
            "Não foi encontrado o valor de um equivalente novo para esta máquina."
        )

    power_cv = machine.power_cv or data.get("power_cv")

    # --- Cálculo determinístico ---------------------------------------------
    try:
        result = suggest_rate(
            PricingInputs(
                category=category,
                age_years=age_years,
                used_value_brl=float(used_value),
                new_value_brl=float(new_value),
                hour_meter=int(hour_meter),
                power_cv=power_cv,
                includes_fuel=includes_fuel,
                includes_operator=includes_operator,
            )
        )
    except PricingError as exc:
        raise SuggestionUnavailable(str(exc)) from exc

    if not result.within_sanity_band:
        # Fora da banda, o problema quase sempre é insumo, não mercado exótico.
        raise SuggestionUnavailable(
            "Os dados encontrados levam a um valor fora da faixa plausível; "
            "confira marca, modelo, ano e horímetro."
        )

    # --- Ancoragem -----------------------------------------------------------
    market_rates = [
        rate["value"]
        for rate in (data.get("observed_rates_brl_hour") or [])
        if rate.get("value")
        # Tarifa com operador não é comparável com uma sem, e o dobro do preço
        # entraria na mediana como se fosse a mesma coisa.
        and bool(rate.get("includes_operator")) == includes_operator
    ]
    internal_rates = _comparable_postings(machine)
    anchored = _anchor(result.suggested_brl_hour, market_rates, internal_rates, confidence)

    band = Decimal(str(P.SUGGESTION_BAND))
    range_min = (anchored * (1 - band)).quantize(Decimal("0.01"))
    range_max = (anchored * (1 + band)).quantize(Decimal("0.01"))

    # A taxa da plataforma é somada por fora (payments.pricing), então o locador
    # precisa ver os dois números: o que recebe e o que o locatário paga.
    from payments.pricing import HORAS_POR_DIARIA, TAXA_PLATAFORMA

    lessee_pays = (anchored * (1 + TAXA_PLATAFORMA)).quantize(Decimal("0.01"))
    daily = (anchored * HORAS_POR_DIARIA).quantize(Decimal("0.01"))

    breakdown = [
        {"chave": item.key, "item": item.label, "brl_hora": str(item.brl_per_billed_hour)}
        for item in result.breakdown
    ]
    assumptions = {
        "categoria": category,
        "idade_anos": age_years,
        "horimetro": int(hour_meter),
        "horimetro_declarado": hour_meter_declared,
        "potencia_cv": power_cv,
        "valor_mercado_usado_brl": float(used_value),
        "valor_novo_equivalente_brl": float(new_value),
        "horas_faturaveis_ano": result.billable_hours_year,
        "horas_motor_ano": result.engine_hours_year,
        "comparaveis_internos": len(internal_rates),
        "tarifas_mercado_encontradas": len(market_rates),
        "inclui_combustivel": includes_fuel,
        "inclui_operador": includes_operator,
        "custo_antes_da_ancoragem": str(result.suggested_brl_hour),
    }

    suggestion = PricingSuggestions.objects.create(
        id=uuid.uuid4(),
        machinery=machine,
        suggested_hourly_rate=anchored,
        cost_hourly_rate=result.cost_brl_hour,
        range_min=range_min,
        range_max=range_max,
        source=source,
        confidence=confidence,
        params_version=result.params_version,
        inputs=assumptions,
        breakdown=breakdown,
        created_at=timezone.now(),
    )

    return Suggestion(
        suggested_hourly_rate=anchored,
        range_min=range_min,
        range_max=range_max,
        cost_hourly_rate=result.cost_brl_hour,
        lessee_pays_hourly=lessee_pays,
        daily_equivalent=daily,
        breakdown=breakdown,
        assumptions=assumptions,
        sources=data.get("sources") or [],
        confidence=confidence,
        source=source,
        params_version=result.params_version,
        suggestion_id=suggestion.id,
        search_suggestions_html=data.get("search_suggestions_html"),
    )


def get_machine(machine_id):
    return Machines.objects.filter(pk=machine_id).first()
