"""
term_expander.py
-----------------
Motor de expansión léxica para búsqueda semántica en SECOP.

Combina, en cascada:
    1. Caché en disco (JSON versionado).
    2. Reglas de dominio (diccionario curado, match por token completo).
    3. WordNet en español vía NLTK (best-effort, offline-safe).

Notas de diseño respecto a la versión original:
- No se toca el contexto SSL por defecto del proceso. La verificación
  insegura, si hace falta, se aplica SOLO a la descarga puntual de NLTK
  mediante un opener local de urllib.
- El directorio de caché es multiplataforma (usa el home del usuario si
  no hay variable de entorno configurada) y se crea si no existe.
- El match de reglas de dominio es por token completo, no por substring,
  para evitar falsos positivos (p. ej. "acta" dentro de "practicante").
- El caché incluye un número de versión de reglas (RULES_VERSION); si
  cambian las reglas, el caché viejo se invalida automáticamente.
- Se usa `logging` en vez de `print`, y hay validación de entrada.
"""

from __future__ import annotations

import json
import logging
import os
import ssl
import string
import unicodedata
import urllib.request
from pathlib import Path
from typing import Iterable

import nltk
from nltk.corpus import wordnet as wn

logger = logging.getLogger(__name__)

# Sube este número cada vez que cambies DOMAIN_KNOWLEDGE o la lógica de
# generación, para invalidar automáticamente el caché en disco.
RULES_VERSION = 1

DOMAIN_KNOWLEDGE: dict[str, list[str]] = {
    "poliza": ["póliza", "polizas", "pólizas", "garantia", "garantía",
               "seguro", "amparo", "aseguradora", "cumplimiento"],
    "acta": ["actas", "recibo", "liquidación", "liquidacion",
             "entrega", "satisfacción", "satisfaccion"],
    "resolucion": ["resolución", "decreto", "adjudicacion",
                   "adjudicación", "acto administrativo"],
    "multa": ["sanción", "sancion", "penalidad", "incumplimiento"],
    "estudio": ["estudios previos", "previos", "pre-pliego",
                "prepliego", "anexo técnico"],
    "pliego": ["pliegos", "condiciones", "definitivo"],
}


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------

def remove_accents(input_str: str) -> str:
    """Quita diacríticos (tildes, diéresis) de una cadena."""
    nfkd_form = unicodedata.normalize('NFKD', input_str)
    return "".join(c for c in nfkd_form if not unicodedata.combining(c))


def _default_cache_dir() -> Path:
    """Directorio de caché multiplataforma, sin asumir Windows."""
    env_dir = os.environ.get("SECOP_PRO_JSON_DIR")
    if env_dir:
        return Path(env_dir)
    return Path.home() / ".secoppro" / "json"


def _sanitize_term(term: str) -> str:
    """Convierte el término en un nombre de archivo seguro."""
    return "".join(c for c in term if c.isalnum()).lower()


# --------------------------------------------------------------------------
# NLTK / recursos
# --------------------------------------------------------------------------

def ensure_nltk_resources() -> None:
    """
    Descarga silenciosamente los corpus de NLTK necesarios si faltan.

    A diferencia de la versión original, NO se modifica
    `ssl._create_default_https_context` a nivel de proceso. Si el
    entorno tiene problemas de verificación de certificados (típico en
    algunas redes corporativas), se usa un opener de urllib con un
    contexto sin verificar aplicado ÚNICAMENTE a estas descargas
    puntuales de NLTK, dejando intacto el comportamiento SSL del resto
    de la aplicación (requests, otras llamadas HTTPS, etc.).
    """
    resources = {
        "corpora/wordnet": "wordnet",
        "corpora/omw-1.4": "omw-1.4",
    }
    missing = []
    for path, name in resources.items():
        try:
            nltk.data.find(path)
        except LookupError:
            missing.append(name)

    if not missing:
        return

    def _download_all(context: ssl.SSLContext | None = None) -> bool:
        opener = None
        if context is not None:
            opener = urllib.request.build_opener(
                urllib.request.HTTPSHandler(context=context)
            )
            urllib.request.install_opener(opener)
        try:
            return all(nltk.download(name, quiet=True) for name in missing)
        finally:
            if opener is not None:
                # Restaurar el opener por defecto para no afectar al resto
                # del proceso.
                urllib.request.install_opener(urllib.request.build_opener())

    try:
        ok = _download_all(context=None)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Descarga NLTK con SSL verificado falló (%s); "
                        "reintentando sin verificación (solo para NLTK).", exc)
        try:
            unverified = ssl.create_default_context()
            unverified.check_hostname = False
            unverified.verify_mode = ssl.CERT_NONE
            ok = _download_all(context=unverified)
        except Exception as exc2:  # noqa: BLE001
            logger.error("No fue posible descargar recursos NLTK (%s). "
                         "El motor seguirá en modo offline (sin WordNet).", exc2)
            ok = False

    if not ok:
        logger.warning("Algunos recursos NLTK no se descargaron; "
                        "WordNet podría no estar disponible.")


