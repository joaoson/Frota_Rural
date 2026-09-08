"""Testes da sugestão de valor/hora.

O motor é determinístico e não toca a rede, então dá para fixá-lo em números
concretos. A pesquisa por IA é substituída em todos os testes de serviço: nenhum
teste aqui chama a API de verdade.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from machines.models import Machines
from postings.models import Postings
from users.models import Users

from . import params as P
from .engine import PricingError, PricingInputs, annual_depreciation_rate, suggest_rate
from .models import MachineValuations, PricingSuggestions
from .research import MachineResearch
from .service import SuggestionUnavailable, build_suggestion


def make_user(role='locador', seq=1):
    return Users.objects.create(
        id=uuid.uuid4(), name=f'Usuario {seq}', document=f'doc{seq:011d}',
        email=f'user{seq}@teste.com', role=role, address='Rua Teste, 100',
        birth_date=date(1990, 1, 1), status='active',
    )


def make_machine(owner, **kwargs):
    defaults = dict(
        id=uuid.uuid4(), owner=owner, renagro_number=f'BR{uuid.uuid4().hex[:10]}',
        brand='John Deere', model='6110J', year=2019, power_cv=110,
        hour_meter=4900, usage_purpose='Preparo de solo', status='active',
        created_at=timezone.now(), updated_at=timezone.now(),
    )
    defaults.update(kwargs)
    return Machines.objects.create(**defaults)


RESEARCH = MachineResearch(
    power_cv=110,
    used_value_brl=380000.0,
    used_value_range_brl=[340000.0, 420000.0],
    new_value_brl=620000.0,
    observed_rates_brl_hour=[],
    confidence='alta',
    matched_model='John Deere 6110J',
    sources=[{'url': 'https://exemplo.com/anuncio', 'title': 'Anúncio'}],
)


class EngineTests(TestCase):
    """O motor, isolado de banco e rede."""

    def test_reproduz_o_exemplo_da_especificacao(self):
        result = suggest_rate(PricingInputs(
            category='trator', age_years=7, used_value_brl=380000,
            new_value_brl=620000, hour_meter=4900,
        ))
        self.assertEqual(result.cost_brl_hour, Decimal('160.13'))
        self.assertEqual(result.suggested_brl_hour, Decimal('192.15'))
        self.assertEqual(result.billable_hours_year, 528)
        self.assertEqual(result.engine_hours_year, 343)
        self.assertTrue(result.within_sanity_band)

    def test_composicao_soma_o_valor_sugerido(self):
        """A decomposição é o que sustenta a sugestão perante o locador; se ela
        não fecha com o total, a explicação está mentindo."""
        result = suggest_rate(PricingInputs(
            category='trator', age_years=5, used_value_brl=300000,
            new_value_brl=500000, hour_meter=3500,
        ))
        total = sum(item.brl_per_billed_hour for item in result.breakdown)
        self.assertAlmostEqual(total, result.suggested_brl_hour, delta=Decimal('0.05'))

    def test_custo_horario_cai_bem_menos_que_o_valor_da_maquina(self):
        """Precificar por percentual do valor subestimaria a máquina velha.

        Ela vale 38% da nova, mas ainda custa ~63% por hora: capital e
        depreciação caem junto com o valor, e a curva de reparo sobe e absorve
        boa parte da queda. É o motivo de o modelo somar componentes em vez de
        aplicar um percentual sobre o preço de mercado.
        """
        nova = suggest_rate(PricingInputs(
            category='trator', age_years=2, used_value_brl=520000,
            new_value_brl=620000, hour_meter=1400,
        ))
        velha = suggest_rate(PricingInputs(
            category='trator', age_years=12, used_value_brl=200000,
            new_value_brl=620000, hour_meter=8400,
        ))
        razao_valor = 200000 / 520000
        razao_custo = float(velha.cost_brl_hour) / float(nova.cost_brl_hour)
        self.assertGreater(razao_custo, razao_valor * 1.5)

        def manutencao(resultado):
            item = next(i for i in resultado.breakdown if i.key == 'manutencao')
            return float(item.brl_per_billed_hour) / float(resultado.cost_brl_hour)

        self.assertGreater(manutencao(velha), manutencao(nova) * 5)

    def test_depreciacao_cai_com_a_idade_e_respeita_o_piso(self):
        self.assertGreater(annual_depreciation_rate(0), annual_depreciation_rate(10))
        self.assertGreaterEqual(annual_depreciation_rate(50), P.DEPRECIATION_FLOOR_RATE)
        self.assertLessEqual(annual_depreciation_rate(0), P.DEPRECIATION_INITIAL_RATE)

    def test_combustivel_e_operador_encarecem_a_tarifa(self):
        base = PricingInputs(
            category='trator', age_years=7, used_value_brl=380000,
            new_value_brl=620000, hour_meter=4900, power_cv=110,
        )
        seco = suggest_rate(base)
        molhado = suggest_rate(PricingInputs(**{
            **base.__dict__, 'includes_fuel': True, 'includes_operator': True,
        }))
        self.assertGreater(molhado.suggested_brl_hour, seco.suggested_brl_hour)
        chaves = {item.key for item in molhado.breakdown}
        self.assertIn('combustivel', chaves)
        self.assertIn('operador', chaves)

    def test_combustivel_sem_potencia_e_erro(self):
        with self.assertRaises(PricingError):
            suggest_rate(PricingInputs(
                category='trator', age_years=7, used_value_brl=380000,
                new_value_brl=620000, hour_meter=4900, power_cv=None,
                includes_fuel=True,
            ))

    def test_usado_acima_do_novo_e_erro(self):
        with self.assertRaises(PricingError):
            suggest_rate(PricingInputs(
                category='trator', age_years=1, used_value_brl=700000,
                new_value_brl=620000, hour_meter=500,
            ))

    def test_categoria_deduzida_da_finalidade_livre(self):
        self.assertEqual(P.category_for('Colheita de Grãos'), 'colheitadeira')
        self.assertEqual(P.category_for('Pulverização'), 'pulverizador')
        self.assertEqual(P.category_for('Plantio e cultivo'), 'trator')
        self.assertEqual(P.category_for(''), P.DEFAULT_CATEGORY)
        self.assertEqual(P.category_for('coisa desconhecida'), P.DEFAULT_CATEGORY)


class ServiceTests(TestCase):
    def setUp(self):
        self.owner = make_user(seq=1)
        self.machine = make_machine(self.owner)

    def test_gera_sugestao_e_grava_o_registro(self):
        with patch('pricing.research.research_machine', return_value=RESEARCH):
            suggestion = build_suggestion(self.machine)

        self.assertEqual(suggestion.source, 'pesquisa')
        self.assertEqual(suggestion.suggested_hourly_rate, Decimal('192.15'))
        # A taxa da plataforma é somada por fora, então o locatário paga mais.
        self.assertGreater(suggestion.lessee_pays_hourly, suggestion.suggested_hourly_rate)
        self.assertEqual(
            suggestion.daily_equivalent, suggestion.suggested_hourly_rate * 8
        )

        registro = PricingSuggestions.objects.get(id=suggestion.suggestion_id)
        self.assertEqual(registro.params_version, P.PARAMS_VERSION)
        self.assertEqual(registro.machinery_id, self.machine.id)

    def test_segunda_chamada_usa_o_cache_e_nao_pesquisa_de_novo(self):
        with patch('pricing.research.research_machine', return_value=RESEARCH) as mock:
            build_suggestion(self.machine)
            build_suggestion(self.machine)
        self.assertEqual(mock.call_count, 1)
        self.assertEqual(MachineValuations.objects.count(), 1)

    def test_cache_expirado_dispara_nova_pesquisa(self):
        with patch('pricing.research.research_machine', return_value=RESEARCH) as mock:
            build_suggestion(self.machine)
            MachineValuations.objects.update(
                expires_at=timezone.now() - timedelta(days=1)
            )
            build_suggestion(self.machine)
        self.assertEqual(mock.call_count, 2)

    def test_sem_pesquisa_nao_sugere(self):
        """Sem dado de mercado a resposta é 'não sei' — nunca um chute."""
        with patch('pricing.research.research_machine', return_value=None):
            with self.assertRaises(SuggestionUnavailable):
                build_suggestion(self.machine)
        self.assertEqual(PricingSuggestions.objects.count(), 0)

    def test_pesquisa_sem_fontes_e_descartada(self):
        sem_fonte = MachineResearch(**{**RESEARCH.as_dict(), 'sources': []})
        with patch('pricing.research.research_machine', return_value=sem_fonte):
            with self.assertRaises(SuggestionUnavailable):
                build_suggestion(self.machine)

    def test_valor_absurdo_cai_na_banda_de_sanidade(self):
        """Um valor de usado irrisório para uma máquina cara produz tarifa fora
        de qualquer faixa plausível — é alucinação, não oportunidade."""
        absurdo = MachineResearch(**{**RESEARCH.as_dict(), 'used_value_brl': 12000.0})
        with patch('pricing.research.research_machine', return_value=absurdo):
            with self.assertRaises(SuggestionUnavailable):
                build_suggestion(self.machine)

    def test_horimetro_ausente_e_estimado_e_sinalizado(self):
        sem_horimetro = make_machine(self.owner, hour_meter=None)
        with patch('pricing.research.research_machine', return_value=RESEARCH):
            suggestion = build_suggestion(sem_horimetro)
        self.assertFalse(suggestion.assumptions['horimetro_declarado'])
        self.assertGreater(suggestion.assumptions['horimetro'], 0)

    def test_maquina_sem_marca_nao_e_pesquisavel(self):
        anonima = make_machine(self.owner, brand='', model='')
        with self.assertRaises(SuggestionUnavailable):
            build_suggestion(anonima)

    def test_tarifa_com_operador_nao_ancora_anuncio_sem_operador(self):
        """Comparar tarifa com operador contra uma sem é comparar produtos
        diferentes; a de fora tem de ser ignorada."""
        com_operador = MachineResearch(**{
            **RESEARCH.as_dict(),
            'observed_rates_brl_hour': [
                {'value': 900.0, 'region': 'MT', 'includes_operator': True}
            ],
        })
        with patch('pricing.research.research_machine', return_value=com_operador):
            suggestion = build_suggestion(self.machine, includes_operator=False)
        self.assertEqual(suggestion.assumptions['tarifas_mercado_encontradas'], 0)
        self.assertEqual(suggestion.suggested_hourly_rate, Decimal('192.15'))


class ComparablesTests(TestCase):
    def setUp(self):
        self.owner = make_user(seq=1)
        self.machine = make_machine(self.owner)

    def _make_comparable(self, rate, seq, **machine_kwargs):
        other_owner = make_user(seq=seq + 100)
        other = make_machine(other_owner, **machine_kwargs)
        return Postings.objects.create(
            id=uuid.uuid4(), machinery=other, hourly_rate=Decimal(str(rate)),
            location_address='Sorriso, MT', status='active',
            created_at=timezone.now(), updated_at=timezone.now(),
        )

    def test_comparaveis_internos_puxam_a_sugestao(self):
        for i in range(5):
            self._make_comparable(300, i)
        with patch('pricing.research.research_machine', return_value=RESEARCH):
            suggestion = build_suggestion(self.machine)
        self.assertEqual(suggestion.assumptions['comparaveis_internos'], 5)
        # Com amostra interna suficiente o peso interno entra e a sugestão
        # sobe em direção aos R$ 300 praticados.
        self.assertGreater(suggestion.suggested_hourly_rate, Decimal('192.15'))

    def test_categoria_diferente_nao_conta_como_comparavel(self):
        for i in range(5):
            self._make_comparable(3000, i, usage_purpose='Colheita')
        with patch('pricing.research.research_machine', return_value=RESEARCH):
            suggestion = build_suggestion(self.machine)
        self.assertEqual(suggestion.assumptions['comparaveis_internos'], 0)
        self.assertEqual(suggestion.suggested_hourly_rate, Decimal('192.15'))

    def test_porte_muito_diferente_nao_conta_como_comparavel(self):
        for i in range(5):
            self._make_comparable(900, i, power_cv=400)
        with patch('pricing.research.research_machine', return_value=RESEARCH):
            suggestion = build_suggestion(self.machine)
        self.assertEqual(suggestion.assumptions['comparaveis_internos'], 0)


class EndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = make_user(seq=1)
        self.machine = make_machine(self.owner)

    def _auth(self, user):
        token = AccessToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_exige_autenticacao(self):
        response = self.client.post(
            '/api/pricing/suggest', {'machinery': str(self.machine.id)}, format='json'
        )
        self.assertIn(response.status_code, (401, 403))

    def test_dono_recebe_a_sugestao(self):
        self._auth(self.owner)
        with patch('pricing.research.research_machine', return_value=RESEARCH):
            response = self.client.post(
                '/api/pricing/suggest', {'machinery': str(self.machine.id)}, format='json'
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['sugerido_brl_hora'], '192.15')  # string, como no resto da API
        self.assertTrue(body['composicao'])
        self.assertTrue(body['fontes'])
        self.assertEqual(body['premissas']['categoria'], 'trator')

    def test_maquina_de_outro_locador_e_proibida(self):
        """Cada sugestão custa uma pesquisa paga: não pode ser disparada sobre
        a frota alheia."""
        intruso = make_user(seq=2)
        self._auth(intruso)
        with patch('pricing.research.research_machine', return_value=RESEARCH) as mock:
            response = self.client.post(
                '/api/pricing/suggest', {'machinery': str(self.machine.id)}, format='json'
            )
        self.assertEqual(response.status_code, 403)
        mock.assert_not_called()

    def test_maquina_inexistente_da_404(self):
        self._auth(self.owner)
        response = self.client.post(
            '/api/pricing/suggest', {'machinery': str(uuid.uuid4())}, format='json'
        )
        self.assertEqual(response.status_code, 404)

    def test_anuncio_criado_registra_o_preco_aceito(self):
        """Fecha o ciclo de calibração: sem gravar o que o locador publicou de
        fato, a sugestão nunca teria como ser corrigida por dados reais."""
        self._auth(self.owner)
        with patch('pricing.research.research_machine', return_value=RESEARCH):
            suggestion_id = self.client.post(
                '/api/pricing/suggest', {'machinery': str(self.machine.id)}, format='json'
            ).json()['suggestion_id']

        response = self.client.post('/api/postings/', {
            'machinery': str(self.machine.id),
            'hourly_rate': '210.00',
            'location_address': 'Sorriso, MT',
            'suggestion_id': suggestion_id,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        # `suggestion_id` é write-only: não pode vazar na resposta do anúncio.
        self.assertNotIn('suggestion_id', response.json())

        registro = PricingSuggestions.objects.get(id=suggestion_id)
        self.assertEqual(registro.accepted_hourly_rate, Decimal('210.00'))
        self.assertEqual(str(registro.posting_id), response.json()['id'])

    def test_sugestao_de_outra_maquina_nao_e_vinculada(self):
        """O id vem do cliente; vinculá-lo sem conferir a máquina deixaria
        qualquer anúncio sobrescrever o registro de aprendizado de outro."""
        self._auth(self.owner)
        outra = make_machine(self.owner, model='7200J')
        with patch('pricing.research.research_machine', return_value=RESEARCH):
            suggestion_id = self.client.post(
                '/api/pricing/suggest', {'machinery': str(outra.id)}, format='json'
            ).json()['suggestion_id']

        response = self.client.post('/api/postings/', {
            'machinery': str(self.machine.id),
            'hourly_rate': '210.00',
            'location_address': 'Sorriso, MT',
            'suggestion_id': suggestion_id,
        }, format='json')
        self.assertEqual(response.status_code, 201)

        registro = PricingSuggestions.objects.get(id=suggestion_id)
        self.assertIsNone(registro.accepted_hourly_rate)
        self.assertIsNone(registro.posting_id)

    def test_sem_dado_de_mercado_responde_422(self):
        self._auth(self.owner)
        with patch('pricing.research.research_machine', return_value=None):
            response = self.client.post(
                '/api/pricing/suggest', {'machinery': str(self.machine.id)}, format='json'
            )
        self.assertEqual(response.status_code, 422)
        self.assertIn('error', response.json())
