"""Brazilian state names and recognition in the existing free-text addresses."""

import re
import unicodedata

BRAZILIAN_STATES = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas",
    "BA": "Bahia", "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo",
    "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul",
    "MG": "Minas Gerais", "PA": "Pará", "PB": "Paraíba", "PR": "Paraná",
    "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina",
    "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins",
}


def _words(value: str) -> list[str]:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.findall(r"[a-z0-9]+", normalized)


def state_from_address(address: str | None) -> str | None:
    """Read a trailing UF/full state, allowing an optional country and postal code.

    Prefer the address suffix so a city or street named after another state
    cannot accidentally widen the selected-state search. Unclear addresses
    stay unmatched rather than guessing their location.
    """
    words = _words(address or "")
    while words and (words[-1].isdigit() or words[-1] in {"br", "brasil", "brazil", "cep"}):
        words.pop()
    if not words:
        return None
    code = words[-1].upper()
    if code in BRAZILIAN_STATES:
        return code
    for code, name in BRAZILIAN_STATES.items():
        name_words = _words(name)
        if words[-len(name_words):] == name_words:
            return code
    return None
