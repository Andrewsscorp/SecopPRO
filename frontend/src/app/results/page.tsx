'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Download, FileText, Search, 
  BarChart2, AlertTriangle, CheckCircle, 
  Settings, SlidersHorizontal, Eye, DownloadCloud,
  FileSearch, Scale, FileSignature, Database, HelpCircle, MessageSquare, X, Send,
  Maximize2, Minimize2, RefreshCw, Copy, Check
} from 'lucide-react';
import { useDashboardStore } from '@/store/useDashboardStore';
import HackerOverlay from '@/components/loading/HackerOverlay';
import ContractorReportModal from '@/components/modals/ContractorReportModal';
import ColumnConfigModal from '@/components/modals/ColumnConfigModal';
import SmartRuleValidatorModal from '@/components/modals/SmartRuleValidatorModal';
import { PdfExporterModal, usePdfExporterStore } from '@/components/pdf-exporter';

const COLUMNS_CONFIG_TABLE: Record<string, { title: string, filterKey?: string, minWidth: string, render: (row: any, actions: any) => React.ReactNode }> = {
  nombre_entidad: { title: "Nombre Entidad", filterKey: "nombre_entidad", minWidth: "150px", render: row => <div className="truncate max-w-[200px]" title={row.nombre_entidad}>{row.nombre_entidad || 'N/A'}</div> },
  nit_entidad: { title: "NIT Entidad", filterKey: "nit_entidad", minWidth: "120px", render: row => <div className="font-medium text-slate-700">{row.nit_entidad || 'N/A'}</div> },
  ciudad: { title: "Ciudad", filterKey: "ciudad", minWidth: "100px", render: row => row.ciudad || 'N/A' },
  nombre_contratista: { title: "Nombre Contratista", filterKey: "proveedor_adjudicado", minWidth: "150px", render: row => <div className="truncate max-w-[200px]" title={row.proveedor_adjudicado}>{row.proveedor_adjudicado || 'N/A'}</div> },
  nit_contratista: { title: "NIT/Cédula Contratista", filterKey: "documento_proveedor", minWidth: "150px", render: (row, { setSelectedNit }) => (
    <div className="flex items-center gap-2 font-medium text-slate-700">
      {row.documento_proveedor || 'N/A'}
      {row.documento_proveedor && (
        <button onClick={(e) => { e.stopPropagation(); setSelectedNit(row.documento_proveedor); }} className="text-slate-400 hover:text-emerald-600 transition-colors bg-white hover:bg-emerald-50 p-1.5 rounded-lg border border-slate-200" title="Ver Historial del Contratista"><Eye className="w-4 h-4" /></button>
      )}
    </div>
  )},
  valor_contrato: { title: "Valor Contrato", filterKey: "valor_del_contrato", minWidth: "120px", render: row => <div className="font-medium text-emerald-700">{row.valor_del_contrato || row.valor_contrato ? `$${Number(row.valor_del_contrato || row.valor_contrato).toLocaleString('es-CO')}` : 'N/A'}</div> },
  fecha_contrato: { title: "Fecha Contrato", filterKey: "fecha_de_firma", minWidth: "120px", render: row => row.fecha_de_firma || 'N/A' },
  nombre_representante: { title: "Nombre Rep. Legal", filterKey: "nombre_representante_legal", minWidth: "150px", render: row => <div className="truncate max-w-[200px]" title={row.nombre_representante_legal}>{row.nombre_representante_legal || 'N/A'}</div> },
  identificacion_representante: { title: "Cédula/NIT Rep.", filterKey: "identificaci_n_representante_legal", minWidth: "120px", render: row => <div className="font-medium text-slate-700">{row.identificaci_n_representante_legal || 'N/A'}</div> },
  telefono_representante: { title: "Teléfono Rep.", filterKey: "telefono_representante_legal", minWidth: "120px", render: row => row.telefono_representante_legal || 'N/A' },
  correo_representante: { title: "Correo Rep.", filterKey: "correo_representante_legal", minWidth: "150px", render: row => <div className="text-emerald-600 truncate max-w-[200px]" title={row.correo_representante_legal}>{row.correo_representante_legal || 'N/A'}</div> },
  tipo_contrato: { title: "Tipo Contrato", filterKey: "tipo_de_contrato", minWidth: "120px", render: row => <div className="truncate max-w-[150px]" title={row.tipo_de_contrato}>{row.tipo_de_contrato || 'N/A'}</div> },
  numero_proceso: { title: "Número Proceso", filterKey: "llave_busqueda", minWidth: "120px", render: row => <div className="font-medium text-emerald-700">{row.llave_busqueda}</div> },
  regla_firma_pub: { title: "Firma +3 vs Pub", minWidth: "120px", render: row => (
    row.regla_firma_pub_cumple === null ? <span className="text-slate-400">Sin datos</span> :
    row.regla_firma_pub_cumple === true ? <span className="text-emerald-600 font-medium">Cumple</span> :
    <span className="text-red-600 font-medium">No cumple ({row.regla_firma_pub_diff}d)</span>
  )},
  regla_firma_inicio: { title: "Firma vs Inicio", minWidth: "120px", render: row => (
    row.regla_firma_inicio_cumple === null ? <span className="text-slate-400">Sin datos</span> :
    row.regla_firma_inicio_cumple === true ? <span className="text-emerald-600 font-medium">Cumple</span> :
    <span className="text-red-600 font-medium">No cumple</span>
  )},
  regla_inicio_fin: { title: "Inicio vs Fin", minWidth: "120px", render: row => (
    row.regla_inicio_fin_cumple === null ? <span className="text-slate-400">Sin datos</span> :
    row.regla_inicio_fin_cumple === true ? <span className="text-emerald-600 font-medium">Cumple</span> :
    <span className="text-red-600 font-medium">Incoherente</span>
  )},
  estado: { title: "Estado", minWidth: "100px", render: row => {
    const hasAlert = row.regla_firma_pub_cumple === false || row.regla_firma_inicio_cumple === false || row.regla_inicio_fin_cumple === false;
    return hasAlert ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 uppercase tracking-wide border border-red-200">Alerta</span> : <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wide border border-emerald-200">Aprobado</span>;
  }},
  departamento: { title: "Departamento", filterKey: "departamento", minWidth: "120px", render: row => row.departamento || 'N/A' },
  codigo_entidad: { title: "Código de Entidad", filterKey: "codigo_entidad", minWidth: "120px", render: row => row.codigo_entidad || 'N/A' },
  urlproceso: { title: "URL del Proceso", filterKey: "urlproceso", minWidth: "150px", render: row => row.urlproceso ? <a href={row.urlproceso} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Ver Proceso</a> : 'N/A' },
  fecha_de_inicio_del_contrato: { title: "Fecha Inicio", filterKey: "fecha_de_inicio_del_contrato", minWidth: "120px", render: row => row.fecha_de_inicio_del_contrato || 'N/A' },
  fecha_de_fin_del_contrato: { title: "Fecha Fin", filterKey: "fecha_de_fin_del_contrato", minWidth: "120px", render: row => row.fecha_de_fin_del_contrato || 'N/A' },
  duraci_n_del_contrato: { title: "Duración", filterKey: "duraci_n_del_contrato", minWidth: "100px", render: row => row.duraci_n_del_contrato || 'N/A' },
  dias_adicionados: { title: "Días Adicionados", filterKey: "dias_adicionados", minWidth: "100px", render: row => row.dias_adicionados || 'N/A' },
  id_contrato: { title: "ID Contrato", filterKey: "id_contrato", minWidth: "150px", render: row => <div className="truncate max-w-[150px]" title={row.id_contrato}>{row.id_contrato || 'N/A'}</div> },
  referencia_del_contrato: { title: "Referencia Contrato", filterKey: "referencia_del_contrato", minWidth: "150px", render: row => row.referencia_del_contrato || 'N/A' },
  proceso_de_compra: { title: "Proceso de Compra", filterKey: "proceso_de_compra", minWidth: "150px", render: row => row.proceso_de_compra || 'N/A' },
  descripcion_del_proceso: { title: "Descripción del Proceso", filterKey: "descripcion_del_proceso", minWidth: "250px", render: row => <div className="truncate max-w-[300px]" title={row.descripcion_del_proceso}>{row.descripcion_del_proceso || 'N/A'}</div> },
  codigo_de_categoria_principal: { title: "Código Categoría", filterKey: "codigo_de_categoria_principal", minWidth: "120px", render: row => row.codigo_de_categoria_principal || 'N/A' },
  condiciones_de_entrega: { title: "Condiciones de Entrega", filterKey: "condiciones_de_entrega", minWidth: "150px", render: row => row.condiciones_de_entrega || 'N/A' },
  justificacion_modalidad_de: { title: "Justificación Modalidad", filterKey: "justificacion_modalidad_de", minWidth: "200px", render: row => <div className="truncate max-w-[200px]" title={row.justificacion_modalidad_de}>{row.justificacion_modalidad_de || 'N/A'}</div> },
  modalidad_de_contratacion: { title: "Modalidad", filterKey: "modalidad_de_contratacion", minWidth: "150px", render: row => row.modalidad_de_contratacion || 'N/A' },
  es_grupo: { title: "¿Es Grupo?", filterKey: "es_grupo", minWidth: "80px", render: row => row.es_grupo || 'N/A' },
  es_pyme: { title: "¿Es PyME?", filterKey: "es_pyme", minWidth: "80px", render: row => row.es_pyme || 'N/A' },
  codigo_proveedor: { title: "Código Proveedor", filterKey: "codigo_proveedor", minWidth: "120px", render: row => row.codigo_proveedor || 'N/A' },
  tipodocproveedor: { title: "Tipo Doc. Proveedor", filterKey: "tipodocproveedor", minWidth: "120px", render: row => row.tipodocproveedor || 'N/A' },
  nacionalidad_representante_legal: { title: "Nacionalidad Rep.", filterKey: "nacionalidad_representante_legal", minWidth: "120px", render: row => row.nacionalidad_representante_legal || 'N/A' },
  domicilio_representante_legal: { title: "Domicilio Rep.", filterKey: "domicilio_representante_legal", minWidth: "120px", render: row => row.domicilio_representante_legal || 'N/A' },
  g_nero_representante_legal: { title: "Género Rep.", filterKey: "g_nero_representante_legal", minWidth: "100px", render: row => row.g_nero_representante_legal || 'N/A' },
  valor_pendiente_de_ejecucion: { title: "Valor Pend. Ejecución", filterKey: "valor_pendiente_de_ejecucion", minWidth: "120px", render: row => row.valor_pendiente_de_ejecucion ? `$${Number(row.valor_pendiente_de_ejecucion).toLocaleString('es-CO')}` : 'N/A' },
  valor_pagado: { title: "Valor Pagado", filterKey: "valor_pagado", minWidth: "120px", render: row => row.valor_pagado ? `$${Number(row.valor_pagado).toLocaleString('es-CO')}` : 'N/A' },
  valor_pendiente_de_pago: { title: "Valor Pend. Pago", filterKey: "valor_pendiente_de_pago", minWidth: "120px", render: row => row.valor_pendiente_de_pago ? `$${Number(row.valor_pendiente_de_pago).toLocaleString('es-CO')}` : 'N/A' },
  valor_amortizado: { title: "Valor Amortizado", filterKey: "valor_amortizado", minWidth: "120px", render: row => row.valor_amortizado ? `$${Number(row.valor_amortizado).toLocaleString('es-CO')}` : 'N/A' },
  valor_facturado: { title: "Valor Facturado", filterKey: "valor_facturado", minWidth: "120px", render: row => row.valor_facturado ? `$${Number(row.valor_facturado).toLocaleString('es-CO')}` : 'N/A' },
  valor_de_pago_adelantado: { title: "Pago Adelantado", filterKey: "valor_de_pago_adelantado", minWidth: "120px", render: row => row.valor_de_pago_adelantado ? `$${Number(row.valor_de_pago_adelantado).toLocaleString('es-CO')}` : 'N/A' },
  saldo_cdp: { title: "Saldo CDP", filterKey: "saldo_cdp", minWidth: "120px", render: row => row.saldo_cdp ? `$${Number(row.saldo_cdp).toLocaleString('es-CO')}` : 'N/A' },
  saldo_vigencia: { title: "Saldo Vigencia", filterKey: "saldo_vigencia", minWidth: "120px", render: row => row.saldo_vigencia ? `$${Number(row.saldo_vigencia).toLocaleString('es-CO')}` : 'N/A' },
  nombre_del_banco: { title: "Nombre del Banco", filterKey: "nombre_del_banco", minWidth: "150px", render: row => row.nombre_del_banco || 'N/A' },
  tipo_de_cuenta: { title: "Tipo de Cuenta", filterKey: "tipo_de_cuenta", minWidth: "120px", render: row => row.tipo_de_cuenta || 'N/A' },
  n_mero_de_cuenta: { title: "Número de Cuenta", filterKey: "n_mero_de_cuenta", minWidth: "150px", render: row => row.n_mero_de_cuenta || 'N/A' },
  nombre_ordenador_de_pago: { title: "Ordenador de Pago", filterKey: "nombre_ordenador_de_pago", minWidth: "150px", render: row => row.nombre_ordenador_de_pago || 'N/A' },
  nombre_ordenador_del_gasto: { title: "Ordenador del Gasto", filterKey: "nombre_ordenador_del_gasto", minWidth: "150px", render: row => row.nombre_ordenador_del_gasto || 'N/A' },
  nombre_supervisor: { title: "Nombre Supervisor", filterKey: "nombre_supervisor", minWidth: "150px", render: row => row.nombre_supervisor || 'N/A' },
  tipo_de_documento_supervisor: { title: "Tipo Doc. Supervisor", filterKey: "tipo_de_documento_supervisor", minWidth: "120px", render: row => row.tipo_de_documento_supervisor || 'N/A' },
  n_mero_de_documento_supervisor: { title: "Doc. Supervisor", filterKey: "n_mero_de_documento_supervisor", minWidth: "120px", render: row => row.n_mero_de_documento_supervisor || 'N/A' },
  liquidaci_n: { title: "Liquidación", filterKey: "liquidaci_n", minWidth: "100px", render: row => row.liquidaci_n || 'N/A' },
  fecha_inicio_liquidacion: { title: "Inicio Liquidación", filterKey: "fecha_inicio_liquidacion", minWidth: "120px", render: row => row.fecha_inicio_liquidacion || 'N/A' },
  fecha_fin_liquidacion: { title: "Fin Liquidación", filterKey: "fecha_fin_liquidacion", minWidth: "120px", render: row => row.fecha_fin_liquidacion || 'N/A' },
  obligaci_n_ambiental: { title: "Obligación Ambiental", filterKey: "obligaci_n_ambiental", minWidth: "150px", render: row => row.obligaci_n_ambiental || 'N/A' },
  obligaciones_postconsumo: { title: "Obligación Postconsumo", filterKey: "obligaciones_postconsumo", minWidth: "150px", render: row => row.obligaciones_postconsumo || 'N/A' },
  documentos_tipo: { title: "Documentos Tipo", filterKey: "documentos_tipo", minWidth: "120px", render: row => row.documentos_tipo || 'N/A' },
  descripcion_documentos_tipo: { title: "Desc. Documentos Tipo", filterKey: "descripcion_documentos_tipo", minWidth: "200px", render: row => <div className="truncate max-w-[200px]" title={row.descripcion_documentos_tipo}>{row.descripcion_documentos_tipo || 'N/A'}</div> },
  ultima_actualizacion: { title: "Última Actualización", filterKey: "ultima_actualizacion", minWidth: "120px", render: row => row.ultima_actualizacion || 'N/A' },
  el_contrato_puede_ser_prorrogado: { title: "¿Prorrogable?", filterKey: "el_contrato_puede_ser_prorrogado", minWidth: "100px", render: row => row.el_contrato_puede_ser_prorrogado || 'N/A' },
  fecha_de_notificaci_n_de_prorrogaci_n: { title: "Fecha Prórroga", filterKey: "fecha_de_notificaci_n_de_prorrogaci_n", minWidth: "120px", render: row => row.fecha_de_notificaci_n_de_prorrogaci_n || 'N/A' },
  cantidad_documentos_pdf: { title: "Cantidad PDFs", filterKey: "cantidad_documentos_pdf", minWidth: "100px", render: row => row.cantidad_documentos_pdf ?? 'No encontrado' },
  nombre_pdf: { title: "Nombres de los PDFs", filterKey: "nombre_pdf", minWidth: "250px", render: row => <div className="truncate max-w-[250px]" title={row.nombre_pdf}>{row.nombre_pdf || 'No encontrado'}</div> },
  sha_pdf: { title: "SHA-256 PDFs", filterKey: "sha_pdf", minWidth: "250px", render: row => <div className="truncate max-w-[250px] font-mono text-[10px]" title={row.sha_pdf}>{row.sha_pdf || 'No encontrado'}</div> },
  total_contratos: { title: "Total Contratos Tercero", filterKey: "total_contratos", minWidth: "120px", render: row => row.total_contratos ?? 'No calculado' },
  valor_total_contratos: { title: "Valor Total Tercero", filterKey: "valor_total_contratos", minWidth: "150px", render: row => (row.valor_total_contratos !== 'No calculado' && row.valor_total_contratos) ? `$${Number(row.valor_total_contratos).toLocaleString('es-CO')}` : 'No calculado' },
  fecha_primer_contrato: { title: "Primer Contrato Tercero", filterKey: "fecha_primer_contrato", minWidth: "150px", render: row => row.fecha_primer_contrato || 'No calculado' },
  lista_entidades_contrato: { title: "Entidades del Tercero", filterKey: "lista_entidades_contrato", minWidth: "300px", render: row => <div className="truncate max-w-[300px]" title={row.lista_entidades_contrato}>{row.lista_entidades_contrato || 'No calculado'}</div> }
};

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId') || 'demo-id';
  
  const { 
    globalSearch, setGlobalSearch,
    stats, setStats,
    resultsData, setResultsData,
    selectedColumns, toggleColumn, toggleAllColumns, columnOrder
  } = useDashboardStore();

  const [loading, setLoading] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedContrato, setSelectedContrato] = useState<any | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [selectedNit, setSelectedNit] = useState<string | null>(null);
  const [showColumnConfigModal, setShowColumnConfigModal] = useState(false);
  const [showSmartRuleModal, setShowSmartRuleModal] = useState(false);
  const [showRetryModal, setShowRetryModal] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, text: string, key: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };
  
  // Scraper Robot State
  const [scraperActive, setScraperActive] = useState(searchParams?.get('running') === 'true');
  const [scraperLog, setScraperLog] = useState("Conectando con Robot de Extracción...");
  
  // Background API Search State
  const [isBackgroundFetching, setIsBackgroundFetching] = useState(searchParams?.get('is_background') === 'true');
  const [backgroundDownloaded, setBackgroundDownloaded] = useState(0);
  
  useEffect(() => {
    if (searchParams?.get('running') === 'true' || searchParams?.get('is_background') === 'true') {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete('running');
      currentUrl.searchParams.delete('is_background');
      window.history.replaceState({}, '', currentUrl.toString());
    }
  }, [searchParams]);
  
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

  // Polling automático para la descarga de fondo de la API SECOP
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isBackgroundFetching) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`http://127.0.0.1:8000/api/search/status/${jobId}`);
          if (res.ok) {
            const data = await res.json();
            setBackgroundDownloaded(data.descargados || 0);
            if (data.estado === 'Completado') {
              setIsBackgroundFetching(false);
              toast.success(`Descarga en segundo plano completada. Total: ${data.descargados} registros.`);
              fetchDashboardData(true);
              fetchStats();
            }
          }
        } catch (e) {
          console.error("Error polling background status:", e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isBackgroundFetching, jobId]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/dashboard/stats?jobId=${jobId}`);
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
      const url = `http://127.0.0.1:8000/api/dashboard/search?jobId=${jobId}&q=${encodeURIComponent(globalSearch)}`;
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

  const executeExcelExport = async (includeAnexo: boolean) => {
    setExportingExcel(true);
    setShowExportModal(false);
    try {
      const activeCols = Object.keys(selectedColumns).filter(k => selectedColumns[k as keyof typeof selectedColumns]);
      if (includeAnexo) {
        activeCols.push('informacion_anexa_tercero');
      }
      
      const res = await fetch('http://127.0.0.1:8000/api/export/excel', {
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
        a.download = `Reporte_SecopPRO_${jobId}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } else {
        alert("Hubo un error al generar el archivo Excel.");
      }
    } catch (error) {
      console.error("Error al exportar:", error);
    }
    setExportingExcel(false);
  };

  const handleDownloadZip = async (internalId: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/export/zip/${jobId}/${internalId}`);
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
      const res = await fetch('http://127.0.0.1:8000/api/dashboard/ocr', {
         method: 'POST',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({jobId, searchTerm: ocrSearchTerm})
      });
      if (res.ok) {
         const data = await res.json();
         setOcrResults(data.details || []);
         fetchDashboardData();
      } else {
         alert("Hubo un error en el motor OCR. Revisa la consola.");
      }
    } catch(e) {
      console.error("OCR Error:", e);
    }
    setIsOcrRunning(false);
  };

  const executeRetry = async (forceSecop: boolean, pdfStrategy: string) => {
    setShowRetryModal(false);
    setRetrying(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/retry-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          force_secop: forceSecop,
          pdf_strategy: pdfStrategy
        })
      });
      if (res.ok) {
        setResultsData([]);
        setScraperActive(true);
      } else {
        const err = await res.json();
        alert(err.detail || "Error al reintentar el análisis");
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al servidor");
    }
    setRetrying(false);
  };

  const renderToggle = (key: keyof typeof selectedColumns, label: string, tooltip: string = "") => (
    <div className="flex items-center justify-between group relative">
      <label className="flex items-center gap-3 cursor-pointer flex-1">
        <div className="relative flex items-center justify-center">
          <input 
            type="checkbox" 
            checked={selectedColumns[key]}
            onChange={() => toggleColumn(key)}
            className="peer sr-only"
          />
          <div className="w-5 h-5 border border-slate-300 rounded-md bg-slate-50 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center shadow-inner" />
          <CheckCircle className="absolute w-3.5 h-3.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" />
        </div>
        <span className="text-xs font-medium text-slate-600 group-hover:text-emerald-700 transition-colors">{label}</span>
      </label>
      {tooltip && (
        <div className="relative flex items-center">
          <HelpCircle className="w-4 h-4 text-slate-400 hover:text-emerald-500 transition-colors cursor-help" />
          <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-56 p-3 bg-white text-slate-700 text-xs rounded-xl shadow-xl z-[100] pointer-events-none border border-slate-100">
            <p className="font-bold mb-1 text-emerald-600">Campos en Excel:</p>
            <p className="leading-relaxed">{tooltip}</p>
          </div>
        </div>
      )}
    </div>
  );

  const renderTableContent = (isExpanded: boolean) => (
    <div className={`bg-white shadow-sm border border-slate-200/60 flex flex-col transition-all duration-300 relative w-full h-full ${isExpanded ? 'rounded-2xl' : 'rounded-2xl overflow-hidden flex-1 min-h-[500px]'}`}>
      <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 backdrop-blur-sm">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-3 tracking-wide">
          <span className="bg-emerald-100 text-emerald-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black border border-emerald-200">2</span> 
          Vista previa del reporte {isExpanded && '(Modo Expandido)'}
        </h3>
        <div className="flex items-center gap-5">
          <button 
            onClick={() => setIsTableExpanded(!isTableExpanded)} 
            className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-5 py-2.5 rounded-xl hover:bg-emerald-100 flex items-center gap-2 transition-all shadow-sm hover:scale-105 hover:shadow-emerald-200"
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />} 
            {isExpanded ? 'Contraer tabla' : 'Ampliar tabla completa'}
          </button>
          <div className="w-px h-5 bg-slate-200"></div>
          <button onClick={() => setShowColumnConfigModal(true)} className="text-xs font-bold text-slate-500 hover:text-emerald-600 flex items-center gap-2 transition-colors">
            <Settings className="w-4 h-4" /> Configurar columnas
          </button>
          <button onClick={() => setColumnFilters({})} className="text-xs font-bold text-slate-500 hover:text-red-500 flex items-center gap-2 transition-colors">
            <SlidersHorizontal className="w-4 h-4" /> Limpiar filtros
          </button>
          <span className="text-xs text-slate-500 font-bold bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">{filteredData.length} registros</span>
        </div>
      </div>
      
      {/* Scrollable table container */}
      <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar bg-white">
        <table className="w-full text-left text-xs whitespace-nowrap min-w-[1200px] border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold sticky top-0 shadow-sm z-30">
            <tr>
              {columnOrder.map(colKey => {
                if (!selectedColumns[colKey as keyof typeof selectedColumns]) return null;
                const config = COLUMNS_CONFIG_TABLE[colKey as string] || { title: colKey, filterKey: colKey, minWidth: "120px", render: (r: any) => "N/A" };
                return (
                  <th key={colKey} className="px-5 py-4 align-top bg-slate-50" style={{ minWidth: config.minWidth }}>
                    <div className="tracking-wide uppercase text-[10px] text-slate-500 mb-2">{config.title}</div>
                    {config.filterKey && (
                      <input type="text" placeholder="Filtrar..." className="w-full text-[11px] p-2 border border-slate-200 rounded-lg font-normal shadow-inner bg-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-slate-800 placeholder-slate-400" value={columnFilters[config.filterKey] || ''} onChange={(e) => setColumnFilters({...columnFilters, [config.filterKey!]: e.target.value})} />
                    )}
                  </th>
                );
              })}
              <th className="px-5 py-4 text-center align-top min-w-[100px] bg-slate-50"><div className="tracking-wide uppercase text-[10px] text-slate-500">Acciones</div></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={columnOrder.length + 1} className="px-6 py-20 text-center text-slate-400 font-medium bg-slate-50/50">
                  <div className="flex flex-col items-center justify-center gap-3">
                     <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
                     Cargando datos...
                  </div>
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={columnOrder.length + 1} className="px-6 py-20 text-center text-slate-500 font-medium bg-slate-50/50">
                  No hay registros que coincidan con los filtros aplicados en la base de datos.
                </td>
              </tr>
            ) : (
              filteredData.map((row, idx) => (
                <tr key={row.internal_id || idx} className="hover:bg-emerald-50/30 transition-colors group">
                  {columnOrder.map(colKey => {
                    if (!selectedColumns[colKey as keyof typeof selectedColumns]) return null;
                    const config = COLUMNS_CONFIG_TABLE[colKey as string];
                    if (!config) return <td key={colKey} className="px-5 py-2">N/A</td>;
                    
                    return (
                      <td key={colKey} className="px-3 py-2 group/cell">
                        <div className="transition-all duration-300 ease-out group-hover/cell:bg-white group-hover/cell:scale-[1.1] group-hover/cell:shadow-xl group-hover/cell:shadow-emerald-900/10 group-hover/cell:-translate-y-1 group-hover/cell:z-20 relative rounded-xl p-3 border border-transparent group-hover/cell:border-emerald-200 flex items-center justify-between gap-3 min-h-[50px] cursor-default">
                           <div className="flex-1 min-w-0">
                             {config.render(row, { setSelectedNit })}
                           </div>
                           
                           {/* Copy Button */}
                           <button 
                             onClick={(e) => {
                               let valueToCopy = "";
                               if (colKey === 'regla_firma_pub') valueToCopy = row.regla_firma_pub_cumple === true ? 'Cumple' : 'No cumple';
                               else if (colKey === 'regla_firma_inicio') valueToCopy = row.regla_firma_inicio_cumple === true ? 'Cumple' : 'No cumple';
                               else if (colKey === 'regla_inicio_fin') valueToCopy = row.regla_inicio_fin_cumple === true ? 'Cumple' : 'Incoherente';
                               else if (colKey === 'valor_contrato') valueToCopy = String(row.valor_del_contrato || row.valor_contrato || '');
                               else if (colKey === 'estado') valueToCopy = (row.regla_firma_pub_cumple === false || row.regla_firma_inicio_cumple === false || row.regla_inicio_fin_cumple === false) ? 'Alerta' : 'Aprobado';
                               else valueToCopy = String(row[config.filterKey || colKey] || '');
                               
                               handleCopy(e, valueToCopy, `${row.internal_id || idx}-${colKey}`);
                             }}
                             className="opacity-0 group-hover/cell:opacity-100 p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all flex-shrink-0"
                             title="Copiar dato"
                           >
                             {copiedKey === `${row.internal_id || idx}-${colKey}` ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                           </button>
                        </div>
                      </td>
                    );
                  })}
                  
                  <td className="px-5 py-2 text-center group/cell">
                    <div className="flex items-center justify-center gap-2 transition-all duration-300 ease-out group-hover/cell:bg-white group-hover/cell:scale-[1.1] group-hover/cell:shadow-xl group-hover/cell:-translate-y-1 group-hover/cell:z-20 relative rounded-xl p-3 border border-transparent group-hover/cell:border-emerald-200 min-h-[50px]">
                      <button 
                        onClick={() => setSelectedContrato(row)}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-100 rounded-lg transition-all border border-transparent hover:border-emerald-200"
                        title="Ver detalle JSON Raw"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDownloadZip(row.internal_id)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-all border border-transparent hover:border-blue-200"
                        title="Descargar ZIP local"
                      >
                        <DownloadCloud className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between rounded-b-2xl">
        <span className="text-xs font-medium text-slate-500">Mostrando {filteredData.length} registros en total</span>
        {/* Minimal Pagination placeholder */}
        <div className="flex gap-2">
          <button className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 bg-white hover:bg-slate-50 transition-colors shadow-sm">&lt;</button>
          <button className="px-3.5 py-1.5 border border-emerald-500/50 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 shadow-sm">1</button>
          <button className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 bg-white hover:bg-slate-50 transition-colors shadow-sm">&gt;</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 selection:bg-emerald-100 selection:text-emerald-900">
      
      {/* HEADER AMBIENT GLOW */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-32 bg-emerald-100/50 blur-[100px] pointer-events-none" />

      {/* HEADER */}
      <header className="bg-white/80 backdrop-blur-2xl border-b border-slate-200/60 py-4 px-6 sticky top-0 z-20 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/mapping')} className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-emerald-600 transition-all border border-slate-200/60 shadow-sm">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20 border border-emerald-400/20">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                SecopPRO 
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] text-emerald-700 uppercase tracking-widest font-semibold">Forensic</span>
              </h1>
              <h2 className="text-xs text-slate-500 font-medium mt-0.5">Dashboard de Resultados y Exportación</h2>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {isBackgroundFetching && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, x: 20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, x: 20 }}
                className="flex items-center gap-3 bg-white border border-emerald-200 px-4 py-2 rounded-xl shadow-lg shadow-emerald-500/10 mr-2"
              >
                <RefreshCw className="w-4 h-4 text-emerald-500 animate-spin" />
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Descargando Histórico</span>
                  <span className="text-xs font-bold text-slate-700">{backgroundDownloaded.toLocaleString('es-CO')} registros</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button 
            onClick={() => setShowRetryModal(true)}
            disabled={exportingExcel || loading || retrying || scraperActive}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-semibold rounded-xl hover:bg-indigo-100 transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
            Reintentar Análisis
          </button>
          
          <button 
            onClick={() => usePdfExporterStore.getState().setIsOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-all shadow-sm"
          >
            <FileText className="w-4 h-4" />
            Exportar PDF
          </button>
          <button 
            onClick={() => setShowExportModal(true)}
            disabled={exportingExcel || loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold rounded-xl hover:from-emerald-500 hover:to-teal-500 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {exportingExcel ? 'Exportando...' : 'Exportar a Excel'}
          </button>
        </div>
      </header>

      {/* Main content wrapper */}
      <main className="flex-1 p-6 overflow-y-auto overflow-x-hidden flex flex-col gap-6 max-w-[1920px] mx-auto w-full relative z-10 custom-scrollbar">
        
        {/* TOP ROW: KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60 flex items-center gap-5 relative overflow-hidden group hover:shadow-md transition-shadow">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-50/0 via-blue-50/50 to-blue-50/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-inner">
              <BarChart2 className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Procesos Analizados</p>
              <div className="flex items-end gap-3 mt-1">
                <span className="text-4xl font-black text-slate-900 tracking-tight">{stats.procesosAnalizados.toLocaleString('es-CO')}</span>
                <span className="text-xs font-medium text-slate-400 mb-1.5">Procesos en total</span>
              </div>
            </div>
          </motion.div>
          
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60 flex items-center gap-5 relative overflow-hidden group hover:shadow-md transition-shadow">
            <div className="absolute inset-0 bg-gradient-to-r from-red-50/0 via-red-50/50 to-red-50/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100 shadow-inner">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Alertas Encontradas</p>
              <div className="flex items-end gap-3 mt-1">
                <span className="text-4xl font-black text-slate-900 tracking-tight">{stats.alertasEncontradas}</span>
                <span className="text-xs font-bold text-red-600 mb-1.5 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">Requieren revisión</span>
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60 flex items-center gap-5 relative overflow-hidden group hover:shadow-md transition-shadow">
             <div className="absolute inset-0 bg-gradient-to-r from-emerald-50/0 via-emerald-50/50 to-emerald-50/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-inner">
              <CheckCircle className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Tasa de Cumplimiento</p>
              <div className="flex items-end gap-3 mt-1">
                <span className="text-4xl font-black text-slate-900 tracking-tight">{stats.tasaCumplimiento}%</span>
                <span className="text-xs font-medium text-emerald-500 mb-1.5">Cálculo general</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* SEARCH BAR */}
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="relative group">
          <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            className="block w-full pl-14 pr-20 py-4 bg-white border border-slate-200/80 rounded-2xl leading-5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 sm:text-sm shadow-sm transition-all"
            placeholder="Búsqueda global en todos los resultados (NIT, valores, palabras OCR)..."
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
          />
          <div className="absolute inset-y-0 right-0 pr-5 flex items-center pointer-events-none">
            <kbd className="inline-flex items-center px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs font-sans font-bold text-slate-400 shadow-sm">Ctrl + K</kbd>
          </div>
        </motion.div>

        {/* PANELS ROW */}
        <div className="flex items-center justify-between mt-2">
          <h2 className="text-sm font-bold text-slate-700 tracking-wide uppercase">Configuración de Columnas para Exportación</h2>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => toggleAllColumns(true)} 
              className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 rounded-xl transition-all border border-emerald-200 shadow-sm"
            >
              Marcar Todas
            </button>
            <button 
              onClick={() => toggleAllColumns(false)} 
              className="text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 px-4 py-2 rounded-xl transition-all border border-slate-200 shadow-sm"
            >
              Desmarcar Todas
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Panel 1 */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60 flex flex-col hover:shadow-md transition-shadow">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-3 mb-5 pb-3 border-b border-slate-100">
              <div className="p-1.5 bg-emerald-50 rounded-lg"><FileSearch className="w-4 h-4 text-emerald-600" /></div>
              Información General
            </h3>
            <div className="grid grid-cols-2 gap-y-4 gap-x-4">
              {renderToggle('nombre_entidad', 'Nombre Entidad')}
              {renderToggle('nit_entidad', 'NIT Entidad')}
              {renderToggle('ciudad', 'Ciudad')}
              {renderToggle('nombre_contratista', 'Nombre Contratista')}
              {renderToggle('nit_contratista', 'NIT/Cédula Contratista')}
              {renderToggle('valor_contrato', 'Valor Contrato')}
              {renderToggle('fecha_contrato', 'Fecha Contrato')}
              {renderToggle('nombre_representante', 'Nombre Representante')}
              {renderToggle('identificacion_representante', 'Cédula/NIT Representante')}
              {renderToggle('telefono_representante', 'Teléfono Representante')}
              {renderToggle('correo_representante', 'Correo Representante')}
              {renderToggle('tipo_contrato', 'Tipo de Contrato')}
            </div>
          </motion.div>

          {/* Panel 2 */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60 flex flex-col hover:shadow-md transition-shadow">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-3 mb-5 pb-3 border-b border-slate-100">
              <div className="p-1.5 bg-blue-50 rounded-lg"><Database className="w-4 h-4 text-blue-600" /></div>
              Otras Columnas (Ocultas)
            </h3>
            <div className="grid grid-cols-2 gap-y-4 gap-x-4">
              {renderToggle('numero_proceso', 'Número Proceso')}
              {renderToggle('estado', 'Estado')}
              {renderToggle('objeto', 'Objeto')}
              {renderToggle('contratista', 'Contratista')}
              {renderToggle('documentos', 'Documentos')}
              {renderToggle('pagos', 'Pagos')}
            </div>
          </motion.div>

          {/* Panel 3 */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60 flex flex-col hover:shadow-md transition-shadow">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-3 mb-5 pb-3 border-b border-slate-100">
              <div className="p-1.5 bg-amber-50 rounded-lg"><Scale className="w-4 h-4 text-amber-500" /></div>
              <span className="flex-1">Comparaciones</span>
              <button 
                onClick={() => setShowSmartRuleModal(true)}
                className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-slate-700 transition-colors border border-transparent hover:border-slate-200"
                title="Resolución Inteligente de Reglas (RAG)"
              >
                <Settings className="w-4 h-4" />
              </button>
            </h3>
            <div className="flex flex-col gap-4 mb-4">
              {renderToggle('regla_firma_pub', 'Comparar Fecha Publicación vs Firma', 'regla_firma_pub_cumple, regla_firma_pub_diff')}
              {renderToggle('regla_firma_inicio', 'Comparar Fecha Firma vs Inicio', 'regla_firma_inicio_cumple, regla_firma_inicio_diff')}
              {renderToggle('regla_inicio_fin', 'Comparar Fecha Inicio vs Terminación', 'regla_inicio_fin_cumple, regla_inicio_fin_diff')}
            </div>
            
            <div className="mt-auto pt-4 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-500 mb-3 uppercase tracking-wider">Reglas personalizadas</p>
              <div className="flex items-center gap-2 mb-3">
                <select className="flex-1 text-xs border border-slate-200 rounded-lg p-2 text-slate-700 bg-slate-50 outline-none focus:border-emerald-500">
                  <option>Fecha Firma</option>
                  <option>Fecha Inicio</option>
                </select>
                <span className="text-slate-400 text-xs font-bold">+</span>
                <input type="number" defaultValue={3} className="w-12 text-center text-xs border border-slate-200 rounded-lg p-2 text-slate-700 bg-slate-50 outline-none focus:border-emerald-500" />
                <select className="w-16 text-xs border border-slate-200 rounded-lg p-2 text-slate-700 bg-slate-50 outline-none focus:border-emerald-500">
                  <option>Días</option>
                  <option>Meses</option>
                </select>
                <select className="flex-1 text-xs border border-slate-200 rounded-lg p-2 text-slate-700 bg-slate-50 outline-none focus:border-emerald-500">
                  <option>Fecha Publicación</option>
                  <option>Fecha Terminación</option>
                </select>
              </div>
              <button className="w-full py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-100 transition-colors flex items-center justify-center gap-2">
                + Agregar Regla
              </button>
            </div>
          </motion.div>

          {/* Panel 4 */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60 flex flex-col hover:shadow-md transition-shadow">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-3 mb-5 pb-3 border-b border-slate-100">
              <div className="p-1.5 bg-indigo-50 rounded-lg"><FileSignature className="w-4 h-4 text-indigo-600" /></div>
              Hallazgos OCR
            </h3>
            <div className="flex flex-col gap-4">
              {renderToggle('ocr_poliza', 'Pólizas de Cumplimiento')}
              {renderToggle('ocr_garantia', 'Garantías Bancarias')}
              {renderToggle('ocr_anticipo', 'Anticipos')}
            </div>
          </motion.div>
        </div>

        {/* PANEL DE OCR AVANZADO */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-slate-900 rounded-2xl shadow-xl border border-slate-800 overflow-hidden flex flex-col relative group mt-4">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent pointer-events-none" />
          <div className="bg-gradient-to-r from-emerald-900 to-slate-900 px-6 py-4 flex items-center justify-between shadow-inner border-b border-white/10">
             <h3 className="text-white font-bold flex items-center gap-3 text-lg">
               <div className="bg-black/30 p-2 rounded-xl backdrop-blur-md border border-white/10"><FileSignature className="w-5 h-5 text-emerald-400" /></div>
               Motor de Análisis Forense (OCR + IA)
             </h3>
             <span className="text-emerald-300 text-xs bg-emerald-950/50 px-3 py-1.5 rounded-lg font-bold border border-emerald-500/20 flex items-center gap-2 shadow-inner">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
               Búsqueda profunda en PDFs
             </span>
          </div>
          <div className="p-6 relative z-10 bg-slate-900">
             <p className="text-sm text-slate-400 mb-5 leading-relaxed max-w-4xl">Ingresa el término que deseas buscar en los documentos físicos descargados (ej. "póliza de cumplimiento", "anticipo"). El sistema usará OCR para leer los PDFs e IA para identificar variaciones del término, devolviendo el contexto exacto donde fue hallado.</p>
             <div className="flex gap-4">
               <input 
                 type="text"
                 placeholder="Término a buscar..."
                 className="flex-1 bg-slate-950/50 backdrop-blur-sm border border-white/10 rounded-xl px-5 py-4 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-inner text-sm text-white placeholder-slate-500 transition-all"
                 value={ocrSearchTerm}
                 onChange={(e) => setOcrSearchTerm(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && runOcrScan()}
               />
               <button 
                 onClick={runOcrScan}
                 disabled={isOcrRunning || !ocrSearchTerm}
                 className="bg-emerald-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-emerald-500 shadow-lg shadow-emerald-900/50 disabled:opacity-50 disabled:shadow-none flex items-center gap-3 transition-all active:scale-[0.98] border border-emerald-400/20"
               >
                 {isOcrRunning ? (
                   <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                 ) : <Search className="w-5 h-5"/>}
                 {isOcrRunning ? 'Analizando Documentos...' : 'Extraer Contexto'}
               </button>
             </div>
             
             <AnimatePresence>
               {ocrResults.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-8 border-t border-white/10 pt-6">
                     <h4 className="font-bold text-white mb-5 flex items-center gap-3">
                       <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]"></span>
                       Resultados Encontrados ({ocrResults.length})
                     </h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[500px] overflow-y-auto pr-2 pb-2 custom-scrollbar">
                       {ocrResults.map((r, i) => (
                          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} key={i} className="bg-slate-950/50 backdrop-blur-sm border border-white/5 p-6 rounded-2xl shadow-lg hover:shadow-emerald-900/20 transition-all relative overflow-hidden group hover:border-emerald-500/30">
                             <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-emerald-400 to-teal-600"></div>
                             <div className="flex justify-between items-start mb-4">
                               <div>
                                 <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-500/20 px-2.5 py-1 rounded-md uppercase tracking-widest shadow-inner">Contrato: {r.llave}</span>
                                 <p className="text-xs text-slate-400 mt-2 truncate max-w-[250px] flex items-center gap-1.5" title={r.archivo}><FileText className="w-3.5 h-3.5 text-slate-500" /> {r.archivo}</p>
                               </div>
                             </div>
                             <div className="bg-slate-900/80 p-4 rounded-xl border border-white/5 relative shadow-inner">
                               <span className="absolute -top-3 -left-2 text-4xl text-slate-700 font-serif opacity-50">"</span>
                               <p className="text-sm text-slate-300 italic relative z-10 leading-relaxed font-serif">
                                 {r.match}
                               </p>
                             </div>
                          </motion.div>
                       ))}
                     </div>
                  </motion.div>
               )}
             </AnimatePresence>
          </div>
        </motion.div>

        {/* DATA TABLE (Standard View) */}
        {!isTableExpanded && renderTableContent(false)}

      </main>

      {/* FULLSCREEN TABLE MODAL */}
      <AnimatePresence>
        {isTableExpanded && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.98 }} 
            animate={{ opacity: 1, y: 0, scale: 1 }} 
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.4, type: "spring", bounce: 0 }}
            className="fixed inset-4 z-[99999] bg-white rounded-3xl shadow-[0_0_100px_rgba(0,0,0,0.2)] border border-slate-200 flex flex-col overflow-hidden"
          >
            {renderTableContent(true)}
          </motion.div>
        )}
      </AnimatePresence>


      {/* MODALS */}
      {/* MODAL DE EXPORTACIÓN EXCEL */}
      <AnimatePresence>
      {showExportModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center gap-4 bg-slate-50">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-inner text-white">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Exportación a Excel</h2>
                <p className="text-sm text-slate-500 mt-0.5">Configuración de libro maestro</p>
              </div>
            </div>
            <div className="p-6 flex flex-col gap-5 bg-white">
              <p className="text-sm text-slate-600 leading-relaxed text-center font-medium">
                ¿Desea anexar la información detallada de los terceros y su histórico de contratos?
              </p>
              <div className="flex flex-col gap-3 mt-2">
                <button 
                  onClick={() => executeExcelExport(true)}
                  className="w-full text-left p-5 rounded-2xl border-2 border-emerald-500 bg-emerald-50 hover:bg-emerald-100 transition-all flex gap-4 items-center group shadow-sm hover:shadow-md"
                >
                  <div className="bg-emerald-100 p-2.5 rounded-xl border border-emerald-200 group-hover:scale-110 transition-transform"><CheckCircle className="w-6 h-6 text-emerald-600" /></div>
                  <div>
                    <h3 className="font-bold text-emerald-900 text-sm">Sí, anexar información de terceros</h3>
                    <p className="text-xs text-emerald-700/80 mt-1">Genera pestañas independientes para cada contratista.</p>
                  </div>
                </button>

                <button 
                  onClick={() => executeExcelExport(false)}
                  className="w-full text-left p-5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-all flex gap-4 items-center group"
                >
                  <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200 group-hover:scale-110 transition-transform"><FileText className="w-6 h-6 text-slate-500" /></div>
                  <div>
                    <h3 className="font-bold text-slate-700 text-sm">No, solo exportar tabla actual</h3>
                    <p className="text-xs text-slate-500 mt-1">Exporta únicamente la información visible en la pantalla.</p>
                  </div>
                </button>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setShowExportModal(false)}
                className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 shadow-sm"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Modal Reporte Contratista */}
      {selectedNit && (
        <ContractorReportModal 
          nit={selectedNit} 
          onClose={() => setSelectedNit(null)} 
        />
      )}
      
      {/* Modal Exportar PDF */}
      <PdfExporterModal jobId={jobId} />

      {/* MODAL CONFIGURACION DE COLUMNAS */}
      <ColumnConfigModal 
        isOpen={showColumnConfigModal} 
        onClose={() => setShowColumnConfigModal(false)} 
      />

      {/* Modal de Detalles Profundos */}
      {showSmartRuleModal && (
        <SmartRuleValidatorModal 
          isOpen={showSmartRuleModal}
          onClose={() => setShowSmartRuleModal(false)}
          jobId={jobId}
          resultsData={resultsData}
          onRefresh={() => {
            window.location.reload();
          }}
        />
      )}

      <AnimatePresence>
      {selectedContrato && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 z-[999999]">
          <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100"><Database className="w-6 h-6 text-emerald-600" /></div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Visor de Datos y JSON Raw</h3>
                  <p className="text-sm text-slate-500 mt-1">Llave Identificadora: <span className="font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">{selectedContrato.llave_busqueda}</span></p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedContrato(null)}
                className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto bg-slate-50 flex-1 custom-scrollbar">
              <h4 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wider flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Objeto Raw (SECOP + Reglas Pandas)</h4>
              <div className="bg-slate-900 rounded-2xl p-5 shadow-inner border border-slate-800 overflow-x-auto relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                <pre className="text-emerald-400/90 font-mono text-sm leading-relaxed">
                  {JSON.stringify(selectedContrato, null, 2)}
                </pre>
              </div>
            </div>
            
            <div className="p-5 border-t border-slate-100 bg-white flex justify-end">
              <button 
                onClick={() => setSelectedContrato(null)}
                className="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl transition-all shadow-sm border border-slate-700"
              >
                Cerrar Visor
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Modal de Reintento */}
      <AnimatePresence>
      {showRetryModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-lg w-full text-center border border-slate-200 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-50 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <div className="w-20 h-20 bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner transform rotate-3">
                <RefreshCw className="w-10 h-10" />
              </div>
              <h3 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Reintentar Análisis</h3>
              <p className="mb-8 text-slate-500 text-sm leading-relaxed">
                Selecciona cómo deseas volver a procesar las llaves guardadas para este análisis forense.
              </p>
              <div className="flex flex-col gap-3 justify-center mb-6 text-sm">
                <button 
                  onClick={() => executeRetry(false, 'copy')}
                  className="w-full px-5 py-4 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-2xl font-bold hover:bg-indigo-100 transition-all active:scale-[0.98]"
                >
                  Cargar Datos (Caché) y Copiar PDFs
                </button>
                <button 
                  onClick={() => executeRetry(false, 'scrape')}
                  className="w-full px-5 py-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl font-bold hover:bg-emerald-100 transition-all active:scale-[0.98]"
                >
                  Cargar Datos (Caché) y Re-descargar PDFs
                </button>
                <button 
                  onClick={() => executeRetry(false, 'ignore')}
                  className="w-full px-5 py-4 bg-slate-100 border border-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-200 transition-all active:scale-[0.98]"
                >
                  Solo Datos (Ignorar PDFs)
                </button>
                <div className="h-px bg-slate-200 my-2 w-1/2 mx-auto" />
                <button 
                  onClick={() => executeRetry(true, 'ignore')}
                  className="w-full px-5 py-4 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl font-bold hover:bg-amber-100 transition-all active:scale-[0.98]"
                >
                  Sobrescribir Datos SECOP (Sin PDFs)
                </button>
                <button 
                  onClick={() => executeRetry(true, 'scrape')}
                  className="w-full px-5 py-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl font-bold hover:bg-red-100 transition-all active:scale-[0.98]"
                >
                  Sobrescribir TODO desde SECOP (Lento)
                </button>
              </div>
              <button onClick={() => setShowRetryModal(false)} className="text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors">
                Cancelar operación
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

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
