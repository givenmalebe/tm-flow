"""ai_module agent functions: briefing narrative, funding discovery, match scoring.
All Gemini calls are mocked — no network."""
import json

import ai_module


def _gemini_response(text):
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


def test_generate_briefing_returns_text_and_passes_system(monkeypatch):
    captured = {}

    def fake_post(payload, timeout):
        captured["system"] = payload.get("systemInstruction", {}).get("parts", [{}])[0].get("text", "")
        captured["prompt"] = payload["contents"][0]["parts"][0]["text"]
        return _gemini_response("Hi Acme! Let's win that CCTV tender.")

    monkeypatch.setattr(ai_module, "_gemini_post", fake_post)
    out = ai_module.generate_briefing(
        "Acme", {"closing_soon": [{"reference_number": "E137"}]}, {"mission": "grow"}
    )
    assert out == "Hi Acme! Let's win that CCTV tender."
    assert "procurement success AI" in captured["system"]
    assert "Acme" in captured["prompt"]
    assert "E137" in captured["prompt"]


def test_generate_briefing_raises_on_gemini_failure(monkeypatch):
    def fake_post(payload, timeout):
        raise RuntimeError("Gemini request failed: HTTP 429")

    monkeypatch.setattr(ai_module, "_gemini_post", fake_post)
    try:
        ai_module.generate_briefing("Acme", {}, {})
        assert False, "should raise"
    except RuntimeError:
        pass


def test_discover_funding_structures_search_results(monkeypatch):
    search_results = [
        {"title": "SEFA", "url": "https://sefa.org.za/apply", "snippet": "loans for SMMEs"},
        {"title": "Bridging finance", "url": "https://fund.co.za", "snippet": "PO funding"},
    ]

    def fake_search(query, num=10, timeout=45.0):
        return search_results

    def fake_chat(prompt, system=None, max_tokens=8000):
        return json.dumps([
            {"title": "SEFA SMME Loan", "provider": "SEFA", "type": "funding",
             "category": "Loan", "location": "South Africa", "closing_date": None,
             "description": "Loans for small businesses", "url": "https://sefa.org.za/apply",
             "source_site": "sefa.org.za", "estimated_value": "R50k - R5m"},
            {"title": "PO Bridging Finance", "provider": "Fund Co", "type": "finance",
             "category": "Bridging finance", "location": "South Africa", "closing_date": None,
             "description": "Purchase order funding", "url": "https://fund.co.za",
             "source_site": "fund.co.za", "estimated_value": None},
        ])

    monkeypatch.setattr(ai_module, "_gemini_web_search", fake_search)
    monkeypatch.setattr(ai_module, "_gemini_chat", fake_chat)

    out = ai_module.discover_funding("Acme, a security company in Gauteng")
    assert len(out) == 2
    assert out[0]["type"] == "funding"
    assert out[1]["type"] == "finance"
    assert out[0]["provider"] == "SEFA"


def test_discover_funding_empty_search_returns_empty(monkeypatch):
    monkeypatch.setattr(ai_module, "_gemini_web_search", lambda q, num=10, timeout=45.0: [])
    assert ai_module.discover_funding("Acme") == []


def test_discover_funding_invalid_json_returns_empty(monkeypatch):
    monkeypatch.setattr(ai_module, "_gemini_web_search", lambda q, num=10, timeout=45.0: [{"title": "x", "url": "https://x"}])
    monkeypatch.setattr(ai_module, "_gemini_chat", lambda p, system=None, max_tokens=8000: "not json at all")
    assert ai_module.discover_funding("Acme") == []


def test_score_opportunities_validates_and_clamps(monkeypatch):
    opps = [{"title": f"T{i}"} for i in range(4)]

    def fake_chat(prompt, system=None, max_tokens=8000):
        assert "T0" in prompt
        return json.dumps([
            {"index": 0, "score": 85, "reason": "You can apply because you are PSIRA registered"},
            {"index": 1, "score": 250, "reason": "clamped"},
            {"index": 7, "score": 50, "reason": "out of range, dropped"},
            {"index": 3, "score": "bad", "reason": "dropped for bad score"},
        ])

    monkeypatch.setattr(ai_module, "_gemini_chat", fake_chat)
    out = ai_module.score_opportunities("Acme security", opps)
    assert out == [
        {"index": 0, "score": 85, "reason": "You can apply because you are PSIRA registered"},
        {"index": 1, "score": 100, "reason": "clamped"},
    ]


def test_score_opportunities_empty_input_and_failure(monkeypatch):
    assert ai_module.score_opportunities("Acme", []) == []
    monkeypatch.setattr(ai_module, "_gemini_chat", lambda p, system=None, max_tokens=8000: "garbage")
    assert ai_module.score_opportunities("Acme", [{"title": "T"}]) == []
