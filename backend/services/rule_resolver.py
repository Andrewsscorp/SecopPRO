import os
import json
import fitz  # PyMuPDF
from typing import Optional, Dict
from database.database import SessionLocal
from database.models import PDFsConsulta, ContratoAnalisis, ConfiguracionAPI
import google.generativeai as genai

# Mapa inteligente: Regla -> Palabras clave en el nombre del PDF
RULE_MAPPING = {
    "regla_firma_pub": {
        "keywords": ["contrato", "minuta", "suscripcion", "firma"],
        "prompt": "Busca la 'Fecha de Firma' o fecha de 'Suscripción' del contrato."
    },
    "regla_firma_inicio": {
        "keywords": ["acta", "inicio"],
        "prompt": "Busca la 'Fecha de Inicio' del contrato en esta acta."
    },
    "regla_inicio_fin": {
        "keywords": ["liquidacion", "terminacion", "cierre", "acta"],
        "prompt": "Busca la 'Fecha de Terminación' o 'Fecha de Liquidación' del contrato."
    }
}

class SmartRuleResolver:
    def __init__(self):
        self.db = SessionLocal()
        
    def _get_api_key(self) -> Optional[str]:
        conf = self.db.query(ConfiguracionAPI).filter(ConfiguracionAPI.proveedor == "gemini", ConfiguracionAPI.is_active == 1).first()
        if conf and conf.api_key_encriptada:
            from utils.crypto_utils import decrypt_key
            try:
                return decrypt_key(conf.api_key_encriptada)
            except:
                return conf.api_key_encriptada
        return None

    def _extract_text_from_pdf(self, pdf_path: str) -> str:
        try:
            doc = fitz.open(pdf_path)
            text = ""
            for page in doc[:5]:
                text += page.get_text()
            if len(doc) > 5:
                text += "\n...[salto]...\n"
                text += doc[-1].get_text()
            return text
        except Exception as e:
            print(f"Error leyendo PDF {pdf_path}: {e}")
            return ""

    def resolve_rule(self, job_id: str, llave_busqueda: str, regla: str) -> Dict:
        if regla not in RULE_MAPPING:
            return {"status": "error", "message": f"Regla {regla} no mapeada para RAG."}
            
        mapping = RULE_MAPPING[regla]
        
        pdfs_record = self.db.query(PDFsConsulta).filter(PDFsConsulta.llave_busqueda == llave_busqueda).first()
        
        if not pdfs_record or not pdfs_record.lista_pdfs or len(pdfs_record.lista_pdfs) == 0:
            return {"status": "need_scraper", "message": "No hay PDFs en caché. Se requiere ejecutar el scraper."}
            
        best_pdf = None
        for keyword in mapping["keywords"]:
            for pdf_name in pdfs_record.lista_pdfs:
                if keyword.lower() in pdf_name.lower():
                    best_pdf = pdf_name
                    break
            if best_pdf:
                break
                
        if not best_pdf:
            best_pdf = pdfs_record.lista_pdfs[0]
            
        pdf_path = f"C:/SecopPRO/CachePDFs/ext_{llave_busqueda}/{best_pdf}"
        if not os.path.exists(pdf_path):
            return {"status": "error", "message": f"PDF no encontrado en disco: {pdf_path}"}
            
        pdf_text = self._extract_text_from_pdf(pdf_path)
        if not pdf_text.strip():
             return {"status": "error", "message": "El PDF está vacío o es una imagen sin OCR previo."}
             
        api_key = self._get_api_key()
        if not api_key:
             return {"status": "error", "message": "No hay API Key de Gemini configurada."}
             
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        prompt = f"""Actúa como extractor de datos precisos.
Se te proporciona el texto extraído del documento '{best_pdf}'.
OBJETIVO: {mapping['prompt']}
Si encuentras la fecha, devuélvela en formato DD/MM/YYYY o el que encuentres. 
Si no la encuentras, responde EXACTAMENTE: 'NO ENCONTRADO'.
TEXTO:
{pdf_text}"""
        
        try:
            response = model.generate_content(prompt)
            resultado = response.text.strip()
            
            contrato_db = self.db.query(ContratoAnalisis).filter(
                ContratoAnalisis.id_analisis == job_id, 
                ContratoAnalisis.llave_busqueda == llave_busqueda
            ).first()
            
            if contrato_db:
                current_rag = contrato_db.rag_resolutions or {}
                current_rag[regla] = {"pdf_usado": best_pdf, "hallazgo": resultado}
                # Forzar actualización en SQLAlchemy
                contrato_db.rag_resolutions = dict(current_rag)
                self.db.commit()
                
            return {"status": "success", "hallazgo": resultado, "pdf_usado": best_pdf}
        except Exception as e:
            return {"status": "error", "message": str(e)}
        finally:
             self.db.close()
