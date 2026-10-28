import json
from unittest.mock import patch

from django.http import HttpResponse
from django.test import SimpleTestCase, override_settings
from django.urls import path

from common.observability import RequestLogFormatter


def broken(request):
    raise RuntimeError("private exception")


def ok(request, pk):
    return HttpResponse("ok")


urlpatterns = [path("item/<uuid:pk>", ok, name="example_item"), path("broken", broken, name="broken")]


class ObservabilityTests(SimpleTestCase):
    def test_liveness_does_not_need_database(self):
        response = self.client.get("/health/live")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response["X-Request-ID"]), 36)

    @patch("common.observability.dependency_health", return_value={"database": True, "redis": False})
    def test_readiness_returns_unavailable_without_exception_details(self, health):
        response = self.client.get("/health/ready")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable", "checks": health.return_value})

    @override_settings(METRICS_TOKEN="", METRICS_TOKEN_FILE="")
    def test_metrics_disabled_without_secret(self):
        self.assertEqual(self.client.get("/metrics").status_code, 404)

    @override_settings(METRICS_TOKEN="test-only", METRICS_TOKEN_FILE="")
    @patch("common.observability.dependency_health", return_value={"database": True, "redis": True})
    def test_metrics_require_credential_and_export_prometheus(self, health):
        self.assertEqual(self.client.get("/metrics").status_code, 403)
        self.assertEqual(self.client.get("/metrics", HTTP_AUTHORIZATION="Bearer wrong").status_code, 403)
        health.assert_not_called()
        response = self.client.get("/metrics", HTTP_AUTHORIZATION="Bearer test-only")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"frota_http_requests_total", response.content)

    @override_settings(METRICS_TOKEN="ignored", METRICS_TOKEN_FILE="/missing/secret")
    def test_missing_secret_file_fails_closed(self):
        self.assertEqual(self.client.get("/metrics", HTTP_AUTHORIZATION="Bearer ignored").status_code, 404)

    @override_settings(ROOT_URLCONF=__name__)
    def test_logs_and_metrics_use_route_names_without_private_values(self):
        with self.assertLogs("frota.requests", "INFO") as logs:
            response = self.client.get("/item/00000000-0000-0000-0000-000000000001?email=private@example.com",
                                       HTTP_AUTHORIZATION="Bearer secret", HTTP_X_REQUEST_ID="forged")
        record = logs.records[0]
        payload = json.loads(RequestLogFormatter().format(record))
        self.assertEqual(payload["route"], "example_item")
        self.assertEqual(payload["status"], 200)
        self.assertEqual(payload["request_id"], response["X-Request-ID"])
        self.assertNotIn("private", json.dumps(payload))
        self.assertNotIn("secret", json.dumps(payload))
        self.assertNotEqual(payload["request_id"], "forged")

    @override_settings(ROOT_URLCONF=__name__)
    def test_unhandled_exception_is_counted_as_server_error(self):
        self.client.raise_request_exception = False
        with self.assertLogs("frota.requests", "INFO") as logs:
            response = self.client.get("/broken")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(logs.records[0].telemetry["status"], 500)

    @override_settings(CHANNEL_LAYERS={"default": {"BACKEND": "channels_redis.core.RedisChannelLayer"}})
    @patch("common.observability.Redis.from_url", side_effect=ConnectionError("private host"))
    @patch("common.observability.connection")
    def test_dependency_failures_are_bounded_and_redacted(self, connection, redis):
        connection.cursor.side_effect = ConnectionError("private password")
        response = self.client.get("/health/ready")
        self.assertEqual(response.json()["checks"], {"database": False, "redis": False})
        self.assertNotIn(b"private", response.content)
        self.assertEqual(redis.call_args.kwargs["socket_timeout"], 1)
