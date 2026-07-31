import { useEffect, useState } from 'react';
import { FileSpreadsheet, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';
import { useMappingStore, MappedColumn } from '@/store/useMappingStore';
import { useFileStore } from '@/store/useFileStore';

const SECOP_FIELDS = [
  'Número de contrato',
  'Objeto del contrato',
  'Entidad - Nombre',
  'Contratista - Nombre',
  'Valor del contrato',
  'Fecha de firma',
  'Fecha de inicio',
  'Fecha de terminación',
  'Estado del contrato',
  'Modalidad de selección'
];

const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const suggestField = (excelCol: string) => {
  const normCol = normalize(excelCol);
  for (const field of SECOP_FIELDS) {
    const normField = normalize(field);
    if (normCol.includes(normField.split(' ')[0]) || normField.includes(normCol) || normCol === normField) {
      return field;
    }
  }
  return null;
};

export default function ColumnMapper() {
  const { columns } = useFileStore();
  const { mappedColumns, setMappedColumns, updateColumnMapping, setKeyColumn, clearAllMappings } = useMappingStore();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (columns.length > 0 && !isInitialized) {
      const initialMapping: MappedColumn[] = columns.map(col => {
        const suggestion = suggestField(col);
        const isValid = !!suggestion;
        return {
          excelCol: col,
          secopField: suggestion,
          isValid,
          isKey: suggestion === 'Número de contrato'
        };
      });

      // Asegurarnos que solo haya máximo 1 llave por defecto
      let foundKey = false;
      const initialFixed = initialMapping.map(c => {
        if (c.isKey) {
          if (foundKey) return { ...c, isKey: false };
          foundKey = true;
          return c;
        }
        return c;
      });

      setMappedColumns(initialFixed);
      setIsInitialized(true);
    }
  }, [columns, isInitialized, setMappedColumns]);

  const mappedCount = mappedColumns.filter(c => c.isValid).length;
  const isAllMapped = mappedCount === columns.length && columns.length > 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 px-2">
        <h3 className="text-lg font-bold text-gray-900">Campos del Archivo</h3>
        <button 
          onClick={clearAllMappings}
          className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-md transition-colors"
          title="Desmarcar y limpiar todos los campos mapeados"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Limpiar todo
        </button>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-4 text-xs font-semibold text-gray-500 mb-4 px-2 uppercase tracking-wider">
        <span>Columnas de tu archivo Excel</span>
        <span className="w-4"></span>
        <span>Campos disponibles en la API de SECOP</span>
        <span className="w-16 text-center">Llave</span>
      </div>

      <div className="space-y-3 overflow-y-auto pr-2 flex-1">
        {mappedColumns.map((col, idx) => (
          <div 
            key={idx} 
            className={`flex items-center gap-3 p-2 rounded-xl transition-all border ${
              col.isKey ? 'border-blue-400 bg-blue-50/40 ring-1 ring-blue-100' : 'border-transparent hover:bg-gray-50'
            }`}
          >
            <div className="w-[45%] bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3 shadow-sm">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span className="text-gray-800 text-sm truncate font-medium" title={col.excelCol}>
                {col.excelCol}
              </span>
            </div>
            
            <ArrowRight className={`w-4 h-4 flex-shrink-0 ${col.isValid ? 'text-emerald-400' : 'text-gray-300'}`} />
            
            <div className="w-[45%] flex items-center gap-3">
              <select
                value={col.secopField || ''}
                onChange={(e) => updateColumnMapping(col.excelCol, e.target.value || null)}
                className={`flex-1 bg-white border rounded-lg p-3 text-sm text-gray-800 focus:ring-2 focus:ring-emerald-500 outline-none transition-all truncate shadow-sm ${
                  col.isValid ? 'border-emerald-200' : 'border-gray-200'
                }`}
              >
                <option value="">Selecciona un campo...</option>
                {SECOP_FIELDS.map(field => (
                  <option key={field} value={field}>{field}</option>
                ))}
              </select>
              
              <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                {col.isValid ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-dashed border-gray-300" />
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-center w-12 flex-shrink-0">
              <input 
                type="radio" 
                id={`key-${idx}`}
                name="primaryKey" 
                checked={col.isKey}
                disabled={!col.isValid}
                onChange={() => setKeyColumn(col.excelCol)}
                className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={!col.isValid ? "Debes seleccionar un campo válido para usarlo como Llave" : "Marcar como Llave de búsqueda"}
              />
            </div>
          </div>
        ))}
      </div>

      <div className={`mt-4 p-4 rounded-xl flex items-center justify-center gap-2 font-medium text-sm transition-colors
        ${isAllMapped ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}`}>
        <CheckCircle2 className={`w-5 h-5 ${isAllMapped ? 'text-emerald-500' : 'text-gray-400'}`} />
        {mappedCount} de {columns.length} columnas mapeadas correctamente
      </div>
    </div>
  );
}
