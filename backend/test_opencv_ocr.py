import os
import time
import cv2
import tempfile
import gc
from services.ocr_engine import _render_pdf_to_images, ocr_model

# 1. Archivo de prueba
pdf_path = r"C:/Users/Hawk/Documents/SecopPRO_Consul\wqwq\DocumentosDescargados\raw_CO1.PCCNTR.9438934\1. CERTIFICADO CDP 6832_2025.pdf"

if not os.path.exists(pdf_path):
    print("PDF de prueba no encontrado.")
    exit(1)

print(f"Probando OCR + OpenCV en: {pdf_path}")

with tempfile.TemporaryDirectory() as images_dir:
    # A. Extraer a imágenes
    start_time = time.time()
    img_paths = _render_pdf_to_images(pdf_path, images_dir, dpi=150)
    print(f"PDF convertido a {len(img_paths)} imágenes en {time.time() - start_time:.2f} segundos.")
    
    for i, img_path in enumerate(img_paths):
        print(f"\n--- Procesando Página {i+1} ---")
        
        try:
            # B. OpenCV Pre-procesamiento
            t0 = time.time()
            img = cv2.imread(img_path)
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            enhanced = clahe.apply(gray)
            cleaned = cv2.medianBlur(enhanced, 3)
            final_img = cv2.cvtColor(cleaned, cv2.COLOR_GRAY2BGR)
            cv_time = time.time() - t0
            
            # C. PaddleOCR Inferencia
            t1 = time.time()
            result, elapse = ocr_model(final_img)
            ocr_time = time.time() - t1
            
            print(f"[OK] OpenCV Limpieza: {cv_time:.3f}s | PaddleOCR Lectura: {ocr_time:.3f}s")
            print("[INFO] Texto Extraído (Fragmento):")
            
            document_text = []
            if result:
                for line in result:
                    text = line[1]
                    document_text.append(text)
            
            # Imprimir solo los primeros 500 caracteres para no llenar la pantalla
            full_text = " ".join(document_text)
            print(full_text[:500] + ("..." if len(full_text) > 500 else ""))
            print("-" * 50)
            
        except Exception as e:
            print(f"Error procesando página {i+1}: {e}")
            
    gc.collect()
