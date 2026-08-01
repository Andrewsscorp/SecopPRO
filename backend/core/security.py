import os
from cryptography.fernet import Fernet

CONFIG_DIR = r"C:\SecopPRO\Config"
KEY_FILE = os.path.join(CONFIG_DIR, "encryption.key")

def _get_or_create_key() -> bytes:
    if not os.path.exists(CONFIG_DIR):
        os.makedirs(CONFIG_DIR, exist_ok=True)
        
    if os.path.exists(KEY_FILE):
        with open(KEY_FILE, "rb") as f:
            return f.read()
    else:
        key = Fernet.generate_key()
        with open(KEY_FILE, "wb") as f:
            f.write(key)
        return key

# Instanciar el objeto Fernet con la llave estática
_fernet = Fernet(_get_or_create_key())

def encrypt_data(data: str) -> str:
    """Encripta un string y retorna el string codificado en base64 (decode a utf-8 para sqlite)."""
    if not data:
        return ""
    encrypted = _fernet.encrypt(data.encode('utf-8'))
    return encrypted.decode('utf-8')

def decrypt_data(encrypted_data: str) -> str:
    """Desencripta un string recuperado de SQLite."""
    if not encrypted_data:
        return ""
    try:
        decrypted = _fernet.decrypt(encrypted_data.encode('utf-8'))
        return decrypted.decode('utf-8')
    except Exception as e:
        print(f"Error decrypting data: {e}")
        return ""
