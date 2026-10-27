"""Índice de veracidade: junta a plausibilidade dos dados e a consistência com o OCR.

Duas fontes de evidência sobre "este cadastro é verdadeiro?":

- **plausibilidade** (`model.py`): os dados parecem de uma pessoa real? Sempre disponível;
- **consistência** (`consistency.py`): os dados batem com a foto da CNH? Só vale quando o
  OCR leu campos suficientes.

A nota de "dado falso" combinada é uma média ponderada, e o peso do OCR cresce com a
quantidade de evidência que ele trouxe:

    w     = min(1, evidência / EVIDENCE_FULL)           (0 se evidência < MIN_EVIDENCE)
    falso = w · (1 − concordância) + (1 − w) · P(falso do modelo)
    índice de veracidade = 100 · (1 − falso)

Com pouco ou nenhum OCR, `w = 0` e o índice é exatamente a plausibilidade (o fallback). Com
vários campos fortes batendo, o OCR "avaliza" o registro e a suspeita do modelo (nome raro,
cidade fora da lista...) pesa pouco. Os pesos e limites são ajustados com
`scripts/evaluate_veracity.py`.

Recusa quando: uma regra dura dispara; ou há divergência dura com o OCR (CPF, ou duas
divergências em campos fortes), mesmo que o modelo goste dos dados; ou a nota combinada
chega ao limiar. Não adianta o OCR bater se uma regra dura (CPF inválido, datas impossíveis)
dispara: a regra é um fato, não uma probabilidade.
"""

from dataclasses import dataclass

from lib.consistency import Consistency

EVIDENCE_FULL = 3.0  # ≈ três campos fortes lidos: o OCR passa a ter a palavra final
MIN_EVIDENCE = 1.0  # menos que um campo forte: o OCR é ignorado (fallback)
HARD_MISMATCH_SCORE = 0.95  # nota mínima quando o OCR contradiz o digitado

BASIS_OCR = "ocr+plausibility"
BASIS_PLAUSIBILITY = "plausibility"


@dataclass(frozen=True)
class Verdict:
    fake_score: float  # 0–1, maior = mais provável ser falso
    veracity: int  # 0–100, maior = mais verdadeiro
    is_suspicious: bool
    basis: str
    hard_mismatch: bool  # o OCR contradiz o digitado de forma inequívoca


def combine(
    model_fake: float, consistency: Consistency, threshold: float, *, rule_hit: bool
) -> Verdict:
    """Decisão final a partir da nota do modelo, da consistência e das regras duras."""
    uses_ocr = consistency.evidence >= MIN_EVIDENCE
    weight = min(1.0, consistency.evidence / EVIDENCE_FULL) if uses_ocr else 0.0
    fake = weight * (1.0 - consistency.agreement) + (1.0 - weight) * model_fake

    hard_mismatch = uses_ocr and consistency.hard_mismatch
    if rule_hit:
        fake = 1.0
    elif hard_mismatch:
        fake = max(fake, HARD_MISMATCH_SCORE)

    return Verdict(
        fake_score=round(fake, 4),
        veracity=round(100 * (1.0 - fake)),
        is_suspicious=rule_hit or hard_mismatch or fake >= threshold,
        basis=BASIS_OCR if uses_ocr else BASIS_PLAUSIBILITY,
        hard_mismatch=hard_mismatch,
    )
