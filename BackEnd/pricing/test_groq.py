import json
import os
from unittest.mock import patch

import httpx
from django.test import SimpleTestCase

from . import research
from .test_gemini import SOURCE, VALUES


def completion(content, tools=None, finish='stop'):
    return {'choices': [{
        'finish_reason': finish,
        'message': {'content': content, 'executed_tools': tools or []},
    }]}


def searched():
    return completion('John Deere 6110J: usado R$ 380000; novo R$ 620000.', [
        {'search_results': {'results': [SOURCE, SOURCE, {'url': 'javascript:alert(1)'}]}},
    ])


@patch.dict(os.environ, {
    'GROQ_API_KEY': 'test-groq-key', 'GEMINI_API_KEY': 'test-gemini-key',
    'ANTHROPIC_API_KEY': 'test-paid-key',
}, clear=True)
class GroqResearchTests(SimpleTestCase):
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
        with patch('pricing.groq.httpx.Client', return_value=client), patch('pricing.research._client') as paid, patch('pricing.gemini.research_with_gemini') as gemini:
            result = research.research_machine('John Deere', '6110J', 2019)
            paid.assert_not_called()
            gemini.assert_not_called()
        return result, requests

    def test_default_provider_searches_and_extracts_with_real_citations(self):
        result, requests = self.run_research([
            (200, searched()), (200, completion(json.dumps(VALUES))),
        ])
        self.assertEqual(result.used_value_brl, 380000)
        self.assertEqual(result.sources, [SOURCE])
        self.assertIsNone(result.search_suggestions_html)
        first, second = [json.loads(request.content) for request in requests]
        self.assertEqual(first['model'], 'groq/compound-mini')
        self.assertEqual(requests[0].headers['Groq-Model-Version'], '2025-07-23')
        self.assertNotIn('Groq-Model-Version', requests[1].headers)
        self.assertEqual(first['compound_custom']['tools']['enabled_tools'], ['web_search'])
        self.assertEqual(first['search_settings'], {'country': 'brazil'})
        self.assertIn('John Deere', first['messages'][0]['content'])
        self.assertEqual(second['model'], 'openai/gpt-oss-120b')
        self.assertEqual(second['response_format']['json_schema']['schema'], research.VALUATION_SCHEMA)
        self.assertTrue(second['response_format']['json_schema']['strict'])
        self.assertEqual(requests[0].headers['Authorization'], 'Bearer test-groq-key')
        self.assertNotIn('test-groq-key', str(requests[0].url))

    def test_missing_key_disables_default_without_falling_back(self):
        with patch.dict(os.environ, {'GROQ_API_KEY': ''}):
            self.assertFalse(research.is_enabled())
            result, requests = self.run_research([])
        self.assertIsNone(result)
        self.assertEqual(requests, [])

    def test_explicit_provider_works(self):
        with patch.dict(os.environ, {'PRICING_AI_PROVIDER': 'groq'}):
            result, _ = self.run_research([(200, searched()), (200, completion(json.dumps(VALUES)))])
        self.assertIsNotNone(result)

    def test_unsourced_answer_skips_extraction(self):
        result, requests = self.run_research([(200, completion('Plausible but unsourced price'))])
        self.assertIsNone(result)
        self.assertEqual(len(requests), 1)

    def test_quota_error_does_not_retry_or_change_provider(self):
        with self.assertLogs('pricing.research', level='ERROR'):
            result, requests = self.run_research([(429, {'error': {'message': 'Quota exceeded'}})])
        self.assertIsNone(result)
        self.assertEqual(len(requests), 1)

    def test_invalid_extracted_data_is_rejected(self):
        invalid = {**VALUES, 'power_cv': 'unknown'}
        with self.assertLogs('pricing.research', level='ERROR'):
            result, _ = self.run_research([(200, searched()), (200, completion(json.dumps(invalid)))])
        self.assertIsNone(result)

    def test_truncated_extraction_is_rejected(self):
        result, _ = self.run_research([(200, searched()), (200, completion('{}', finish='length'))])
        self.assertIsNone(result)

    def test_network_failure_leaves_manual_pricing_available(self):
        with self.assertLogs('pricing.research', level='ERROR'):
            result, _ = self.run_research([httpx.ReadTimeout('Timed out')])
        self.assertIsNone(result)
