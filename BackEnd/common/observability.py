"""HTTP telemetry with bounded labels and no request bodies, URLs or identities."""

import json
import logging
import os
import time
import uuid
from pathlib import Path

from django.conf import settings
from django.db import connection
from django.http import HttpResponse, JsonResponse
from django.utils.crypto import constant_time_compare
from django.views.decorators.http import require_GET
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from redis import Redis

REQUESTS = Counter("frota_http_requests_total", "Completed HTTP requests", ["method", "route", "status"])
DURATION = Histogram("frota_http_duration_seconds", "HTTP latency", ["method", "route"],
                     buckets=(.01, .05, .1, .25, .5, 1, 2.5, 5, 10))
DEPENDENCIES = Gauge("frota_dependency_up", "Dependency reachable", ["dependency"])
logger = logging.getLogger("frota.requests")
OPERATIONS = {"health_live", "health_ready", "metrics"}


class RequestLogFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({"timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
                           "level": record.levelname, **record.telemetry}, ensure_ascii=False)


class ObservabilityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started = time.perf_counter()
        request_id = str(uuid.uuid4())
        request.request_id = request_id
        response = self.get_response(request)
        response["X-Request-ID"] = request_id
        match = request.resolver_match
        route = (match.view_name or "unnamed") if match else "unmatched"
        if route not in OPERATIONS:
            method = request.method if request.method in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"} else "OTHER"
            duration = time.perf_counter() - started
            REQUESTS.labels(method, route, str(response.status_code)).inc()
            DURATION.labels(method, route).observe(duration)
            logger.info("http_request", extra={"telemetry": {
                "event": "http_request", "request_id": request_id, "method": method,
                "route": route, "status": response.status_code, "duration_ms": round(duration * 1000, 2),
            }})
        return response


def dependency_health():
    checks = {}
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            checks["database"] = cursor.fetchone() == (1,)
    except Exception:
        checks["database"] = False
    try:
        # An in-memory channel layer is allowed only in tests/development.
        if settings.CHANNEL_LAYERS["default"]["BACKEND"] == "channels.layers.InMemoryChannelLayer":
            checks["redis"] = True
        else:
            with Redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379/0"),
                                socket_connect_timeout=1, socket_timeout=1) as client:
                checks["redis"] = bool(client.ping())
    except Exception:
        checks["redis"] = False
    for name, healthy in checks.items():
        DEPENDENCIES.labels(name).set(int(healthy))
    return checks


@require_GET
def liveness(request):
    return JsonResponse({"status": "ok"})


@require_GET
def readiness(request):
    checks = dependency_health()
    healthy = all(checks.values())
    return JsonResponse({"status": "ok" if healthy else "unavailable", "checks": checks}, status=200 if healthy else 503)


@require_GET
def metrics(request):
    token = settings.METRICS_TOKEN
    if settings.METRICS_TOKEN_FILE:
        try:
            token = Path(settings.METRICS_TOKEN_FILE).read_text().strip()
        except OSError:
            token = ""
    if not token:
        return HttpResponse(status=404)
    if not constant_time_compare(request.headers.get("Authorization", ""), f"Bearer {token}"):
        return HttpResponse(status=403)
    dependency_health()
    return HttpResponse(generate_latest(), content_type=CONTENT_TYPE_LATEST)
