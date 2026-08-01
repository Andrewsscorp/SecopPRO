import pytest
from database.models import AnalisisRealizado, ContratoAnalisis, CacheSecop

def test_dashboard_stats_empty(client, db_session):
    response = client.get("/api/dashboard/stats?jobId=NON-EXISTENT")
    # API return empty stats object
    assert response.status_code == 200
    data = response.json()
    assert data["procesosAnalizados"] == 0
    
def test_dashboard_stats_success(client, db_session):
    # Setup Data
    from database.models import EstadoAnalisis
    analisis = AnalisisRealizado(id="JOB-123", nombre_analisis="Test", sha256_archivo="hash", nombre_documento="doc.xlsx", total_columnas=5, estado=EstadoAnalisis.COMPLETADO)
    vinculo = ContratoAnalisis(id_analisis="JOB-123", llave_busqueda="CON-1")
    cache = CacheSecop(
        llave_busqueda="CON-1",
        nombre_entidad="Entidad X",
        valor_contrato="1000000",
        datos_adicionales={"extra": "field"}
    )
    db_session.add(analisis)
    db_session.add(vinculo)
    db_session.add(cache)
    db_session.commit()

    response = client.get("/api/dashboard/stats?jobId=JOB-123")
    assert response.status_code == 200
    data = response.json()
    assert "procesosAnalizados" in data
    assert data["procesosAnalizados"] == 1

def test_dashboard_search_success(client, db_session):
    # Tests the row unpacking logic for the tabular schema + json
    from database.models import EstadoAnalisis
    analisis = AnalisisRealizado(id="JOB-456", nombre_analisis="Test 2", sha256_archivo="hash", nombre_documento="doc.xlsx", total_columnas=5, estado=EstadoAnalisis.COMPLETADO)
    vinculo = ContratoAnalisis(id_analisis="JOB-456", llave_busqueda="CON-2")
    cache = CacheSecop(
        llave_busqueda="CON-2",
        nombre_entidad="MIN",
        urlproceso="http://secop.gov.co/1",
        datos_adicionales={"dinamico": "123"}
    )
    db_session.add_all([analisis, vinculo, cache])
    db_session.commit()

    response = client.get("/api/dashboard/search?jobId=JOB-456")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    # Check physical column unpacking
    assert data[0]["nombre_entidad"] == "MIN"
    # Check JSON additional unpacking
    assert data[0]["dinamico"] == "123"
    # Check relationship id injection
    assert "internal_id" in data[0]
