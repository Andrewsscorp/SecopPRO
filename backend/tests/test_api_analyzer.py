import pytest
from database.models import AnalisisRealizado



def test_api_analyzer_next_audit_name(client):
    response = client.get("/api/next-audit-name")
    assert response.status_code == 200
    data = response.json()
    assert "next_name" in data
    assert data["next_name"].startswith("SECOP Auditor")
