'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  FileText, Search, Clock, Calendar, 
  Play, CheckCircle, AlertTriangle, 
  Loader2, Key, ChevronRight, FileArchive, Copy
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
  const LIMIT = 10;

  useEffect(() => {
    fetchHistory(0);
  }, []);

  const fetchHistory = async (currentOffset: number = 0) => {
    if (currentOffset === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await fetch(`http://localhost:8000/api/dashboard/history?limit=${LIMIT}&offset=${currentOffset}`);
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
      await fetch('http://localhost:8000/api/dashboard/open-folder', {
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
    const toastId = toast.loading('Duplicando análisis...');
    
    try {
      const res = await fetch('http://localhost:8000/api/dashboard/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: jobToDuplicate, newName: newJobName.trim() })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        toast.success('Análisis duplicado exitosamente', { id: toastId });
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
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle className="w-3.5 h-3.5" /> Completado</span>;
      case 'Procesando':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando</span>;
      case 'Error':
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200"><AlertTriangle className="w-3.5 h-3.5" /> Error</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">{estado}</span>;
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
    <div className="w-full h-full flex flex-col bg-slate-50 min-h-screen">
      <div className="bg-white border-b border-gray-200 px-8 py-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <FileText className="w-8 h-8 text-emerald-600" />
              Historial de Consultas
            </h1>
            <p className="mt-2 text-gray-500 max-w-2xl">
              Aquí encontrarás todas las auditorías y análisis masivos que has realizado. 
              El sistema guarda automáticamente toda la información en la base de datos local.
            </p>
          </div>
          
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar por nombre o archivo origen..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm font-medium"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-gray-500 font-medium">Cargando historial de base de datos...</p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center flex flex-col items-center justify-center">
              <div className="bg-gray-50 p-4 rounded-full mb-4">
                <FileArchive className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">No se encontraron consultas</h3>
              <p className="text-gray-500 max-w-md">
                {searchTerm ? 'Ningún análisis coincide con tu búsqueda. Intenta con otros términos.' : 'Aún no has realizado ninguna auditoría masiva en el sistema.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredHistory.map((record) => (
                <div 
                  key={record.id} 
                  className="bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md hover:border-emerald-200 transition-all duration-200 flex flex-col overflow-hidden group"
                >
                  <div className="p-6 border-b border-gray-100 flex-1">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1 min-w-0 pr-4">
                        <h3 className="font-bold text-lg text-gray-900 truncate" title={record.nombre_analisis}>
                          {record.nombre_analisis || "Sin título"}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1 truncate flex items-center gap-1.5" title={record.archivo_origen}>
                          <FileText className="w-3.5 h-3.5" />
                          {record.archivo_origen}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {getStatusBadge(record.estado)}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-y-4 gap-x-2 mt-6">
                      <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1 flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/> Fecha</p>
                        <p className="text-sm font-semibold text-gray-800">
                          {record.hora_inicio ? new Date(record.hora_inicio).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '--'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> Hora</p>
                        <p className="text-sm font-semibold text-gray-800">
                          {record.hora_inicio ? new Date(record.hora_inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1 flex items-center gap-1"><Key className="w-3.5 h-3.5"/> Llaves</p>
                        <p className="text-sm font-semibold text-emerald-700 bg-emerald-50 w-max px-2 py-0.5 rounded">
                          {record.cantidad_llaves} extraídas
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1 flex items-center gap-1"><Play className="w-3.5 h-3.5"/> Duración</p>
                        <p className="text-sm font-semibold text-gray-800">
                          {formatDuration(record.tiempo_respuesta)}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50/50 p-4 flex gap-2">
                    <button
                      onClick={() => handleOpenFolder(record.id)}
                      title="Abrir carpeta local"
                      className="p-2.5 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-100 text-gray-600 rounded-xl shadow-sm transition-all flex items-center justify-center shrink-0"
                    >
                      <FileArchive className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => {
                        setJobToDuplicate(record.id);
                        setNewJobName(`${record.nombre_analisis || "Análisis"} (Copia)`);
                        setDuplicateModalOpen(true);
                      }}
                      title="Duplicar análisis"
                      className="p-2.5 bg-white border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 text-gray-600 rounded-xl shadow-sm transition-all flex items-center justify-center shrink-0"
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => router.push(`/results?jobId=${record.id}`)}
                      className="flex-1 py-2.5 px-4 bg-white border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 text-gray-700 font-semibold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600"
                    >
                      Ir a la Consulta
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {history.length > 0 && history.length < total && !searchTerm && (
            <div className="mt-10 flex justify-center pb-8">
              <button 
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-full shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {loadingMore ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Cargando más...</>
                ) : (
                  'Mostrar más consultas'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Modal de Duplicación */}
      {duplicateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-200">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-900">Duplicar Análisis</h2>
              <p className="text-sm text-gray-500 mt-1">
                Se creará una copia exacta independiente en la base de datos y se clonará la carpeta física de descargas.
              </p>
            </div>
            
            <form onSubmit={handleDuplicate} className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nuevo nombre del análisis
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                  placeholder="Ej: Auditoría Modificada"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-gray-900 font-medium"
                />
              </div>
              
              <div className="flex gap-3 justify-end mt-8">
                <button
                  type="button"
                  onClick={() => setDuplicateModalOpen(false)}
                  disabled={duplicating}
                  className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={duplicating || !newJobName.trim()}
                  className="px-6 py-2 bg-emerald-600 text-white font-medium hover:bg-emerald-700 rounded-xl shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {duplicating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Duplicando...</>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Crear Duplicado
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
    </div>
  );
}
