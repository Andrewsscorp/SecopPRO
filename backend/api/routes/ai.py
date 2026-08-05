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
    
    if provider != "qwen":
        # Buscar configuración activa para APIs
        config = db.query(ConfiguracionAPI).filter(ConfiguracionAPI.proveedor == provider).first()
        if not config or not config.is_active:
            raise HTTPException(status_code=400, detail=f"La API de {provider.capitalize()} no está configurada o activada en Ajustes.")
    else:
        config = None
        
    try:
        api_key = decrypt_data(config.api_key_encriptada) if config else None
        response_text = ""
        
        if provider == "groq":
            # Para Groq también usamos la primera llave
            groq_key = [k.strip() for k in api_key.split(",") if k.strip()][0] if api_key else None
            client = Groq(api_key=groq_key, http_client=httpx.Client(verify=False))
            chat_completion = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": "Eres el motor de IA integrado nativamente en SecopPRO. Tu propósito es asistir en la auditoría y análisis de contratos."},
                    {"role": "user", "content": data.message}
                ],
                model=config.modelo,
            )
            response_text = chat_completion.choices[0].message.content
            
        elif provider == "gemini":
            import time
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
                
                gemini_keys = [k.strip() for k in api_key.split(",") if k.strip()] if api_key else []
                total_keys = len(gemini_keys) if gemini_keys else 1
                
                max_retries = 3
                attempt = 0
                current_key_idx = 0
                
                while attempt < max_retries:
                    current_key = gemini_keys[current_key_idx] if gemini_keys else None
                    if not current_key:
                        raise HTTPException(status_code=400, detail="La llave de Gemini no está configurada.")
                        
                    res = client.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/{raw_model}:generateContent?key={current_key}",
                        json=payload,
                        timeout=60.0
                    )
                    
                    if res.status_code == 200:
                        json_data = res.json()
                        response_text = json_data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "Sin respuesta de Gemini")
                        break
                    elif res.status_code == 429:
                        if total_keys > 1 and current_key_idx < total_keys - 1:
                            current_key_idx += 1
                            continue
                        else:
                            time.sleep(2 ** attempt)
                            attempt += 1
                            current_key_idx = 0
                            continue
                    else:
                        raise HTTPException(status_code=502, detail=f"Error en Gemini API: {res.text}")
                
                if not response_text:
                    raise HTTPException(status_code=502, detail="Límite de peticiones excedido en todas las llaves (Error 429).")
                    
        elif provider == "qwen":
            import os, time, subprocess
            models_dir = os.path.join("C:\\", "SecopPRO", "Models")
            model_path = os.path.join(models_dir, "qwen2.5-3b-instruct-q4_k_m.gguf")
            engine_path = os.path.join("C:\\", "SecopPRO", "Engine", "llama-cli.exe")
            
            if not os.path.exists(model_path) or not os.path.exists(engine_path):
                raise HTTPException(status_code=500, detail="El modelo local o el motor no están instalados correctamente.")
                
            prompt_formatted = f"<|im_start|>system\nEres el motor de IA integrado nativamente en SecopPRO. Tu propósito es asistir en la auditoría y análisis de contratos.<|im_end|>\n<|im_start|>user\n{data.message}<|im_end|>\n<|im_start|>assistant\n"
            
            prompt_file = os.path.join("C:\\", "SecopPRO", "Engine", "temp_chat_prompt.txt")
            with open(prompt_file, "w", encoding="utf-8") as f:
                f.write(prompt_formatted)
                
            cmd = [
                engine_path,
                "-m", model_path,
                "-f", prompt_file,
                "-n", "512",
                "-c", "2048",
                "--log-disable"
            ]
            
            # 0x08000000 = CREATE_NO_WINDOW
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore", creationflags=0x08000000)
            
            raw_output = result.stdout
            response_text = raw_output
            if "\nassistant" in response_text:
                response_text = response_text.split("\nassistant")[-1].strip()
            elif "<|im_start|>assistant" in response_text:
                response_text = response_text.split("<|im_start|>assistant")[-1].strip()
                
            if response_text.startswith("aquí estoy") or response_text.startswith("aqu"):
                 pass
                 
            if not response_text or "RAW:" in response_text:
                response_text = "(El motor generó una respuesta vacía)"
                
        else:
            raise HTTPException(status_code=400, detail="Proveedor de IA no soportado.")
            
        # Registrar auditoría silenciosa
        # Registrar auditoría silenciosa
        auditoria = AuditoriaSistema(
            accion="CONSULTA_IA",
            detalles={
                "proveedor": provider,
                "modelo": config.modelo if config else "qwen2.5-3b-local",
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
