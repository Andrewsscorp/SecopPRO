import { motion } from 'framer-motion';
import { useDashboardStore } from '../../store/useDashboardStore';
import { Terminal, X } from 'lucide-react';

interface MiniProgressWidgetProps {
  jobId?: string;
  onCancel: () => void;
}

export default function MiniProgressWidget({ jobId, onCancel }: MiniProgressWidgetProps) {
  const currentPdf = useDashboardStore(state => state.currentPdf);
  const totalPdfs = useDashboardStore(state => state.totalPdfs);
  const toggleMinimize = useDashboardStore(state => state.toggleMinimize);

  const progressPercent = totalPdfs > 0 ? (currentPdf / totalPdfs) * 100 : 0;

  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar que el clic se propague al contenedor padre y abra el modal
    onCancel();
    // Si cancela, también des-minimizamos para que vea los logs finales
    toggleMinimize();
  };

  return (
    <motion.div 
      initial={{ y: 50, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 50, opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      whileHover={{ scale: 1.05 }}
      onClick={toggleMinimize}
      className="fixed bottom-6 right-6 z-50 bg-[#0d1117]/90 backdrop-blur border border-emerald-500/30 rounded-lg p-4 shadow-2xl cursor-pointer flex flex-col min-w-[240px]"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <Terminal className="w-4 h-4 text-emerald-500 mr-2" />
          <span className="text-gray-300 font-mono text-xs font-semibold">Extrayendo SECOP...</span>
        </div>
        
        {/* Punto verde animado */}
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
          <button 
            onClick={handleCancelClick}
            className="text-red-500 hover:text-red-400 p-0.5 rounded-full hover:bg-red-500/10 transition-colors"
            title="Cancelar Proceso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      <div className="flex justify-between items-end mb-1">
        <span className="text-gray-500 text-[10px] uppercase tracking-wider font-bold">Progreso PDFs</span>
        <span className="text-emerald-400 font-mono text-sm">{currentPdf} <span className="text-gray-600">/</span> {totalPdfs}</span>
      </div>
      
      <div className="w-full bg-gray-900 rounded-full h-1.5 border border-gray-800 overflow-hidden">
        <div 
          className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full transition-all duration-300 ease-out" 
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </motion.div>
  );
}
