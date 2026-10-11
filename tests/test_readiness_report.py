"""The readiness report must always produce a real report, even when the AI
daily quota is spent. These tests pin the deterministic fallback.
"""
import pytest

import ai_module


TENDER = {
    "reference_number": "RFP-001",
    "title": "Office cleaning contract",
    "client_company": "City Council",
    "closing_date": "2030-01-15",
    "days_until_close": 40,
    "contract_period": "24 months",
    "submission_method": "Two-envelope, hand delivered",
    "scope_of_work": "Daily cleaning of 12 municipal buildings",
}

CHECKLIST = [
    {"name": "CIPC registration", "status": "Complete", "mandatory": True, "description": "Company registration"},
    {"name": "B-BBEE certificate", "status": "Complete", "mandatory": True, "description": None},
    {"name": "Tax clearance", "status": "Outstanding", "mandatory": True, "description": "SARS pin"},
    {"name": "Method statement", "status": "Outstanding", "mandatory": True, "description": "How we will deliver"},
    {"name": "References", "status": "Outstanding", "mandatory": False, "description": None},
]

LIBRARY = [
    {"name": "CIPC certificate", "category": "CIPC", "expiry_date": None, "days_to_expiry": None, "status": "Active"},
    {"name": "B-BBEE Level 2", "category": "B-BBEE", "expiry_date": "2030-06-30", "days_to_expiry": 200, "status": "Active"},
    {"name": "PSIRA certificate", "category": "PSIRA", "expiry_date": "2020-01-01", "days_to_expiry": -3000, "status": "Expired"},
    {"name": "COIDA letter", "category": "COIDA", "expiry_date": "2030-01-05", "days_to_expiry": 20, "status": "Expiring Soon"},
]

COMPANY = {
    "company_name": "Sparkle Cleaning Co",
    "registration_number": "2019/123456/07",
    "psira_number": None,
    "bbbbee_level": "Level 2",
}


def test_offline_report_has_all_seven_sections():
    report = ai_module.build_readiness_report_offline(TENDER, {}, CHECKLIST, LIBRARY, COMPANY)
    for section in [
        "=== WHAT THE TENDER REQUIRES ===",
        "=== WHAT YOU HAVE ===",
        "=== WHAT YOU ARE MISSING ===",
        "=== DEADLINES ===",
        "=== RISKS ===",
        "=== WHAT NEEDS TO BE DONE BEFORE SUBMISSION ===",
        "=== READINESS SCORE ===",
    ]:
        assert section in report, f"missing section: {section}"


def test_offline_report_lists_gaps_and_risks():
    report = ai_module.build_readiness_report_offline(TENDER, {}, CHECKLIST, LIBRARY, COMPANY)
    # Missing mandatory items are called out.
    assert "Tax clearance" in report
    assert "Method statement" in report
    assert "MANDATORY" in report
    # Expired compliance is both a gap and a risk.
    assert "PSIRA certificate" in report
    assert "expired" in report.lower()
    # Recommended items are separated from mandatory ones.
    assert "References" in report


def test_offline_report_scores_and_verifies():
    report = ai_module.build_readiness_report_offline(TENDER, {}, CHECKLIST, LIBRARY, COMPANY)
    # 2/5 complete = 40, minus 10 for the expired doc, minus 5 for the soon-expiry.
    assert "25/100" in report
    assert "BARELY STARTED" in report
    assert "Company: Sparkle Cleaning Co" in report
    assert "City Council" in report


def test_offline_report_when_everything_is_done():
    done = [dict(c, status="Complete") for c in CHECKLIST]
    clean_library = [d for d in LIBRARY if d["status"] == "Active"]
    report = ai_module.build_readiness_report_offline(TENDER, {}, done, clean_library, COMPANY)
    assert "100/100" in report
    assert "READY TO SUBMIT" in report
    assert "Nothing outstanding" in report
    assert "No major risks" in report


def test_closed_tender_scores_zero_and_warns():
    closed = dict(TENDER, days_until_close=-5)
    report = ai_module.build_readiness_report_offline(closed, {}, CHECKLIST, LIBRARY, COMPANY)
    assert "0/100" in report
    assert "already closed" in report.lower()


def test_generate_readiness_report_never_fails_on_quota(monkeypatch):
    """The endpoint must never surface 'generation failed' to the user."""
    def _quota(*a, **k):
        raise RuntimeError("Gemini daily quota reached")

    monkeypatch.setattr(ai_module, "_gemini_chat", _quota)

    report = ai_module.generate_readiness_report(TENDER, {}, CHECKLIST, LIBRARY, COMPANY)

    assert "generation failed" not in report.lower()
    assert "=== READINESS SCORE ===" in report
    assert "Tax clearance" in report
    assert "AI analysis unavailable" in report


def test_generate_readiness_report_uses_ai_when_available(monkeypatch):
    monkeypatch.setattr(ai_module, "_gemini_chat", lambda *a, **k: "AI REPORT")
    assert ai_module.generate_readiness_report(TENDER, {}, CHECKLIST, LIBRARY, COMPANY) == "AI REPORT"


def test_offline_report_handles_empty_data():
    report = ai_module.build_readiness_report_offline({}, {}, [], [], {})
    assert "=== READINESS SCORE ===" in report
    assert "No closing date" in report
    assert "0/100" in report