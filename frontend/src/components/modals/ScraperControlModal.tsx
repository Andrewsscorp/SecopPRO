import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, DownloadCloud, FileText, CheckCircle, Loader2, Database, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ScraperControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
}

export default function ScraperControlModal({ isOpen, onClose, jobId }: ScraperControlModalProps) {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [minValor, setMinValor] = useState('');
  const [maxValor, setMaxValor] = useState('');

  // Selección y Ejecución
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ total: number; current: number }>({ total: 0, current: 0 });
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  
  // Log de Resultados
  const [resultsLog, setResultsLog] = useState<{ llave: string, status: string, message: string, files: any[] }[]>([]);
  
  // Cargar contratos al montar
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch(`http://localhost:8000/api/dashboard/search?jobId=${jobId}`)
        .then(res => res.json())
        .then(data => setContracts(data || []))
        .catch(err => {
          console.error(err);
          toast.error("Error al cargar los contratos de la base de datos.");
        })
        .finally(() => setLoading(false));
    } else {
      // Limpiar al cerrar
      setSelectedKeys(new Set());
      setSearchTerm('');
      setEstadoFiltro('');
      setMinValor('');
      setMaxValor('');
      setIsProcessing(false);
      setProcessingKey(null);
      setResultsLog([]);
    }
  }, [isOpen, jobId]);

  // Lista de estados únicos para el select
  const estadosUnicos = useMemo(() => {
    const estados = new Set<string>();
    contracts.forEach(c => {
      if (c.estado_contrato) estados.add(c.estado_contrato);
    });
    return Array.from(estados).sort();
  }, [contracts]);

  // Aplicar filtros
  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      // 1. Búsqueda de texto (Entidad, Contratista, Llave, Descripción)
      const matchesSearch = searchTerm === '' || 
        (c.nombre_entidad?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (c.proveedor_adjudicado?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (c.llave_busqueda?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (c.descripcion_del_proceso?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      
      // 2. Filtro por Estado
      const matchesEstado = estadoFiltro === '' || c.estado_contrato === estadoFiltro;

      // 3. Filtros por Cuantía (Valor del contrato)
      let matchesMin = true;
      let matchesMax = true;
      const valorStr = c.valor_del_contrato || c.valor_contrato || '0';
      const valorNumeric = Number(valorStr.toString().replace(/,/g, '').replace(/\./g, ''));

      if (minValor) {
        matchesMin = valorNumeric >= Number(minValor);
      }
      if (maxValor) {
        matchesMax = valorNumeric <= Number(maxValor);
      }

      return matchesSearch && matchesEstado && matchesMin && matchesMax;
    });
  }, [contracts, searchTerm, estadoFiltro, minValor, maxValor]);

  const handleSelectAll = () => {
    if (selectedKeys.size === filteredContracts.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filteredContracts.map(c => c.llave_busqueda)));
    }
  };

  const toggleSelection = (llave: string) => {
    const newSet = new Set(selectedKeys);
    if (newSet.has(llave)) {
      newSet.delete(llave);
    } else {
      newSet.add(llave);
    }
    setSelectedKeys(newSet);
  };

  const formatCurrency = (val: any) => {
    if (!val) return '$0';
    const num = Number(val.toString().replace(/,/g, '').replace(/\./g, ''));
    return '$' + num.toLocaleString('es-CO');
  };

  // Función de ejecución del scraper
  const executeScraper = async (descargarFisicamente: boolean) => {
    if (selectedKeys.size === 0) return;
    
    setIsProcessing(true);
    setProgress({ total: selectedKeys.size, current: 0 });
    setResultsLog([]);
    
    const targetKeys = Array.from(selectedKeys);
    let successCount = 0;
    let errorCount = 0;

    for (const llave of targetKeys) {
      const contract = contracts.find(c => c.llave_busqueda === llave);
      if (!contract || !contract.urlproceso) {
        errorCount++;
        setResultsLog(prev => [{ llave, status: 'error', message: 'Sin URL de proceso válida', files: [] }, ...prev]);
        setProgress(p => ({ ...p, current: p.current + 1 }));
        continue;
      }

      setProcessingKey(llave);
      
      try {
        const res = await fetch('http://localhost:8000/api/pdf/run-scraper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: jobId,
            llave_busqueda: llave,
            urlproceso: contract.urlproceso,
            descargar_archivos: descargarFisicamente
          })
        });

        const rData = await res.json();

        if (res.ok) {
          successCount++;
          const data = rData.data || {};
          setResultsLog(prev => [{ 
            llave, 
            status: 'success', 
            message: `${data.cantidad_pdfs || 0} archivos extraídos`, 
            files: data.lista_pdfs || []
          }, ...prev]);
        } else {
          errorCount++;
          setResultsLog(prev => [{ llave, status: 'error', message: rData.detail || 'Error de extracción', files: [] }, ...prev]);
        }
      } catch (err) {
        console.error(err);
        errorCount++;
        setResultsLog(prev => [{ llave, status: 'error', message: 'Error de red al invocar el scraper', files: [] }, ...prev]);
      }
      
      setProgress(p => ({ ...p, current: p.current + 1 }));
    }

    setProcessingKey(null);
    setIsProcessing(false);
    
    toast.success(`Extracción finalizada. Éxitos: ${successCount} | Errores: ${errorCount}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200">
        
        {/* HEADER */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <DownloadCloud className="w-5 h-5 text-indigo-600" />
              Buscador y Extractor de Anexos (Scraper)
            </h2>
            <p className="text-sm text-slate-500 mt-1">Busca contratos de esta auditoría y selecciona cuáles deseas extraer.</p>
          </div>
          <button onClick={onClose} disabled={isProcessing} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* FILTERS BAR */}
        <div className="px-6 py-4 bg-white border-b border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Buscar contrato, entidad, llave..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          
          <div>
            <select 
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-700"
            >
              <option value="">Todos los Estados</option>
              {estadosUnicos.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          <div>
            <input 
              type="number"
              placeholder="Valor Mínimo ($)"
              value={minValor}
              onChange={(e) => setMinValor(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <input 
              type="number"
              placeholder="Valor Máximo ($)"
              value={maxValor}
              onChange={(e) => setMaxValor(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* PROGRESS BAR & RESULTS LOG */}
        {(isProcessing || resultsLog.length > 0) && (
          <div className="px-6 py-4 bg-indigo-50 border-b border-indigo-100 flex flex-col gap-3">
            {isProcessing && (
              <>
                <div className="flex justify-between text-xs font-semibold text-indigo-700">
                  <span>Procesando: {processingKey}</span>
                  <span>{progress.current} / {progress.total} Completados</span>
                </div>
                <div className="w-full bg-indigo-200 rounded-full h-2">
                  <div 
                    className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  ></div>
                </div>
              </>
            )}
            
            {resultsLog.length > 0 && (
              <div className="mt-2 bg-white border border-indigo-100 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2 text-sm shadow-inner">
                {resultsLog.map((log, idx) => (
                  <div key={idx} className="flex flex-col gap-1 border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      {log.status === 'success' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                      )}
                      <span className="font-mono text-xs font-semibold text-slate-700">{log.llave}</span>
                      <span className={`text-xs ${log.status === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                        - {log.message}
                      </span>
                    </div>
                    {log.files && log.files.length > 0 && (
                      <div className="pl-6 flex flex-col gap-0.5 text-[11px] text-slate-500 font-mono">
                        {log.files.map((file, fIdx) => (
                          <span key={fIdx} className="truncate" title={file.nombre}>📄 {file.nombre}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* RESULTS LIST */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-sm font-medium">Cargando base de datos...</p>
            </div>
          ) : filteredContracts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-3">
              <Database className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">No se encontraron contratos con estos filtros.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{filteredContracts.length} Resultados</span>
                <button 
                  onClick={handleSelectAll}
                  disabled={isProcessing}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                >
                  {selectedKeys.size === filteredContracts.length && filteredContracts.length > 0 ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                </button>
              </div>

              {filteredContracts.map(c => {
                const isSelected = selectedKeys.has(c.llave_busqueda);
                return (
                  <div 
                    key={c.llave_busqueda}
                    onClick={() => !isProcessing && toggleSelection(c.llave_busqueda)}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex gap-4 ${
                      isSelected 
                        ? 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100' 
                        : 'border-white bg-white hover:border-indigo-200 shadow-sm'
                    } ${isProcessing ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="pt-1 shrink-0">
                      <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${
                        isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'
                      }`}>
                        {isSelected && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-4">
                        <h4 className="text-sm font-bold text-slate-800 line-clamp-1">{c.nombre_entidad || 'Entidad Desconocida'}</h4>
                        <span className="text-[11px] font-mono font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded-md shrink-0">
                          {c.llave_busqueda}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.descripcion_del_proceso}</p>
                      
                      <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-slate-100/60">
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="font-semibold text-slate-400">Contratista:</span>
                          <span className="font-medium truncate max-w-[200px]">{c.proveedor_adjudicado || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="font-semibold text-slate-400">Estado:</span>
                          <span className="font-medium px-2 py-0.5 rounded-full bg-slate-100">{c.estado_contrato || 'N/A'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="font-semibold text-slate-400">Cuantía:</span>
                          <span className="font-mono text-emerald-600 font-medium">{formatCurrency(c.valor_del_contrato || c.valor_contrato)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between">
          <div className="text-sm font-medium text-slate-600">
            {selectedKeys.size} contratos seleccionados
          </div>
          
          <div className="flex gap-3">
            <button
              disabled={selectedKeys.size === 0 || isProcessing}
              onClick={() => executeScraper(false)}
              className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Extracción Rápida (Nombres)
            </button>
            <button
              disabled={selectedKeys.size === 0 || isProcessing}
              onClick={() => executeScraper(true)}
              className="px-5 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center gap-2"
            >
              <DownloadCloud className="w-4 h-4" />
              Modo Forense (Descargar PDFs)
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
