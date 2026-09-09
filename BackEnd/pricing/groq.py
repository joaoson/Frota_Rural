"""Groq REST adapter: Compound web research and GPT OSS schema extraction."""
from __future__ import annotations

import json
import os
from urllib.parse import urlsplit

import httpx
from jsonschema import validate

ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"


def _message(response):
    response.raise_for_status()
    choices = response.json().get("choices") or []
    if not choices or choices[0].get("finish_reason") != "stop":
        return None
    message = choices[0].get("message") or {}
    if not isinstance(message.get("content"), str) or not message["content"].strip():
        return None
    return message


def research_with_groq(prompt, extraction_prompt, schema):
    headers = {"Authorization": f"Bearer {os.environ['GROQ_API_KEY']}"}
    # Free-plan quotas are enforced by Groq. Never retry or switch providers.
    with httpx.Client(timeout=120.0) as http:
        # Basic search avoids the large internal contexts of advanced search,
        # which can exceed the free plan's underlying model token limits.
        message = _message(http.post(ENDPOINT, headers={
            **headers, "Groq-Model-Version": "2025-07-23",
        }, json={
            "model": "groq/compound-mini",
            "messages": [{"role": "user", "content": prompt}],
            "search_settings": {"country": "brazil"},
            "compound_custom": {"tools": {"enabled_tools": ["web_search"]}},
            "max_completion_tokens": 4000,
        }))
        if message is None:
            return None
        sources = []
        for tool in message.get("executed_tools") or []:
            for result in (tool.get("search_results") or {}).get("results") or []:
                url = result.get("url")
                if isinstance(url, str) and urlsplit(url).scheme in {"https", "http"}:
                    source = {"url": url, "title": result.get("title")}
                    if source not in sources:
                        sources.append(source)
        if not sources:
            return None

        extracted = _message(http.post(ENDPOINT, headers=headers, json={
            "model": "openai/gpt-oss-120b",
            "messages": [{"role": "user", "content": extraction_prompt.format(
                research=message["content"],
            )}],
            "max_completion_tokens": 3000,
            "response_format": {"type": "json_schema", "json_schema": {
                "name": "machine_valuation", "strict": True, "schema": schema,
            }},
        }))
        if extracted is None:
            return None
        data = json.loads(extracted["content"])
        validate(instance=data, schema=schema)
        # Only URLs from actual search results can appear as citations.
        data["sources"] = sources
        return data
