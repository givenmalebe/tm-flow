def test_harness_uses_an_isolated_database(client):
    from tests.conftest import ACTIVE_DB_PATH

    assert "tmp" in ACTIVE_DB_PATH.lower() or "test" in ACTIVE_DB_PATH.lower()
