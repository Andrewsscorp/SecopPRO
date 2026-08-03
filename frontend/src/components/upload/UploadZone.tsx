'use client';

import { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CloudUpload, FileText, Trash2, ArrowRight, Search, Building2, MapPin, 
  Calendar, User, Loader2, Database, AlertCircle, X, ShieldCheck, Scale, 
  Lock, Activity, Cpu, Network, Server, Zap, CheckCircle2, ChevronRight 
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { validateFileSize, ACCEPTED_MIME_TYPES, isValidFileType } from '@/lib/validations';
import { extractHeaders } from '@/lib/excelParser';
import { generateFileHash } from '@/lib/crypto';
import { useFileStore } from '@/store/useFileStore';

export default function UploadZone() {
  const router = useRouter();
  const { file, fileHash, setFileAndColumns, clearFile } = useFileStore();
  const [activeTab, setActiveTab] = useState<'upload' | 'search'>('upload');

  // Estados para búsqueda directa
  const [searchParams, setSearchParams] = useState({
    nombre: '',
    documento: '',
    ciudad: '',
    fechaInicio: '',
    fechaFin: ''
  });
  const [isSearching, setIsSearching] = useState(false);
  const [showNoResultsModal, setShowNoResultsModal] = useState(false);
  
  // Estado para el reloj / Live feed
  const [currentTime, setCurrentTime] = useState('');
  useEffect(() => {
    const update = () => setCurrentTime(new Date().toLocaleTimeString('es-CO'));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[], fileRejections: any[]) => {
    if (fileRejections.length > 0) {
      const error = fileRejections[0].errors[0];
      if (error.code === 'file-too-large') {
        toast.error('El archivo excede el tamaño máximo permitido de 50MB.');
      } else if (error.code === 'file-invalid-type') {
        toast.error('Formato no soportado. Sube un archivo .xlsx, .xls, .csv o .pdf.');
      } else {
        toast.error('Error al intentar cargar el archivo.');
      }
      return;
    }

    const droppedFile = acceptedFiles[0];
    if (!droppedFile) return;

    if (!validateFileSize(droppedFile)) {
      toast.error('El archivo excede el tamaño máximo permitido de 50MB.');
      return;
    }
    
    if (!isValidFileType(droppedFile)) {
        toast.error('Formato no soportado. Sube un archivo .xlsx, .xls, .csv o .pdf.');
        return;
    }

    const toastId = toast.loading('Calculando firma digital y procesando archivo...');
    
    try {
      const [columns, hash] = await Promise.all([
        extractHeaders(droppedFile),
        generateFileHash(droppedFile)
      ]);
      
      setFileAndColumns(droppedFile, columns, hash);
      toast.success('Archivo procesado exitosamente', { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error inesperado', { id: toastId });
    }
  }, [setFileAndColumns]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME_TYPES,
    maxSize: 50 * 1024 * 1024,
    multiple: false
  });

  const handleDirectSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const { nombre, documento, ciudad, fechaInicio, fechaFin } = searchParams;
    
    if (!nombre && !documento && !ciudad && !(fechaInicio && fechaFin)) {
      toast.error('Por favor, ingresa al menos un criterio de búsqueda.');
      return;
    }

    if ((fechaInicio && !fechaFin) || (!fechaInicio && fechaFin)) {
      toast.error('Para buscar por fecha debes indicar tanto inicio como fin.');
      return;
    }

    setIsSearching(true);
    const toastId = toast.loading('Consultando la API oficial de SECOP II...');

    try {
      const query = new URLSearchParams();
      if (nombre) query.append('nombre', nombre);
      if (documento) query.append('documento', documento);
      if (ciudad) query.append('ciudad', ciudad);
      if (fechaInicio) query.append('fecha_inicio', fechaInicio);
      if (fechaFin) query.append('fecha_fin', fechaFin);

      const res = await fetch(`http://localhost:8000/api/search/direct?${query.toString()}`);
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Error en la búsqueda');
      }

      const data = await res.json();
      
      toast.dismiss(toastId);
      
      if (data.count === 0) {
        setShowNoResultsModal(true);
      } else {
        toast.success(`Se encontraron ${data.count} contratos. Cargando Dashboard...`);
        router.push(`/results?jobId=${data.job_id}`);
      }
    } catch (error: any) {
      toast.dismiss(toastId);
      toast.error(error.message);
    } finally {
      setIsSearching(false);
    }
  };

  // 1. Vista de Archivo Listo (Pestaña Upload)
  if (file && activeTab === 'upload') {
    return (
      <div className="relative w-full h-full min-h-[90vh] flex flex-col items-center justify-center p-8 bg-[#f4f7f9] overflow-hidden rounded-3xl m-4">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none" />
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-400/20 blur-[120px] rounded-full mix-blend-multiply pointer-events-none animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-400/20 blur-[120px] rounded-full mix-blend-multiply pointer-events-none animate-pulse-slow" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-2xl bg-white/70 backdrop-blur-3xl border border-white/60 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.05)] rounded-[2rem] p-12 z-10 relative overflow-hidden"
        >
          {/* Decorative Top Line */}
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 via-teal-400 to-blue-500" />

          <div className="flex flex-col items-center text-center mb-10">
            <div className="p-6 bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600 rounded-3xl shadow-inner border border-emerald-100 mb-6">
              <FileText className="w-16 h-16" />
            </div>
            <h4 className="text-3xl font-extrabold text-slate-800 truncate w-full" title={file.name}>
              {file.name}
            </h4>
            <p className="text-slate-500 font-medium mt-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              Archivo Procesado Exitosamente • {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>

          <div className="mb-12 bg-slate-50/80 p-6 rounded-2xl border border-slate-200/60 shadow-sm">
            <span className="flex items-center justify-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">
              <ShieldCheck className="w-5 h-5" />
              Sello Criptográfico Inmutable (SHA-256)
            </span>
            <div className="bg-white border border-slate-200 p-4 rounded-xl overflow-x-auto shadow-inner text-center">
              <code className="text-base text-emerald-700 font-mono font-bold tracking-tight">
                {fileHash}
              </code>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={clearFile}
              className="w-full sm:w-auto flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-white border-2 border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-500 rounded-2xl font-bold transition-all"
            >
              <Trash2 className="w-5 h-5" />
              Descartar
            </button>
            <button
              onClick={() => router.push('/mapping')}
              className="w-full sm:w-auto flex-[2] flex items-center justify-center gap-3 px-6 py-4 bg-slate-900 text-white hover:bg-slate-800 rounded-2xl font-extrabold shadow-xl shadow-slate-900/20 transition-all hover:shadow-slate-900/30 active:scale-[0.98]"
            >
              Iniciar Análisis Forense
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // 2. Vista Principal (El Gran Dashboard Inicial)
  return (
    <div className="relative w-full h-full min-h-[95vh] flex flex-col bg-[#f8fafc] overflow-x-hidden rounded-3xl m-2 shadow-[inset_0_0_100px_rgba(0,0,0,0.02)] border border-white">
      
      {/* Background Decorativo Premium */}
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none" />
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-emerald-300/20 blur-[140px] rounded-full mix-blend-multiply pointer-events-none animate-pulse-slow" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-300/20 blur-[140px] rounded-full mix-blend-multiply pointer-events-none animate-pulse-slow" />

      {/* Título y Header Top Spanning */}
      <header className="relative w-full pt-10 pb-6 px-10 flex flex-col md:flex-row items-center justify-between z-20">
        <div className="flex flex-col items-start">
          <motion.h1 
            initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-5xl md:text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 drop-shadow-sm flex items-center gap-1"
          >
            Secop<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">PRO</span>
            <span className="text-xl text-emerald-500 ml-2 animate-pulse">•</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="text-slate-500 font-semibold tracking-wide mt-1 text-sm md:text-base uppercase"
          >
            Plataforma Avanzada de Inteligencia Forense
          </motion.p>
        </div>

        <motion.div 
          initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}
          className="mt-6 md:mt-0 flex flex-col items-end"
        >
          <div className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-white/60 backdrop-blur-md border border-white shadow-sm">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-sm font-bold text-slate-700">Sistema En Línea</span>
            <span className="text-slate-300 mx-1">|</span>
            <span className="text-sm font-mono text-slate-500">{currentTime}</span>
          </div>
          <p className="text-xs font-semibold text-slate-400 mt-3 text-right">
            Arquitectura por <span className="text-slate-600 font-bold">Andrés Suárez</span>
          </p>
        </motion.div>
      </header>

      {/* Grid Principal Layout */}
      <div className="flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-8 px-6 lg:px-10 pb-10 z-10 h-full">
        
        {/* COLUMNA IZQUIERDA: Intelligence Stream */}
        <motion.aside 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="hidden lg:flex col-span-3 flex-col gap-6"
        >
          <div className="bg-white/60 backdrop-blur-2xl border border-white shadow-xl rounded-3xl p-6 flex-1 flex flex-col overflow-hidden relative">
            <div className="flex items-center gap-3 mb-6 border-b border-slate-200 pb-4">
              <Activity className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold text-slate-800 tracking-wide">Inteligencia Activa</h3>
            </div>
            
            {/* Fake Scrolling Feed */}
            <div className="flex-1 relative overflow-hidden mask-image-bottom-fade">
              <motion.div 
                animate={{ y: ["0%", "-50%"] }}
                transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
                className="flex flex-col gap-4 absolute w-full"
              >
                {/* Repetimos elementos para el scroll continuo */}
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="flex flex-col gap-4">
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                      <p className="text-xs font-bold text-emerald-600 mb-1">Módulo Socrata</p>
                      <p className="text-sm text-slate-600 leading-snug font-medium">Conexión establecida con Datos Abiertos de Colombia. Lectura de 500k+ registros.</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                      <p className="text-xs font-bold text-blue-600 mb-1">Motor IA Groq</p>
                      <p className="text-sm text-slate-600 leading-snug font-medium">Modelos LLaMA 3.1 70B inicializados para análisis de pliegos y anexos.</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                      <p className="text-xs font-bold text-purple-600 mb-1">Seguridad</p>
                      <p className="text-sm text-slate-600 leading-snug font-medium">Bóveda criptográfica SHA-256 activa. Garantía de inmutabilidad en curso.</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                      <p className="text-xs font-bold text-orange-600 mb-1">Visión Computacional</p>
                      <p className="text-sm text-slate-600 leading-snug font-medium">OCR Tesseract preparado para PDFs escaneados y documentos no estructurados.</p>
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </motion.aside>


        {/* COLUMNA CENTRAL: Formularios (Upload / Search) */}
        <motion.main 
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, duration: 0.5 }}
          className="col-span-1 lg:col-span-6 flex flex-col"
        >
          <div className="w-full bg-white/70 backdrop-blur-3xl border border-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] rounded-[2.5rem] p-8 md:p-10 flex-1 flex flex-col relative overflow-hidden">
            
            {/* Selector de Pestañas Toggle */}
            <div className="flex bg-slate-100/80 p-1.5 rounded-2xl mb-8 w-full max-w-sm mx-auto shadow-inner border border-slate-200/50">
              <button
                onClick={() => setActiveTab('upload')}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                  activeTab === 'upload' 
                    ? 'bg-white text-emerald-700 shadow-md border border-white/50' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
              >
                <CloudUpload className="w-4 h-4" />
                Cargar Archivo
              </button>
              <button
                onClick={() => setActiveTab('search')}
                className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2 ${
                  activeTab === 'search' 
                    ? 'bg-white text-emerald-700 shadow-md border border-white/50' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
              >
                <Database className="w-4 h-4" />
                Base Oficial
              </button>
            </div>

            <AnimatePresence mode="wait">
              {/* TAB 1: UPLOAD */}
              {activeTab === 'upload' ? (
                <motion.div 
                  key="upload" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}
                  className="w-full flex-1 flex flex-col items-center justify-center"
                >
                  <div 
                    {...getRootProps()} 
                    className={`w-full h-full min-h-[350px] p-10 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ease-out bg-slate-50/50 relative overflow-hidden group
                      ${isDragActive ? 'border-emerald-500 bg-emerald-50/80 scale-[1.02] shadow-2xl shadow-emerald-500/20' : 'border-slate-300 hover:border-emerald-400 hover:bg-white hover:shadow-xl'}`}
                  >
                    <input {...getInputProps()} />
                    
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-100/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}
                      className="w-24 h-24 mb-8 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-3xl flex items-center justify-center shadow-md border border-white rotate-3 group-hover:rotate-6 transition-transform duration-500"
                    >
                      <CloudUpload className={`w-10 h-10 ${isDragActive ? 'text-emerald-600 animate-bounce' : 'text-emerald-500'}`} />
                    </motion.div>

                    <h3 className="text-2xl md:text-3xl font-extrabold text-slate-800 mb-4 text-center tracking-tight">
                      Bóveda de Documentos
                    </h3>
                    <p className="text-slate-500 mb-10 font-medium text-center max-w-sm text-sm leading-relaxed">
                      Arrastra tu archivo corporativo (Excel, CSV) o un documento legal (PDF) para indexarlo en el motor analítico.
                    </p>

                    <button className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-xl hover:bg-slate-800 transition-all flex items-center gap-3 group-hover:scale-105">
                      <FileText className="w-5 h-5" />
                      Explorar Sistema
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* TAB 2: SEARCH */
                <motion.div 
                  key="search" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}
                  className="w-full flex-1 flex flex-col"
                >
                  <form onSubmit={handleDirectSearch} className="w-full h-full flex flex-col justify-between">
                    <div className="mb-6 text-center">
                      <h3 className="text-2xl font-extrabold text-slate-800 tracking-tight">Interrogatorio de API SECOP</h3>
                      <p className="text-sm text-slate-500 mt-2 font-medium">Extrae datos directamente del gobierno sin necesidad de archivos locales.</p>
                    </div>

                    <div className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-emerald-500" />
                          Entidad Pública o Contratista
                        </label>
                        <input 
                          type="text" placeholder="Ej. Alcaldía de Medellín..." value={searchParams.nombre} onChange={e => setSearchParams({...searchParams, nombre: e.target.value})}
                          className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-800 font-semibold placeholder:font-normal placeholder:text-slate-400 shadow-sm"
                        />
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                            <User className="w-4 h-4 text-emerald-500" />
                            NIT o Cédula
                          </label>
                          <input 
                            type="text" placeholder="Ej. 890905211" value={searchParams.documento} onChange={e => setSearchParams({...searchParams, documento: e.target.value})}
                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-800 font-semibold placeholder:font-normal placeholder:text-slate-400 shadow-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-emerald-500" />
                            Ubicación
                          </label>
                          <input 
                            type="text" placeholder="Ej. Antioquia, Bogotá" value={searchParams.ciudad} onChange={e => setSearchParams({...searchParams, ciudad: e.target.value})}
                            className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-800 font-semibold placeholder:font-normal placeholder:text-slate-400 shadow-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-emerald-500" />
                            Límite Inferior
                          </label>
                          <input 
                            type="date" value={searchParams.fechaInicio} onChange={e => setSearchParams({...searchParams, fechaInicio: e.target.value})}
                            className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-700 font-semibold shadow-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-emerald-500" />
                            Límite Superior
                          </label>
                          <input 
                            type="date" value={searchParams.fechaFin} onChange={e => setSearchParams({...searchParams, fechaFin: e.target.value})}
                            className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-slate-700 font-semibold shadow-sm"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-8">
                      <button
                        type="submit"
                        disabled={isSearching}
                        className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold text-lg rounded-xl shadow-xl shadow-emerald-500/30 hover:from-emerald-700 hover:to-emerald-600 hover:shadow-emerald-500/40 disabled:opacity-70 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                      >
                        {isSearching ? (
                          <>
                            <Loader2 className="w-6 h-6 animate-spin" />
                            Estableciendo Túnel con SECOP...
                          </>
                        ) : (
                          <>
                            <Search className="w-6 h-6" />
                            Desplegar Extracción
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.main>


        {/* COLUMNA DERECHA: Telemetría / System Status */}
        <motion.aside 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="hidden lg:flex col-span-3 flex-col gap-6"
        >
          <div className="bg-white/60 backdrop-blur-2xl border border-white shadow-xl rounded-3xl p-6 flex-1 flex flex-col relative overflow-hidden">
            <div className="flex items-center gap-3 mb-6 border-b border-slate-200 pb-4">
              <Server className="w-5 h-5 text-slate-700" />
              <h3 className="font-bold text-slate-800 tracking-wide">Telemetría del Motor</h3>
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Cpu className="w-4 h-4" /> Computo Local</span>
                  <span className="text-xs font-bold text-slate-700">Óptimo</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: "20%" }} animate={{ width: ["20%", "45%", "25%"] }} transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                    className="h-full bg-blue-500 rounded-full"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Network className="w-4 h-4" /> Ancho de Banda</span>
                  <span className="text-xs font-bold text-emerald-600">2.4 Gbps</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: "80%" }} animate={{ width: ["80%", "95%", "85%"] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                    className="h-full bg-emerald-500 rounded-full"
                  />
                </div>
              </div>

              <div className="mt-8 p-4 bg-slate-900 rounded-2xl border border-slate-800 shadow-inner relative overflow-hidden">
                <div className="absolute -right-4 -top-4 text-slate-800 opacity-50">
                  <Zap className="w-20 h-20" />
                </div>
                <h4 className="text-white font-bold text-sm mb-1 relative z-10">Módulo Groq HPC</h4>
                <p className="text-slate-400 text-xs font-medium leading-relaxed relative z-10">
                  Aceleración LPU habilitada. Latencia estimada en inferencia &lt; 200ms por token.
                </p>
                <div className="mt-4 flex gap-1 relative z-10">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-1 flex-1 bg-emerald-500 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.aside>

      </div>

      {/* Cláusulas en la parte inferior */}
      <div className="w-full bg-white/50 backdrop-blur-md border-t border-white/80 py-6 px-10 flex flex-col md:flex-row items-center justify-between gap-6 z-20 mt-auto">
        <div className="flex items-center gap-8 overflow-x-auto w-full md:w-auto hide-scrollbar">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <div>
              <p className="text-xs font-bold text-slate-700 uppercase">Seguridad Militar</p>
              <p className="text-[10px] text-slate-500">Aislamiento de procesos por Sandbox</p>
            </div>
          </div>
          <div className="w-px h-8 bg-slate-300/50 hidden md:block" />
          <div className="flex items-center gap-3 whitespace-nowrap">
            <Scale className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-xs font-bold text-slate-700 uppercase">Marco Regulatorio</p>
              <p className="text-[10px] text-slate-500">Alineado a Transparencia Estatal</p>
            </div>
          </div>
          <div className="w-px h-8 bg-slate-300/50 hidden md:block" />
          <div className="flex items-center gap-3 whitespace-nowrap">
            <Lock className="w-5 h-5 text-purple-600" />
            <div>
              <p className="text-xs font-bold text-slate-700 uppercase">Inmutabilidad</p>
              <p className="text-[10px] text-slate-500">Firmas criptográficas por documento</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 bg-slate-200/50 px-4 py-2 rounded-full border border-slate-300/50">
          Versión de Motor 2.1.0-RC
        </div>
      </div>

      {/* Modal Elegante para Cero Resultados */}
      <AnimatePresence>
        {showNoResultsModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-[2rem] p-10 max-w-md w-full shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 via-red-500 to-orange-400 bg-[length:200%_auto] animate-gradient" />
              
              <button 
                onClick={() => setShowNoResultsModal(false)}
                className="absolute top-6 right-6 text-slate-400 hover:text-slate-700 transition-colors bg-slate-100 p-2 rounded-full hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center text-center mt-4">
                <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center mb-6 shadow-inner border border-orange-100 relative">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }}>
                    <AlertCircle className="w-12 h-12 text-orange-500" />
                  </motion.div>
                </div>
                
                <h3 className="text-2xl font-extrabold text-slate-800 mb-3">
                  Cero Hallazgos
                </h3>
                
                <p className="text-slate-500 mb-8 leading-relaxed font-medium">
                  La minería de datos no produjo resultados. Es probable que la entidad o el contratista no registren actividad en el marco de tiempo seleccionado.
                </p>

                <button
                  onClick={() => setShowNoResultsModal(false)}
                  className="w-full py-4 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-xl shadow-slate-900/20 active:scale-[0.98]"
                >
                  Modificar Parámetros
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
