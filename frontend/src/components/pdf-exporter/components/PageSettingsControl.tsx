import React from 'react';
import { usePdfExporterStore } from '../store';

export const PageSettingsControl: React.FC = () => {
  const { 
    pageSize, setPageSize, 
    orientation, setOrientation, 
    margins, setMargins, 
    quality, setQuality, 
    includePageNumber, setIncludePageNumber, 
    includeTOC, setIncludeTOC 
  } = usePdfExporterStore();

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">2. Configuración del PDF</h3>
      
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Tamaño de página */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Tamaño de página</label>
          <select 
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-md py-1.5 px-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          >
            <option>A4 (210 x 297 mm)</option>
            <option>Carta (216 x 279 mm)</option>
            <option>Legal (216 x 356 mm)</option>
          </select>
        </div>

        {/* Orientación */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Orientación</label>
          <div className="flex bg-slate-100 p-0.5 rounded-md border border-slate-200">
            <button
              onClick={() => setOrientation('Vertical')}
              className={`flex-1 text-xs py-1 rounded-sm transition-colors ${
                orientation === 'Vertical' ? 'bg-white text-emerald-600 shadow-sm font-medium border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Vertical
            </button>
            <button
              onClick={() => setOrientation('Horizontal')}
              className={`flex-1 text-xs py-1 rounded-sm transition-colors ${
                orientation === 'Horizontal' ? 'bg-white text-emerald-600 shadow-sm font-medium border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Horizontal
            </button>
          </div>
        </div>

        {/* Márgenes */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Márgenes</label>
          <select 
            value={margins}
            onChange={(e) => setMargins(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-md py-1.5 px-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          >
            <option>Estándar</option>
            <option>Estrechos</option>
            <option>Ninguno</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Calidad */}
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Calidad de imagen</label>
          <select 
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-md py-1.5 px-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          >
            <option>Alta (300 DPI)</option>
            <option>Media (150 DPI)</option>
            <option>Baja (72 DPI)</option>
          </select>
        </div>

        {/* Toggles */}
        <div className="col-span-2 flex flex-col justify-center gap-3 pl-4">
          <div className="flex items-center justify-between max-w-[200px]">
            <span className="text-xs text-slate-600">Incluir número de página</span>
            <button
              onClick={() => setIncludePageNumber(!includePageNumber)}
              className={`w-8 h-4.5 rounded-full relative transition-colors ${includePageNumber ? 'bg-emerald-500' : 'bg-slate-200'}`}
            >
              <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform shadow-sm ${includePageNumber ? 'left-[16px]' : 'left-0.5'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between max-w-[200px]">
            <span className="text-xs text-slate-600">Incluir tabla de contenido</span>
            <button
              onClick={() => setIncludeTOC(!includeTOC)}
              className={`w-8 h-4.5 rounded-full relative transition-colors ${includeTOC ? 'bg-emerald-500' : 'bg-slate-200'}`}
            >
              <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform shadow-sm ${includeTOC ? 'left-[16px]' : 'left-0.5'}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
