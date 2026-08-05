import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Minus, XCircle } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { useDashboardStore } from '../../store/useDashboardStore';
import MiniProgressWidget from './MiniProgressWidget';

interface HackerOverlayProps {
  jobId?: string;
  onComplete: () => void;
  onCancel?: () => void;
}

export default function HackerOverlay({ jobId, onComplete, onCancel }: HackerOverlayProps) {
  const [logs, setLogs] = useState<string[]>(['[SISTEMA] Estableciendo conexión segura SSE...']);
  const [progress, setProgress] = useState(0);
  const [hasError, setHasError] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  const isMinimized = useDashboardStore(state => state.isMinimized);
  const toggleMinimize = useDashboardStore(state => state.toggleMinimize);
  const setPdfProgress = useDashboardStore(state => state.setPdfProgress);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, isMinimized]);

  useEffect(() => {
    if (!jobId) {
      setLogs(prev => [...prev, '[ADVERTENCIA] No se recibió Job ID.']);
      return;
    }

    const sseUrl = `http://127.0.0.1:8000/api/stream/${jobId}`;
    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.message) {
          setLogs(prev => [...prev, data.message]);
          
          // Parseo inteligente de logs para progreso de PDFs
          const match = data.message.match(/Descargando (?:documento|alternativo) (\d+) de (\d+)/i);
          if (match) {
            setPdfProgress(parseInt(match[1], 10), parseInt(match[2], 10));
          }
        }
        
        if (typeof data.progress === 'number') {
          setProgress(data.progress);
        }

        if (data.type === 'done' || data.type === 'complete') {
          eventSource.close();
        }

        if (data.type === 'error') {
          eventSource.close();
          setLogs(prev => [...prev, `[ERROR CRÍTICO] ${data.message || 'Error desconocido'}`]);
          setHasError(true);
        }
      } catch (err) {
        console.error("Error parseando evento SSE", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource falló", err);
      eventSource.close();
      setLogs(prev => [...prev, '[ERROR] Se perdió la conexión con el motor backend o el trabajo no existe (Posible reinicio del servidor).']);
      setHasError(true);
    };

    return () => {
      eventSource.close();
    };
  }, [jobId, setPdfProgress]);

  const handleCancel = async () => {
    if (progress >= 100) {
      onComplete();
      return;
    }
    if (!jobId) return;
    try {
      await fetch(`http://127.0.0.1:8000/api/cancel/${jobId}`, { method: 'POST' });
      setLogs(prev => [...prev, '[SISTEMA] Enviando señal de aborto al motor (Cancelando vía SIGTERM PID)...']);
      
      // Esperar un instante para que el backend mate el proceso
      setTimeout(() => {
        if (onCancel) onCancel();
        else onComplete();
      }, 1000);
    } catch (e) {
      console.error("Error cancelando el trabajo", e);
    }
  };

  const estimatedTime = Math.max(0, 90 - Math.floor(progress * 0.9));
  const minutes = Math.floor(estimatedTime / 60).toString().padStart(2, '0');
  const seconds = (estimatedTime % 60).toString().padStart(2, '0');

  return (
    <>
      <AnimatePresence>
        {!isMinimized && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="w-full max-w-3xl bg-[#0d1117] border border-gray-800 rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="bg-[#161b22] px-4 py-3 flex items-center justify-between border-b border-gray-800">
                <div className="flex items-center">
                  <Terminal className="w-5 h-5 text-emerald-500 mr-3" />
                  <span className="text-gray-300 font-mono text-sm tracking-wide">SecopPRO - Celery Worker Terminal {jobId ? `(Job: ${jobId.split('-')[0]})` : ''}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button onClick={toggleMinimize} className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors" title="Minimizar a Widget">
                    <Minus className="w-4 h-4" />
                  </button>
                  <button onClick={handleCancel} className="text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors" title="Cancelar Proceso">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="p-6 font-mono text-xs sm:text-sm text-emerald-400 space-y-2 h-72 flex flex-col overflow-y-auto custom-scrollbar">
                {logs.map((log, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {log}
                  </motion.div>
                ))}
                <div className="animate-pulse mt-auto">_</div>
                <div ref={logsEndRef} />
              </div>

              <div className="px-6 pb-6 pt-4 border-t border-gray-800/50 bg-[#0d1117]">
                <div className="flex justify-between text-xs text-gray-400 font-mono mb-2">
                  <span>Progreso General (Extracción y OCR)</span>
                  <span className="text-emerald-400 font-bold">{progress.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-gray-900 rounded-full h-3 mb-3 border border-gray-800">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300 ease-out relative" 
                    style={{ width: `${progress}%` }}
                  >
                    <div className="absolute top-0 bottom-0 left-0 right-0 bg-white/20 animate-pulse rounded-full"></div>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-gray-500 text-xs font-mono">
                    Tiempo estimado restante: <span className="text-gray-400">{minutes}:{seconds}</span>
                  </p>
                  { (progress >= 100 || hasError) && (
                    <button 
                      onClick={onComplete}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-1.5 rounded-md font-mono transition-colors shadow-lg shadow-emerald-900/20 border border-emerald-500/50"
                    >
                      Cerrar Consola
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMinimized && (
          <MiniProgressWidget jobId={jobId} onCancel={handleCancel} />
        )}
      </AnimatePresence>
    </>
  );
}
