"""Gemini REST adapter: grounded research, then schema-constrained extraction."""
from __future__ import annotations

import json
import os
from urllib.parse import quote, urlsplit

import httpx
from jsonschema import validate

DEFAULT_MODEL = "gemini-2.5-flash"
API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"


def _candidate(response):
    response.raise_for_status()
    candidates = response.json().get("candidates") or []
    if not candidates or candidates[0].get("finishReason") != "STOP":
        return None
    return candidates[0]


def _text(candidate):
    return "\n".join(
        part["text"] for part in candidate.get("content", {}).get("parts", [])
        if isinstance(part.get("text"), str) and not part.get("thought")
    )


def research_with_gemini(prompt, extraction_prompt, schema):
    model = os.getenv("GEMINI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    endpoint = f"{API_ROOT}/{quote(model, safe='')}:generateContent"
    headers = {"x-goog-api-key": os.environ["GEMINI_API_KEY"]}
    # No automatic retries: a quota error must not trigger additional calls.
    with httpx.Client(timeout=120.0) as http:
        candidate = _candidate(http.post(endpoint, headers=headers, json={
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "tools": [{"google_search": {}}],
            "generationConfig": {"maxOutputTokens": 8192},
        }))
        if candidate is None:
            return None
        research_text = _text(candidate)
        metadata = candidate.get("groundingMetadata") or {}
        sources = []
        for chunk in metadata.get("groundingChunks") or []:
            web = chunk.get("web") or {}
            url = web.get("uri")
            if isinstance(url, str) and urlsplit(url).scheme in {"https", "http"}:
                source = {"url": url, "title": web.get("title")}
                if source not in sources:
                    sources.append(source)
        if not research_text or not sources:
            # A fluent answer without actual search evidence is not market data.
            return None

        extracted = _candidate(http.post(endpoint, headers=headers, json={
            "contents": [{"role": "user", "parts": [{
                "text": extraction_prompt.format(research=research_text),
            }]}],
            "generationConfig": {
                "maxOutputTokens": 8192,
                "responseMimeType": "application/json",
                "responseJsonSchema": schema,
            },
        }))
        if extracted is None:
            return None
        data = json.loads(_text(extracted))
        validate(instance=data, schema=schema)
        # Citation URLs come from the search engine, never from generated JSON.
        data["sources"] = sources
        entry_point = (metadata.get("searchEntryPoint") or {}).get("renderedContent")
        data["search_suggestions_html"] = entry_point if isinstance(entry_point, str) else None
        return data
