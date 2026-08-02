'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, Download, FileText, Search, 
  BarChart2, AlertTriangle, CheckCircle, 
  Settings, SlidersHorizontal, Eye, DownloadCloud,
  FileSearch, Scale, FileSignature, Database, HelpCircle, MessageSquare, X, Send,
  Maximize2, Minimize2, RefreshCw
} from 'lucide-react';
import { useDashboardStore } from '@/store/useDashboardStore';
import HackerOverlay from '@/components/loading/HackerOverlay';
import ContractorReportModal from '@/components/modals/ContractorReportModal';
import ColumnConfigModal from '@/components/modals/ColumnConfigModal';
import SmartRuleValidatorModal from '@/components/modals/SmartRuleValidatorModal';
import { PdfExporterModal, usePdfExporterStore } from '@/components/pdf-exporter';

const COLUMNS_CONFIG_TABLE: Record<string, { title: string, filterKey?: string, minWidth: string, render: (row: any, actions: any) => React.ReactNode }> = {
  nombre_entidad: { title: "Nombre Entidad", filterKey: "nombre_entidad", minWidth: "150px", render: row => <div className="truncate max-w-[200px]" title={row.nombre_entidad}>{row.nombre_entidad || 'N/A'}</div> },
  nit_entidad: { title: "NIT Entidad", filterKey: "nit_entidad", minWidth: "120px", render: row => <div className="font-medium text-gray-700">{row.nit_entidad || 'N/A'}</div> },
  ciudad: { title: "Ciudad", filterKey: "ciudad", minWidth: "100px", render: row => row.ciudad || 'N/A' },
  nombre_contratista: { title: "Nombre Contratista", filterKey: "proveedor_adjudicado", minWidth: "150px", render: row => <div className="truncate max-w-[200px]" title={row.proveedor_adjudicado}>{row.proveedor_adjudicado || 'N/A'}</div> },
  nit_contratista: { title: "NIT/Cédula Contratista", filterKey: "documento_proveedor", minWidth: "150px", render: (row, { setSelectedNit }) => (
    <div className="flex items-center gap-2 font-medium text-gray-700">
      {row.documento_proveedor || 'N/A'}
      {row.documento_proveedor && (
        <button onClick={() => setSelectedNit(row.documento_proveedor)} className="text-gray-400 hover:text-emerald-600 transition-colors" title="Ver Historial del Contratista"><Eye className="w-4 h-4" /></button>
      )}
    </div>
  )},
  valor_contrato: { title: "Valor Contrato", filterKey: "valor_del_contrato", minWidth: "120px", render: row => <div className="font-medium">{row.valor_del_contrato || row.valor_contrato ? `$${Number(row.valor_del_contrato || row.valor_contrato).toLocaleString('es-CO')}` : 'N/A'}</div> },
  fecha_contrato: { title: "Fecha Contrato", filterKey: "fecha_de_firma", minWidth: "120px", render: row => row.fecha_de_firma || 'N/A' },
  nombre_representante: { title: "Nombre Rep. Legal", filterKey: "nombre_representante_legal", minWidth: "150px", render: row => <div className="truncate max-w-[200px]" title={row.nombre_representante_legal}>{row.nombre_representante_legal || 'N/A'}</div> },
  identificacion_representante: { title: "Cédula/NIT Rep.", filterKey: "identificaci_n_representante_legal", minWidth: "120px", render: row => <div className="font-medium text-gray-700">{row.identificaci_n_representante_legal || 'N/A'}</div> },
  telefono_representante: { title: "Teléfono Rep.", filterKey: "telefono_representante_legal", minWidth: "120px", render: row => row.telefono_representante_legal || 'N/A' },
  correo_representante: { title: "Correo Rep.", filterKey: "correo_representante_legal", minWidth: "150px", render: row => <div className="text-emerald-600 truncate max-w-[200px]" title={row.correo_representante_legal}>{row.correo_representante_legal || 'N/A'}</div> },
  tipo_contrato: { title: "Tipo Contrato", filterKey: "tipo_de_contrato", minWidth: "120px", render: row => <div className="truncate max-w-[150px]" title={row.tipo_de_contrato}>{row.tipo_de_contrato || 'N/A'}</div> },
  numero_proceso: { title: "Número Proceso", filterKey: "llave_busqueda", minWidth: "120px", render: row => <div className="font-medium text-emerald-700">{row.llave_busqueda}</div> },
  regla_firma_pub: { title: "Firma +3 vs Pub", minWidth: "120px", render: row => (
    row.regla_firma_pub_cumple === null ? <span className="text-gray-400">Sin datos</span> :
    row.regla_firma_pub_cumple === true ? <span className="text-emerald-600 font-medium">Cumple</span> :
    <span className="text-red-600 font-medium">No cumple ({row.regla_firma_pub_diff}d)</span>
  )},
  regla_firma_inicio: { title: "Firma vs Inicio", minWidth: "120px", render: row => (
    row.regla_firma_inicio_cumple === null ? <span className="text-gray-400">Sin datos</span> :
    row.regla_firma_inicio_cumple === true ? <span className="text-emerald-600 font-medium">Cumple</span> :
    <span className="text-red-600 font-medium">No cumple</span>
  )},
  regla_inicio_fin: { title: "Inicio vs Fin", minWidth: "120px", render: row => (
    row.regla_inicio_fin_cumple === null ? <span className="text-gray-400">Sin datos</span> :
    row.regla_inicio_fin_cumple === true ? <span className="text-emerald-600 font-medium">Cumple</span> :
    <span className="text-red-600 font-medium">Incoherente</span>
  )},
  estado: { title: "Estado", minWidth: "100px", render: row => {
    const hasAlert = row.regla_firma_pub_cumple === false || row.regla_firma_inicio_cumple === false || row.regla_inicio_fin_cumple === false;
    return hasAlert ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 uppercase tracking-wide border border-red-200">Alerta</span> : <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wide border border-emerald-200">Aprobado</span>;
  }},
  departamento: { title: "Departamento", filterKey: "departamento", minWidth: "120px", render: row => row.departamento || 'N/A' },
  codigo_entidad: { title: "Código de Entidad", filterKey: "codigo_entidad", minWidth: "120px", render: row => row.codigo_entidad || 'N/A' },
  urlproceso: { title: "URL del Proceso", filterKey: "urlproceso", minWidth: "150px", render: row => row.urlproceso ? <a href={row.urlproceso} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Ver Proceso</a> : 'N/A' },
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
  
  // Scraper Robot State
  const [scraperActive, setScraperActive] = useState(searchParams?.get('running') === 'true');
  const [scraperLog, setScraperLog] = useState("Conectando con Robot de Extracción...");
  
  useEffect(() => {
    if (searchParams?.get('running') === 'true') {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete('running');
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

  const executeExcelExport = async (includeAnexo: boolean) => {
    setExportingExcel(true);
    setShowExportModal(false);
    try {
      // Pasamos las columnas que el usuario tiene activas (solo como referencia, aunque la DB tiene todo)
      const activeCols = Object.keys(selectedColumns).filter(k => selectedColumns[k as keyof typeof selectedColumns]);
      if (includeAnexo) {
        activeCols.push('informacion_anexa_tercero');
      }
      
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

  const executeRetry = async (forceSecop: boolean, pdfStrategy: string) => {
    setShowRetryModal(false);
    setRetrying(true);
    try {
      const res = await fetch('http://localhost:8000/api/retry-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          force_secop: forceSecop,
          pdf_strategy: pdfStrategy
        })
      });
      if (res.ok) {
        // Clear results before restarting
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
          <button 
            onClick={() => setShowRetryModal(true)}
            disabled={exportingExcel || loading || retrying || scraperActive}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
            Reintentar Análisis
          </button>
          
          <button 
            onClick={() => usePdfExporterStore.getState().setIsOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <FileText className="w-4 h-4" />
            Exportar PDF
          </button>
          <button 
            onClick={() => setShowExportModal(true)}
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
          <div className="flex items-center gap-2">
            <button 
              onClick={() => toggleAllColumns(true)} 
              className="text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors border border-emerald-200 shadow-sm"
            >
              Marcar Todas
            </button>
            <button 
              onClick={() => toggleAllColumns(false)} 
              className="text-xs font-semibold text-gray-600 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors border border-gray-200 shadow-sm"
            >
              Desmarcar Todas
            </button>
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
              {renderToggle('nombre_contratista', 'Nombre Contratista')}
              {renderToggle('nit_contratista', 'NIT/Cédula Contratista')}
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
              <Scale className="w-4 h-4 text-emerald-600" /> 
              <span className="flex-1">Comparaciones Automáticas</span>
              <button 
                onClick={() => setShowSmartRuleModal(true)}
                className="p-1.5 hover:bg-emerald-50 rounded-lg text-gray-400 hover:text-emerald-600 transition-colors border border-transparent hover:border-emerald-200"
                title="Resolución Inteligente de Reglas (RAG)"
              >
                <Settings className="w-4 h-4" />
              </button>
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
        <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col transition-all duration-300 ${isTableExpanded ? 'fixed inset-4 z-[9999] shadow-2xl flex-1 h-auto' : 'flex-1 min-h-[400px]'}`}>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              2. Vista previa del reporte
            </h3>
            <div className="flex items-center gap-4">
              <button onClick={() => setIsTableExpanded(!isTableExpanded)} className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 flex items-center gap-1.5 transition-all shadow-sm">
                {isTableExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />} 
                {isTableExpanded ? 'Minimizar vista' : 'Ampliar tabla'}
              </button>
              <div className="w-px h-4 bg-gray-300"></div>
              <button onClick={() => setShowColumnConfigModal(true)} className="text-xs font-medium text-gray-600 hover:text-emerald-600 flex items-center gap-1.5 transition-colors">
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
                  {columnOrder.map(colKey => {
                    if (!selectedColumns[colKey as keyof typeof selectedColumns]) return null;
                    const config = COLUMNS_CONFIG_TABLE[colKey as string] || { title: colKey, filterKey: colKey, minWidth: "120px", render: (r: any) => "N/A" };
                    return (
                      <th key={colKey} className="px-4 py-3 align-top" style={{ minWidth: config.minWidth }}>
                        <div>{config.title}</div>
                        {config.filterKey && (
                          <input type="text" placeholder="Filtrar..." className="mt-1.5 w-full text-[10px] p-1.5 border border-gray-200 rounded font-normal shadow-inner bg-gray-50 focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors" value={columnFilters[config.filterKey] || ''} onChange={(e) => setColumnFilters({...columnFilters, [config.filterKey!]: e.target.value})} />
                        )}
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 text-center align-top min-w-[80px]"><div>Acciones</div></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={columnOrder.length + 1} className="px-4 py-12 text-center text-gray-400 animate-pulse">Cargando datos...</td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={columnOrder.length + 1} className="px-4 py-12 text-center text-gray-500">No hay registros que coincidan con los filtros.</td>
                  </tr>
                ) : (
                  filteredData.map((row, idx) => (
                    <tr key={row.internal_id || idx} className="hover:bg-emerald-50/50 transition-colors">
                      {columnOrder.map(colKey => {
                        if (!selectedColumns[colKey as keyof typeof selectedColumns]) return null;
                        const config = COLUMNS_CONFIG_TABLE[colKey as string];
                        if (!config) return <td key={colKey} className="px-4 py-3">N/A</td>;
                        
                        return (
                          <td key={colKey} className="px-4 py-3">
                            {config.render(row, { setSelectedNit })}
                          </td>
                        );
                      })}
                      
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
                  ))
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

      {/* MODALS */}
      {/* MODAL DE EXPORTACIÓN EXCEL */}
      {showExportModal && (
        <div className="fixed inset-0 z-[99999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden border border-gray-100 flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Exportación a Excel</h2>
                <p className="text-sm text-gray-500">Configuración de libro maestro</p>
              </div>
            </div>
            <div className="p-6 flex flex-col gap-4 bg-gray-50/50">
              <p className="text-sm text-gray-600 leading-relaxed text-center font-medium">
                ¿Desea anexar la información detallada de los terceros y su histórico de contratos?
              </p>
              <div className="flex flex-col gap-3 mt-2">
                <button 
                  onClick={() => executeExcelExport(true)}
                  className="w-full text-left p-4 rounded-xl border-2 border-emerald-500 bg-emerald-50/30 hover:bg-emerald-50 transition-colors flex gap-3 items-center group"
                >
                  <div className="bg-emerald-100 p-2 rounded-full"><CheckCircle className="w-5 h-5 text-emerald-600" /></div>
                  <div>
                    <h3 className="font-bold text-emerald-900 text-sm">Sí, anexar información de terceros</h3>
                    <p className="text-xs text-emerald-700/80 mt-1">Genera pestañas independientes para cada contratista.</p>
                  </div>
                </button>

                <button 
                  onClick={() => executeExcelExport(false)}
                  className="w-full text-left p-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors flex gap-3 items-center"
                >
                  <div className="bg-gray-100 p-2 rounded-full"><FileText className="w-5 h-5 text-gray-500" /></div>
                  <div>
                    <h3 className="font-bold text-gray-700 text-sm">No, solo exportar tabla actual</h3>
                    <p className="text-xs text-gray-500 mt-1">Exporta únicamente la información visible en la pantalla.</p>
                  </div>
                </button>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-white flex justify-end">
              <button 
                onClick={() => setShowExportModal(false)}
                className="px-5 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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
            // Recargar datos si es necesario
            window.location.reload();
          }}
        />
      )}

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

      {/* Modal de Reintento */}
      {showRetryModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-lg w-full text-center border border-white/20 animate-in zoom-in duration-300">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <RefreshCw className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Reintentar Análisis</h3>
            <p className="mb-6 text-gray-600 text-sm leading-relaxed">
              Selecciona cómo deseas volver a procesar las llaves guardadas para este análisis.
            </p>
            <div className="flex flex-col gap-3 justify-center mb-4 text-sm">
              <button 
                onClick={() => executeRetry(false, 'copy')}
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98]"
              >
                Cargar Datos (Caché) y Copiar PDFs
              </button>
              <button 
                onClick={() => executeRetry(false, 'scrape')}
                className="w-full px-4 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.98]"
              >
                Cargar Datos (Caché) y Re-descargar PDFs
              </button>
              <button 
                onClick={() => executeRetry(false, 'ignore')}
                className="w-full px-4 py-3 bg-slate-600 text-white rounded-xl font-semibold hover:bg-slate-700 shadow-lg shadow-slate-600/30 transition-all active:scale-[0.98]"
              >
                Solo Datos (Ignorar PDFs)
              </button>
              <button 
                onClick={() => executeRetry(true, 'ignore')}
                className="w-full px-4 py-3 bg-white border-2 border-amber-500 text-amber-600 rounded-xl font-semibold hover:bg-amber-50 transition-all active:scale-[0.98]"
              >
                Sobrescribir Datos SECOP (Ignorar PDFs)
              </button>
              <button 
                onClick={() => executeRetry(true, 'scrape')}
                className="w-full px-4 py-3 bg-white border-2 border-red-500 text-red-600 rounded-xl font-semibold hover:bg-red-50 transition-all active:scale-[0.98]"
              >
                Sobrescribir TODO desde SECOP (Lento)
              </button>
            </div>
            <button onClick={() => setShowRetryModal(false)} className="text-sm text-gray-400 hover:text-gray-600 underline mt-2">
              Cancelar
            </button>
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
