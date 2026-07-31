import { useState } from 'react';
import { Play, X, Bot, Zap } from 'lucide-react';
import { useMappingStore } from '@/store/useMappingStore';
import { toast } from 'sonner';

interface StartButtonProps {
  onStartAnalysis: (name: string, date: string, runScraper: boolean) => void;
}

export default function StartButton({ onStartAnalysis }: StartButtonProps) {
  const { mappedColumns } = useMappingStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [analysisName, setAnalysisName] = useState('');
  const [cutOffDate, setCutOffDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  
  // Nuevo estado para el toggle del scraper
  const [runScraper, setRunScraper] = useState(true);

  const handleInitialClick = () => {
    const hasKey = mappedColumns.some(c => c.isKey);
    if (!hasKey) {
      toast.error('Debes seleccionar al menos una columna de tu Excel como "Llave" principal.', {
        description: 'Usa el botón circular de la derecha en las columnas mapeadas.'
      });
      return;
    }
    setIsModalOpen(true);
  };

  const handleConfirm = () => {
    if (!analysisName.trim() || !cutOffDate) {
      toast.error('Todos los campos son obligatorios.');
      return;
    }
    setIsModalOpen(false);
    onStartAnalysis(analysisName, cutOffDate, runScraper);
  };

  return (
    <>
      <button 
        onClick={handleInitialClick}
        className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold shadow-md hover:bg-emerald-700 transition-colors flex items-center gap-2"
      >
        <Play className="w-4 h-4 fill-current" />
        Iniciar análisis
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 w-full max-w-lg mx-4 relative animate-in fade-in zoom-in duration-300">
            
            <button onClick={() => setIsModalOpen(false)} className="absolute top-5 right-5 text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-full p-1.5 transition-colors">
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-2xl font-bold text-gray-900 mb-2">Configuración Final</h3>
            <p className="text-sm text-gray-600 mb-6">Asigna los parámetros para la auditoría y elige la profundidad del motor de IA.</p>
            
            <div className="space-y-5 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nombre del Análisis</label>
                <input 
                  type="text" 
                  value={analysisName}
                  onChange={e => setAnalysisName(e.target.value)}
                  placeholder="Ej. Auditoria_Alcaldia_Q2"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-gray-50/50 hover:bg-white focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Fecha de Corte</label>
                <input 
                  type="date" 
                  value={cutOffDate}
                  onChange={e => setCutOffDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all bg-gray-50/50 hover:bg-white focus:bg-white text-gray-700"
                />
              </div>
            </div>

            {/* Toggle Glassmorphism Elegante */}
            <div 
              onClick={() => setRunScraper(!runScraper)}
              className={`mb-8 p-4 rounded-2xl cursor-pointer transition-all duration-300 border ${
                runScraper 
                  ? 'bg-emerald-50 border-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {runScraper ? <Bot className="w-5 h-5 text-emerald-600" /> : <Zap className="w-5 h-5 text-amber-500" />}
                  <span className={`font-bold ${runScraper ? 'text-emerald-800' : 'text-gray-700'}`}>
                    {runScraper ? 'Extracción Profunda Activada' : 'Análisis Rápido (Solo Datos)'}
                  </span>
                </div>
                {/* Switch visual */}
                <div className={`w-11 h-6 rounded-full p-1 transition-colors ${runScraper ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${runScraper ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </div>
              <p className={`text-xs leading-relaxed ${runScraper ? 'text-emerald-700/80' : 'text-gray-500'}`}>
                {runScraper 
                  ? 'El robot descargará físicamente los PDFs de SECOP y utilizará Visión Artificial (OCR) para buscar pólizas. Este proceso tomará más tiempo pero extraerá toda la verdad.' 
                  : 'Se saltará la descarga de PDFs y solo cruzará los metadatos oficiales de Socrata. Proceso ultrarrápido (segundos) pero sin lectura de documentos físicos.'}
              </p>
            </div>

            <div className="flex gap-3 mt-4">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-3.5 border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirm}
                className="flex-1 px-4 py-3.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.98]"
              >
                Lanzar Auditoría
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
