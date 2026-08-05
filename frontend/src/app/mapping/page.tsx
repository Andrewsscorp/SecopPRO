'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFileStore } from '@/store/useFileStore';
import { useMappingStore } from '@/store/useMappingStore';
import ColumnMapper from '@/components/mapping/ColumnMapper';
import ConfigPanel from '@/components/mapping/ConfigPanel';
import StartButton from '@/components/mapping/StartButton';
import { Layers, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function MappingPage() {
  const router = useRouter();
  const { file } = useFileStore();
  const { setAnalysisConfig } = useMappingStore();
  
  const [mounted, setMounted] = useState(false);
  const [jobId, setJobId] = useState<string | undefined>(undefined);
  
  // Estados para el modal de Caché
  const [showCacheModal, setShowCacheModal] = useState(false);
  const [cacheStats, setCacheStats] = useState({ cached: 0, total: 0, cached_pdfs: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleStartAnalysis = async (name: string, date: string, runScraper: boolean) => {
    setAnalysisConfig(name, date, runScraper);
    
    if (!file) {
      toast.error('No hay archivo seleccionado');
      return;
    }

    try {
      const payload = useMappingStore.getState().getApiPayload();
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('payload', JSON.stringify(payload));

      // 1. Validar contra el Caché Global (SECOP Warehouse)
      const checkRes = await fetch('http://127.0.0.1:8000/api/check_cache', {
        method: 'POST',
        body: formData,
      });

      if (checkRes.ok) {
        const checkData = await checkRes.json();
        setCacheStats({ cached: checkData.cached_count || 0, total: checkData.total_count || 0, cached_pdfs: checkData.cached_pdfs_count || 0 });
        setShowCacheModal(true);
        return; // Pausamos ejecución hasta que el usuario decida
      }
      
      // Si no hay respuesta del check o es 0, ejecutamos con forceSecop = false
      executeAnalysis(false);

    } catch (err) {
      console.error(err);
      toast.error('Falló la validación con el backend de SecopPRO.');
    }
  };

  const executeAnalysis = async (forceSecop: boolean, pdfStrategy: string = 'scrape') => {
    setShowCacheModal(false);
    
    try {
      const payload = useMappingStore.getState().getApiPayload();
      // Inyectar bandera de decisión
      payload.forceSecop = forceSecop;
      payload.pdfStrategy = pdfStrategy;
      
      const formData = new FormData();
      formData.append('file', file!);
      formData.append('payload', JSON.stringify(payload));

      const res = await fetch('http://127.0.0.1:8000/api/start', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Error al iniciar el análisis en el servidor');
      }
      
      const data = await res.json();
      setJobId(data.job_id);
      
      toast.success('Análisis iniciado en 2do plano. Redirigiendo al Dashboard...', {
        description: 'Puedes trabajar mientras los PDFs se descargan.'
      });
      
      // Redirigir de inmediato
      setTimeout(() => {
        router.push(`/results?jobId=${data.job_id}&running=true`);
      }, 1000);
      
    } catch (err) {
      console.error(err);
      toast.error('Falló la conexión con el backend de SecopPRO.');
    }
  };

  if (!mounted) return <div className="p-8 flex justify-center items-center h-screen bg-[#f8fafc]">Cargando...</div>;

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      {/* Cabecera Premium */}
      <header className="bg-white border-b border-gray-100 py-4 px-8 sticky top-0 z-10 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <Layers className="w-8 h-8 text-emerald-600" />
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">SecopPRO</h1>
          </div>
          <div className="h-6 w-px bg-gray-200" />
          <button 
            onClick={() => router.push('/')}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Carga
          </button>
        </div>
        <StartButton onStartAnalysis={handleStartAnalysis} />
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 p-8 overflow-hidden">
        <div className="max-w-[1600px] mx-auto h-full flex flex-col">
          
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Mapeo de columnas a la API de SECOP</h2>
            <p className="text-gray-500 text-sm">Relaciona las columnas de tu archivo Excel con los campos disponibles en la API de SECOP.</p>
          </div>

          {!file ? (
            <div className="text-amber-600 bg-amber-50 p-6 rounded-xl border border-amber-100 max-w-2xl shadow-sm">
              <h3 className="font-bold mb-2">Archivo no detectado</h3>
              <p className="text-sm">El estado del archivo se ha perdido. Por favor, vuelve al inicio y carga tu archivo nuevamente.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_500px] gap-6 flex-1 min-h-[500px] h-[calc(100vh-180px)]">
              <ColumnMapper />
              <ConfigPanel />
            </div>
          )}
        </div>
      </main>

      {showCacheModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full text-center border border-white/20 animate-in zoom-in duration-300">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Registros Previos Encontrados</h3>
            <p className="mb-6 text-gray-600 text-sm leading-relaxed">
              Hemos detectado que <strong className="text-gray-900 text-base">{cacheStats.cached}</strong> de los <strong className="text-gray-900 text-base">{cacheStats.total}</strong> contratos ya han sido consultados anteriormente y se encuentran en nuestra base de datos unificada (Caché).
              {cacheStats.cached_pdfs > 0 && (
                <span className="block mt-2 text-indigo-600 font-medium">
                  Además, <strong className="text-indigo-800">{cacheStats.cached_pdfs}</strong> de estos contratos ya tienen sus PDFs guardados en la bóveda global.
                </span>
              )}
            </p>
            <div className="flex flex-col gap-3 justify-center mb-4">
              <button 
                onClick={() => executeAnalysis(false, 'copy')}
                className="w-full px-4 py-3.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98]"
              >
                Cargar Datos y Copiar PDFs (Súper Rápido)
              </button>
              <button 
                onClick={() => executeAnalysis(false, 'scrape')}
                className="w-full px-4 py-3.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.98]"
              >
                Cargar Datos y Re-descargar PDFs (Rápido)
              </button>
              <button 
                onClick={() => executeAnalysis(false, 'ignore')}
                className="w-full px-4 py-3.5 bg-slate-600 text-white rounded-xl font-semibold hover:bg-slate-700 shadow-lg shadow-slate-600/30 transition-all active:scale-[0.98]"
              >
                Solo Datos (Ignorar PDFs - Súper Rápido)
              </button>
              <button 
                onClick={() => executeAnalysis(true, 'ignore')}
                className="w-full px-4 py-3.5 bg-white border-2 border-amber-500 text-amber-600 rounded-xl font-semibold hover:bg-amber-50 transition-all active:scale-[0.98]"
              >
                Sobrescribir Datos desde SECOP (Ignorar PDFs)
              </button>
              <button 
                onClick={() => executeAnalysis(true, 'scrape')}
                className="w-full px-4 py-3.5 bg-white border-2 border-red-500 text-red-600 rounded-xl font-semibold hover:bg-red-50 transition-all active:scale-[0.98]"
              >
                Sobrescribir TODO desde SECOP (Lento)
              </button>
            </div>
            <button onClick={() => setShowCacheModal(false)} className="text-sm text-gray-400 hover:text-gray-600 underline">
              Cancelar Análisis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
