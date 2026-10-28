"""Normalização de texto para comparar o que o OCR leu com os rótulos esperados."""

import difflib
import re
import unicodedata

_NON_ALNUM = re.compile(r"[^A-Z0-9]+")


def squash(text: str) -> str:
    """Maiúsculo, sem acento e só letras e dígitos: "Nº REGISTRO" e "NOREGISTRO" ficam iguais.

    O reconhecedor de texto ora engole espaços ("NOREGISTRO"), ora troca letras
    ("ASSINATURADOPORTADDR"), então rótulos nunca são comparados com espaços nem exatos.
    """
    decomposed = unicodedata.normalize("NFKD", text)
    ascii_text = "".join(char for char in decomposed if not unicodedata.combining(char))
    return _NON_ALNUM.sub("", ascii_text.upper())


def similarity(a: str, b: str) -> float:
    """Semelhança de 0 a 1 entre dois textos já normalizados com `squash`."""
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b).ratio()
