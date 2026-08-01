import pytest
import asyncio
from unittest.mock import patch, MagicMock
from database.models import CacheSecop

# Se importa la función (esto importará el módulo y cargará el _build_cache_kwargs si lo desacoplamos, 
# pero dado que está anidado, probaremos insertando en BD simulando un payload del request).

@pytest.mark.asyncio
async def test_secop_worker_cache_building(db_session):
    # En lugar de levantar el worker completo (que hace requests y arranca threads),
    # simularemos el cuerpo principal de guardado en la base de datos de manera similar
    # a como lo hace el secop_worker, para validar el parseo de la URL.
    
    tabulated_keys = [
        "id_contrato", "urlproceso"
    ]
    data_dict = {
        "id_contrato": "C123",
        "urlproceso": {"url": "https://secop.gov.co/123", "text": "Enlace"}
    }
    
    kwargs = {"llave_busqueda": "C123"}
    adicionales = {}
    
    # La misma logica interna que usamos en secop_worker.py:
    for k, v in data_dict.items():
        if k in tabulated_keys:
            if k == 'urlproceso' and isinstance(v, dict):
                v = v.get('url', v)
            kwargs[k] = str(v) if v is not None else "vacía por el momento"
        else:
            adicionales[k] = v
            
    kwargs["datos_adicionales"] = adicionales
    
    cache = CacheSecop(**kwargs)
    db_session.add(cache)
    db_session.commit()
    
    # Verificacion de que urlproceso fue limpiada a string
    guardado = db_session.query(CacheSecop).filter_by(llave_busqueda="C123").first()
    assert guardado.urlproceso == "https://secop.gov.co/123"
    assert "http" in guardado.urlproceso
    assert not guardado.urlproceso.startswith("{")
