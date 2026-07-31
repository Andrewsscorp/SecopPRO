import os
import json
import nltk
from nltk.corpus import wordnet as wn
import string
import unicodedata

# Asegurar que se descargan los recursos de NLTK silenciosamente
def ensure_nltk_resources():
    import ssl
    try:
        _create_unverified_https_context = ssl._create_unverified_context
    except AttributeError:
        pass
    else:
        ssl._create_default_https_context = _create_unverified_https_context

    try:
        nltk.data.find('corpora/wordnet')
    except LookupError:
        nltk.download('wordnet', quiet=True)
    try:
        nltk.data.find('corpora/omw-1.4')
    except LookupError:
        nltk.download('omw-1.4', quiet=True)

ensure_nltk_resources()

def remove_accents(input_str):
    nfkd_form = unicodedata.normalize('NFKD', input_str)
    return u"".join([c for c in nfkd_form if not unicodedata.combining(c)])

def expand_term_with_local_ai(term: str) -> list:
    """
    Motor NLP ultraligero que corre en local.
    Toma una palabra y genera sinónimos morfológicos y contextuales.
    Si el JSON ya existe, lo carga instantáneamente.
    """
    json_dir = os.environ.get("SECOP_PRO_JSON_DIR", "C:/SecopPRO/Json")
    safe_term = "".join(c for c in term if c.isalnum()).lower()
    json_path = os.path.join(json_dir, f"ia_term_{safe_term}.json")
    
    # 1. Caché JSON (0 segundos, 0 CPU)
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get("synonyms", [term])
        except Exception:
            pass # Si falla, recalcular
            
    # 2. Generación Inteligente (NLP Local)
    base_term = term.lower().strip()
    synonyms = set([base_term, remove_accents(base_term)])
    
    # Algunas reglas duras de negocio para SECOP (Fallback rápido)
    domain_knowledge = {
        "poliza": ["póliza", "polizas", "pólizas", "garantia", "garantía", "seguro", "amparo", "aseguradora", "cumplimiento"],
        "acta": ["actas", "recibo", "liquidación", "liquidacion", "entrega", "satisfacción", "satisfaccion"],
        "resolucion": ["resolución", "decreto", "adjudicacion", "adjudicación", "acto administrativo"],
        "multa": ["sanción", "sancion", "penalidad", "incumplimiento"],
        "estudio": ["estudios previos", "previos", "pre-pliego", "prepliego", "anexo técnico"],
        "pliego": ["pliegos", "condiciones", "definitivo"],
    }
    
    # Inyectar conocimiento de dominio si aplica
    for k, v in domain_knowledge.items():
        if k in remove_accents(base_term):
            synonyms.update(v)

    # Inyectar WordNet (Español) si hay internet y la librería se descargó
    try:
        for syn in wn.synsets(base_term, lang='spa'):
            for lemma in syn.lemmas('spa'):
                w = lemma.name().lower().replace('_', ' ')
                synonyms.add(w)
                synonyms.add(remove_accents(w))
    except Exception as e:
        # Falla silenciosa (modo offline absoluto)
        print(f"[IA LOCAL] Fallo al consultar WordNet: {e}")
        pass
        
    final_list = list(synonyms)
    
    # 3. Guardar Caché
    try:
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump({
                "base_term": term,
                "synonyms": final_list,
                "engine": "NLTK_WordNet_Fuzzy",
                "generated_by": "SecopPRO Local AI"
            }, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[IA LOCAL WARNING] No se pudo guardar caché: {e}")
        
    return final_list
