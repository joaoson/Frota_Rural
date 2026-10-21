"""Shared Groq transport/model contract for pricing and catalog recommendations."""

import json
from typing import Any

import httpx
from jsonschema import validate

ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
RESEARCH_MODEL = "openai/gpt-oss-20b"
STRUCTURED_MODEL = "openai/gpt-oss-120b"


def complete_json(
    http: httpx.Client,
    *,
    api_key: str,
    messages: list[dict[str, str]],
    schema: dict[str, Any],
    schema_name: str,
    max_tokens: int = 2000,
    reasoning_effort: str | None = None,
) -> dict[str, Any] | None:
    payload: dict[str, Any] = {
        "model": STRUCTURED_MODEL,
        "messages": messages,
        "temperature": 0,
        "max_completion_tokens": max_tokens,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": schema_name,
                "strict": True,
                "schema": schema,
            },
        },
    }
    if reasoning_effort:
        payload["reasoning_effort"] = reasoning_effort
    response = http.post(ENDPOINT, headers={"Authorization": f"Bearer {api_key}"}, json=payload)
    response.raise_for_status()
    choices = response.json().get("choices") or []
    if not choices or choices[0].get("finish_reason") != "stop":
        return None
    message = choices[0].get("message") or {}
    content = message.get("content")
    if message.get("refusal") or not isinstance(content, str) or not content.strip():
        return None
    data = json.loads(content)
    validate(instance=data, schema=schema)
    if not isinstance(data, dict):
        raise ValueError("Expected a structured object.")
    return data
