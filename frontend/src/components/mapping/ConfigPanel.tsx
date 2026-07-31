import { Info, Search, CheckSquare, Square } from 'lucide-react';
import { useMappingStore } from '@/store/useMappingStore';

const TOGGLES = [
  { id: 'infoBasica', label: 'Información básica', tooltip: 'Endpoints: /detalle. Extrae: id_contrato, valor_total, estado_actual, fecha_firma.' },
  { id: 'contratista', label: 'Contratista', tooltip: 'Endpoints: /terceros. Extrae: NIT, razon_social, representante_legal.' },
  { id: 'documentos', label: 'Documentos del proceso', tooltip: 'Descarga archivos físicos: pliegos (.pdf), estudios_previos (.docx), resoluciones.' },
  { id: 'garantias', label: 'Garantías y pólizas', tooltip: 'Descarga y analiza por OCR: poliza_cumplimiento, aseguradora, vigencia.' },
  { id: 'ejecucion', label: 'Ejecución del contrato', tooltip: 'Endpoints: /modificaciones, /suspensiones. Extrae: prorrogas, adiciones_valor.' },
  { id: 'pagos', label: 'Pagos y actas', tooltip: 'Extrae: historial_pagos, saldo_pendiente, actas_recibo_satisfaccion.' },
  { id: 'supervisor', label: 'Supervisor', tooltip: 'Extrae: nombre_supervisor, cedula, dependencia, correo_institucional.' },
  { id: 'licitaciones', label: 'Licitaciones', tooltip: 'Endpoints: /ofertas. Extrae: proponentes_rechazados, puntajes_evaluacion.' },
] as const;

export default function ConfigPanel() {
  const { configToggles, toggleConfig, toggleAllConfig, ocrSearchTerm, setOcrSearchTerm } = useMappingStore();

  const allChecked = Object.values(configToggles).every(Boolean);

  return (
    <div className="space-y-6 flex flex-col h-full">
      {/* Toggles Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex-1">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-gray-900">Descargar información adicional</h3>
          <button 
            onClick={() => toggleAllConfig(!allChecked)}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-md transition-colors"
          >
            {allChecked ? <Square className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
            {allChecked ? 'Desmarcar todo' : 'Marcar todo'}
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-6 mt-1">Selecciona los datos que deseas obtener según las columnas.</p>
        
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-4 gap-y-4">
          {TOGGLES.map(toggle => (
            <label key={toggle.id} className="flex items-center gap-3 cursor-pointer group/label relative">
              <div className="relative flex items-center justify-center">
                <input 
                  type="checkbox" 
                  checked={configToggles[toggle.id as keyof typeof configToggles]}
                  onChange={() => toggleConfig(toggle.id as keyof typeof configToggles)}
                  className="peer sr-only"
                />
                <div className="w-5 h-5 border-2 border-gray-300 rounded bg-white peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-colors flex items-center justify-center" />
                <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1 flex items-center gap-2 group">
                <span className="text-sm font-semibold text-gray-800">{toggle.label}</span>
                <div className="relative flex items-center">
                  <Info className="w-4 h-4 text-gray-400 group-hover:text-emerald-500 transition-colors cursor-help" />
                  
                  {/* Tooltip Nativo de Tailwind */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-200 z-50">
                    <div className="bg-gray-800 text-xs text-gray-200 p-2.5 rounded shadow-lg relative font-mono leading-relaxed">
                      {toggle.tooltip}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                    </div>
                  </div>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* OCR Search Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Búsqueda OCR en Documentos</h3>
        <p className="text-sm text-gray-500 mb-4">Escribe una palabra clave para buscar en todos los PDF.</p>
        
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={ocrSearchTerm}
            onChange={(e) => setOcrSearchTerm(e.target.value)}
            className="block w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
            placeholder="Ej: póliza, acta, multa..."
          />
        </div>

        <div className="bg-[#f0f7ff] border border-[#e0f0ff] rounded-xl p-3.5 flex gap-3 items-start">
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 leading-relaxed font-medium">
            El motor extraerá el contenido y usará Fuzzy Matching para encontrar coincidencias incluso si hay errores de escaneo.
          </p>
        </div>
      </div>
    </div>
  );
}
