import os
import pathlib

def ensure_immutable_directories():
    """
    Crea la estructura de carpetas inmutables en C:\SecopPRO
    Esto separa el código de la base de datos y de la memoria IA local.
    """
    base_dir = pathlib.Path("C:/SecopPRO")
    
    # Rutas sagradas
    directories = [
        base_dir / "Database",
        base_dir / "Config",
        base_dir / "Json"
    ]
    
    for d in directories:
        d.mkdir(parents=True, exist_ok=True)
    
    # Establecer variables de entorno para uso en todo el backend
    os.environ["SECOP_PRO_DB_DIR"] = str(base_dir / "Database")
    os.environ["SECOP_PRO_CONFIG_DIR"] = str(base_dir / "Config")
    os.environ["SECOP_PRO_JSON_DIR"] = str(base_dir / "Json")

if __name__ == "__main__":
    ensure_immutable_directories()
