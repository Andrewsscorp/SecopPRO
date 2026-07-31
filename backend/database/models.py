import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, JSON
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

class Analisis(Base):
    __tablename__ = "analisis"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    nombre = Column(String, nullable=False)
    fecha_corte = Column(String)
    estado = Column(Enum(EstadoAnalisis), default=EstadoAnalisis.INICIADO)
    created_at = Column(DateTime, default=datetime.utcnow)

class Contrato(Base):
    __tablename__ = "contratos"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    id_analisis = Column(String, ForeignKey("analisis.id"))
    llave_busqueda = Column(String, index=True)
    # Se utiliza JSON en lugar de JSONB para compatibilidad nativa con SQLite
    datos_secop = Column(JSON)
    hallazgos_ocr = Column(JSON)

class LogSistema(Base):
    __tablename__ = "logs_sistema"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    id_analisis = Column(String, ForeignKey("analisis.id"))
    timestamp = Column(DateTime, default=datetime.utcnow)
    mensaje = Column(String)
    nivel = Column(Enum(NivelLog), default=NivelLog.INFO)
