import os
import sys
from google import genai

sys.path.append(os.path.join(os.getcwd(), 'backend'))
from database.database import SessionLocal
from database.models import ConfiguracionAPI
from core.security import decrypt_data

db = SessionLocal()
config = db.query(ConfiguracionAPI).filter(ConfiguracionAPI.proveedor == 'gemini').first()
API_KEY = decrypt_data(config.api_key_encriptada)
db.close()


def probar_gemini():
    print("Inicializando cliente...")
    
    # 2. Configurar el cliente con la llave proporcionada
    client = genai.Client(api_key=API_KEY, http_options={'verify': False})
    
    # 3. Usar el modelo con mayor límite gratuito (1,000 RPD)
    modelo_id = "gemini-2.5-flash-lite"
    
    # 4. Mensaje de prueba 
    prompt = "Escribe un mensaje de bienvenida corto para Trace Audit Pro, mi aplicación personal de análisis."
    
    print(f"Enviando petición a {modelo_id}...")
    
    try:
        # 5. Llamada a la API
        response = client.models.generate_content(
            model=modelo_id,
            contents=prompt,
        )
        
        print("\n Conexion exitosa! Respuesta de Gemini:\n")
        print(response.text)
        print("\n" + "="*40)
        
    except Exception as e:
        print(f"\n Error al conectar con la API: {e}")
        print("Revisa que tu API Key sea correcta y que tengas conexión a internet.")

if __name__ == "__main__":
    probar_gemini()
