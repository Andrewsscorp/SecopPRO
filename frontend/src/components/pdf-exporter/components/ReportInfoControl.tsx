import React from 'react';
import { usePdfExporterStore } from '../store';

export const ReportInfoControl: React.FC = () => {
  const { reportInfo, setReportInfo } = usePdfExporterStore();

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">4. Información del reporte</h3>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Título del reporte</label>
          <input 
            type="text" 
            value={reportInfo.title}
            onChange={(e) => setReportInfo({ title: e.target.value })}
            className="w-full text-sm border border-slate-200 rounded-md py-1.5 px-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>
        
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Subtítulo (opcional)</label>
          <input 
            type="text" 
            value={reportInfo.subtitle}
            onChange={(e) => setReportInfo({ subtitle: e.target.value })}
            className="w-full text-sm border border-slate-200 rounded-md py-1.5 px-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Fecha del reporte</label>
          <div className="relative">
            <input 
              type="text" 
              value={reportInfo.date}
              onChange={(e) => setReportInfo({ date: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-md py-1.5 px-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            {/* Si quisieras un icono de calendario podrías ponerlo aquí absoluto */}
          </div>
        </div>
        
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Preparado por</label>
          <input 
            type="text" 
            value={reportInfo.preparedBy}
            onChange={(e) => setReportInfo({ preparedBy: e.target.value })}
            className="w-full text-sm border border-slate-200 rounded-md py-1.5 px-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>
      </div>
    </div>
  );
};
