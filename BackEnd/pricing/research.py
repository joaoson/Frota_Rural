"""Pesquisa de mercado com busca na web e extração estruturada.

Groq é o padrão para testes com a cota do plano gratuito. Gemini e Claude
permanecem disponíveis com PRICING_AI_PROVIDER=gemini ou anthropic. O provedor é
explícito: uma falha ou cota esgotada nunca dispara um fallback pago.
A IA coleta fatos e fontes; engine.py continua responsável pelo preço.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

MODEL = "claude-opus-5"

# A busca é o passo caro; 8 usos cobrem "acha o modelo, confere em outra fonte,
# procura o valor de novo" sem deixar a chamada correr solta.
MAX_SEARCHES = 8

# Uma turnada de busca pode parar em `pause_turn` quando o laço server-side
# atinge o limite de iterações. Reenviar retoma de onde parou; o teto evita
# transformar uma pesquisa difícil numa conta aberta.
MAX_CONTINUATIONS = 3

RESEARCH_TIMEOUT_SECONDS = 120.0

# Fallback server-side: se um classificador recusar a resposta, a API roteia
# para outro modelo em vez de devolver conteúdo vazio. Improvável num pedido
# sobre preço de trator, mas custa uma linha.
FALLBACK_BETA = "server-side-fallback-2026-07-01"

VALUATION_SCHEMA = {
    "type": "object",
    "properties": {
        "power_cv": {"type": ["integer", "null"]},
        "used_value_brl": {"type": ["number", "null"]},
        "used_value_range_brl": {
            "type": ["array", "null"],
            "items": {"type": "number"},
        },
        "new_value_brl": {"type": ["number", "null"]},
        "observed_rates_brl_hour": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "value": {"type": "number"},
                    "region": {"type": ["string", "null"]},
                    "includes_operator": {"type": ["boolean", "null"]},
                },
                "required": ["value", "region", "includes_operator"],
                "additionalProperties": False,
            },
        },
        "confidence": {"type": "string", "enum": ["alta", "media", "baixa"]},
        "matched_model": {"type": ["string", "null"]},
        "sources": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "title": {"type": ["string", "null"]},
                },
                "required": ["url", "title"],
                "additionalProperties": False,
            },
        },
    },
    "required": [
        "power_cv", "used_value_brl", "used_value_range_brl", "new_value_brl",
        "observed_rates_brl_hour", "confidence", "matched_model", "sources",
    ],
    "additionalProperties": False,
}

RESEARCH_PROMPT = """Pesquise o mercado brasileiro de maquinário agrícola usado \
e levante os dados abaixo sobre esta máquina:

Marca: {brand}
Modelo: {model}
Ano: {year}

Levante:
1. Valor de mercado atual do usado, em reais, para esse modelo e ano.
2. A faixa de valores encontrada (menor e maior anúncio).
3. Valor de um equivalente novo, em reais (modelo atual da mesma linha e porte).
4. Potência nominal, em cv.
5. Tarifas de locação por hora anunciadas para máquinas desse porte, se houver, \
dizendo a região e se incluem operador.

Regras:
- Tudo em reais. Se encontrar preço em outra moeda, não converta: descarte.
- Cite a URL de cada fonte usada.
- Se não achar o modelo exato, use o mais próximo em porte e potência e diga \
qual foi usado.
- Não estime por analogia solta e não invente número: dado que você não achou é \
dado ausente. Confiança "baixa" com campos vazios é uma resposta melhor do que \
um chute plausível."""

EXTRACTION_PROMPT = """Extraia os dados da pesquisa abaixo para o schema.

Use null em todo campo que a pesquisa não estabeleceu com fonte. Não preencha \
por dedução: se o valor do novo não aparece, é null, e não uma extrapolação do \
valor do usado.

Confiança:
- "alta": modelo e ano exatos, com mais de uma fonte concordante;
- "media": modelo próximo, ou fonte única;
- "baixa": dados esparsos, desatualizados ou contraditórios.

