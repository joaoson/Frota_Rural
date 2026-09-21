import json
import os
from unittest.mock import patch

import httpx
from django.test import SimpleTestCase

from . import groq, research

SOURCE = {'url': 'https://example.com/real-search-result', 'title': 'Trator'}
SOURCE_CONTENT = (
    'John Deere 6110J 2019 usado, 4900 horas, localizado em Castro, PR, Brasil. '
    'Preço anunciado: R$ 380000. Potência: 110 cv. '
    'John Deere equivalente novo, zero horas, Brasil: R$ 620000.'
)
VALUES = {
    'power_cv': 110, 'used_value_brl': 380000,
    'used_value_range_brl': [340000, 420000], 'new_value_brl': 620000,
    'observed_rates_brl_hour': [], 'confidence': 'alta',
    'matched_model': 'John Deere 6110J', 'sources': [SOURCE],
}


def completion(content, tools=None, finish='stop'):
    return {'choices': [{
        'finish_reason': finish,
        'message': {'content': content, 'executed_tools': tools or []},
    }]}


def searched():
    return completion('John Deere 6110J: usado R$ 380000; novo R$ 620000.', [
        {'search_results': {'results': [
            {**SOURCE, 'content': SOURCE_CONTENT},
            {**SOURCE, 'content': SOURCE_CONTENT},
            {'url': 'javascript:alert(1)', 'content': 'Preço sem fonte válida.'},
        ]}},
    ])


