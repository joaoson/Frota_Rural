import json
import os
from unittest.mock import patch

import httpx
from django.test import SimpleTestCase

from . import research

VALUES = {
    'power_cv': 110, 'used_value_brl': 380000,
    'used_value_range_brl': [340000, 420000], 'new_value_brl': 620000,
    'observed_rates_brl_hour': [], 'confidence': 'alta',
    'matched_model': 'John Deere 6110J',
    'sources': [{'url': 'https://invented.example', 'title': 'Generated URL'}],
}
WIDGET = '<div>Google Search suggestions</div>'
SOURCE = {'url': 'https://example.com/real-search-result', 'title': 'Trator'}


def candidate(text, metadata=None, finish='STOP'):
    return {'candidates': [{
        'finishReason': finish,
        'content': {'parts': [{'text': text}]},
        'groundingMetadata': metadata or {},
    }]}


def grounded():
    return candidate('John Deere 6110J 2019: usado R$ 380000; novo R$ 620000.', {
        'groundingChunks': [{'web': {'uri': SOURCE['url'], 'title': SOURCE['title']}}],
        'searchEntryPoint': {'renderedContent': WIDGET},
    })


@patch.dict(os.environ, {
    'PRICING_AI_PROVIDER': 'gemini', 'GEMINI_API_KEY': 'test-gemini-key',
    'ANTHROPIC_API_KEY': 'test-paid-key',
}, clear=True)
class GeminiResearchTests(SimpleTestCase):
    def run_research(self, responses):
        requests = []

        def handler(request):
            requests.append(request)
            item = responses[len(requests) - 1]
            if isinstance(item, Exception):
                raise item
            status, body = item
            return httpx.Response(status, json=body)

        client = httpx.Client(transport=httpx.MockTransport(handler))
        with patch('pricing.gemini.httpx.Client', return_value=client), patch('pricing.research._client') as paid:
            result = research.research_machine('John Deere', '6110J', 2019)
            paid.assert_not_called()
        return result, requests

    def test_grounded_search_then_structured_extraction_keeps_real_citations(self):
        result, requests = self.run_research([
            (200, grounded()), (200, candidate(json.dumps(VALUES))),
        ])
        self.assertEqual(result.used_value_brl, 380000)
        self.assertEqual(result.sources, [SOURCE])
        self.assertEqual(result.search_suggestions_html, WIDGET)
        first, second = [json.loads(request.content) for request in requests]
        self.assertEqual(first['tools'], [{'google_search': {}}])
        self.assertIn('John Deere', first['contents'][0]['parts'][0]['text'])
        self.assertNotIn('tools', second)
        self.assertEqual(second['generationConfig']['responseJsonSchema'], research.VALUATION_SCHEMA)
        self.assertEqual(requests[0].headers['x-goog-api-key'], 'test-gemini-key')
        self.assertNotIn('test-gemini-key', str(requests[0].url))
        self.assertIn('/gemini-2.5-flash:generateContent', str(requests[0].url))

    def test_missing_gemini_key_does_not_use_configured_paid_provider(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY': ''}), patch('pricing.research._client') as paid:
            self.assertFalse(research.is_enabled())
            self.assertIsNone(research.research_machine('John Deere', '6110J', 2019))
            paid.assert_not_called()

    def test_unknown_provider_is_disabled(self):
        with patch.dict(os.environ, {'PRICING_AI_PROVIDER': 'unknown'}):
            self.assertFalse(research.is_enabled())

    def test_ungrounded_answer_is_rejected_without_spending_an_extraction_request(self):
        result, requests = self.run_research([(200, candidate('A plausible but unsourced price'))])
        self.assertIsNone(result)
        self.assertEqual(len(requests), 1)

    def test_quota_error_is_not_retried_or_routed_to_paid_provider(self):
        with self.assertLogs('pricing.research', level='ERROR'):
            result, requests = self.run_research([(429, {'error': {'message': 'Quota exceeded'}})])
        self.assertIsNone(result)
        self.assertEqual(len(requests), 1)

    def test_malformed_extracted_values_are_rejected(self):
        invalid = {**VALUES, 'used_value_brl': 'not a price'}
        with self.assertLogs('pricing.research', level='ERROR'):
            result, _ = self.run_research([(200, grounded()), (200, candidate(json.dumps(invalid)))])
        self.assertIsNone(result)

    def test_truncated_answer_is_rejected(self):
        result, _ = self.run_research([(200, candidate('partial', finish='MAX_TOKENS'))])
        self.assertIsNone(result)

    def test_network_timeout_leaves_manual_pricing_available(self):
        with self.assertLogs('pricing.research', level='ERROR'):
            result, _ = self.run_research([httpx.ReadTimeout('Timed out')])
        self.assertIsNone(result)
