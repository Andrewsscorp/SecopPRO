import React, { useEffect } from 'react';
import { usePdfExporterStore } from './store';
import { SectionsControl } from './components/SectionsControl';
import { PageSettingsControl } from './components/PageSettingsControl';
import { WatermarkControl } from './components/WatermarkControl';
import { ReportInfoControl } from './components/ReportInfoControl';
import { PreviewPane } from './components/PreviewPane';
import { X, FileText } from 'lucide-react';

interface PdfExporterModalProps {
  jobId: string;
}

export const PdfExporterModal: React.FC<PdfExporterModalProps> = ({ jobId }) => {
  const { isOpen, setIsOpen } = usePdfExporterStore();

  // Cerrar al presionar Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      
      {/* Contenedor Principal Glassmorphism */}
      <div 
        className="w-full max-w-[1400px] h-full max-h-[900px] bg-white/95 backdrop-blur-xl border border-white/40 shadow-2xl rounded-2xl flex flex-col overflow-hidden relative animate-in slide-in-from-bottom-4 duration-300"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.5) inset'
        }}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg text-red-500">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Exportar Reporte a PDF</h2>
              <p className="text-xs text-slate-500">Personaliza el contenido y diseño de tu reporte PDF</p>
            </div>
          </div>
          
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo Dividido en 2 Columnas */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Panel Izquierdo: Controles */}
          <div className="w-[450px] border-r border-slate-200 flex flex-col bg-white">
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <SectionsControl jobId={jobId} />
              <div className="w-full h-px bg-slate-100 my-6" />
              <PageSettingsControl />
              <div className="w-full h-px bg-slate-100 my-6" />
              <WatermarkControl />
              <div className="w-full h-px bg-slate-100 my-6" />
              <ReportInfoControl />
            </div>
            
            {/* Footer de Acciones Panel Izquierdo */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-4">
              <button 
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 bg-white rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button 
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
              >
                <span>Generar PDF</span>
                <FileText className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Panel Derecho: Vista Previa */}
          <div className="flex-1 bg-slate-50 p-6 overflow-hidden">
            <PreviewPane />
          </div>

        </div>
      </div>
    </div>
  );
};
