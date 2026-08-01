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
    nombre_analisis = Column(String, unique=True, nullable=True)
    sha256_archivo = Column(String, index=True, nullable=False)
    nombre_documento = Column(String, nullable=False)
    total_columnas = Column(Integer)
    columna_escogida = Column(String)
    estado = Column(Enum(EstadoAnalisis), default=EstadoAnalisis.INICIADO)
    hora_inicio = Column(DateTime, default=datetime.utcnow)
    tiempo_respuesta = Column(Float)  # En segundos

class CacheSecop(Base):
    """Bóveda Global de datos de SECOP tabulada. La llave primaria es el identificador único."""
    __tablename__ = "cache_secop"
    llave_busqueda = Column(String, primary_key=True)
    
    # --- Datos de Entidad y Contrato ---
    nombre_entidad = Column(String)
    entidad = Column(String)
    nit_entidad = Column(String)
    codigo_entidad = Column(String)
    departamento = Column(String)
    ciudad = Column(String)
    
    # --- Tiempos y Fechas ---
    fecha_de_firma = Column(String)
    fecha_de_inicio_del_contrato = Column(String)
    fecha_de_fin_del_contrato = Column(String)
    duraci_n_del_contrato = Column(String)
    dias_adicionados = Column(String)
    fecha_de_notificaci_n_de_prorrogaci_n = Column(String)
    el_contrato_puede_ser_prorrogado = Column(String)
    
    # --- Identificadores de Proceso ---
    id_contrato = Column(String)
    referencia_del_contrato = Column(String)
    proceso_de_compra = Column(String)
    internal_id = Column(String)
    
    # --- Descripción y Clasificación ---
    descripcion_del_proceso = Column(String)
    codigo_de_categoria_principal = Column(String)
    condiciones_de_entrega = Column(String)
    justificacion_modalidad_de = Column(String)
    modalidad_de_contratacion = Column(String)
    tipo_de_contrato = Column(String)
    estado_contrato = Column(String)
    urlproceso = Column(String)
    
    # --- Proveedor y Contratista ---
    proveedor_adjudicado = Column(String)
    es_grupo = Column(String)
    es_pyme = Column(String)
    codigo_proveedor = Column(String)
    documento_proveedor = Column(String)
    tipodocproveedor = Column(String)
    
    nombre_representante_legal = Column(String)
    tipo_de_identificaci_n_representante_legal = Column(String)
    identificaci_n_representante_legal = Column(String)
    nacionalidad_representante_legal = Column(String)
    domicilio_representante_legal = Column(String)
    g_nero_representante_legal = Column(String)
    telefono_representante_legal = Column(String)
    tel_fono_representante_legal = Column(String)
    correo_representante_legal = Column(String)
    correo_electronico_representante = Column(String)
    
    # --- Información Financiera ---
    valor_del_contrato = Column(String)
    valor_contrato = Column(String)
    valor_pendiente_de_ejecucion = Column(String)
    valor_pendiente_de = Column(String)
    valor_pagado = Column(String)
    valor_pendiente_de_pago = Column(String)
    valor_amortizado = Column(String)
    valor_facturado = Column(String)
    valor_de_pago_adelantado = Column(String)
    saldo_cdp = Column(String)
    saldo_vigencia = Column(String)
    nombre_del_banco = Column(String)
    tipo_de_cuenta = Column(String)
    n_mero_de_cuenta = Column(String)
    nombre_ordenador_de_pago = Column(String)
    nombre_ordenador_del_gasto = Column(String)
    nombre_supervisor = Column(String)
    tipo_de_documento_supervisor = Column(String)
    n_mero_de_documento_supervisor = Column(String)
    
    # --- Otros ---
    documentos_tipo = Column(String)
    descripcion_documentos_tipo = Column(String)
    ultima_actualizacion = Column(String)
    liquidaci_n = Column(String)
    fecha_inicio_liquidacion = Column(String)
    fecha_fin_liquidacion = Column(String)
    obligaci_n_ambiental = Column(String)
    obligaciones_postconsumo = Column(String)
    
    # --- Catch-all (Si Socrata manda llaves nuevas no mapeadas arriba) ---
    datos_adicionales = Column(JSON) 

    fecha_ultima_actualizacion = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class PDFsConsulta(Base):
    """Bóveda Global de PDFs reutilizables para análisis rápidos"""
    __tablename__ = "pdfs_consulta"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    llave_busqueda = Column(String, ForeignKey("cache_secop.llave_busqueda"), index=True)
    lista_pdfs = Column(JSON)  # Lista con los nombres de los PDFs
    cantidad_pdfs = Column(Integer)
    sha256_pdfs = Column(JSON) # Diccionario { "nombre.pdf": "hash_sha256" }
    nombre_zip = Column(String) # "llave_busqueda.zip"
    ruta_global_zip = Column(String) # C:\SecopPRO\CachePDFs\llave_busqueda.zip
    fecha_guardado = Column(DateTime, default=datetime.utcnow)

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
