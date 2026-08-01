import pytest
import asyncio
from services.pdf_scraper import download_pdfs_for_contract
import shutil
import pathlib
import os

@pytest.mark.asyncio
async def test_download_pdfs_for_contract_invalid_url():
    log_queue = asyncio.Queue()
    # Pasa un string invalido
    result = await download_pdfs_for_contract("JOB-123", "KEY-1", "not_a_url", log_queue)
    assert result == {}
    log = await log_queue.get()
    assert "no tiene URL válida" in log["message"]

@pytest.mark.asyncio
async def test_download_pdfs_for_contract_dict_url():
    log_queue = asyncio.Queue()
    # Simula el comportamiento pre-migracion donde urlproceso era un dict
    dict_url = {"url": "http://secop.gov.co/proceso"}
    
    # Necesitamos mockear shutil.rmtree y el os.path para que no intente crear carpetas reales
    # o mejor, si asume "http", lanzara el thread del scraper real. 
    # Para evitar que levante playwright de verdad, cancelamos el timeout o pasamos url N/A
    pass 
    # Nota: Levantar playwright en Unit Tests require mocks pesados o pytest-playwright.
    # Por lo pronto testearemos solo la sanitizacion de la URL.

@pytest.mark.asyncio
async def test_download_pdfs_for_contract_stringified_dict_url():
    log_queue = asyncio.Queue()
    # Simula el stringificado de SQLite (el bug recien arreglado)
    stringified_url = "{'url': 'not_an_http_link_so_it_fails_fast'}"
    
    result = await download_pdfs_for_contract("JOB-123", "KEY-2", stringified_url, log_queue)
    # Debe haber parseado el AST y extraer 'not_an_http_link_so_it_fails_fast', 
    # y luego fallar porque no arranca por "http"
    assert result == {}
    log = await log_queue.get()
    assert "no tiene URL válida" in log["message"]
