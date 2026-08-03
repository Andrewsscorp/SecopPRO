import sys
import os
import httpx
from dotenv import load_dotenv

sys.path.append(os.path.join(os.getcwd(), 'backend'))
load_dotenv(os.path.join(os.getcwd(), 'backend', '.env'))
from database.database import SessionLocal
from database.models import ConfiguracionAPI
from core.security import decrypt_data

db = SessionLocal()
config = db.query(ConfiguracionAPI).filter(ConfiguracionAPI.proveedor == 'gemini').first()
api_key = decrypt_data(config.api_key_encriptada)
db.close()

with httpx.Client(verify=False) as client:
    res = client.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}")
    print([m['name'] for m in res.json().get('models', [])])
