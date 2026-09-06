"""Flag suave de moderação por palavra bloqueada.

A mensagem continua sendo entregue normalmente — só entra na fila da moderação.
Bloquear o envio seria pior: o remetente reescreveria a frase e a denúncia
nunca chegaria a um humano.
"""

import re

from django.conf import settings

_DEFAULT_BANNED = ()


def banned_words():
    configured = getattr(settings, 'CHAT_BANNED_WORDS', None)
    return tuple(configured) if configured else _DEFAULT_BANNED


def should_flag(content):
    words = banned_words()
    if not words:
        return False
    lowered = (content or '').lower()
    return any(re.search(r'\b' + re.escape(w) + r'\b', lowered) for w in words)
