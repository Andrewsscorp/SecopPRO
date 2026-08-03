import sys
import os
import time

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.pdf_ai_service import PdfAiService
from dotenv import load_dotenv

load_dotenv(os.path.join(os.getcwd(), 'backend', '.env'))

service = PdfAiService()

print("API KEY:", service.api_key[:10] if service.api_key else "NONE")

# Simulate a request
instruction = "Eres un asistente."
payload_text = "[]"

print("Enviando request a Gemini...")
try:
    for chunk in service.stream_generate_content(instruction, payload_text, max_retries=1):
        print("CHUNK:", chunk)
except Exception as e:
    print("EXCEPCION:", e)
