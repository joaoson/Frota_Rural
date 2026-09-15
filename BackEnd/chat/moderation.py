"""Flag suave de moderação por palavra bloqueada.

A mensagem continua sendo entregue normalmente — só entra na fila da moderação.
Bloquear o envio seria pior: o remetente reescreveria a frase e a denúncia
nunca chegaria a um humano.
"""

import re

from django.conf import settings


def banned_words() -> tuple[str, ...]:
    configured: list[str] | None = getattr(settings, "CHAT_BANNED_WORDS", None)
    return tuple(configured) if configured else ()


def should_flag(content: str | None) -> bool:
    words = banned_words()
    if not words:
        return False
    lowered = (content or "").lower()
    return any(re.search(r"\b" + re.escape(word) + r"\b", lowered) for word in words)
