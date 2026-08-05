'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { 
  FileText, Search, Clock, Calendar, 
  Play, CheckCircle, AlertTriangle, 
  Loader2, Key, ChevronRight, FileArchive, Copy,
  Database, Server
} from 'lucide-react';
import { toast } from 'sonner';

interface HistoryRecord {
  id: string;
  nombre_analisis: string;
  archivo_origen: string;
  hora_inicio: string;
  tiempo_respuesta: number | null;
  estado: string;
  cantidad_llaves: number;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [offset, setOffset] = useState(0);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [jobToDuplicate, setJobToDuplicate] = useState<string | null>(null);
  const [newJobName, setNewJobName] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const LIMIT = 12;

  useEffect(() => {
    fetchHistory(0);
  }, []);

  const fetchHistory = async (currentOffset: number = 0) => {
    if (currentOffset === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await fetch(`http://127.0.0.1:8000/api/dashboard/history?limit=${LIMIT}&offset=${currentOffset}`);
      if (res.ok) {
        const result = await res.json();
        if (currentOffset === 0) {
          setHistory(result.data);
        } else {
          setHistory(prev => [...prev, ...result.data]);
        }
        setTotal(result.total);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    const nextOffset = offset + LIMIT;
    setOffset(nextOffset);
    fetchHistory(nextOffset);
  };

  const handleOpenFolder = async (jobId: string) => {
    try {
      await fetch('http://127.0.0.1:8000/api/dashboard/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });
    } catch (error) {
      console.error("Error opening folder:", error);
    }
  };

  const handleDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobToDuplicate || !newJobName.trim()) return;
    
    setDuplicating(true);
    const toastId = toast.loading('Duplicando análisis e independizando Bóveda...');
    
    try {
      const res = await fetch('http://127.0.0.1:8000/api/dashboard/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: jobToDuplicate, newName: newJobName.trim() })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        toast.success('Bóveda duplicada exitosamente', { id: toastId });
        setDuplicateModalOpen(false);
        setNewJobName('');
        setJobToDuplicate(null);
        fetchHistory(0);
      } else {
        toast.error(data.detail || 'Error al duplicar el análisis', { id: toastId });
      }
    } catch (error) {
      toast.error('Error de conexión al servidor', { id: toastId });
      console.error(error);
    } finally {
      setDuplicating(false);
    }
  };

  const filteredHistory = history.filter(record => 
    record.nombre_analisis?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.archivo_origen?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (estado: string) => {
    switch (estado) {
      case 'Completado':
        return (
          <div className="relative group/badge flex items-center justify-center">
            <div className="absolute inset-0 bg-emerald-400/20 rounded-full blur-md group-hover/badge:blur-lg transition-all" />
            <span className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white/80 backdrop-blur border border-emerald-200 text-emerald-700 shadow-sm">
              <CheckCircle className="w-3.5 h-3.5" /> Completado
            </span>
          </div>
        );
      case 'Procesando':
        return (
          <div className="relative group/badge flex items-center justify-center">
            <div className="absolute inset-0 bg-blue-400/20 rounded-full blur-md group-hover/badge:blur-lg transition-all animate-pulse" />
            <span className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white/80 backdrop-blur border border-blue-200 text-blue-700 shadow-sm">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando
            </span>
          </div>
        );
      case 'Error':
        return (
          <div className="relative group/badge flex items-center justify-center">
            <div className="absolute inset-0 bg-red-400/20 rounded-full blur-md group-hover/badge:blur-lg transition-all" />
            <span className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white/80 backdrop-blur border border-red-200 text-red-700 shadow-sm">
              <AlertTriangle className="w-3.5 h-3.5" /> Error
            </span>
          </div>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100/80 backdrop-blur border border-slate-200 text-slate-700 shadow-sm">
            {estado}
          </span>
        );
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return '--';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="relative w-full h-full min-h-[95vh] flex flex-col bg-[#f8fafc] overflow-x-hidden rounded-3xl m-2 shadow-[inset_0_0_100px_rgba(0,0,0,0.02)] border border-white">
      
      {/* Background Decorativo Premium */}
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none fixed" />
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-400/20 blur-[140px] rounded-full mix-blend-multiply pointer-events-none animate-pulse-slow" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-400/20 blur-[140px] rounded-full mix-blend-multiply pointer-events-none animate-pulse-slow" />

      {/* Header Estilo UploadZone (Flotante y Espaciado) */}
      <header className="relative w-full pt-12 pb-8 px-6 lg:px-10 flex flex-col xl:flex-row items-center justify-between z-20 gap-8">
        <div className="flex items-center gap-4">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring" }}
            className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center shadow-md border border-emerald-100 shrink-0"
          >
            <Database className="w-8 h-8" />
          </motion.div>
          <div className="flex flex-col items-start">
            <motion.h1 
              initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: "easeOut" }}
              className="text-4xl md:text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 drop-shadow-sm flex items-center"
            >
              Bóveda Forense
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="text-slate-500 font-semibold tracking-wide mt-1 text-sm md:text-base uppercase"
            >
              Repositorio de Inteligencia y Auditorías
            </motion.p>
          </div>
        </div>

        {/* Buscador Interactivo (Cápsula Flotante) */}
        <motion.div 
          initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}
          className="relative w-full xl:w-[450px] group shrink-0"
        >
          <div className="absolute inset-0 bg-emerald-400/10 rounded-2xl blur-xl group-hover:bg-emerald-400/20 transition-all duration-500" />
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-emerald-600/70" />
            <input 
              type="text" 
              placeholder="Indagar por folio, nombre o archivo..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-6 py-4 bg-white/80 backdrop-blur-3xl border border-white/60 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all text-base md:text-lg font-bold text-slate-800 placeholder:font-normal placeholder:text-slate-400 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.05)]"
            />
          </div>
        </motion.div>
      </header>

      {/* Grid de Consultas */}
      <div className="flex-1 w-full px-6 lg:px-10 pb-10 z-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[50vh] gap-6">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-400 blur-xl opacity-20 animate-pulse rounded-full" />
              <Loader2 className="w-16 h-16 text-emerald-500 animate-spin relative z-10" />
            </div>
            <p className="text-slate-500 font-bold text-lg animate-pulse tracking-wide uppercase">Cargando Bóveda Central...</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-2xl mx-auto bg-white/50 backdrop-blur-xl rounded-[3rem] border-2 border-dashed border-slate-300 p-16 text-center flex flex-col items-center justify-center mt-10 shadow-sm"
          >
            <div className="bg-slate-100 p-6 rounded-full mb-6 shadow-inner">
              <FileArchive className="w-16 h-16 text-slate-400" />
            </div>
            <h3 className="text-3xl font-extrabold text-slate-800 mb-4 tracking-tight">Registro Vacío</h3>
            <p className="text-slate-500 text-lg font-medium leading-relaxed">
              {searchTerm 
                ? 'El motor de búsqueda no encontró coincidencias en la telemetría actual. Intenta con otros parámetros.' 
                : 'La bóveda forense está esperando tu primer análisis de inteligencia.'}
            </p>
          </motion.div>
        ) : (
          <>
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8"
            >
              {filteredHistory.map((record) => (
                <motion.div 
                  variants={itemVariants}
                  key={record.id} 
                  className="bg-white/70 backdrop-blur-3xl border border-white shadow-[0_15px_30px_-10px_rgba(0,0,0,0.05)] hover:shadow-[0_30px_60px_-15px_rgba(5,150,105,0.15)] rounded-[2rem] transition-all duration-300 flex flex-col overflow-hidden group hover:-translate-y-2 relative"
                >
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-200 to-slate-200 group-hover:from-emerald-400 group-hover:to-teal-400 transition-all duration-500" />
                  
                  <div className="p-8 border-b border-white/50 flex-1 relative z-10">
                    <div className="flex justify-between items-start mb-6 gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-extrabold text-xl text-slate-800 truncate tracking-tight mb-1" title={record.nombre_analisis}>
                          {record.nombre_analisis || "Sin título"}
                        </h3>
                        <p className="text-sm font-semibold text-slate-500 truncate flex items-center gap-2" title={record.archivo_origen}>
                          <FileText className="w-4 h-4 text-emerald-500" />
                          {record.archivo_origen}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {getStatusBadge(record.estado)}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-y-6 gap-x-4 mt-8 bg-slate-50/50 rounded-2xl p-4 border border-white shadow-inner">
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5"/> Fecha</p>
                        <p className="text-sm font-extrabold text-slate-700">
                          {record.hora_inicio ? new Date(record.hora_inicio).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '--'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> Hora</p>
                        <p className="text-sm font-extrabold text-slate-700">
                          {record.hora_inicio ? new Date(record.hora_inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--'}
                        </p>
                      </div>
                      <div className="col-span-2 border-t border-slate-200/60 pt-4 mt-1 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Key className="w-3.5 h-3.5"/> Contratos</p>
                          <p className="text-sm font-black text-emerald-600 bg-emerald-50 border border-emerald-100 w-max px-3 py-1 rounded-lg shadow-sm">
                            {record.cantidad_llaves} indexados
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Play className="w-3.5 h-3.5"/> Tiempo IA</p>
                          <p className="text-sm font-extrabold text-slate-700 mt-1">
                            {formatDuration(record.tiempo_respuesta)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white/80 p-5 flex gap-3 relative z-10 backdrop-blur-md">
                    <button
                      onClick={() => handleOpenFolder(record.id)}
                      title="Explorar Físico"
                      className="w-12 h-12 bg-slate-50 border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 rounded-2xl shadow-sm transition-all flex items-center justify-center shrink-0"
                    >
                      <FileArchive className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => {
                        setJobToDuplicate(record.id);
                        setNewJobName(`${record.nombre_analisis || "Análisis"} (V2)`);
                        setDuplicateModalOpen(true);
                      }}
                      title="Clonar Inteligencia"
                      className="w-12 h-12 bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 text-slate-600 rounded-2xl shadow-sm transition-all flex items-center justify-center shrink-0"
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => router.push(`/results?jobId=${record.id}`)}
                      className="flex-1 h-12 bg-slate-900 border border-transparent hover:bg-emerald-600 text-white font-bold rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 group-hover:shadow-emerald-500/25 active:scale-[0.98]"
                    >
                      Ingresar
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {history.length > 0 && history.length < total && !searchTerm && (
              <div className="mt-16 flex justify-center pb-12 z-10 relative">
                <button 
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-8 py-4 bg-white/80 backdrop-blur-xl border border-white text-slate-800 font-bold rounded-full shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] hover:shadow-[0_10px_40px_-10px_rgba(5,150,105,0.2)] hover:border-emerald-200 transition-all flex items-center gap-3 disabled:opacity-50 active:scale-95"
                >
                  {loadingMore ? (
                    <><Loader2 className="w-5 h-5 animate-spin text-emerald-500" /> Extrayendo más telemetría...</>
                  ) : (
                    <>
                      <Server className="w-5 h-5 text-emerald-500" />
                      Cargar Archivos Antiguos
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Modal Glassmorphism de Duplicación */}
      <AnimatePresence>
        {duplicateModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white/90 backdrop-blur-3xl rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-400 via-emerald-400 to-teal-500" />

              <div className="p-10 border-b border-slate-100">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-inner border border-blue-100">
                  <Copy className="w-8 h-8" />
                </div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tight">Clonar Bóveda</h2>
                <p className="text-base text-slate-500 mt-3 font-medium leading-relaxed">
                  Se creará un clon forense exacto (SnapShot) en la base de datos y se independizará la carpeta física de descargas de anexos.
                </p>
              </div>
              
              <form onSubmit={handleDuplicate} className="p-10 bg-slate-50/50">
                <div className="mb-8">
                  <label className="block text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider">
                    Asignación de Nueva Identidad
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newJobName}
                    onChange={(e) => setNewJobName(e.target.value)}
                    placeholder="Ej: Auditoría Revisión Final"
                    className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-slate-900 font-bold shadow-sm"
                  />
                </div>
                
                <div className="flex gap-4 justify-end">
                  <button
                    type="button"
                    onClick={() => setDuplicateModalOpen(false)}
                    disabled={duplicating}
                    className="px-6 py-3.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-all"
                  >
                    Abortar
                  </button>
                  <button
                    type="submit"
                    disabled={duplicating || !newJobName.trim()}
                    className="px-8 py-3.5 bg-gradient-to-r from-slate-900 to-slate-800 text-white font-bold hover:from-black hover:to-slate-900 rounded-xl shadow-xl shadow-slate-900/20 transition-all flex items-center gap-3 disabled:opacity-50 active:scale-95"
                  >
                    {duplicating ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Procesando Clon...</>
                    ) : (
                      <>
                        <Database className="w-5 h-5 text-emerald-400" />
                        Ejecutar Clonado
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
    </div>
  );
}