--- PESQUISA ---
{research}"""


@dataclass(frozen=True)
class MachineResearch:
    power_cv: int | None
    used_value_brl: float | None
    used_value_range_brl: list | None
    new_value_brl: float | None
    observed_rates_brl_hour: list
    confidence: str
    matched_model: str | None
    sources: list
    search_suggestions_html: str | None = None

    def as_dict(self):
        return asdict(self)


def is_enabled():
    """A pesquisa só roda com a chave do provedor escolhido."""
    provider = os.getenv("PRICING_AI_PROVIDER", "groq").strip().lower()
    if provider == "groq":
        return bool(os.getenv("GROQ_API_KEY", "").strip())
    if provider == "gemini":
        return bool(os.getenv("GEMINI_API_KEY", "").strip())
    if provider != "anthropic" or not os.getenv("ANTHROPIC_API_KEY"):
        return False
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return False
    return True


def _client():
    import anthropic

    return anthropic.Anthropic(timeout=RESEARCH_TIMEOUT_SECONDS)


def _text_of(message):
    return "\n".join(b.text for b in message.content if b.type == "text")


def _run_search(client, brand, model, year):
    """Passo 1: pesquisa com busca na web, retomando turnadas pausadas."""
    messages = [
        {
            "role": "user",
            "content": RESEARCH_PROMPT.format(brand=brand, model=model, year=year),
        }
    ]
    tools = [
        {"type": "web_search_20260209", "name": "web_search", "max_uses": MAX_SEARCHES}
    ]

    for _ in range(MAX_CONTINUATIONS + 1):
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=8000,
            tools=tools,
            messages=messages,
            thinking={"type": "adaptive"},
            betas=[FALLBACK_BETA],
            fallbacks="default",
        )
        if response.stop_reason != "pause_turn":
            return _text_of(response)
        # A API detecta o bloco de busca pendente e retoma sozinha — não se
        # acrescenta uma mensagem "continue" aqui.
        messages.append({"role": "assistant", "content": response.content})

    logger.warning("Pesquisa de preço não concluiu em %s retomadas.", MAX_CONTINUATIONS)
    return None


def _extract(client, research_text):
    """Passo 2: texto livre -> JSON validado contra o schema."""
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=4000,
        messages=[
            {"role": "user", "content": EXTRACTION_PROMPT.format(research=research_text)}
        ],
        output_config={"format": {"type": "json_schema", "schema": VALUATION_SCHEMA}},
        betas=[FALLBACK_BETA],
        fallbacks="default",
    )
    return json.loads(_text_of(response))


def research_machine(brand, model, year):
    """Pesquisa a máquina e devolve os fatos, ou `None` se não deu.

    Nunca levanta exceção para o chamador: qualquer falha — rede, cota, resposta
    fora do formato — vira `None`, e o anúncio segue sem sugestão.
    """
    if not is_enabled():
        return None

    try:
        provider = os.getenv("PRICING_AI_PROVIDER", "groq").strip().lower()
        if provider in {"groq", "gemini"}:
            if provider == "groq":
                from .groq import research_with_groq as run_research
            else:
                from .gemini import research_with_gemini as run_research

            data = run_research(
                RESEARCH_PROMPT.format(brand=brand, model=model, year=year),
                EXTRACTION_PROMPT,
                VALUATION_SCHEMA,
            )
            if data is None:
                return None
        else:
            client = _client()
            research_text = _run_search(client, brand, model, year)
            if not research_text:
                return None
            data = _extract(client, research_text)
    except Exception:
        logger.exception("Falha na pesquisa de preço de %s %s %s", brand, model, year)
        return None

    return MachineResearch(
        power_cv=data.get("power_cv"),
        used_value_brl=data.get("used_value_brl"),
        used_value_range_brl=data.get("used_value_range_brl"),
        new_value_brl=data.get("new_value_brl"),
        observed_rates_brl_hour=data.get("observed_rates_brl_hour") or [],
        confidence=data.get("confidence") or "baixa",
        matched_model=data.get("matched_model"),
        sources=data.get("sources") or [],
        search_suggestions_html=data.get("search_suggestions_html"),
    )
