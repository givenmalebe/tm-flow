"""eTenders official scraper: public links, parsing, ranking, and login-wall
URL sanitization (network fully mocked)."""
import scraper
import ai_agent


ROW_WITH_DOC = {
    "tender_No": "ZNQ(L)0026/26",
    "description": "Rendering of private security services to Public Works",
    "category": "Services: General",
    "organ_of_State": "Public Works",
    "province": "KwaZulu-Natal",
    "closing_Date": "2026-10-12T11:00:00",
    "compulsory_briefing_session": "2026-10-08T10:00:00",
    "briefingVenue": "Ulundi",
    "contactPerson": "Sipho",
    "email": "a@b.gov.za",
    "telephone": "021-000",
    "eSubmission": True,
    "supportDocument": [
        {"supportDocumentID": "abc-123", "extension": ".pdf", "fileName": "Bid Document.pdf"}
    ],
}

ROW_NO_DOC = {
    "tender_No": "X1",
    "description": "Deep cleaning of municipal offices",
    "category": "Cleaning",
    "organ_of_State": "Some Municipality",
    "province": "Gauteng",
    "closing_Date": "2026-11-01T12:00:00",
    "supportDocument": [],
}


def test_public_url_or_none_blocks_login_walls():
    assert scraper.public_url_or_none(None) is None
    assert scraper.public_url_or_none("") is None
    assert scraper.public_url_or_none(
        "https://www.security.co.za/Tender/ViewTender?tenderId=81616"
    ) is None
    assert scraper.public_url_or_none(
        "https://www.etenders.gov.za/home/Download/?blobName=x.pdf"
    ) == "https://www.etenders.gov.za/home/Download/?blobName=x.pdf"
    assert scraper.public_url_or_none("https://sefa.org.za/loans") == "https://sefa.org.za/loans"


def test_document_url_is_public_and_encoded():
    url = scraper._etenders_document_url(
        {"supportDocumentID": "abc-123", "extension": ".pdf", "fileName": "Bid Document.pdf"}
    )
    assert url == (
        "https://www.etenders.gov.za/home/Download/"
        "?blobName=abc-123.pdf&downloadedFileName=Bid%20Document.pdf"
    )
    # extension already present in the name is not duplicated
    url2 = scraper._etenders_document_url(
        {"supportDocumentID": "g", "extension": ".pdf", "fileName": "doc.pdf"}
    )
    assert url2.endswith("blobName=g.pdf&downloadedFileName=doc.pdf")


def test_scraper_maps_row_with_document(monkeypatch):
    monkeypatch.setattr(scraper, "_etenders_active_opportunities", lambda: [ROW_WITH_DOC])
    results = scraper.scrape_etenders_opportunities("security", "guards", "South Africa", 10)
    assert len(results) == 1
    r = results[0]
    assert r["reference_number"] == "ZNQ(L)0026/26"
    assert r["client"] == "Public Works"
    assert r["source_site"] == "etenders.gov.za"
    assert r["closing_date"] == "2026-10-12"
    assert r["url"].startswith("https://www.etenders.gov.za/home/Download/")
    assert "blobName=abc-123.pdf" in r["url"]
    assert r["relevance"] == "high"
    # rich metadata is folded into the description
    assert "Department: Public Works" in r["description"]
    assert "Compulsory briefing: 2026-10-08" in r["description"]
    assert "eSubmission" in r["description"]


def test_scraper_without_document_has_no_link(monkeypatch):
    monkeypatch.setattr(scraper, "_etenders_active_opportunities", lambda: [ROW_NO_DOC])
    results = scraper.scrape_etenders_opportunities("security", "guards", "South Africa", 10)
    assert results[0]["url"] is None
    assert results[0]["relevance"] == "low"


def test_scraper_ranks_relevant_then_soonest(monkeypatch):
    monkeypatch.setattr(
        scraper, "_etenders_active_opportunities", lambda: [ROW_NO_DOC, ROW_WITH_DOC]
    )
    results = scraper.scrape_etenders_opportunities("security", "guards", "South Africa", 10)
    # relevant (security) beats irrelevant (cleaning), regardless of source order
    assert results[0]["reference_number"] == "ZNQ(L)0026/26"


def test_scraper_respects_limit(monkeypatch):
    rows = [dict(ROW_NO_DOC, tender_No=f"X{i}") for i in range(50)]
    monkeypatch.setattr(scraper, "_etenders_active_opportunities", lambda: rows)
    results = scraper.scrape_etenders_opportunities("cleaning", "", "South Africa", 5)
    assert len(results) == 5


def test_normalize_result_drops_login_wall_url():
    item = ai_agent._normalize_result(
        {
            "title": "Guarding services",
            "url": "https://www.security.co.za/Tender/ViewTender?tenderId=1",
            "source_site": "security.co.za",
        },
        "tender",
    )
    assert item["url"] is None


def test_scrape_all_sanitizes_and_keeps_etenders(monkeypatch):
    monkeypatch.setattr(
        scraper,
        "scrape_etenders_opportunities",
        lambda *a, **k: [
            {"title": "Guarding", "url": "https://www.security.co.za/Tender/ViewTender?tenderId=9",
             "source_site": "security.co.za", "relevance": "high"},
        ],
    )
    monkeypatch.setattr(scraper, "scrape_security_co_za", lambda *a, **k: [])
    monkeypatch.setattr(scraper, "scrape_tenderflow_co_za", lambda *a, **k: [])

    out = scraper.scrape_all("security", "", "South Africa", 10)
    assert len(out["results"]) == 1
    assert out["results"][0]["url"] is None
    assert any("etenders.gov.za" in s for s in out["sources"])


def test_startup_cleanup_nulls_stored_login_wall_urls(db):
    import database as dbmod

    old = dbmod.AIOpportunity(
        company_id=None,
        type="tender",
        title="Old guarding tender",
        status="new",
        url="https://www.security.co.za/Tender/ViewTender?tenderId=81616",
    )
    good = dbmod.AIOpportunity(
        company_id=None,
        type="tender",
        title="Official tender",
        status="new",
        url="https://www.etenders.gov.za/home/Download/?blobName=x.pdf",
    )
    db.add_all([old, good])
    db.commit()

    dbmod._sanitize_login_wall_urls(db)

    db.refresh(old)
    db.refresh(good)
    assert old.url is None
    assert good.url == "https://www.etenders.gov.za/home/Download/?blobName=x.pdf"

