import os
import zipfile
import tempfile
import pathlib
import gc
from typing import List

import fitz  # PyMuPDF
from rapidocr_onnxruntime import RapidOCR
from thefuzz import fuzz

from services.local_ai import expand_term_with_local_ai

# Inicializar RapidOCR (PaddleOCR portado a ONNX Runtime)
try:
    ocr_model = RapidOCR()
except Exception as e:
    ocr_model = None
    print(f"[OCR ENGINE ERROR] No se pudo inicializar RapidOCR: {e}")

def _render_pdf_to_images(pdf_path: str, output_dir: str, dpi: int = 150) -> List[str]:
    """
    Convierte páginas de PDF a imágenes PNG ligeras.
    Usa DPI=150 para optimizar consumo de RAM.
    """
    image_paths = []
    doc = fitz.open(pdf_path)
    # zoom factor. 150 DPI es aprox zoom de 2.0 respecto a 72 DPI estándar
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=mat, alpha=False)
        img_path = os.path.join(output_dir, f"page_{i}.png")
        pix.save(img_path)
        image_paths.append(img_path)
        
    doc.close()
    return image_paths

def analyze_zip_with_ocr(zip_path: str, search_term: str) -> dict:
    """
    Recibe un ZIP de contratos, lo extrae en memoria temporal,
    procesa los PDFs con PaddleOCR, y los cruza con IA Local.
    Retorna un diccionario de hallazgos.
    """
    if not ocr_model:
        return {"error": "PaddleOCR no inicializado."}
        
    if not os.path.exists(zip_path):
        return {"error": "ZIP no encontrado."}
        
    # 1. Expandir término de búsqueda usando IA Local (Caché JSON)
    synonyms = expand_term_with_local_ai(search_term)
    
    findings = {
        "term": search_term,
        "synonyms_used": synonyms,
        "matches": []
    }
    
    # 2. Entorno Volátil: El TempDirectory se destruye automáticamente al salir del bloque 'with'
    with tempfile.TemporaryDirectory() as temp_dir:
        extract_dir = os.path.join(temp_dir, "extracted")
        images_dir = os.path.join(temp_dir, "images")
        os.makedirs(extract_dir)
        os.makedirs(images_dir)
        
        # Extraer ZIP
        try:
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
        except zipfile.BadZipFile:
            return {"error": "Archivo ZIP corrupto o vacío."}
            
        # 3. Analizar cada PDF extraído
        for root, dirs, files in os.walk(extract_dir):
            for file in files:
                if file.lower().endswith(".pdf"):
                    pdf_path = os.path.join(root, file)
                    
                    try:
                        # Convertir a imagen (150 DPI)
                        img_paths = _render_pdf_to_images(pdf_path, images_dir, dpi=150)
                        
                        document_text = []
                        for img_path in img_paths:
                            # 4. Magia Negra OCR (Silencioso)
                            result, elapse = ocr_model(img_path)
                            if result:
                                for line in result:
                                    text = line[1]
                                    document_text.append(text)
                            
                            # Borrar la imagen de disco inmediatamente para no saturar tempdir
                            os.remove(img_path)
                            
                        # 5. Fuzzy Matching contra la bolsa de sinónimos de la IA
                        full_text = " ".join(document_text)
                        
                        matched = False
                        best_match = None
                        highest_score = 0
                        
                        # Buscar por fragmentos o palabras completas
                        # Nota: Si el texto es inmenso, thefuzz partial_ratio es ideal
                        for syn in synonyms:
                            score = fuzz.partial_ratio(syn.lower(), full_text.lower())
                            if score > highest_score:
                                highest_score = score
                                best_match = syn
                                
                        # Umbral Estricto (85%) propuesto por el usuario
                        if highest_score >= 85:
                            findings["matches"].append({
                                "file": file,
                                "matched_synonym": best_match,
                                "confidence": highest_score
                            })
                    except Exception as e:
                        print(f"[OCR ENGINE] Error procesando PDF {file}: {e}")
                    finally:
                        # 6. Recolección explícita de basura para limpiar tensores y pixmaps
                        gc.collect()

    return findings
