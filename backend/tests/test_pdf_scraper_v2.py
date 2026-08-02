import pytest
import asyncio
from unittest.mock import patch, MagicMock
from services.pdf_scraper_v2 import download_pdfs_for_contract_v2

@pytest.mark.asyncio
async def test_download_pdfs_for_contract_v2_with_download():
    """Prueba que el scraper V2 funcione correctamente en modo de descarga."""
    mock_log_queue = asyncio.Queue()
    job_id = "test_job"
    llave = "test_llave"
    urlproceso = "http://test.url"

    with patch("services.pdf_scraper_v2.run_playwright_isolated_v2") as mock_run:
        with patch("services.pdf_scraper_v2.os.listdir", return_value=["test.pdf"]):
            with patch("pathlib.Path.exists", return_value=True):
                with patch("pathlib.Path.is_file", return_value=True):
                    with patch("builtins.open", new_callable=MagicMock):
                        with patch("hashlib.sha256") as mock_sha256:
                            mock_sha_instance = MagicMock()
                            mock_sha_instance.hexdigest.return_value = "fakehash123"
                            mock_sha256.return_value = mock_sha_instance
                            
                            with patch("shutil.rmtree"):
                                with patch("shutil.copy2"):
                                    res = await download_pdfs_for_contract_v2(
                                        job_id, llave, urlproceso, mock_log_queue, 
                                        descargar_archivos=True
                                    )
                                    
    assert res.get("cantidad_pdfs") == 1
    assert "test.pdf" in res.get("lista_pdfs", [])
    assert res.get("sha256_pdfs", {}).get("test.pdf") == "fakehash123"
    assert "C:\\SecopPRO\\CachePDFs" in res.get("ruta_global_zip", "")

@pytest.mark.asyncio
async def test_download_pdfs_for_contract_v2_no_download():
    """Prueba que el scraper V2 asigne correctamente el mensaje de NO HASH si no hay descarga."""
    mock_log_queue = asyncio.Queue()
    job_id = "test_job_no_dl"
    llave = "test_llave_no_dl"
    urlproceso = "http://test.url"

    with patch("services.pdf_scraper_v2.run_playwright_isolated_v2") as mock_run:
        with patch("services.pdf_scraper_v2.os.listdir", return_value=["test2.pdf"]):
            with patch("pathlib.Path.exists", side_effect=lambda: True): # patch exists dynamically
                with patch("pathlib.Path.is_file", return_value=True):
                    with patch("shutil.rmtree"):
                        res = await download_pdfs_for_contract_v2(
                            job_id, llave, urlproceso, mock_log_queue, 
                            descargar_archivos=False
                        )
                                    
    assert res.get("cantidad_pdfs") == 1
    assert "test2.pdf" in res.get("lista_pdfs", [])
    # Validar que asignó la frase de Hash no disponible
    assert "Hash no disponible" in res.get("sha256_pdfs", {}).get("test2.pdf", "")
    assert res.get("ruta_global_zip") == "No descargado en bóveda"
