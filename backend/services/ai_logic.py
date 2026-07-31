import os
import json
import pathlib
from typing import List

JSON_DIR = pathlib.Path("C:/SecopPRO/Json")

def get_ai_synonyms(term: str) -> List[str]:
    """
    Busca si existe el archivo de caché JSON para el término.
    Si existe, lo carga (0s de CPU).
    Si no, simula despertar a la IA local para generar sinónimos morfológicos y lo guarda.
    """
    safe_term = term.lower().strip().replace(" ", "_")
    file_path = JSON_DIR / f"ia_term_{safe_term}.json"
    
    if file_path.exists():
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get("synonyms", [])
            
    # --- WAKE UP LOCAL AI (Simulación) ---
    print(f"[AI Local] Generando contexto morfológico para: {term}")
    
    # Lógica de fallback para términos clave en auditoría (Póliza, Anticipo, etc.)
    synonyms = []
    if "poliza" in safe_term or "póliza" in term.lower():
        synonyms = ["poliza de cumplimiento", "garantia", "fianza", "aseguradora", "siniestro", "asegurado"]
    elif "anticipo" in safe_term:
        synonyms = ["pago anticipado", "desembolso inicial", "giro", "plan de pagos"]
    else:
        synonyms = [term, f"{term} autorizado", f"documento de {term}"]
        
    data = {
        "term": term,
        "synonyms": synonyms,
        "morphology": "sustantivo_audit",
        "generated_by": "Local_AI_Engine_v1"
    }
    
    # Guardar en memoria caché para futuras auditorías
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        
    return synonyms
