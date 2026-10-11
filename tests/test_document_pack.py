"""The document pack: what a tender actually needs, and where each item stands.

Compliance items must be matched from the tenant's library and never invented;
content documents are matched against what has already been written.
"""
import ai_module


CHECKLIST = [
    {"name": "CIPC registration certificate", "mandatory": True, "description": "Proof of registration",
     "library_category": "CIPC", "linked_library_doc_id": None, "status": "Outstanding"},
    {"name": "B-BBEE certificate", "mandatory": True, "description": "Level 2 certificate",
     "library_category": "B-BBEE", "linked_library_doc_id": None, "status": "Outstanding"},
    {"name": "Tax clearance certificate", "mandatory": True, "description": "SARS PIN",
     "library_category": "SARS", "linked_library_doc_id": None, "status": "Outstanding"},
    {"name": "PSIRA certificate", "mandatory": False, "description": None,
     "library_category": "PSIRA", "linked_library_doc_id": None, "status": "Outstanding"},
]

LIBRARY = [
    {"id": 1, "name": "CIPC Certificate", "category": "CIPC", "status": "Active",
     "expiry_date": None, "days_to_expiry": None},
    {"id": 2, "name": "B-BBEE Level 2", "category": "B-BBEE", "status": "Expired",
     "expiry_date": "2020-01-01", "days_to_expiry": -100},
]

SMART = [
    {"doc_type": "method_statement", "reason": "Required for technical score", "priority": "essential"},
    {"doc_type": "business_plan", "reason": "Client requires a business plan", "priority": "essential"},
    {"doc_type": "pricing_schedule", "reason": "All bids need pricing", "priority": "essential"},
]

GENERATED = [{"id": 50, "doc_type": "method_statement", "title": "Method Statement — T-1"}]


def _pack(**kw):
    args = dict(checklist=CHECKLIST, library_docs=LIBRARY, generated_docs=GENERATED, smart_docs=SMART)
    args.update(kw)
    return ai_module.build_document_pack(**args)


def _by_title(pack):
    return {p["title"]: p for p in pack}


def test_compliance_items_are_matched_from_the_library():
    pack = _by_title(_pack())
    cipc = pack["CIPC registration certificate"]
    assert cipc["kind"] == "compliance"
    assert cipc["library_document_id"] == 1
    assert cipc["status"] == "ready"

    # Not held -> explicitly reported as missing, never invented.
    tax = pack["Tax clearance certificate"]
    assert tax["library_document_id"] is None
    assert tax["status"] == "missing"
    assert tax["editable"] is False


def test_expired_library_document_is_flagged_not_hidden():
    pack = _by_title(_pack())
    bbee = pack["B-BBEE certificate"]
    assert bbee["library_document_id"] == 2
    assert bbee["status"] == "expired"


def test_content_documents_respect_generation_state():
    pack = _by_title(_pack())
    method = pack["Method Statement"]
    assert method["kind"] == "content"
    assert method["status"] == "generated"
    assert method["generated_id"] == 50
    assert method["editable"] is True

    plan = pack["Business Plan"]
    assert plan["doc_type"] == "business_plan"
    assert plan["status"] == "missing"
    assert plan["mandatory"] is True


def test_missing_outstanding_are_counted_in_the_summary():
    summary = ai_module.document_pack_summary(_pack())
    # ready: CIPC. expired: B-BBEE. missing: tax, PSIRA, business plan, pricing.
    assert summary["ready"] == 1
    assert summary["expired"] == 1
    assert summary["missing"] == 4
    assert summary["generated"] == 1
    assert summary["outstanding"] == summary["missing"] + summary["expired"]


def test_mandatory_missing_documents_are_listed_first():
    pack = _pack()
    titles = [p["title"] for p in pack]
    # Everything mandatory comes before the optional PSIRA item.
    psira_at = titles.index("PSIRA certificate")
    assert all(p["mandatory"] for p in pack[:psira_at])


def test_explicit_link_beats_category_matching():
    checklist = [{"name": "Tax clearance", "mandatory": True, "library_category": "SARS",
                  "linked_library_doc_id": 2, "status": "Outstanding"}]
    pack = ai_module.build_document_pack(checklist, LIBRARY, [], [])
    assert pack[0]["library_document_id"] == 2


def test_already_written_documents_are_kept_even_if_no_longer_required():
    generated = [{"id": 9, "doc_type": "sops", "title": "SOPs"}]
    pack = _by_title(_pack(generated_docs=generated, smart_docs=[]))
    sops = pack[ai_module.DOCUMENT_TYPE_INFO["sops"]["title"]]
    assert sops["status"] == "generated"
    assert sops["generated_id"] == 9


def test_empty_inputs_do_not_crash():
    assert ai_module.build_document_pack([], [], [], []) == []
    assert ai_module.document_pack_summary([])["total"] == 0


def test_business_plan_is_a_supported_document_type():
    assert "business_plan" in ai_module.DOCUMENT_GENERATORS
    assert ai_module.DOCUMENT_TYPE_INFO["business_plan"]["title"] == "Business Plan"
    assert "business_plan" in ai_module.WRITABLE_DOC_TYPES


def test_ai_edit_keeps_the_original_when_the_ai_fails(monkeypatch):
    original = "MY DOCUMENT\n\nOriginal content."
    monkeypatch.setattr(
        ai_module, "_gemini_chat",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("quota")),
    )
    result = ai_module.ai_edit_document(original, "make it shorter", {}, {})
    assert "MY DOCUMENT" in result
    assert "AI edit unavailable" in result


def test_ai_edit_returns_revised_content(monkeypatch):
    monkeypatch.setattr(ai_module, "_gemini_chat", lambda *a, **k: "REVISED DOCUMENT")
    assert ai_module.ai_edit_document("old", "shorten", {}, {}) == "REVISED DOCUMENT"


def test_ai_edit_never_invents_a_placeholder_when_ai_works(monkeypatch):
    """A successful edit must not be wrapped in the unavailable banner."""
    monkeypatch.setattr(ai_module, "_gemini_chat", lambda *a, **k: "Fine, revised.")
    out = ai_module.ai_edit_document("old", "edit", {}, {})
    assert out == "Fine, revised."