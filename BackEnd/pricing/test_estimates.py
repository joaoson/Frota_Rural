"""Regressões da estimativa explícita do equivalente novo, sem rede externa."""

from dataclasses import replace
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from .models import MachineValuations, PricingSuggestions
from .service import SuggestionUnavailable, build_suggestion
from .tests import RESEARCH, make_machine, make_user


class NewEquivalentEstimateTests(TestCase):
    def setUp(self):
        self.owner = make_user()
        self.machine = make_machine(
            self.owner, model='S790', year=timezone.now().year - 3,
            usage_purpose='Colheita de Grãos', power_cv=547, hour_meter=2350,
        )
        self.research = replace(
            RESEARCH, power_cv=547, matched_model='John Deere S790',
            used_value_brl=2700000.0,
            used_value_range_brl=[2600000.0, 2800000.0], new_value_brl=None,
        )

    def test_s790_retorna_estimativa_rotulada_com_premissas_e_auditoria(self):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(self.owner)}')
        with patch('pricing.research.research_machine', return_value=self.research):
            response = client.post(
                '/api/pricing/suggest', {'machinery': str(self.machine.id)}, format='json'
            )
        self.assertEqual(response.status_code, 200, response.data)
        body = response.json()
        self.assertGreater(Decimal(body['sugerido_brl_hora']), 0)
        self.assertEqual(body['confianca'], 'baixa')
        self.assertEqual(body['versao_parametros'], '2026.09.2')
        assumptions = body['premissas']
        self.assertEqual(assumptions['valor_novo_equivalente_brl'], 3703703.70)
        self.assertEqual(assumptions['estimativa_valor_novo'], {
            'taxa_anual': 0.10,
            'fracao_residual_minima': 0.40,
            'retencao_aplicada': 0.729,
        })
        audit = PricingSuggestions.objects.get(id=body['suggestion_id'])
        self.assertEqual(audit.inputs, assumptions)
        self.assertEqual(audit.confidence, 'baixa')
        self.assertEqual(body['fontes'], self.research.sources)

    def test_cache_preserva_pesquisa_bruta_e_repete_estimativa_sem_provedor(self):
        with patch('pricing.research.research_machine', return_value=self.research) as provider:
            first = build_suggestion(self.machine)
            cached = build_suggestion(self.machine)
        provider.assert_called_once()
        self.assertEqual(cached.source, 'cache')
        self.assertEqual(cached.confidence, 'baixa')
        self.assertEqual(cached.assumptions, first.assumptions)
        self.assertEqual(cached.suggested_hourly_rate, first.suggested_hourly_rate)
        valuation = MachineValuations.objects.get()
        self.assertIsNone(valuation.payload['new_value_brl'])
        self.assertEqual(valuation.confidence, self.research.confidence)
        self.assertNotIn('estimativa_valor_novo', valuation.payload)
        self.assertEqual(PricingSuggestions.objects.count(), 2)

    def test_valor_novo_pesquisado_mantem_confianca_e_nao_cria_estimativa(self):
        research = replace(self.research, new_value_brl=3703703.70)
        with patch('pricing.research.research_machine', return_value=research):
            suggestion = build_suggestion(self.machine)
        self.assertEqual(suggestion.confidence, research.confidence)
        self.assertIsNone(suggestion.assumptions['estimativa_valor_novo'])
        self.assertEqual(suggestion.assumptions['valor_novo_equivalente_brl'], 3703703.70)
        self.assertEqual(MachineValuations.objects.get().payload['new_value_brl'], 3703703.70)

    def test_sem_preco_usado_positivo_ou_fontes_nao_ha_estimativa(self):
        for fields in (
            {'sources': []},
            *({'used_value_brl': value} for value in (
                None, 0, -1, float('nan'), float('inf'), True, '2700000',
            )),
        ):
            with self.subTest(fields=fields):
                with patch('pricing.research.research_machine', return_value=replace(self.research, **fields)):
                    with self.assertRaises(SuggestionUnavailable):
                        build_suggestion(self.machine)
        self.assertEqual(MachineValuations.objects.count(), 0)
        self.assertEqual(PricingSuggestions.objects.count(), 0)

    def test_valor_novo_invalido_nao_e_tratado_como_ausente(self):
        for new_value in (0, -1, float('nan'), float('inf'), float('-inf'), True, '3700000'):
            with self.subTest(new_value=new_value):
                with patch('pricing.research.research_machine', return_value=replace(self.research, new_value_brl=new_value)):
                    with self.assertRaises(SuggestionUnavailable):
                        build_suggestion(self.machine)
        self.assertEqual(MachineValuations.objects.count(), 0)
        self.assertEqual(PricingSuggestions.objects.count(), 0)

    def test_ano_ausente_futuro_ou_invalido_nao_permite_estimativa(self):
        for year in (None, 0, -1, timezone.now().year + 1, True, 'invalido', 2023.5):
            with self.subTest(year=year):
                self.machine.year = year
                with patch('pricing.research.research_machine', return_value=self.research):
                    with self.assertRaises(SuggestionUnavailable):
                        build_suggestion(self.machine)
        self.assertEqual(MachineValuations.objects.count(), 0)
        self.assertEqual(PricingSuggestions.objects.count(), 0)

    def test_retencao_tem_piso_e_ano_atual_nao_deprecia(self):
        for age, retention, new_value in ((0, 1.0, 2700000.0), (20, 0.4, 6750000.0)):
            with self.subTest(age=age):
                self.machine.year = timezone.now().year - age
                self.machine.hour_meter = 0
                with patch('pricing.research.research_machine', return_value=self.research):
                    suggestion = build_suggestion(self.machine)
                self.assertEqual(suggestion.assumptions['estimativa_valor_novo']['retencao_aplicada'], retention)
                self.assertEqual(suggestion.assumptions['valor_novo_equivalente_brl'], new_value)

    def test_estimativa_nao_contorna_banda_de_sanidade(self):
        self.machine.hour_meter = 90000
        with patch('pricing.research.research_machine', return_value=self.research):
            with self.assertRaisesMessage(SuggestionUnavailable, 'fora da faixa plausível'):
                build_suggestion(self.machine)
        self.assertEqual(MachineValuations.objects.count(), 0)
        self.assertEqual(PricingSuggestions.objects.count(), 0)

    def test_preco_usado_maior_que_novo_observado_continua_indisponivel(self):
        research = replace(self.research, new_value_brl=1000000)
        with patch('pricing.research.research_machine', return_value=research):
            with self.assertRaisesMessage(SuggestionUnavailable, 'usado não pode superar'):
                build_suggestion(self.machine)
        self.assertEqual(MachineValuations.objects.count(), 0)
        self.assertEqual(PricingSuggestions.objects.count(), 0)
