'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, Download, FileText, Search, 
  BarChart2, AlertTriangle, CheckCircle, 
  Settings, SlidersHorizontal, Eye, DownloadCloud,
  FileSearch, Scale, FileSignature, Database, HelpCircle
} from 'lucide-react';
import { useDashboardStore } from '@/store/useDashboardStore';
import HackerOverlay from '@/components/loading/HackerOverlay';

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId') || 'demo-id';
  
  const { 
    globalSearch, setGlobalSearch,
    stats, setStats,
    resultsData, setResultsData,
    selectedColumns, toggleColumn, toggleAllColumns
  } = useDashboardStore();

  const [loading, setLoading] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [selectedContrato, setSelectedContrato] = useState<any | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  
  // Scraper Robot State
  const [scraperActive, setScraperActive] = useState(searchParams?.get('running') === 'true');
  const [scraperLog, setScraperLog] = useState("Conectando con Robot de Extracción...");
  
  // OCR State
  const [ocrSearchTerm, setOcrSearchTerm] = useState('');
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrResults, setOcrResults] = useState<any[]>([]);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch Data & Stats with Debounce on globalSearch
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDashboardData();
      fetchStats();
    }, 300);
    return () => clearTimeout(timer);
  }, [jobId, globalSearch]);

  // Polling automático cuando el scraper está corriendo en segundo plano
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (scraperActive) {
      interval = setInterval(() => {
        fetchDashboardData(true); // Silencioso para no parpadear
        fetchStats();
      }, 5000); // 5 segundos
    }
    return () => clearInterval(interval);
  }, [scraperActive, jobId, globalSearch]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`http://localhost:8000/api/dashboard/stats?jobId=${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const fetchDashboardData = async (hideLoading = false) => {
    if (!hideLoading) setLoading(true);
    try {
      const url = `http://localhost:8000/api/dashboard/search?jobId=${jobId}&q=${encodeURIComponent(globalSearch)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setResultsData(data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
    if (!hideLoading) setLoading(false);
  };

  const filteredData = resultsData.filter(row => {
    return Object.entries(columnFilters).every(([key, val]) => {
      if (!val) return true;
      const rowVal = String(row[key] || '').toLowerCase();
      return rowVal.includes(val.toLowerCase());
    });
  });

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      // Pasamos las columnas que el usuario tiene activas (solo como referencia, aunque la DB tiene todo)
      const activeCols = Object.keys(selectedColumns).filter(k => selectedColumns[k as keyof typeof selectedColumns]);
      
      const res = await fetch('http://localhost:8000/api/export/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          q: globalSearch,
          columns: activeCols
        })
      });
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Reporte_SecopPRO_${new Date().getTime()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        alert("Error exportando a Excel");
      }
    } catch (error) {
      console.error("Error al exportar:", error);
    }
    setExportingExcel(false);
  };

  const handleDownloadZip = async (internalId: string) => {
    try {
      // Usamos el ID interno de la tabla, o la llave_busqueda
      const res = await fetch(`http://localhost:8000/api/export/zip/${jobId}/${internalId}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${internalId}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        alert("El archivo ZIP aún no ha sido generado por el robot o no existe.");
      }
    } catch (error) {
      console.error("Error descargando ZIP:", error);
    }
  };

  const runOcrScan = async () => {
    if (!ocrSearchTerm) return;
    setIsOcrRunning(true);
    setOcrResults([]);
    try {
      const res = await fetch('http://localhost:8000/api/dashboard/ocr', {
         method: 'POST',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({jobId, searchTerm: ocrSearchTerm})
      });
      if (res.ok) {
         const data = await res.json();
         setOcrResults(data.details || []);
         // Refresh global data so OCR appears in raw JSON viewer and Excel
         fetchDashboardData();
      } else {
         alert("Hubo un error en el motor OCR. Revisa la consola.");
      }
    } catch(e) {
      console.error("OCR Error:", e);
    }
    setIsOcrRunning(false);
  };

  // Helper for rendering checkboxes
  const renderToggle = (key: keyof typeof selectedColumns, label: string, tooltip: string = "") => (
    <div className="flex items-center justify-between group relative">
      <label className="flex items-center gap-2 cursor-pointer flex-1">
        <div className="relative flex items-center justify-center">
          <input 
            type="checkbox" 
            checked={selectedColumns[key]}
            onChange={() => toggleColumn(key)}
            className="peer sr-only"
          />
          <div className="w-4 h-4 border border-emerald-500 rounded bg-white peer-checked:bg-emerald-500 transition-colors flex items-center justify-center" />
          <CheckCircle className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" />
        </div>
        <span className="text-xs font-medium text-gray-700 group-hover:text-emerald-700 transition-colors">{label}</span>
      </label>
      {tooltip && (
        <div className="relative flex items-center">
          <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-emerald-600 transition-colors cursor-help" />
          <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-[10px] rounded-lg shadow-xl z-50 pointer-events-none">
            <p className="font-bold mb-1 text-emerald-400">Campos en Excel:</p>
            <p className="leading-relaxed">{tooltip}</p>
            <div className="absolute top-full right-1.5 -mt-1 border-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f3f4f6] flex flex-col font-sans">
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 py-3 px-6 sticky top-0 z-20 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/mapping')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Database className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">SecopPRO</h1>
            <span className="text-gray-400 text-lg mx-2">|</span>
            <h2 className="text-lg text-gray-600 font-medium">Dashboard de Resultados y Vista Previa de Exportación</h2>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
            <FileText className="w-4 h-4" />
            Exportar PDF
          </button>
          <button 
            onClick={handleExportExcel}
            disabled={exportingExcel || loading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exportingExcel ? 'Exportando...' : 'Exportar a Excel'}
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-hidden flex flex-col gap-6 max-w-[1920px] mx-auto w-full">
        
        {/* TOP ROW: KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-center gap-5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <BarChart2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Procesos Analizados</p>
              <div className="flex items-end gap-3 mt-1">
                <span className="text-3xl font-bold text-gray-900">{stats.procesosAnalizados.toLocaleString('es-CO')}</span>
                <span className="text-xs font-medium text-gray-400 mb-1">Procesos en total</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-center gap-5">
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Alertas Encontradas</p>
              <div className="flex items-end gap-3 mt-1">
                <span className="text-3xl font-bold text-gray-900">{stats.alertasEncontradas}</span>
                <span className="text-xs font-medium text-red-500 mb-1">Requieren revisión</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-center gap-5">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Tasa de Cumplimiento</p>
              <div className="flex items-end gap-3 mt-1">
                <span className="text-3xl font-bold text-gray-900">{stats.tasaCumplimiento}%</span>
                <span className="text-xs font-medium text-emerald-500 mb-1">Cálculo general</span>
              </div>
            </div>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            className="block w-full pl-11 pr-16 py-3.5 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm shadow-sm transition-all"
            placeholder="Búsqueda global en todos los resultados (NIT, valores, palabras OCR)..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
            <kbd className="inline-flex items-center px-2 py-1 border border-gray-200 rounded text-xs font-sans font-medium text-gray-400">Ctrl + K</kbd>
          </div>
        </div>

        {/* PANELS ROW */}
        <div className="flex items-center justify-between mt-2">
          <h2 className="text-sm font-bold text-gray-900">Configuración de Columnas para Exportación</h2>
          <div className="flex gap-2">
            <button onClick={() => toggleAllColumns(true)} className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition-colors">Marcar Todas</button>
            <button onClick={() => toggleAllColumns(false)} className="px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded border border-gray-200 transition-colors">Desmarcar Todas</button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Panel 1 */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
              <FileSearch className="w-4 h-4 text-emerald-600" /> Información General
            </h3>
            <div className="grid grid-cols-2 gap-y-3 gap-x-4">
              {renderToggle('nombre_entidad', 'Nombre Entidad')}
              {renderToggle('nit_entidad', 'NIT Entidad')}
              {renderToggle('ciudad', 'Ciudad')}
              {renderToggle('valor_contrato', 'Valor Contrato')}
              {renderToggle('fecha_contrato', 'Fecha Contrato')}
              {renderToggle('nombre_representante', 'Nombre Representante Legal')}
              {renderToggle('identificacion_representante', 'Cédula/NIT Representante')}
              {renderToggle('telefono_representante', 'Teléfono Representante')}
              {renderToggle('correo_representante', 'Correo Representante')}
              {renderToggle('tipo_contrato', 'Tipo de Contrato')}
            </div>
          </div>

          {/* Panel 2 */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
              <Database className="w-4 h-4 text-emerald-600" /> Otras Columnas (Ocultas)
            </h3>
            <div className="grid grid-cols-2 gap-y-3 gap-x-4">
              {renderToggle('numero_proceso', 'Número Proceso')}
              {renderToggle('estado', 'Estado')}
              {renderToggle('objeto', 'Objeto')}
              {renderToggle('contratista', 'Contratista')}
              {renderToggle('documentos', 'Documentos')}
              {renderToggle('pagos', 'Pagos')}
            </div>
          </div>

          {/* Panel 3 */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
              <Scale className="w-4 h-4 text-emerald-600" /> Comparaciones Automáticas
            </h3>
            <div className="flex flex-col gap-2 mb-4">
              {renderToggle('regla_firma_pub', 'Comparar Fecha Publicación vs Firma', 'regla_firma_pub_cumple, regla_firma_pub_diff')}
              {renderToggle('regla_firma_inicio', 'Comparar Fecha Firma vs Inicio', 'regla_firma_inicio_cumple, regla_firma_inicio_diff')}
              {renderToggle('regla_inicio_fin', 'Comparar Fecha Inicio vs Terminación', 'regla_inicio_fin_cumple, regla_inicio_fin_diff')}
            </div>
            
            <div className="mt-auto">
              <p className="text-[11px] font-semibold text-gray-500 mb-2 uppercase tracking-wider">Comparaciones personalizadas</p>
              <div className="flex items-center gap-2 mb-3">
                <select className="flex-1 text-xs border border-gray-200 rounded p-1.5 text-gray-700 bg-gray-50 outline-none focus:border-emerald-500">
                  <option>Fecha Firma</option>
                  <option>Fecha Inicio</option>
                </select>
                <span className="text-gray-400 text-xs font-bold">+</span>
                <input type="number" defaultValue={3} className="w-12 text-center text-xs border border-gray-200 rounded p-1.5 text-gray-700 outline-none focus:border-emerald-500" />
                <select className="w-16 text-xs border border-gray-200 rounded p-1.5 text-gray-700 bg-gray-50 outline-none focus:border-emerald-500">
                  <option>Días</option>
                  <option>Meses</option>
                </select>
                <select className="flex-1 text-xs border border-gray-200 rounded p-1.5 text-gray-700 bg-gray-50 outline-none focus:border-emerald-500">
                  <option>Fecha Publicación</option>
                  <option>Fecha Terminación</option>
                </select>
              </div>
              <button className="w-full py-1.5 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded hover:bg-emerald-50 transition-colors flex items-center justify-center gap-1">
                + Agregar comparación
              </button>
            </div>
          </div>

          {/* Panel 4 */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
              <FileSignature className="w-4 h-4 text-emerald-600" /> Hallazgos OCR
            </h3>
            <div className="flex flex-col gap-3">
              {renderToggle('ocr_poliza', 'Pólizas de Cumplimiento')}
              {renderToggle('ocr_garantia', 'Garantías Bancarias')}
              {renderToggle('ocr_anticipo', 'Anticipos')}
            </div>
          </div>
        </div>

        {/* PANEL DE OCR AVANZADO */}
        <div className="bg-white rounded-xl shadow-sm border border-emerald-100 overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-emerald-700 to-teal-800 px-6 py-4 flex items-center justify-between shadow-inner">
             <h3 className="text-white font-bold flex items-center gap-3">
               <div className="bg-white/20 p-1.5 rounded-lg"><FileSignature className="w-5 h-5 text-white" /></div>
               Motor de Análisis Forense (OCR + IA)
             </h3>
             <span className="text-emerald-100 text-xs bg-black/20 px-3 py-1.5 rounded-full font-medium border border-white/10">Búsqueda profunda en PDFs</span>
          </div>
          <div className="p-6 bg-emerald-50/30">
             <p className="text-sm text-gray-600 mb-4">Ingresa el término que deseas buscar en los documentos físicos descargados (ej. "póliza de cumplimiento", "anticipo"). El sistema usará OCR para leer los PDFs e IA para identificar variaciones del término, devolviendo el contexto exacto donde fue hallado.</p>
             <div className="flex gap-4">
               <input 
                 type="text"
                 placeholder="Término a buscar..."
                 className="flex-1 border border-gray-300 rounded-xl px-5 py-3.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-sm text-sm"
                 value={ocrSearchTerm}
                 onChange={(e) => setOcrSearchTerm(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && runOcrScan()}
               />
               <button 
                 onClick={runOcrScan}
                 disabled={isOcrRunning || !ocrSearchTerm}
                 className="bg-emerald-600 text-white px-8 py-3.5 rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 disabled:opacity-50 disabled:shadow-none flex items-center gap-2 transition-all active:scale-[0.98]"
               >
                 {isOcrRunning ? (
                   <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                 ) : <Search className="w-5 h-5"/>}
                 {isOcrRunning ? 'Analizando Documentos...' : 'Extraer Contexto'}
               </button>
             </div>
             
             {ocrResults.length > 0 && (
                <div className="mt-8 border-t border-gray-200 pt-6">
                   <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                     Resultados Encontrados ({ocrResults.length})
                   </h4>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2 pb-2">
                     {ocrResults.map((r, i) => (
                        <div key={i} className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                           <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                           <div className="flex justify-between items-start mb-3">
                             <div>
                               <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded uppercase tracking-wider">Contrato: {r.llave}</span>
                               <p className="text-xs text-gray-500 mt-1 truncate max-w-[200px]" title={r.archivo}>📄 {r.archivo}</p>
                             </div>
                           </div>
                           <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 relative">
                             <span className="absolute -top-2 -left-2 text-2xl text-gray-300">"</span>
                             <p className="text-sm text-gray-700 italic relative z-10 leading-relaxed font-serif">
                               {r.match}
                             </p>
                           </div>
                        </div>
                     ))}
                   </div>
                </div>
             )}
          </div>
        </div>

        {/* DATA TABLE */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[400px]">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
            <h3 className="text-sm font-bold text-gray-900">2. Vista previa del reporte</h3>
            <div className="flex items-center gap-4">
              <button className="text-xs font-medium text-gray-600 hover:text-emerald-600 flex items-center gap-1.5 transition-colors">
                <Settings className="w-3.5 h-3.5" /> Configurar columnas
              </button>
              <button onClick={() => setColumnFilters({})} className="text-xs font-medium text-gray-600 hover:text-red-600 flex items-center gap-1.5 transition-colors">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Limpiar filtros
              </button>
              <span className="text-xs text-gray-400 font-medium bg-white px-2 py-1 rounded border border-gray-200">{filteredData.length} registros</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <table className="w-full text-left text-xs whitespace-nowrap min-w-[1200px]">
              <thead className="bg-white border-b border-gray-200 text-gray-900 font-bold sticky top-0 shadow-sm z-10">
                <tr>
                  {selectedColumns.nombre_entidad && (
                    <th className="px-4 py-3 align-top min-w-[150px]">
                      <div>Nombre Entidad</div>
                      <input type="text" placeholder="Filtrar..." className="mt-1.5 w-full text-[10px] p-1.5 border border-gray-200 rounded font-normal shadow-inner bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors" value={columnFilters.nombre_entidad || ''} onChange={(e) => setColumnFilters({...columnFilters, nombre_entidad: e.target.value})} />
                    </th>
                  )}
                  {selectedColumns.nit_entidad && (
                    <th className="px-4 py-3 align-top min-w-[120px]">
                      <div>NIT Entidad</div>
                      <input type="text" placeholder="Filtrar..." className="mt-1.5 w-full text-[10px] p-1.5 border border-gray-200 rounded font-normal shadow-inner bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors" value={columnFilters.nit_entidad || ''} onChange={(e) => setColumnFilters({...columnFilters, nit_entidad: e.target.value})} />
                    </th>
                  )}
                  {selectedColumns.ciudad && (
                    <th className="px-4 py-3 align-top min-w-[100px]">
                      <div>Ciudad</div>
                      <input type="text" placeholder="Filtrar..." className="mt-1.5 w-full text-[10px] p-1.5 border border-gray-200 rounded font-normal shadow-inner bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors" value={columnFilters.ciudad || ''} onChange={(e) => setColumnFilters({...columnFilters, ciudad: e.target.value})} />
                    </th>
                  )}
                  {selectedColumns.valor_contrato && (
                    <th className="px-4 py-3 align-top min-w-[120px]">
                      <div>Valor Contrato</div>
                      <input type="text" placeholder="Filtrar..." className="mt-1.5 w-full text-[10px] p-1.5 border border-gray-200 rounded font-normal shadow-inner bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors" value={columnFilters.valor_del_contrato || ''} onChange={(e) => setColumnFilters({...columnFilters, valor_del_contrato: e.target.value})} />
                    </th>
                  )}
                  {selectedColumns.fecha_contrato && (
                    <th className="px-4 py-3 align-top min-w-[120px]">
                      <div>Fecha Contrato</div>
                      <input type="text" placeholder="Filtrar..." className="mt-1.5 w-full text-[10px] p-1.5 border border-gray-200 rounded font-normal shadow-inner bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors" value={columnFilters.fecha_de_firma || ''} onChange={(e) => setColumnFilters({...columnFilters, fecha_de_firma: e.target.value})} />
                    </th>
                  )}
                  {selectedColumns.nombre_representante && (
                    <th className="px-4 py-3 align-top min-w-[150px]">
                      <div>Nombre Rep. Legal</div>
                      <input type="text" placeholder="Filtrar..." className="mt-1.5 w-full text-[10px] p-1.5 border border-gray-200 rounded font-normal shadow-inner bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors" value={columnFilters.nombre_representante_legal || ''} onChange={(e) => setColumnFilters({...columnFilters, nombre_representante_legal: e.target.value})} />
                    </th>
                  )}
                  {selectedColumns.identificacion_representante && (
                    <th className="px-4 py-3 align-top min-w-[120px]">
                      <div>Cédula/NIT Rep.</div>
                      <input type="text" placeholder="Filtrar..." className="mt-1.5 w-full text-[10px] p-1.5 border border-gray-200 rounded font-normal shadow-inner bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors" value={columnFilters.identificaci_n_representante_legal || ''} onChange={(e) => setColumnFilters({...columnFilters, identificaci_n_representante_legal: e.target.value})} />
                    </th>
                  )}
                  {selectedColumns.telefono_representante && (
                    <th className="px-4 py-3 align-top min-w-[120px]">
                      <div>Teléfono Rep.</div>
                      <input type="text" placeholder="Filtrar..." className="mt-1.5 w-full text-[10px] p-1.5 border border-gray-200 rounded font-normal shadow-inner bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors" value={columnFilters.telefono_representante_legal || ''} onChange={(e) => setColumnFilters({...columnFilters, telefono_representante_legal: e.target.value})} />
                    </th>
                  )}
                  {selectedColumns.correo_representante && (
                    <th className="px-4 py-3 align-top min-w-[150px]">
                      <div>Correo Rep.</div>
                      <input type="text" placeholder="Filtrar..." className="mt-1.5 w-full text-[10px] p-1.5 border border-gray-200 rounded font-normal shadow-inner bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors" value={columnFilters.correo_representante_legal || ''} onChange={(e) => setColumnFilters({...columnFilters, correo_representante_legal: e.target.value})} />
                    </th>
                  )}
                  {selectedColumns.tipo_contrato && (
                    <th className="px-4 py-3 align-top min-w-[120px]">
                      <div>Tipo Contrato</div>
                      <input type="text" placeholder="Filtrar..." className="mt-1.5 w-full text-[10px] p-1.5 border border-gray-200 rounded font-normal shadow-inner bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors" value={columnFilters.tipo_de_contrato || ''} onChange={(e) => setColumnFilters({...columnFilters, tipo_de_contrato: e.target.value})} />
                    </th>
                  )}
                  
                  {/* Additional / Optional Columns */}
                  {selectedColumns.numero_proceso && (
                    <th className="px-4 py-3 align-top min-w-[120px]">
                      <div>Número Proceso</div>
                      <input type="text" placeholder="Filtrar..." className="mt-1.5 w-full text-[10px] p-1.5 border border-gray-200 rounded font-normal shadow-inner bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors" value={columnFilters.llave_busqueda || ''} onChange={(e) => setColumnFilters({...columnFilters, llave_busqueda: e.target.value})} />
                    </th>
                  )}
                  {selectedColumns.regla_firma_pub && <th className="px-4 py-3 align-top"><div>Firma +3 vs Pub</div></th>}
                  {selectedColumns.regla_firma_inicio && <th className="px-4 py-3 align-top"><div>Firma vs Inicio</div></th>}
                  {selectedColumns.regla_inicio_fin && <th className="px-4 py-3 align-top"><div>Inicio vs Fin</div></th>}
                  {selectedColumns.estado && <th className="px-4 py-3 align-top"><div>Estado</div></th>}
                  
                  <th className="px-4 py-3 text-center align-top min-w-[80px]"><div>Acciones</div></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-gray-400 animate-pulse">Cargando datos...</td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-gray-500">No hay registros que coincidan con los filtros.</td>
                  </tr>
                ) : (
                  filteredData.map((row, idx) => {
                    const hasAlert = 
                      row.regla_firma_pub_cumple === false || 
                      row.regla_firma_inicio_cumple === false || 
                      row.regla_inicio_fin_cumple === false;

                    return (
                      <tr key={row.internal_id || idx} className="hover:bg-emerald-50/50 transition-colors">
                        {selectedColumns.nombre_entidad && <td className="px-4 py-3 truncate max-w-[200px]" title={row.nombre_entidad}>{row.nombre_entidad || 'N/A'}</td>}
                        {selectedColumns.nit_entidad && <td className="px-4 py-3 font-medium text-gray-700">{row.nit_entidad || 'N/A'}</td>}
                        {selectedColumns.ciudad && <td className="px-4 py-3">{row.ciudad || 'N/A'}</td>}
                        {selectedColumns.valor_contrato && (
                          <td className="px-4 py-3 font-medium">
                            {row.valor_del_contrato || row.valor_contrato 
                              ? `$${Number(row.valor_del_contrato || row.valor_contrato).toLocaleString('es-CO')}` 
                              : 'N/A'}
                          </td>
                        )}
                        {selectedColumns.fecha_contrato && <td className="px-4 py-3">{row.fecha_de_firma || 'N/A'}</td>}
                        {selectedColumns.nombre_representante && <td className="px-4 py-3 truncate max-w-[200px]" title={row.nombre_representante_legal}>{row.nombre_representante_legal || 'N/A'}</td>}
                        {selectedColumns.identificacion_representante && <td className="px-4 py-3 font-medium text-gray-700">{row.identificaci_n_representante_legal || 'N/A'}</td>}
                        {selectedColumns.telefono_representante && <td className="px-4 py-3">{row.telefono_representante_legal || 'N/A'}</td>}
                        {selectedColumns.correo_representante && <td className="px-4 py-3 text-emerald-600 truncate max-w-[200px]" title={row.correo_representante_legal}>{row.correo_representante_legal || 'N/A'}</td>}
                        {selectedColumns.tipo_contrato && <td className="px-4 py-3 truncate max-w-[150px]" title={row.tipo_de_contrato}>{row.tipo_de_contrato || 'N/A'}</td>}
                        
                        {/* Optional columns */}
                        {selectedColumns.numero_proceso && <td className="px-4 py-3 font-medium text-emerald-700">{row.llave_busqueda}</td>}
                        {/* REGLAS */}
                        {selectedColumns.regla_firma_pub && (
                          <td className="px-4 py-3">
                            {row.regla_firma_pub_cumple === null ? <span className="text-gray-400">Sin datos</span> :
                             row.regla_firma_pub_cumple === true ? <span className="text-emerald-600 font-medium">Cumple</span> :
                             <span className="text-red-600 font-medium">No cumple ({row.regla_firma_pub_diff}d)</span>
                            }
                          </td>
                        )}
                        {selectedColumns.regla_firma_inicio && (
                          <td className="px-4 py-3">
                            {row.regla_firma_inicio_cumple === null ? <span className="text-gray-400">Sin datos</span> :
                             row.regla_firma_inicio_cumple === true ? <span className="text-emerald-600 font-medium">Cumple</span> :
                             <span className="text-red-600 font-medium">No cumple</span>
                            }
                          </td>
                        )}
                        {selectedColumns.regla_inicio_fin && (
                          <td className="px-4 py-3">
                            {row.regla_inicio_fin_cumple === null ? <span className="text-gray-400">Sin datos</span> :
                             row.regla_inicio_fin_cumple === true ? <span className="text-emerald-600 font-medium">Cumple</span> :
                             <span className="text-red-600 font-medium">Incoherente</span>
                            }
                          </td>
                        )}

                        {selectedColumns.estado && (
                          <td className="px-4 py-3">
                            {hasAlert ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 uppercase tracking-wide border border-red-200">
                                Alerta
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wide border border-emerald-200">
                                Aprobado
                              </span>
                            )}
                          </td>
                        )}
                        
                        <td className="px-4 py-3 text-center flex items-center justify-center gap-2">
                          <button 
                            onClick={() => setSelectedContrato(row)}
                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="Ver detalle"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDownloadZip(row.internal_id)}
                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="Descargar ZIP local"
                          >
                            <DownloadCloud className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          <div className="px-5 py-3 border-t border-gray-100 bg-white flex items-center justify-between">
            <span className="text-xs text-gray-500">Mostrando {filteredData.length} registros</span>
            {/* Minimal Pagination placeholder */}
            <div className="flex gap-1">
              <button className="px-2 py-1 border border-gray-200 rounded text-xs text-gray-400 bg-gray-50 hover:bg-gray-100">&lt;</button>
              <button className="px-2.5 py-1 border border-emerald-500 rounded text-xs text-emerald-700 bg-emerald-50 font-medium">1</button>
              <button className="px-2 py-1 border border-gray-200 rounded text-xs text-gray-400 bg-gray-50 hover:bg-gray-100">&gt;</button>
            </div>
          </div>
        </div>

      </main>

      {/* Modal de Detalles Profundos */}
      {selectedContrato && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-8 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden border border-gray-200">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Visor de Datos y OCR</h3>
                <p className="text-sm text-gray-500 mt-1">Llave: <span className="font-mono text-emerald-700">{selectedContrato.llave_busqueda}</span></p>
              </div>
              <button 
                onClick={() => setSelectedContrato(null)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto bg-gray-50 flex-1">
              <h4 className="text-sm font-bold text-gray-700 mb-2">JSON Raw (SECOP + Reglas Pandas)</h4>
              <div className="bg-gray-900 rounded-xl p-4 shadow-inner overflow-x-auto">
                <pre className="text-emerald-400 font-mono text-sm">
                  {JSON.stringify(selectedContrato, null, 2)}
                </pre>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-white flex justify-end">
              <button 
                onClick={() => setSelectedContrato(null)}
                className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Cerrar Visor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* El famoso Log Elegante (HackerOverlay) central y su estado Minimizado */}
      {scraperActive && (
        <HackerOverlay 
          jobId={jobId} 
          onComplete={() => setScraperActive(false)} 
          onCancel={() => setScraperActive(false)} 
        />
      )}

    </div>
  );
}