@patch.dict(os.environ, {
    'GROQ_API_KEY': 'test-groq-key', 'GEMINI_API_KEY': 'test-gemini-key',
    'ANTHROPIC_API_KEY': 'test-paid-key',
}, clear=True)
class GroqResearchTests(SimpleTestCase):
    def run_research(self, responses, model='6110J', year=2019):
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
            result = research.research_machine('John Deere', model, year)
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
        self.assertEqual(first['model'], 'openai/gpt-oss-20b')
        self.assertNotIn('Groq-Model-Version', requests[0].headers)
        self.assertNotIn('Groq-Model-Version', requests[1].headers)
        self.assertEqual(first['tools'], [{'type': 'browser_search'}])
        self.assertEqual(first['tool_choice'], 'required')
        self.assertEqual(first['reasoning_effort'], 'low')
        self.assertEqual(first['max_completion_tokens'], 2048)
        self.assertNotIn('compound_custom', first)
        self.assertNotIn('search_settings', first)
        self.assertNotIn('response_format', first)
        self.assertIn('John Deere', first['messages'][0]['content'])
        self.assertEqual(second['model'], 'openai/gpt-oss-120b')
        self.assertEqual(second['max_completion_tokens'], 2000)
        self.assertEqual(second['response_format']['json_schema']['schema'], research.VALUATION_SCHEMA)
        self.assertTrue(second['response_format']['json_schema']['strict'])
        self.assertEqual(requests[0].headers['Authorization'], 'Bearer test-groq-key')
        self.assertNotIn('test-groq-key', str(requests[0].url))

    def test_browser_open_evidence_is_used_after_empty_search_result_for_same_url(self):
        # Shape verified against GPT-OSS browser_search: search may supply only
        # links, while browser.open supplies the original page for that URL.
        listing = completion('MISLEADING SUMMARY: this used machine is new.', [
            {'name': 'browser.search', 'type': 'browser_search', 'search_results': {
                'results': [{**SOURCE, 'content': ''}],
            }},
            {'name': 'browser.open', 'type': 'browser.open', 'search_results': {
                'results': [{**SOURCE, 'content': SOURCE_CONTENT}],
            }},
        ])
        result, requests = self.run_research([
            (200, listing), (200, completion(json.dumps(VALUES))),
        ])
        self.assertEqual(result.sources, [SOURCE])
        context = json.loads(requests[1].content)['messages'][0]['content']
        self.assertIn(SOURCE_CONTENT, context)
        self.assertNotIn('MISLEADING SUMMARY', context)

    def test_browser_search_without_opened_content_cannot_supply_estimated_prices(self):
        listing = completion('An apparent price with a source link.', [
            {'name': 'browser.search', 'type': 'browser_search', 'search_results': {
                'results': [{**SOURCE, 'content': ''}],
            }},
        ])
        result, requests = self.run_research([(200, listing)])
        self.assertIsNone(result)
        self.assertEqual(len(requests), 1)

    def test_extraction_uses_raw_s790_listing_and_query_instead_of_wrong_summary(self):
        source = {'url': 'https://example.com/s790-2023-mt', 'title': 'S790 2023'}
        content = (
            'Colheitadeira John Deere S790 2023. Preço: R$ 2700000. '
            'Localização: Mato Grosso, Brasil. Horas de utilização: 1442 h. '
            'Condição: usada. Valor de fábrica de máquina nova: sob consulta.'
        )
        misleading_summary = 'MISLEADING SUMMARY: John Deere S790 nova custa R$ 2700000.'
        listing = completion(misleading_summary, [
            {'search_results': {'results': [{**source, 'content': content}]}},
        ])
        extracted = {
            **VALUES, 'power_cv': 543, 'used_value_brl': 2700000,
            'used_value_range_brl': [2700000, 2700000], 'new_value_brl': None,
            'matched_model': 'John Deere S790', 'sources': [source],
        }
        result, requests = self.run_research([
            (200, listing), (200, completion(json.dumps(extracted))),
        ], model='S790', year=2023)

        context = json.loads(requests[1].content)['messages'][0]['content']
        self.assertIn('John Deere S790', context)
        self.assertIn('2023', context)
        self.assertIn('1442', context)
        self.assertIn('Mato Grosso', context)
        self.assertIn('usada', context)
        self.assertIn('2700000', context)
        self.assertIn(source['url'], context)
        self.assertNotIn(misleading_summary, context)
        self.assertIn(json.loads(requests[0].content)['messages'][0]['content'], context)
        self.assertEqual(result.used_value_brl, 2700000)
        self.assertIsNone(result.new_value_brl)
        self.assertEqual(result.sources, [source])

    def test_extractor_cannot_cite_invented_or_invalid_urls(self):
        for url in ('https://invented.example/machine', 'javascript:alert(1)'):
            with self.subTest(url=url):
                data = {**VALUES, 'sources': [{'url': url, 'title': 'Unsupported'}]}
                result, _ = self.run_research([
                    (200, searched()), (200, completion(json.dumps(data))),
                ])
                self.assertIsNone(result)

    def test_citations_only_include_sources_selected_from_supplied_evidence(self):
        unrelated = {
            'url': 'https://example.com/unrelated-machine', 'title': 'Outra máquina',
            'content': 'Outro modelo, sem relação com a máquina solicitada.',
        }
        listing = searched()
        listing['choices'][0]['message']['executed_tools'][0]['search_results']['results'].append(unrelated)
        data = {**VALUES, 'sources': [
            SOURCE, {'url': 'https://invented.example', 'title': 'Unsupported'},
        ]}
        result, _ = self.run_research([
            (200, listing), (200, completion(json.dumps(data))),
        ])
        self.assertEqual(result.sources, [SOURCE])

    def test_search_evidence_is_bounded_before_extraction(self):
        limit = groq.MAX_EVIDENCE_CHARS
        trailing = 'EVIDENCE_BEYOND_LIMIT_MUST_NOT_BE_SENT'
        listing = completion('Summary contains none of the original listing.', [
            {'search_results': {'results': [
                {**SOURCE, 'content': SOURCE_CONTENT + '\n' + ('§' * (limit * 2)) + trailing},
            ]}},
        ])
        result, requests = self.run_research([
            (200, listing), (200, completion(json.dumps(VALUES))),
        ])
        self.assertIsNotNone(result)
        context = json.loads(requests[1].content)['messages'][0]['content']
        self.assertIn('Castro', context)
        self.assertGreater(context.count('§'), 0)
        self.assertLessEqual(context.count('§'), limit)
        self.assertNotIn(trailing, context)

    def test_url_without_source_content_cannot_ground_a_summary(self):
        for content in (None, '', ' \n\t '):
            with self.subTest(content=content):
                listing = completion('John Deere 6110J usado custa R$ 380000.', [
                    {'search_results': {'results': [{**SOURCE, 'content': content}]}},
                ])
                result, requests = self.run_research([(200, listing)])
                self.assertIsNone(result)
                self.assertEqual(len(requests), 1)

    def test_total_evidence_budget_counts_json_escaping_and_excludes_unseen_citations(self):
        for filler in ('§' * 6000, '\\"\n\t\x00' * 1200):
            with self.subTest(escaped='\x00' in filler):
                sources = [
                    {'url': f'https://example.com/listing-{i}', 'title': f'Máquina {i}',
                     'content': SOURCE_CONTENT + filler}
                    for i in range(12)
                ]
                listing = completion('Do not extract this summary.', [
                    {'search_results': {'results': sources}},
                ])
                excluded_source = {
                    'url': sources[-1]['url'], 'title': sources[-1]['title'],
                }
                data = {**VALUES, 'sources': [excluded_source]}
                result, requests = self.run_research([
                    (200, listing), (200, completion(json.dumps(data))),
                ])
                context = json.loads(requests[1].content)['messages'][0]['content']
                encoded_evidence = context.rsplit('--- PESQUISA ---\n', 1)[1]
                evidence = json.loads(encoded_evidence)
                self.assertGreater(len(evidence), 1)
                self.assertLess(len(evidence), len(sources))
                self.assertLessEqual(len(encoded_evidence), groq.MAX_EVIDENCE_CHARS)
                self.assertTrue(all(len(item['content']) <= groq.MAX_SOURCE_CHARS for item in evidence))
                self.assertIn('Castro', evidence[0]['content'])
                self.assertNotIn(excluded_source['url'], {item['url'] for item in evidence})
                self.assertIsNone(result)

    def test_raw_search_evidence_is_usable_without_a_generated_summary(self):
        listing = searched()
        listing['choices'][0]['message']['content'] = ''
        result, requests = self.run_research([
            (200, listing), (200, completion(json.dumps(VALUES))),
        ])
        self.assertEqual(len(requests), 2)
        self.assertEqual(result.used_value_brl, 380000)
        self.assertEqual(result.sources, [SOURCE])

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
