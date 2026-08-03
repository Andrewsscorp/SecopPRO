from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from groq import Groq
import google.generativeai as genai
import httpx
from typing import Optional

from database.database import get_db
from database.models import ConfiguracionAPI, AuditoriaSistema
from core.security import decrypt_data

router = APIRouter()

class ChatMessage(BaseModel):
    message: str
    provider: Optional[str] = "groq"

@router.post("/chat")
async def chat_with_ai(data: ChatMessage, db: Session = Depends(get_db)):
    provider = data.provider.lower() if data.provider else "groq"
    
    # Buscar configuración activa
    config = db.query(ConfiguracionAPI).filter(ConfiguracionAPI.proveedor == provider).first()
    
    if not config or not config.is_active:
        raise HTTPException(status_code=400, detail=f"La API de {provider.capitalize()} no está configurada o activada en Ajustes.")
        
    try:
        api_key = decrypt_data(config.api_key_encriptada)
        response_text = ""
        
        if provider == "groq":
            client = Groq(api_key=api_key, http_client=httpx.Client(verify=False))
            chat_completion = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": "Eres el motor de IA integrado nativamente en SecopPRO. Tu propósito es asistir en la auditoría y análisis de contratos."},
                    {"role": "user", "content": data.message}
                ],
                model=config.modelo,
            )
            response_text = chat_completion.choices[0].message.content
            
        elif provider == "gemini":
            # Usar REST directo para evitar problemas de proxy/SSL con el SDK de Google
            with httpx.Client(verify=False) as client:
                # Map legacy names
                raw_model = config.modelo
                if raw_model == "gemini-flash-latest":
                    raw_model = "gemini-3.5-flash"
                elif raw_model == "gemini-pro-latest":
                    raw_model = "gemini-3.1-pro-preview"
                    
                payload = {
                    "system_instruction": {
                        "parts": [{"text": "Eres el motor de IA integrado nativamente en SecopPRO. Tu propósito es asistir en la auditoría y análisis de contratos."}]
                    },
                    "contents": [{"parts": [{"text": data.message}]}]
                }
                res = client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{raw_model}:generateContent?key={api_key}",
                    json=payload,
                    timeout=60.0
                )
                
                if res.status_code == 200:
                    json_data = res.json()
                    response_text = json_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "Sin respuesta de Gemini")
                else:
                    raise HTTPException(status_code=502, detail=f"Error en Gemini API: {res.text}")
            
        else:
            raise HTTPException(status_code=400, detail="Proveedor de IA no soportado.")
            
        # Registrar auditoría silenciosa
        auditoria = AuditoriaSistema(
            accion="CONSULTA_IA",
            detalles={
                "proveedor": provider,
                "modelo": config.modelo,
                "longitud_prompt": len(data.message),
                "longitud_respuesta": len(response_text)
            }
        )
        db.add(auditoria)
        db.commit()
        
        return {"response": response_text}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error en IA: {repr(e)}")