# --------------------------------------------------------------------------
# Reglas de dominio
# --------------------------------------------------------------------------

def _domain_synonyms(base_term: str) -> set[str]:
    """
    Devuelve sinónimos de dominio para `base_term`, matcheando por
    token completo (no substring) contra las llaves de DOMAIN_KNOWLEDGE.
    """
    tokens = set(remove_accents(base_term).split())
    tokens.add(remove_accents(base_term))  # cubre términos de una palabra

    result: set[str] = set()
    for key, values in DOMAIN_KNOWLEDGE.items():
        if key in tokens:
            result.update(values)
    return result


def _wordnet_synonyms(base_term: str) -> set[str]:
    """Sinónimos vía WordNet en español. Falla en silencio (best-effort)."""
    result: set[str] = set()
    try:
        for syn in wn.synsets(base_term, lang='spa'):
            for lemma in syn.lemmas('spa'):
                w = lemma.name().lower().replace('_', ' ')
                result.add(w)
                result.add(remove_accents(w))
    except Exception as exc:  # noqa: BLE001
        logger.debug("WordNet no disponible para '%s': %s", base_term, exc)
    return result


# --------------------------------------------------------------------------
# API pública
# --------------------------------------------------------------------------

def expand_term_with_local_ai(term: str, json_dir: str | Path | None = None) -> list[str]:
    """
    Genera sinónimos morfológicos y contextuales para `term`, combinando
    caché en disco, reglas de dominio SECOP y WordNet.

    Parameters
    ----------
    term:
        Término a expandir. Debe ser una cadena no vacía.
    json_dir:
        Directorio de caché opcional (por defecto usa
        SECOP_PRO_JSON_DIR o ~/.secoppro/json).

    Returns
    -------
    list[str]
        Lista de sinónimos (incluye el término original normalizado).
        Devuelve `[]` si `term` no es una cadena válida.
    """
    if not isinstance(term, str) or not term.strip():
        logger.warning("expand_term_with_local_ai recibió un término inválido: %r", term)
        return []

    cache_dir = Path(json_dir) if json_dir else _default_cache_dir()
    safe_term = _sanitize_term(term)
    if not safe_term:
        logger.warning("El término '%s' no produjo un nombre de caché válido.", term)
        safe_term = "unnamed"
    cache_path = cache_dir / f"ia_term_{safe_term}.json"

    # 1. Caché en disco (válido solo si coincide la versión de reglas)
    if cache_path.exists():
        try:
            with cache_path.open('r', encoding='utf-8') as f:
                data = json.load(f)
            if data.get("rules_version") == RULES_VERSION:
                return data.get("synonyms", [term])
            logger.info("Caché de '%s' obsoleto (v%s != v%s); recalculando.",
                        term, data.get("rules_version"), RULES_VERSION)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Caché corrupto para '%s' (%s); recalculando.", term, exc)

    # 2. Generación
    base_term = term.lower().strip()
    synonyms: set[str] = {base_term, remove_accents(base_term)}
    synonyms.update(_domain_synonyms(base_term))
    synonyms.update(_wordnet_synonyms(base_term))

    final_list = sorted(synonyms)

    # 3. Guardar caché
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        with cache_path.open('w', encoding='utf-8') as f:
            json.dump({
                "base_term": term,
                "synonyms": final_list,
                "engine": "NLTK_WordNet_Fuzzy",
                "generated_by": "SecopPRO Local Expander",
                "rules_version": RULES_VERSION,
            }, f, ensure_ascii=False, indent=2)
    except OSError as exc:
        logger.warning("No se pudo guardar caché para '%s' en %s: %s",
                        term, cache_path, exc)

    return final_list


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ensure_nltk_resources()
    for palabra in ("poliza", "acta", "practicante"):
        print(palabra, "->", expand_term_with_local_ai(palabra))
