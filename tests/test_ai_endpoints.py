"""Chat-history, memory endpoints, and assistant chat persistence."""
import main as mainmod
from tests.conftest import make_company, make_user


def _pair(db):
    alice = make_user(db, "alice@example.com", company_name="Acme")
    make_company(db, "Acme", alice)
    bob = make_user(db, "bob@example.com", company_name="Globex")
    make_company(db, "Globex", bob)
    return alice, bob


def test_chat_history_roundtrip_and_isolation(db, client, act_as, monkeypatch):
    alice, bob = _pair(db)
    monkeypatch.setattr(mainmod.ai_module, "assistant_answer", lambda q, ctx: "mock answer")

    act_as(alice)
    r = client.post("/api/ai/assistant", json={"question": "hi team"})
    assert r.status_code == 200, r.text
    assert r.json()["answer"] == "mock answer"

    r = client.get("/api/ai/chat-history")
    assert r.status_code == 200
    items = r.json()["items"]
    assert [i["role"] for i in items] == ["user", "assistant"]
    assert items[0]["content"] == "hi team"
    assert items[0]["user_name"] == "Test User"
    assert items[1]["content"] == "mock answer"

    # Bob sees nothing of Alice's chat
    act_as(bob)
    r = client.get("/api/ai/chat-history")
    assert r.json()["items"] == []

    # Bob's clear does not touch Alice's history
    r = client.delete("/api/ai/chat-history")
    assert r.status_code == 200
    assert r.json()["deleted"] == 0

    act_as(alice)
    r = client.delete("/api/ai/chat-history")
    assert r.json()["deleted"] == 2
    r = client.get("/api/ai/chat-history")
    assert r.json()["items"] == []


def test_assistant_saves_and_injects_context(db, client, act_as, monkeypatch):
    alice, _ = _pair(db)
    act_as(alice)

    captured = {}

    def fake_answer(question, context):
        captured["question"] = question
        captured["context"] = context
        return "mock answer"

    monkeypatch.setattr(mainmod.ai_module, "assistant_answer", fake_answer)

    r = client.post("/api/ai/assistant", json={"question": "first question"})
    assert r.status_code == 200

    r = client.post("/api/ai/assistant", json={"question": "second question"})
    assert r.status_code == 200

    # The second call's context carries the prior exchange as recent_chat
    chat = [c["content"] for c in captured["context"]["recent_chat"]]
    assert "first question" in chat
    assert "mock answer" in chat
    # And the company scope made it into the snapshot
    assert captured["context"]["company_scope"]["company_name"] == "Acme"
    # The current question is NOT duplicated inside recent_chat
    assert "second question" not in chat


def test_memory_roundtrip(db, client, act_as):
    alice, bob = _pair(db)
    act_as(alice)

    r = client.get("/api/ai/memory")
    assert r.status_code == 200
    assert r.json() == {"mission": None, "goals": [], "preferences": None}

    r = client.put(
        "/api/ai/memory",
        json={"mission": "Win tenders", "goals": ["Grow in Gauteng"], "preferences": "direct tone"},
    )
    assert r.status_code == 200
    assert r.json()["mission"] == "Win tenders"
    assert r.json()["goals"] == ["Grow in Gauteng"]

    # Bob's memory stays separate
    act_as(bob)
    r = client.get("/api/ai/memory")
    assert r.json()["mission"] is None
