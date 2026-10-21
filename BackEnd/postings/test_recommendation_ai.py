import json
import os
from unittest.mock import patch

import httpx
from django.core.cache import cache
from django.test import SimpleTestCase

from common.groq import STRUCTURED_MODEL
from postings import recommendation_ai as ai

NEEDS = {"application": "Preparo de solo", "soil": "Argiloso", "state": "PR"}
CATALOG = [
    {
        "posting_id": "listing-1",
        "machine": "Trator exemplo",
        "usage_purpose": "Destorroamento",
        "description": "Enxada rotativa incluída para destorroar a terra.",
        "technical_specifications": "",
    }
]
MATCH = {
    "posting_id": "listing-1",
    "reason": "Possível alternativa para destorroar o solo; confirme com o locador.",
    "evidence_field": "description",
    "evidence_quote": "Enxada rotativa incluída",
}


@patch.dict(os.environ, {"GROQ_API_KEY": "test-private-key"})
class CatalogAITests(SimpleTestCase):
    def setUp(self) -> None:
        cache.clear()

    def tearDown(self) -> None:
        cache.clear()

    def run_ai(
        self, data: object, *, status: int = 200, finish: str = "stop"
    ) -> tuple[list[dict[str, str]] | None, list[httpx.Request]]:
        requests = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(
                status,
                json={
                    "choices": [{"finish_reason": finish, "message": {"content": json.dumps(data)}}]
                },
            )

        client = httpx.Client(transport=httpx.MockTransport(handler))
        with patch("postings.recommendation_ai.httpx.Client", return_value=client):
            result = ai.find_similar(NEEDS, CATALOG)
        return result, requests

    def test_uses_same_structured_model_as_pricing_and_only_catalog_data(self) -> None:
        result, requests = self.run_ai({"matches": [MATCH]})
        self.assertEqual(result, [{"posting_id": "listing-1", "reason": MATCH["reason"]}])
        payload = json.loads(requests[0].content)
        self.assertEqual(payload["model"], STRUCTURED_MODEL)
        self.assertTrue(payload["response_format"]["json_schema"]["strict"])
        self.assertNotIn("tools", payload)
        self.assertEqual(requests[0].headers["Authorization"], "Bearer test-private-key")
        self.assertEqual(
            json.loads(payload["messages"][1]["content"]), {"needs": NEEDS, "catalog": CATALOG}
        )
        self.assertIn("dado não confiável", payload["messages"][0]["content"])

    def test_ignores_unsubstantiated_duplicate_or_external_link_recommendations(self) -> None:
        for invalid in [
            {**MATCH, "evidence_quote": "Implemento que não existe"},
            {**MATCH, "evidence_quote": ""},
            {**MATCH, "reason": "Veja https://external.test"},
            {**MATCH, "reason": ""},
            {**MATCH, "reason": "x" * 301},
        ]:
            with self.subTest(invalid=invalid):
                cache.clear()
                result, _ = self.run_ai({"matches": [invalid]})
                self.assertEqual(result, [])
        cache.clear()
        result, _ = self.run_ai({"matches": [MATCH, MATCH]})
        self.assertEqual(len(result), 1)

    def test_unknown_ids_malformed_and_truncated_outputs_are_not_used(self) -> None:
        for invalid in [
            {"matches": [{**MATCH, "posting_id": "invented"}]},
            {"matches": "bad"},
            {"matches": [{**MATCH, "extra": "field"}]},
            [],
        ]:
            with self.subTest(invalid=invalid):
                cache.clear()
                with self.assertLogs("postings.recommendation_ai", level="WARNING"):
                    result, _ = self.run_ai(invalid)
                self.assertIsNone(result)
        cache.clear()
        result, _ = self.run_ai({"matches": [MATCH]}, finish="length")
        self.assertIsNone(result)

    def test_no_match_is_valid_and_cached_without_repeating_provider_calls(self) -> None:
        result, requests = self.run_ai({"matches": []})
        self.assertEqual(result, [])
        self.assertEqual(len(requests), 1)
        result, requests = self.run_ai({"matches": [MATCH]})
        self.assertEqual(result, [])
        self.assertEqual(requests, [])

    def test_catalog_changes_invalidate_cached_semantic_choices(self) -> None:
        self.run_ai({"matches": [MATCH]})
        with patch(
            "postings.recommendation_ai.complete_json", return_value={"matches": []}
        ) as complete:
            changed = [{**CATALOG[0], "description": "Implemento retirado do anúncio."}]
            self.assertEqual(ai.find_similar(NEEDS, changed), [])
        complete.assert_called_once()

    def test_failures_are_bounded_redacted_and_do_not_retry_or_change_provider(self) -> None:
        for status in [401, 429, 503]:
            with self.subTest(status=status):
                cache.clear()
                with self.assertLogs("postings.recommendation_ai", level="WARNING") as logs:
                    result, requests = self.run_ai({"error": "test-private-key"}, status=status)
                self.assertIsNone(result)
                self.assertEqual(len(requests), 1)
                self.assertNotIn("test-private-key", str(logs.output))
                result, requests = self.run_ai({"matches": [MATCH]})
                self.assertIsNone(result)
                self.assertEqual(requests, [])
        cache.clear()
        with (
            patch(
                "postings.recommendation_ai.complete_json",
                side_effect=httpx.ReadTimeout("test-private-key"),
            ),
            self.assertLogs("postings.recommendation_ai", level="WARNING") as logs,
        ):
            self.assertIsNone(ai.find_similar(NEEDS, CATALOG))
        self.assertNotIn("test-private-key", str(logs.output))

    def test_missing_key_empty_inventory_and_budget_do_not_call_provider(self) -> None:
        with patch("postings.recommendation_ai.complete_json") as complete:
            with patch.dict(os.environ, {"GROQ_API_KEY": ""}):
                self.assertIsNone(ai.find_similar(NEEDS, CATALOG))
            self.assertEqual(ai.find_similar(NEEDS, []), [])
            with patch("postings.recommendation_ai._within_budget", return_value=False):
                self.assertIsNone(ai.find_similar(NEEDS, CATALOG))
        complete.assert_not_called()

    def test_budget_limits_distinct_requests(self) -> None:
        with patch("postings.recommendation_ai.time.time", return_value=1000):
            self.assertTrue(all(ai._within_budget() for _ in range(ai.MAX_REQUESTS_PER_MINUTE)))
            self.assertFalse(ai._within_budget())

    def test_catalog_is_bounded_by_count_and_payload_size(self) -> None:
        long = [{**CATALOG[0], "posting_id": str(i), "description": "x" * 1000} for i in range(100)]
        catalog = ai.bounded_catalog(long)
        self.assertLessEqual(len(catalog), ai.MAX_CANDIDATES)
        self.assertLessEqual(len(json.dumps(catalog, ensure_ascii=False)), ai.MAX_CATALOG_CHARS)
