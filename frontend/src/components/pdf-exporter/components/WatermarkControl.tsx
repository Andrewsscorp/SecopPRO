import React from 'react';
import { usePdfExporterStore } from '../store';

export const WatermarkControl: React.FC = () => {
  const { watermark, setWatermark } = usePdfExporterStore();

  const handlePositionClick = (pos: string) => {
    setWatermark({ position: pos });
  };

  const positions = [
    'top-left', 'top-center', 'top-right',
    'center-left', 'center', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right'
  ];

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-800">3. Marca de agua</h3>
        <button
          onClick={() => setWatermark({ enabled: !watermark.enabled })}
          className={`w-8 h-4.5 rounded-full relative transition-colors ${watermark.enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
        >
          <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform shadow-sm ${watermark.enabled ? 'left-[16px]' : 'left-0.5'}`} />
        </button>
      </div>

      <div className={`transition-opacity duration-200 ${!watermark.enabled ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-xs text-slate-500 mb-1.5">Texto de la marca de agua</label>
            <input 
              type="text" 
              value={watermark.text}
              onChange={(e) => setWatermark({ text: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-md py-1.5 px-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
          
          <div className="w-20">
            <label className="block text-xs text-slate-500 mb-1.5">Opacidad</label>
            <div className="relative">
              <input 
                type="number" 
                min="0" max="100"
                value={watermark.opacity}
                onChange={(e) => setWatermark({ opacity: Number(e.target.value) })}
                className="w-full text-sm border border-slate-200 rounded-md py-1.5 pl-2 pr-6 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
              <span className="absolute right-2 top-1.5 text-xs text-slate-400">%</span>
            </div>
          </div>

          <div className="w-16">
            <label className="block text-xs text-slate-500 mb-1.5">Tamaño</label>
            <input 
              type="number" 
              value={watermark.size}
              onChange={(e) => setWatermark({ size: Number(e.target.value) })}
              className="w-full text-sm border border-slate-200 rounded-md py-1.5 px-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
          
          <div className="w-24">
            <label className="block text-xs text-slate-500 mb-1.5">Rotación</label>
            <select 
              value={watermark.rotation}
              onChange={(e) => setWatermark({ rotation: e.target.value })}
              className="w-full text-sm border border-slate-200 rounded-md py-1.5 px-2 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            >
              <option value="0°">0°</option>
              <option value="45°">45°</option>
              <option value="90°">90°</option>
              <option value="-45°">-45°</option>
            </select>
          </div>
        </div>

        <div className="flex gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1.5">Color</label>
            <div className="flex gap-2">
              <input 
                type="color" 
                value={watermark.color}
                onChange={(e) => setWatermark({ color: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border border-slate-200 p-0"
              />
              <div 
                className="w-16 h-8 rounded border border-slate-200 flex items-center justify-center text-xs font-mono text-slate-600 bg-slate-50"
              >
                {watermark.color.toUpperCase()}
              </div>
            </div>
          </div>
          
          <div className="ml-auto">
             <label className="block text-xs text-slate-500 mb-1.5">Posición</label>
             <div className="grid grid-cols-3 gap-1 w-[60px] h-[60px] border border-slate-200 p-1 rounded bg-slate-50">
               {positions.map((pos) => (
                 <button
                   key={pos}
                   onClick={() => handlePositionClick(pos)}
                   className={`w-full h-full rounded-sm border transition-colors ${watermark.position === pos ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-slate-200 hover:bg-slate-100'}`}
                   aria-label={`Position ${pos}`}
                 />
               ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
