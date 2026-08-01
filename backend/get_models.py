import json
import urllib.request
from sqlalchemy.orm import Session
from database.database import get_db, SessionLocal
from database.models import ConfiguracionAPI
from core.security import decrypt_data

def get_groq_models():
    db = SessionLocal()
    groq_config = db.query(ConfiguracionAPI).filter(ConfiguracionAPI.proveedor == "groq").first()
    if not groq_config:
        print("No groq config found")
        return
        
    api_key = decrypt_data(groq_config.api_key_encriptada)
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/models", 
        headers={"Authorization": f"Bearer {api_key}"}
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            models = [m['id'] for m in data['data']]
            print("AVAILABLE MODELS:")
            for m in models:
                print(m)
    except Exception as e:
        print(e)

if __name__ == "__main__":
    get_groq_models()
