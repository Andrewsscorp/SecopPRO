'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFileStore } from '@/store/useFileStore';
import { useMappingStore } from '@/store/useMappingStore';
import ColumnMapper from '@/components/mapping/ColumnMapper';
import ConfigPanel from '@/components/mapping/ConfigPanel';
import StartButton from '@/components/mapping/StartButton';
import HackerOverlay from '@/components/loading/HackerOverlay';
import { Layers, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function MappingPage() {
  const router = useRouter();
  const { file } = useFileStore();
  const { setAnalysisConfig } = useMappingStore();
  
  const [mounted, setMounted] = useState(false);
  const [showHackerOverlay, setShowHackerOverlay] = useState(false);
  const [jobId, setJobId] = useState<string | undefined>(undefined);

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
      // getApiPayload should be fetched from the store via useMappingStore.getState()
      // to guarantee we have the latest payload without triggering re-renders everywhere.
      const payload = useMappingStore.getState().getApiPayload();
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('payload', JSON.stringify(payload));

      const res = await fetch('http://localhost:8000/api/start', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Error al iniciar el análisis en el servidor');
      }
      
      const data = await res.json();
      setJobId(data.job_id);
      setShowHackerOverlay(true);
    } catch (err) {
      console.error(err);
      toast.error('Falló la conexión con el backend de SecopPRO.');
    }
  };

  const handleAnalysisComplete = () => {
    setShowHackerOverlay(false);
    toast.success('Análisis completado. Redirigiendo a resultados...', {
      description: 'El backend notificó el fin del procesamiento.'
    });
    // Redirigir a la vista previa de datos reales
    setTimeout(() => {
      router.push(`/results?jobId=${jobId}`);
    }, 1000);
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

      {showHackerOverlay && <HackerOverlay jobId={jobId} onComplete={handleAnalysisComplete} />}
    </div>
  );
}
