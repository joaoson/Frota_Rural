"""Rótulos impressos de cada layout de CNH e o casamento tolerante do que o OCR leu.

O reconhecedor de texto erra os rótulos ("NOREGISTRO", "ASSINATURADOPORTADDR"), então o
casamento é por semelhança sobre o texto normalizado (`text.squash`), nunca por igualdade.
Os rótulos funcionam como **âncoras**: com 3 ou mais deles reconhecidos dá para calcular a
rotação, a escala e a posição do documento na foto (`registration.py`).
"""

from lib.text import similarity, squash

# Layout antigo: a "CNH aberta" (frente e verso numa folha), o único coberto pelo dataset BID.
OLD_LABELS = {
    "name": "NOME",
    "doc": "DOCIDENTIDADEORGEMISSORUF",
    "cpf": "CPF",
    "birth": "DATANASCIMENTO",
    "filiation": "FILIACAO",
    "permission": "PERMISSAO",
    "acc": "ACC",
    "category": "CATHAB",
    "register": "NOREGISTRO",
    "expiration": "VALIDADE",
    "first_license": "1AHABILITACAO",
    "observations": "OBSERVACOES",
    "place": "LOCAL",
    "issue": "DATAEMISSAO",
    "sign_holder": "ASSINATURADOPORTADOR",
    "sign_issuer": "ASSINATURADOEMISSOR",
}
# Títulos e textos fixos: ajudam a reconhecer o layout, mas não servem de âncora de posição.
OLD_TITLES = (
    "CARTEIRANACIONALDEHABILITACAO",
    "DEPARTAMENTONACIONALDETRANSITO",
    "PROIBIDOPLASTIFICAR",
)

# Layout numerado: a CNH digital (CNH-e) e, provavelmente, a física nova.
DIGITAL_LABELS = {
    "name": "2E1NOMEESOBRENOME",
    "first_license": "1HABILITACAO",
    "birth": "3DATALOCALEUFDENASCIMENTO",
    "issue": "4ADATAEMISSAO",
    "expiration": "4BVALIDADE",
    "doc": "4CDOCIDENTIDADEORGEMISSORUF",
    "cpf": "4DCPF",
    "register": "5NREGISTRO",
    "category": "9CATHAB",
    "nationality": "NACIONALIDADE",
    "filiation": "FILIACAO",
    "observations": "12OBSERVACOES",
    "place": "LOCAL",
}
DIGITAL_TITLES = ("CARTEIRANACIONALDEHABILITACAO", "SECRETARIANACIONALDETRANSITO")

MATCH_THRESHOLD = 0.80
SHORT_LABEL = 3  # rótulos de até 3 letras (CPF, ACC) exigem texto praticamente igual


def match_label(text: str, labels: dict[str, str]) -> tuple[str, float] | None:
    """Rótulo de `labels` que melhor casa com `text`, ou `None` se nenhum passar do limiar.

    Só casa a linha inteira: "4dCPF" casa com o rótulo `4DCPF`, mas "CPF 896.630.040-53" não.
    """
    squashed = squash(text)
    if not squashed:
        return None
    best: tuple[str, float] | None = None
    for key, canonical in labels.items():
        if abs(len(squashed) - len(canonical)) > max(3, len(canonical) // 3):
            continue
        score = similarity(squashed, canonical)
        needed = 0.99 if len(canonical) <= SHORT_LABEL else MATCH_THRESHOLD
        if score >= needed and (best is None or score > best[1]):
            best = (key, score)
    return best


def title_hits(texts: list[str], titles: tuple[str, ...]) -> int:
    """Quantos dos títulos fixos do layout aparecem (por semelhança) entre os textos lidos."""
    squashed = [squash(t) for t in texts]
    return sum(
        any(similarity(s, title) >= 0.75 or title in s for s in squashed) for title in titles
    )
