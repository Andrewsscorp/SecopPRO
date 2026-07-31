import { useState } from 'react';
import { Play, X } from 'lucide-react';
import { useMappingStore } from '@/store/useMappingStore';
import { toast } from 'sonner';

interface StartButtonProps {
  onStartAnalysis: (name: string, date: string) => void;
}

export default function StartButton({ onStartAnalysis }: StartButtonProps) {
  const { mappedColumns } = useMappingStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [analysisName, setAnalysisName] = useState('');
  const [cutOffDate, setCutOffDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

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
    onStartAnalysis(analysisName, cutOffDate);
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-8 w-full max-w-md mx-4 relative animate-in fade-in zoom-in duration-200">
            
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-gray-900 mb-1">Configuración del Análisis</h3>
            <p className="text-sm text-gray-500 mb-6">Asigna un nombre y fecha de corte para estructurar los resultados de esta auditoría en la Base de Datos.</p>
            
            <div className="space-y-5 mb-8">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nombre del Análisis</label>
                <input 
                  type="text" 
                  value={analysisName}
                  onChange={e => setAnalysisName(e.target.value)}
                  placeholder="Ej. Auditoria_Alcaldia_Q2"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all bg-gray-50 hover:bg-white focus:bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Fecha de Corte</label>
                <input 
                  type="date" 
                  value={cutOffDate}
                  onChange={e => setCutOffDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all bg-gray-50 hover:bg-white focus:bg-white text-gray-700"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirm}
                className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 shadow-sm transition-colors"
              >
                Confirmar e Iniciar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
