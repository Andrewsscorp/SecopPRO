import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, JSON, Float
from sqlalchemy.orm import relationship
import uuid
from .database import Base

class EstadoAnalisis(str, enum.Enum):
    INICIADO = "Iniciado"
    PROCESANDO = "Procesando"
    COMPLETADO = "Completado"
    ERROR = "Error"

class NivelLog(str, enum.Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"

class AnalisisRealizado(Base):
    """Metadatos del archivo Excel cargado y del proceso de análisis"""
    __tablename__ = "analisis_realizados"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    sha256_archivo = Column(String, index=True, nullable=False)
    nombre_documento = Column(String, nullable=False)
    total_columnas = Column(Integer)
    columna_escogida = Column(String)
    estado = Column(Enum(EstadoAnalisis), default=EstadoAnalisis.INICIADO)
    hora_inicio = Column(DateTime, default=datetime.utcnow)
    tiempo_respuesta = Column(Float)  # En segundos

class CacheSecop(Base):
    """Bóveda Global de datos de SECOP. La llave primaria es el identificador único de SECOP (ej. id_contrato)"""
    __tablename__ = "cache_secop"
    llave_busqueda = Column(String, primary_key=True)
    datos_completos = Column(JSON) # Aquí va el merge de contratos, procesos, terceros, modificaciones, etc.
    fecha_ultima_actualizacion = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ContratoAnalisis(Base):
    """Tabla asociativa (M:N) para vincular un Análisis con las llaves que consultó"""
    __tablename__ = "contratos_analisis"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    id_analisis = Column(String, ForeignKey("analisis_realizados.id"))
    llave_busqueda = Column(String, ForeignKey("cache_secop.llave_busqueda"))
    # Solo datos que varían por análisis (ej. hallazgos OCR específicos)
    hallazgos_ocr = Column(JSON) 

class ResultadoOCR(Base):
    """Resultados relacionales del análisis forense de OCR"""
    __tablename__ = "resultados_ocr"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    llave_busqueda = Column(String, ForeignKey("cache_secop.llave_busqueda"), index=True)
    palabra_clave = Column(String, nullable=False)
    sha256_archivo = Column(String)
    archivo_origen = Column(String)
    contexto_previo = Column(String)
    bloque_coincidencia = Column(String)
    contexto_posterior = Column(String)
    fecha_analisis = Column(DateTime, default=datetime.utcnow)

class AuditoriaSistema(Base):
    """Trazabilidad inmutable de las acciones del usuario en el sistema"""
    __tablename__ = "auditoria_sistema"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    fecha_hora = Column(DateTime, default=datetime.utcnow)
    usuario = Column(String, default="Local_User")
    accion = Column(String, nullable=False)
    detalles = Column(JSON)

class LogsServidor(Base):
    """Logs técnicos e inmutables del servidor y Scraper"""
    __tablename__ = "logs_servidor"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    id_analisis = Column(String, ForeignKey("analisis_realizados.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    mensaje = Column(String, nullable=False)
    nivel = Column(Enum(NivelLog), default=NivelLog.INFO)
