import React, { useEffect, useState, useMemo, useRef } from 'react';
import { X, Bot, AlertTriangle, FileText, BarChart3, Clock, Building, Maximize2, Minimize2, SlidersHorizontal, Copy, Check, Download, FileSpreadsheet, Image as ImageIcon, BarChart as ChartIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import * as htmlToImage from 'html-to-image';

interface Props {
  nit: string;
  onClose: () => void;
}

export default function ContractorReportModal({ nit, onClose }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [expandedChart, setExpandedChart] = useState<'year' | 'entities' | null>(null);
  
  const [copiedAI, setCopiedAI] = useState(false);
  const [copiedValue, setCopiedValue] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  
  // Refs for export
  const chart1WrapperRef = useRef<HTMLDivElement>(null);
  const chart1HeaderRef = useRef<HTMLDivElement>(null);
  const chart1ContentRef = useRef<HTMLDivElement>(null);

  const chart2WrapperRef = useRef<HTMLDivElement>(null);
  const chart2HeaderRef = useRef<HTMLDivElement>(null);
  const chart2ContentRef = useRef<HTMLDivElement>(null);
  
  const expandedChartWrapperRef = useRef<HTMLDivElement>(null);
  const expandedChartHeaderRef = useRef<HTMLDivElement>(null);
  const expandedChartContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`http://localhost:8000/api/contractor/${nit}`)
      .then(res => res.json())
      .then(resData => {
        if (resData.status === 'success') {
          setData(resData);
        } else {
          setError(resData.detail || 'Error desconocido al cargar historial.');
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [nit]);

  const allKeys = useMemo(() => {
    if (!data?.datos_completos) return [];
    const keysSet = new Set<string>();
    data.datos_completos.forEach((item: any) => {
      Object.keys(item).forEach(k => keysSet.add(k));
    });
    const priority = ['fecha_de_firma', 'entidad', 'descripcion_del_proceso', 'codigo_categoria_principal', 'estado_contrato', 'valor_del_contrato'];
    const otherKeys = Array.from(keysSet).filter(k => !priority.includes(k));
    return [...priority.filter(k => keysSet.has(k)), ...otherKeys];
  }, [data]);

  const filteredData = useMemo(() => {
    if (!data?.datos_completos) return [];
    return data.datos_completos.filter((row: any) => {
      return Object.entries(columnFilters).every(([key, filterValue]) => {
        if (!filterValue) return true;
        const cellValue = String(row[key] || '').toLowerCase();
        return cellValue.includes(filterValue.toLowerCase());
      });
    });
  }, [data, columnFilters]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-lg p-8 flex flex-col items-center justify-center gap-4 relative overflow-hidden shadow-2xl border border-gray-100">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <h3 className="text-lg font-bold text-gray-800">Analizando Historial...</h3>
          <p className="text-sm text-gray-500 text-center">Consultando SECOP y llamando a Groq AI. Esto puede tardar unos segundos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-lg p-8 relative shadow-2xl">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 bg-gray-50 rounded-full transition-colors"><X className="w-5 h-5" /></button>
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center"><AlertTriangle className="w-6 h-6" /></div>
            <h3 className="text-lg font-bold text-gray-900">Error al cargar</h3>
            <p className="text-sm text-gray-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const formatCurrency = (val: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(val);

  const handleCopy = (text: string, setCopied: React.Dispatch<React.SetStateAction<boolean>>) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadAdvanced = async (
    wrapperRef: React.RefObject<HTMLDivElement>, 
    headerRef: React.RefObject<HTMLDivElement>,
    contentRef: React.RefObject<HTMLDivElement>,
    chartTitle: string
  ) => {
    if (!wrapperRef.current || !headerRef.current || !contentRef.current) return;
    
    try {
      // 1. Unhide header and footer, add padding for the image
      headerRef.current.classList.remove('hidden');
      headerRef.current.classList.add('block');
      
      const footerRef = wrapperRef.current.querySelector('.export-footer');
      if (footerRef) {
        footerRef.classList.remove('hidden');
        footerRef.classList.add('block');
      }
      
      wrapperRef.current.style.padding = '24px';
      
      // 2. Remove restrictions to prevent cropping (e.g. scrollbars)
      const scrollables = contentRef.current.querySelectorAll('.overflow-y-auto, .max-h-24, .custom-scrollbar');
      scrollables.forEach(el => {
        const e = el as HTMLElement;
        e.dataset.originalOverflow = e.style.overflow;
        e.dataset.originalMaxHeight = e.style.maxHeight;
        e.style.overflow = 'visible';
        e.style.maxHeight = 'none';
      });
      
      // Allow DOM layout recalculation and React re-render
      await new Promise(r => setTimeout(r, 400));
      
      // 3. Generate image via html-to-image
      const dataUrl = await htmlToImage.toPng(wrapperRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2
      });
      
      // 4. Download
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${chartTitle.replace(/ /g, '_')}_${data?.documento}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      
    } catch (error) {
      console.error("Export error:", error);
      alert("Hubo un error al exportar la gráfica.");
    } finally {
      // 5. Restore original layout state
      headerRef.current.classList.add('hidden');
      headerRef.current.classList.remove('block');
      
      const footerRef = wrapperRef.current.querySelector('.export-footer');
      if (footerRef) {
        footerRef.classList.add('hidden');
        footerRef.classList.remove('block');
      }
      
      wrapperRef.current.style.padding = '0';
      
      const scrollables = contentRef.current.querySelectorAll('.overflow-y-auto, .max-h-24, .custom-scrollbar');
      scrollables.forEach(el => {
        const e = el as HTMLElement;
        e.style.overflow = e.dataset.originalOverflow || '';
        e.style.maxHeight = e.dataset.originalMaxHeight || '';
      });
    }
  };

  const chartDataYear = data?.resumen?.contratos_por_anio 
    ? Object.keys(data.resumen.contratos_por_anio).sort().map(year => ({ name: year, Contratos: data.resumen.contratos_por_anio[year] }))
    : [];

  const topEntidades = data?.resumen?.entidades_top ? Object.keys(data.resumen.entidades_top) : [];
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
  const chartDataEntities = topEntidades.map(ent => ({ name: ent, value: data.resumen.entidades_top[ent] }));

  const dateStr = new Date().toLocaleDateString('es-CO');
  const timeStr = new Date().toLocaleTimeString('es-CO');
  
  const renderMembrete = (title: string) => (
    <div className="border-b-2 border-emerald-500 pb-4 mb-4">
      <h1 className="text-2xl font-bold text-gray-900 uppercase">{data?.nombre}</h1>
      <p className="text-gray-600 font-medium text-sm mt-1">NIT: {data?.documento}</p>
      <h2 className="text-lg font-bold text-emerald-700 mt-2">{title}</h2>
    </div>
  );

  const renderFooter = () => (
    <div className="export-footer hidden mt-4 text-right">
      <span className="text-[10px] text-gray-400 font-mono font-medium">
        Generado: {dateStr} {timeStr}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-0 sm:p-4 overflow-hidden">
      
      {/* EXPANDED CHART MODAL */}
      {expandedChart && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-4xl h-[600px] flex flex-col shadow-2xl relative">
            <button 
              onClick={() => setExpandedChart(null)} 
              className="absolute top-4 right-4 p-2 text-gray-500 hover:text-red-500 bg-gray-100 rounded-full transition-colors z-10"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                <ChartIcon className="w-6 h-6 text-emerald-600" /> 
                {expandedChart === 'year' ? 'Contratos por Año' : 'Top 5 Entidades'}
              </h2>
              <button 
                onClick={() => handleDownloadAdvanced(
                  expandedChartWrapperRef, 
                  expandedChartHeaderRef, 
                  expandedChartContentRef, 
                  expandedChart === 'year' ? 'Contratos por Año' : 'Top 5 Entidades'
                )} 
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow transition-colors mr-12"
              >
                <ImageIcon className="w-4 h-4" /> Descargar Imagen
              </button>
            </div>
            
            <div ref={expandedChartWrapperRef} className="flex-1 w-full bg-white flex flex-col">
              {/* Export Membrete (Hidden by default) */}
              <div ref={expandedChartHeaderRef} className="hidden">
                {renderMembrete(expandedChart === 'year' ? 'Contratos por Año' : 'Top 5 Entidades')}
              </div>
              
              <div ref={expandedChartContentRef} className="flex-1 w-full flex flex-col">
                {expandedChart === 'year' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartDataYear}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="name" 
                        fontSize={14} 
                        tickLine={false} 
                        axisLine={false} 
                        tickMargin={12} 
                        tick={{ fill: '#059669', fontWeight: 'bold' }} 
                      />
                      <YAxis fontSize={14} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                      <Bar dataKey="Contratos" fill="#10b981" radius={[4, 4, 0, 0]} barSize={64} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <div className="w-full flex justify-center items-center">
                      <ResponsiveContainer width="100%" height={350}>
                        <PieChart>
                          <Pie 
                            data={chartDataEntities} 
                            cx="50%" 
                            cy="50%" 
                            innerRadius={70} 
                            outerRadius={110} 
                            paddingAngle={5} 
                            dataKey="value" 
                            label={({name, value}) => `${name.substring(0,22)} (${value})`}
                            labelLine={{ stroke: '#6b7280', strokeWidth: 1.5 }}
                            isAnimationActive={false}
                          >
                            {chartDataEntities.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    {/* HTML Legend under expanded chart */}
                    <div className="mt-8 flex flex-wrap justify-center gap-6 px-4">
                      {chartDataEntities.map((ent, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-gray-700 font-medium">
                          <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS[i % COLORS.length]}}></div>
                          <span>{ent.name} ({ent.value})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {renderFooter()}
            </div>
          </div>
        </div>
      )}

      <div className={`bg-gray-50 flex flex-col shadow-2xl relative border border-gray-200 transition-all duration-300 ${isFullscreen ? 'w-full h-full rounded-none' : 'w-full max-w-7xl max-h-[90vh] rounded-2xl'}`}>
        
        {/* HEADER */}
        <div className={`flex flex-wrap items-center justify-between gap-4 p-5 border-b border-gray-200 bg-white ${isFullscreen ? 'rounded-none' : 'rounded-t-2xl'}`}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 leading-tight">{data?.nombre}</h2>
              <p className="text-sm text-gray-500 font-mono mt-0.5">NIT: {data?.documento} | <span className="text-emerald-600 font-medium">{data?.source === 'cache' ? 'Cargado desde Caché Rápida ⚡' : 'Extraído de Socrata SECOP II 🌐'}</span></p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-100 border border-gray-200 transition-colors">
              <FileText className="w-4 h-4" />
              Descargar PDF
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-sm font-semibold rounded-lg hover:bg-emerald-100 border border-emerald-200 transition-colors">
              <FileSpreadsheet className="w-4 h-4" />
              Descargar Excel
            </button>
            <div className="w-px h-6 bg-gray-300 mx-2"></div>
            <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 text-gray-500 hover:text-emerald-600 bg-gray-50 hover:bg-emerald-50 rounded-full transition-colors" title={isFullscreen ? "Minimizar" : "Pantalla Completa"}>
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 rounded-full transition-colors" title="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BODY SCROLLABLE */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 relative">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><FileText className="w-6 h-6"/></div>
              <div>
                <p className="text-sm font-medium text-gray-500">Total de Contratos Históricos</p>
                <h3 className="text-2xl font-bold text-gray-900">{data?.resumen?.total_contratos}</h3>
              </div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between group relative">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><BarChart3 className="w-6 h-6"/></div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Valor Total Adjudicado Estimado</p>
                  <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(data?.resumen?.valor_total || 0)}</h3>
                </div>
              </div>
              <button 
                onClick={() => handleCopy(formatCurrency(data?.resumen?.valor_total || 0), setCopiedValue)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-emerald-50 text-gray-600 hover:text-emerald-600 border border-gray-200 hover:border-emerald-200 text-xs font-bold rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                title="Copiar valor"
              >
                {copiedValue ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                {copiedValue ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-xl p-6 text-white shadow-lg relative overflow-hidden h-full border border-indigo-700 min-h-[300px]">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                  <Bot className="w-32 h-32" />
                </div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                  <div className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-indigo-300" />
                    <h3 className="text-lg font-bold">Dictamen del Auditor Forense IA</h3>
                  </div>
                  <button 
                    onClick={() => handleCopy(data?.reporte_ia || '', setCopiedAI)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-indigo-100 text-xs font-semibold rounded-lg transition-colors border border-white/10"
                  >
                    {copiedAI ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedAI ? 'Copiado!' : 'Copiar Dictamen'}
                  </button>
                </div>
                <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-a:text-indigo-300 relative z-10 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                  <ReactMarkdown>{data?.reporte_ia || "Generando..."}</ReactMarkdown>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {/* Chart 1 */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-64">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-800">Contratos por Año</h3>
                  <div className="flex gap-2">
                    <button onClick={() => handleDownloadAdvanced(chart1WrapperRef, chart1HeaderRef, chart1ContentRef, 'Contratos por Año')} className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-gray-600 bg-white border border-gray-300 hover:border-emerald-500 hover:text-emerald-600 rounded shadow-sm transition-colors" title="Descargar Imagen">
                      <ImageIcon className="w-3.5 h-3.5" /> <span className="hidden xl:inline">Descargar</span>
                    </button>
                    <button onClick={() => setExpandedChart('year')} className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-gray-600 bg-white border border-gray-300 hover:border-emerald-500 hover:text-emerald-600 rounded shadow-sm transition-colors" title="Ampliar Gráfica">
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {/* EXPORT WRAPPER */}
                <div ref={chart1WrapperRef} className="flex-1 w-full bg-white flex flex-col">
                  <div ref={chart1HeaderRef} className="hidden">
                    {renderMembrete('Contratos por Año')}
                  </div>
                  <div ref={chart1ContentRef} className="flex-1 w-full min-h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartDataYear}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis 
                          dataKey="name" 
                          fontSize={12} 
                          tickLine={false} 
                          axisLine={false} 
                          tickMargin={10} 
                          tick={{ fill: '#059669', fontWeight: 'bold' }} 
                        />
                        <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                        <Bar dataKey="Contratos" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {renderFooter()}
                </div>
              </div>
              
              {/* Chart 2 */}
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex-1 flex flex-col min-h-[250px]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-800">Top 5 Entidades</h3>
                  <div className="flex gap-2">
                    <button onClick={() => handleDownloadAdvanced(chart2WrapperRef, chart2HeaderRef, chart2ContentRef, 'Top 5 Entidades')} className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-gray-600 bg-white border border-gray-300 hover:border-emerald-500 hover:text-emerald-600 rounded shadow-sm transition-colors" title="Descargar Imagen">
                      <ImageIcon className="w-3.5 h-3.5" /> <span className="hidden xl:inline">Descargar</span>
                    </button>
                    <button onClick={() => setExpandedChart('entities')} className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-gray-600 bg-white border border-gray-300 hover:border-emerald-500 hover:text-emerald-600 rounded shadow-sm transition-colors" title="Ampliar Gráfica">
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {/* EXPORT WRAPPER */}
                <div ref={chart2WrapperRef} className="flex-1 flex flex-col w-full bg-white">
                  <div ref={chart2HeaderRef} className="hidden">
                    {renderMembrete('Top 5 Entidades')}
                  </div>
                  <div ref={chart2ContentRef} className="flex-1 w-full flex flex-col">
                    <div className="flex-1 w-full flex items-center justify-center min-h-[160px]">
                      {chartDataEntities.length > 0 ? (
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart>
                            <Pie 
                              data={chartDataEntities} 
                              cx="50%" 
                              cy="50%" 
                              innerRadius={45} 
                              outerRadius={75} 
                              paddingAngle={5} 
                              dataKey="value"
                              isAnimationActive={false}
                            >
                              {chartDataEntities.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : <span className="text-xs text-gray-400">Sin datos</span>}
                    </div>
                    <div className="mt-4 flex flex-col gap-1.5 max-h-28 overflow-y-auto custom-scrollbar">
                      {chartDataEntities.map((ent, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor: COLORS[i % COLORS.length]}}></div>
                          <span className="truncate" title={ent.name}>{ent.name}</span>
                          <span className="ml-auto font-medium text-gray-900">{ent.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {renderFooter()}
                </div>
              </div>
            </div>
          </div>

          {/* DYNAMIC TABLE */}
          <div className={`bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col transition-all duration-300 ${isTableExpanded ? 'fixed inset-4 z-[99999] shadow-2xl' : 'h-[500px]'}`}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-gray-900">Historial Detallado ({filteredData.length} registros)</h3>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setColumnFilters({})} className="text-xs font-bold text-gray-600 hover:text-red-600 bg-gray-50 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-200 flex items-center gap-1.5 transition-colors">
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Limpiar Filtros
                </button>
                <button 
                  onClick={() => setIsTableExpanded(!isTableExpanded)} 
                  className="text-xs font-bold text-white bg-emerald-600 border border-emerald-700 hover:bg-emerald-700 px-4 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  {isTableExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  {isTableExpanded ? 'Minimizar Tabla' : 'Ampliar a Pantalla Completa'}
                </button>
              </div>
            </div>
            
            <div className="overflow-auto flex-1 custom-scrollbar">
              <table className="w-full text-left border-collapse text-[11px] relative">
                <thead className="sticky top-0 z-20 shadow-md">
                  <tr className="bg-slate-800 text-white uppercase font-bold border-b-2 border-emerald-500">
                    {allKeys.map(key => (
                      <th key={key} className="px-4 py-3 align-top min-w-[160px] bg-slate-800 border-r border-slate-700 last:border-r-0">
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-extrabold tracking-wider leading-tight text-emerald-400 truncate w-full block" title={key.replace(/_/g, ' ')}>
                            {key.replace(/_/g, ' ')}
                          </span>
                          <input 
                            type="text" 
                            placeholder="Filtrar..." 
                            className="w-full text-[10px] px-2 py-1.5 border border-slate-600 rounded bg-slate-900 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-all font-normal"
                            value={columnFilters[key] || ''} 
                            onChange={(e) => setColumnFilters({...columnFilters, [key]: e.target.value})} 
                          />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700 relative z-0">
                  {filteredData.map((c: any, i: number) => {
                    const noDisp = <span className="text-red-500 font-medium bg-red-50 px-1.5 py-0.5 rounded border border-red-100">No disponible</span>;
                    return (
                      <tr key={i} className="hover:bg-emerald-50/50 transition-colors">
                        {allKeys.map(key => {
                          let val = c[key];
                          if (val === undefined || val === null || val === '') {
                            return <td key={key} className="px-4 py-3 bg-white border-r border-gray-50 last:border-r-0">{noDisp}</td>;
                          }
                          if (key.includes('valor')) {
                            const floatVal = parseFloat(val);
                            if (!isNaN(floatVal)) val = formatCurrency(floatVal);
                          } else if (typeof val === 'object') {
                            val = JSON.stringify(val);
                          }
                          return (
                            <td key={key} className="px-4 py-3 bg-white border-r border-gray-50 last:border-r-0 max-w-md truncate" title={val}>
                              {val}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {filteredData.length === 0 && (
                    <tr>
                      <td colSpan={allKeys.length} className="px-4 py-12 text-center text-gray-500 bg-gray-50 text-sm font-medium">
                        No hay contratos que coincidan con la búsqueda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
