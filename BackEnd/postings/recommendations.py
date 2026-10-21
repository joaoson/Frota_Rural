"""Guided catalog search. Matches listing declarations, not agronomic suitability."""

import re
import unicodedata
from collections.abc import Mapping
from datetime import datetime, time
from typing import Any

from django.db.models import Q, QuerySet
from django.utils import timezone

from common.geography import state_from_address
from payments.availability import reservas_em_conflito
from postings import recommendation_ai
from postings.models import Postings
from postings.serializer import RecommendationInputSerializer
from postings.services import PostingService

APPLICATIONS = {
    "soil_preparation": (
        "Preparo de solo",
        ("preparo", "aracao", "arado", "gradagem", "subsol", "escarif"),
    ),
    "planting": ("Plantio e cultivo", ("plantio", "cultivo", "plantad", "semead")),
    "spraying": ("Pulverização", ("pulver",)),
    "harvesting": ("Colheita", ("colheit", "ceifa")),
}
SOILS = {"clay": "argil", "sand": "aren", "mixed": "mist", "unknown": ""}
RESULT_LIMIT = 3


def _words(value: str | None) -> list[str]:
    normalized = (
        unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode().lower()
    )
    return re.findall(r"[a-z0-9]+", normalized)


def _mentions(words: list[str], stems: tuple[str, ...]) -> bool:
    return any(word.startswith(stem) for word in words for stem in stems)


SOIL_LABELS = {"clay": "Argiloso", "sand": "Arenoso", "mixed": "Misto", "unknown": "Não informado"}


def _available_postings(params: dict[str, Any]) -> QuerySet[Postings]:
    # Reused after AI returns: availability and public visibility stay authoritative.
    queryset = PostingService.list({"status": "active"}, actor=None).filter(
        Q(availability_end__isnull=True) | Q(availability_end__gte=timezone.now())
    )
    if params["max_hourly_rate"] is not None:
        queryset = queryset.filter(hourly_rate__lte=params["max_hourly_rate"])
    if params["start_date"]:
        start = timezone.make_aware(datetime.combine(params["start_date"], time.min))
        end = timezone.make_aware(datetime.combine(params["end_date"], time.max))
        duration = (params["end_date"] - params["start_date"]).days + 1
        queryset = queryset.filter(
            Q(availability_start__isnull=True) | Q(availability_start__lte=start),
            Q(availability_end__isnull=True) | Q(availability_end__gte=end),
            Q(max_reservation_days__isnull=True) | Q(max_reservation_days__gte=duration),
        ).exclude(
            machinery_id__in=reservas_em_conflito(start, end).values("postings__machinery_id")
        )
    return queryset


def _matches_location(posting: Postings, params: dict[str, Any]) -> bool:
    return (
        not params["state"] or state_from_address(posting.location_address) == params["state"]
    ) and set(_words(params["location"])).issubset(_words(posting.location_address))


def _catalog_item(posting: Postings) -> dict[str, str]:
    # Public descriptive fields only. No owner identity, contact info, full
    # address, document numbers, photo URLs or booking details go to the model.
    return {
        "posting_id": str(posting.pk),
        "machine": f"{posting.machinery.brand or ''} {posting.machinery.model or ''}"[:160],
        "usage_purpose": (posting.machinery.usage_purpose or "")[:200],
        "description": (posting.description or "")[:600],
        "technical_specifications": (posting.machinery.technical_specifications or "")[:400],
    }


def _response(
    results: list[dict[str, Any]],
    *,
    total: int,
    params: dict[str, Any],
    match_type: str,
    ai_unavailable: bool = False,
) -> dict[str, Any]:
    return {
        "results": results,
        "total": total,
        "dates_checked": bool(params["start_date"]),
        "match_type": match_type,
        "ai_unavailable": ai_unavailable,
    }


def _similar_results(
    params: dict[str, Any], candidates: list[tuple[bool, Postings]]
) -> dict[str, Any]:
    distinct = {}
    for _, posting in candidates:
        distinct.setdefault(posting.machinery_id, posting)
    catalog = recommendation_ai.bounded_catalog(
        [_catalog_item(posting) for posting in distinct.values()]
    )
    if not catalog:
        return _response([], total=0, params=params, match_type="none")
    matches = recommendation_ai.find_similar(
        {
            "application": APPLICATIONS[params["application"]][0],
            "soil": SOIL_LABELS[params["soil"]],
            "state": params["state"],
        },
        catalog,
    )
    if not matches:
        return _response(
            [], total=0, params=params, match_type="none", ai_unavailable=matches is None
        )

    original = {item["posting_id"]: item for item in catalog}
    ids = {match["posting_id"] for match in matches if match["posting_id"] in original}
    current = {
        str(posting.pk): posting
        for posting in _available_postings(params).filter(pk__in=ids)
        if _matches_location(posting, params)
        and _catalog_item(posting) == original[str(posting.pk)]
    }
    results = []
    for match in matches:
        posting = current.pop(match["posting_id"], None)
        if posting is None:
            continue
        reasons = [match["reason"]]
        if params["start_date"]:
            reasons.append("Sem conflito de reservas no período informado.")
        results.append({"posting": posting, "reasons": reasons, "soil_mentioned": False})
    return _response(
        results, total=len(results), params=params, match_type="similar" if results else "none"
    )


class PostingRecommendationService:
    @staticmethod
    def search(data: Mapping[str, Any]) -> dict[str, Any]:
        serializer = RecommendationInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        params = serializer.validated_data
        label, stems = APPLICATIONS[params["application"]]
        soil_stem = SOILS[params["soil"]]
        candidates: list[tuple[bool, Postings]] = []
        exact: list[tuple[bool, Postings]] = []
        for posting in _available_postings(params):
            if not _matches_location(posting, params):
                continue
            purpose = posting.machinery.usage_purpose
            description = " ".join(
                filter(None, [posting.description, posting.machinery.technical_specifications])
            )
            soil_mentioned = bool(soil_stem and _mentions(_words(description), (soil_stem,)))
            candidates.append((soil_mentioned, posting))
            if _mentions(_words(purpose or description), stems):
                exact.append((soil_mentioned, posting))

        # AI runs only when literal matching is empty; it never overrides exact results.
        if not exact:
            candidates.sort(
                key=lambda item: (
                    not _mentions(
                        _words(item[1].description)
                        + _words(item[1].machinery.technical_specifications),
                        stems,
                    ),
                    not item[0],
                    item[1].hourly_rate,
                    str(item[1].pk),
                )
            )
            return _similar_results(params, candidates)

        exact.sort(key=lambda item: (not item[0], item[1].hourly_rate, str(item[1].pk)))
        results = []
        seen_machines = set()
        total = 0
        for soil_mentioned, posting in exact:
            if posting.machinery_id in seen_machines:
                continue
            seen_machines.add(posting.machinery_id)
            total += 1
            if len(results) >= RESULT_LIMIT:
                continue
            reasons = [f"Atividade informada: {label}."]
            if soil_mentioned:
                reasons.append(
                    "O tipo de solo aparece na descrição; confira o contexto com o locador."
                )
            if params["start_date"]:
                reasons.append("Sem conflito de reservas no período informado.")
            results.append(
                {"posting": posting, "reasons": reasons, "soil_mentioned": soil_mentioned}
            )
        return _response(results, total=total, params=params, match_type="exact")
