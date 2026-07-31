import os
import time
import glob
import fitz
import concurrent.futures
from services.ocr_engine import process_page_ocr

def test_largest_pdf():
    # Buscar todos los PDFs
    pdf_files = glob.glob('C:/Users/Hawk/Documents/SecopPRO_Consul/**/*.pdf', recursive=True)
    if not pdf_files:
        print("No se encontraron PDFs.")
        return
        
    # Encontrar el más grande (mayor tamaño en disco suele implicar más páginas escaneadas)
    largest_pdf = max(pdf_files, key=os.path.getsize)
    print(f"Probando OCR Inteligente en el PDF más grande: {largest_pdf}")
    print(f"Tamaño: {os.path.getsize(largest_pdf) / (1024*1024):.2f} MB")
    
    start_time = time.time()
    document_text = []
    pages_to_ocr = []
    
    # 1. Leer con PyMuPDF
    doc = fitz.open(largest_pdf)
    total_pages = len(doc)
    print(f"Total de páginas: {total_pages}")
    
    mat = fitz.Matrix(150 / 72.0, 150 / 72.0)
    
    for i, page in enumerate(doc):
        # A) Detección de texto nativo
        page_text = page.get_text("text").strip()
        if len(page_text) > 50:
            document_text.append(page_text)
            print(f"Página {i+1}: Texto digital detectado ({len(page_text)} caracteres). OCR omitido.")
        else:
            # B) Escaneado
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img_path = f"temp_page_{i}.png"
            pix.save(img_path)
            pages_to_ocr.append(img_path)
            print(f"Página {i+1}: Escaneado detectado. Enviando a cola de OCR.")
            
    doc.close()
    
    # 2. OCR en Paralelo
    if pages_to_ocr:
        print(f"\nProcesando {len(pages_to_ocr)} imágenes en paralelo (Max 2 hilos)...")
        ocr_start = time.time()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            results = executor.map(process_page_ocr, pages_to_ocr)
            document_text.extend(results)
        print(f"OCR de imágenes completado en {time.time() - ocr_start:.2f} segundos.")
        
    total_time = time.time() - start_time
    print(f"\n--- RESUMEN ---")
    print(f"Tiempo total procesando PDF de {total_pages} páginas: {total_time:.2f} segundos.")
    
    full_text = " ".join(document_text)
    print(f"Total caracteres extraídos: {len(full_text)}")
    print("Fragmento final:")
    print(full_text[:300] + "...")

if __name__ == "__main__":
    test_largest_pdf()
