import pytest
from database.models import CacheSecop, PDFsConsulta, AnalisisRealizado

def test_cache_secop_creation(db_session):
    cache = CacheSecop(
        llave_busqueda="AMS-MIN-C-18-2026",
        nombre_entidad="MINISTERIO DE PRUEBA",
        id_contrato="12345",
        urlproceso="https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.112233",
        datos_adicionales={"extra_field": "some_value"}
    )
    db_session.add(cache)
    db_session.commit()

    # Retrieve
    retrieved = db_session.query(CacheSecop).filter_by(llave_busqueda="AMS-MIN-C-18-2026").first()
    assert retrieved is not None
    assert retrieved.nombre_entidad == "MINISTERIO DE PRUEBA"
    assert retrieved.urlproceso.startswith("http")
    assert retrieved.datos_adicionales["extra_field"] == "some_value"
    
def test_pdfs_consulta_creation(db_session):
    pdf_log = PDFsConsulta(
        llave_busqueda="TEST-PDF-1",
        cantidad_pdfs=2,
        lista_pdfs=["file1.pdf", "file2.pdf"],
        sha256_pdfs={"file1.pdf": "hash1", "file2.pdf": "hash2"},
        ruta_global_zip="/some/path/TEST-PDF-1.zip"
    )
    db_session.add(pdf_log)
    db_session.commit()
    
    retrieved = db_session.query(PDFsConsulta).filter_by(llave_busqueda="TEST-PDF-1").first()
    assert retrieved.cantidad_pdfs == 2
    assert retrieved.ruta_global_zip == "/some/path/TEST-PDF-1.zip"

def test_analisis_realizado_creation(db_session):
    from database.models import EstadoAnalisis
    analisis = AnalisisRealizado(
        id="JOB-12345",
        nombre_analisis="Auditoria Test",
        sha256_archivo="hash",
        nombre_documento="doc.xlsx",
        total_columnas=5,
        estado=EstadoAnalisis.COMPLETADO
    )
    db_session.add(analisis)
    db_session.commit()
    
    retrieved = db_session.query(AnalisisRealizado).filter_by(id="JOB-12345").first()
    assert retrieved.nombre_analisis == "Auditoria Test"
