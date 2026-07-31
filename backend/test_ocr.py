import traceback
from rapidocr_onnxruntime import RapidOCR

print("Iniciando RapidOCR...")
try:
    engine = RapidOCR()
    print("Motor inicializado con éxito.")
    
    # Crear una imagen en memoria o vacía no funciona, usemos numpy
    import numpy as np
    import cv2
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    
    print("Probando inferencia...")
    result, elapse = engine(img)
    print("Inferencia completa:", result)
except Exception as e:
    print("Error:", e)
    traceback.print_exc()
