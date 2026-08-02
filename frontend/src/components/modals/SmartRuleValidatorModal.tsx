import React, { useState, useMemo } from 'react';
import { X, Scale, FileText, Search, DownloadCloud, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface SmartRuleValidatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  resultsData: any[];
  onRefresh: () => void;
}

const RULES = [
  { id: 'regla_firma_pub', name: 'Firma vs Publicación', desc: 'Compara si la firma se realizó después de la publicación.' },
  { id: 'regla_firma_inicio', name: 'Firma vs Inicio', desc: 'Compara que el acta de inicio sea posterior a la firma.' },
  { id: 'regla_inicio_fin', name: 'Inicio vs Fin', desc: 'Valida las fechas de inicio y terminación del contrato.' }
];

export default function SmartRuleValidatorModal({ isOpen, onClose, jobId, resultsData, onRefresh }: SmartRuleValidatorModalProps) {
  const [selectedRule, setSelectedRule] = useState<string>(RULES[0].id);
  const [loadingItems, setLoadingItems] = useState<Record<string, 'resolving' | 'scraping' | false>>({});

  // Filtrar contratos a los que les falte información para la regla seleccionada
  const missingDataContracts = useMemo(() => {
    if (!resultsData) return [];
    return resultsData.filter(row => {
      const cumpleKey = `${selectedRule}_cumple`;
      return row[cumpleKey] === null || row[cumpleKey] === undefined;
    });
  }, [resultsData, selectedRule]);

  const handleResolve = async (llave_busqueda: string) => {
    setLoadingItems(prev => ({ ...prev, [llave_busqueda]: 'resolving' }));
    
    try {
      const res = await fetch('/api/pdf/resolve-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          llave_busqueda,
          regla: selectedRule
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        if (data.detail === "No hay PDFs en caché. Se requiere ejecutar el scraper.") {
           toast.error('No hay PDFs descargados para este contrato. Usa el Scraper primero.');
        } else {
           toast.error(`Error: ${data.detail || data.message}`);
        }
        return;
      }
      
      if (data.status === 'need_scraper') {
        toast.error('No hay PDFs descargados. Ejecuta el scraper para este contrato.');
        return;
      }
      
      if (data.status === 'success') {
        if (data.hallazgo === 'NO ENCONTRADO') {
          toast.warning(`No concluyente: No se encontró la fecha en el PDF ${data.pdf_usado}`);
        } else {
          toast.success(`Dato encontrado en ${data.pdf_usado}: ${data.hallazgo}`);
          // Idealmente actualizaríamos resultsData aquí o forzar refresh
        }
      } else {
        toast.error(data.message);
      }
      
    } catch (err: any) {
      toast.error('Error de red al intentar resolver la regla.');
    } finally {
      setLoadingItems(prev => ({ ...prev, [llave_busqueda]: false }));
    }
  };

  const handleScrape = async (llave_busqueda: string, urlproceso: string) => {
    if (!urlproceso) {
      toast.error('El contrato no tiene URL válida para hacer scraping.');
      return;
    }
    
    // Pop-up de decisión (True = Descargar, False = Solo nombres)
    const confirmMsg = "¿Deseas descargar físicamente los PDFs para calcular el hash SHA256?\n\n- ACEPTAR: Descarga completa (Lento, pero forense).\n- CANCELAR: Solo extrae nombres (Rápido, sin descarga).";
    const descargar_archivos = window.confirm(confirmMsg);

    setLoadingItems(prev => ({ ...prev, [llave_busqueda]: 'scraping' }));
    
    try {
      const res = await fetch('/api/pdf/run-scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          llave_busqueda,
          urlproceso,
          descargar_archivos
        })
      });
      
      if (!res.ok) {
        toast.error('Error al iniciar el scraper');
        return;
      }
      
      const modeText = descargar_archivos ? "Descarga Forense" : "Extracción Rápida (Solo Nombres)";
      toast.success(`Scraper iniciado en modo: ${modeText}. Revisa la consola o los archivos locales.`);
    } catch (err) {
      toast.error('Error de red.');
    } finally {
      setLoadingItems(prev => ({ ...prev, [llave_busqueda]: false }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden border border-gray-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2 rounded-lg">
              <Scale className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Resolución Inteligente de Reglas (RAG)</h2>
              <p className="text-sm text-gray-500">Busca en los PDFs descargados la información faltante de SECOP</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar de Reglas */}
          <div className="w-1/3 border-r border-gray-100 bg-gray-50/50 p-4 overflow-y-auto">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Selecciona una Regla</h3>
            <div className="flex flex-col gap-2">
              {RULES.map(rule => (
                <button
                  key={rule.id}
                  onClick={() => setSelectedRule(rule.id)}
                  className={`text-left p-3 rounded-lg border transition-all ${selectedRule === rule.id ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-gray-200 hover:border-emerald-300 hover:bg-white'}`}
                >
                  <div className="font-semibold text-sm text-gray-900">{rule.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{rule.desc}</div>
                </button>
              ))}
            </div>
            
            <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <Search className="w-4 h-4 text-blue-600" />
                <h4 className="font-bold text-sm text-blue-900">¿Cómo funciona?</h4>
              </div>
              <p className="text-xs text-blue-800 leading-relaxed">
                Cuando falta información en SECOP para validar una regla, puedes indicarle a la IA que busque el dato exacto dentro de los PDFs del contrato mediante <strong>búsqueda inteligente RAG</strong>.
              </p>
            </div>
          </div>

          {/* Contenido Principal */}
          <div className="w-2/3 p-6 flex flex-col overflow-hidden bg-white">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold text-gray-800">
                Contratos sin datos ({missingDataContracts.length})
              </h3>
              <button onClick={onRefresh} className="text-xs text-emerald-600 font-semibold hover:underline">
                Recargar Datos
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-3">
              {missingDataContracts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center opacity-70">
                  <CheckCircle className="w-12 h-12 text-emerald-500 mb-3" />
                  <p className="font-medium text-gray-800">¡Todo en orden!</p>
                  <p className="text-sm text-gray-500 max-w-[250px] mt-1">Ningún contrato tiene falta de información para esta regla.</p>
                </div>
              ) : (
                missingDataContracts.map(row => (
                  <div key={row.llave_busqueda} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600 border border-gray-200 mb-2 inline-block">
                          {row.llave_busqueda}
                        </span>
                        <h4 className="text-sm font-bold text-gray-800 line-clamp-1" title={row.proveedor_adjudicado}>
                          {row.proveedor_adjudicado || 'Sin proveedor'}
                        </h4>
                      </div>
                      <div className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-1 rounded text-[10px] font-bold border border-amber-200">
                        <AlertTriangle className="w-3 h-3" /> Falta Info
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleResolve(row.llave_busqueda)}
                        disabled={!!loadingItems[row.llave_busqueda]}
                        className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {loadingItems[row.llave_busqueda] === 'resolving' ? (
                           <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizando...</>
                        ) : (
                           <><FileText className="w-3.5 h-3.5" /> Extraer de PDFs</>
                        )}
                      </button>
                      
                      <button 
                        onClick={() => handleScrape(row.llave_busqueda, row.urlproceso)}
                        disabled={!!loadingItems[row.llave_busqueda]}
                        className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold py-2 rounded-lg border border-gray-300 transition-colors disabled:opacity-50"
                      >
                        {loadingItems[row.llave_busqueda] === 'scraping' ? (
                           <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Descargando...</>
                        ) : (
                           <><DownloadCloud className="w-3.5 h-3.5" /> Descargar PDFs</>
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
