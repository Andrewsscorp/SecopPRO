import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import mermaid from 'mermaid';
import { usePdfExporterStore } from '../store';
import { ChevronLeft, ChevronRight, Minus, Plus, Download } from 'lucide-react';

const MermaidChart = ({ chart }: { chart: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (containerRef.current && chart) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'loose',
        themeVariables: {
          primaryColor: '#059669', // emerald-600
          primaryTextColor: '#ffffff',
          primaryBorderColor: '#047857', // emerald-700
          lineColor: '#334155', // slate-700
          secondaryColor: '#f8fafc', // slate-50
          tertiaryColor: '#e2e8f0', // slate-200
          pie1: '#059669', // emerald-600
          pie2: '#0f172a', // slate-900
          pie3: '#334155', // slate-700
          pie4: '#64748b', // slate-500
          pie5: '#94a3b8', // slate-400
          pie6: '#cbd5e1', // slate-300
          fontFamily: 'inherit',
          pieTitleTextSize: '18px',
          pieLegendTextSize: '14px',
        }
      });
      mermaid.render('mermaid-svg-' + Math.random().toString(36).substring(2, 9), chart)
        .then((result) => {
          if (containerRef.current) {
            containerRef.current.innerHTML = result.svg;
          }
        })
        .catch(err => console.warn("Error rendering mermaid", err));
    }
  }, [chart]);
  
  return <div ref={containerRef} className="my-6 flex justify-center text-slate-800" />;
};

const markdownComponents = {
  code({node, inline, className, children, ...props}: any) {
    const match = /language-(\w+)/.exec(className || '');
    if (!inline && match && match[1] === 'mermaid') {
      return <MermaidChart chart={String(children).replace(/\\n$/, '')} />;
    }
    return <code className={className} {...props}>{children}</code>;
  }
};

export const PreviewPane: React.FC = () => {
  const { 
    zoom, setZoom,
    watermark,
    reportInfo,
    orientation,
    sections,
    generatedAiContent
  } = usePdfExporterStore();

  const isSectionEnabled = (id: string) => sections.find(s => s.id === id)?.enabled;

  const handleZoomOut = () => setZoom(Math.max(25, zoom - 10));
  const handleZoomIn = () => setZoom(Math.min(200, zoom + 10));

  // Determinar las proporciones de la página basadas en A4 (210x297mm)
  const isLandscape = orientation === 'Horizontal';
  const pageAspectRatio = isLandscape ? 297 / 210 : 210 / 297;
  
  // Posiciones Flex para la marca de agua
  const getWatermarkPositionClass = () => {
    const pos = watermark.position;
    if (pos === 'top-left') return 'items-start justify-start';
    if (pos === 'top-center') return 'items-start justify-center';
    if (pos === 'top-right') return 'items-start justify-end';
    if (pos === 'center-left') return 'items-center justify-start';
    if (pos === 'center') return 'items-center justify-center';
    if (pos === 'center-right') return 'items-center justify-end';
    if (pos === 'bottom-left') return 'items-end justify-start';
    if (pos === 'bottom-center') return 'items-end justify-center';
    if (pos === 'bottom-right') return 'items-end justify-end';
    return 'items-center justify-center';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header Vista Previa */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">5. Vista previa en tiempo real</h3>
          <p className="text-xs text-slate-500">Asi se verá tu reporte PDF con la configuración actual.</p>
        </div>
        
        {/* Controles Header */}
        <div className="flex items-center gap-4 bg-white border border-slate-200 rounded-md p-1 shadow-sm">
          <div className="flex items-center gap-2 px-2 border-r border-slate-200">
            <button className="text-slate-400 hover:text-slate-600"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs font-medium text-slate-600">1 / 15</span>
            <button className="text-slate-400 hover:text-slate-600"><ChevronRight className="w-4 h-4" /></button>
          </div>
          
          <div className="flex items-center gap-2 px-2 border-r border-slate-200">
            <select 
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="text-xs font-medium text-slate-600 outline-none bg-transparent"
            >
              <option value={50}>50%</option>
              <option value={75}>75%</option>
              <option value={100}>100%</option>
              <option value={125}>125%</option>
              <option value={150}>150%</option>
            </select>
            <button onClick={handleZoomOut} className="text-slate-400 hover:text-slate-600"><Minus className="w-4 h-4" /></button>
            <button onClick={handleZoomIn} className="text-slate-400 hover:text-slate-600"><Plus className="w-4 h-4" /></button>
          </div>
          
          <button className="px-2 text-slate-400 hover:text-slate-600">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contenedor del documento */}
      <div className="flex-1 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 relative flex items-center justify-center p-4">
        <div className="w-full h-full overflow-auto flex items-start justify-center pt-8 pb-8 custom-scrollbar">
          
          {/* Renderizado por Páginas Individuales */}
          <div className="flex flex-col gap-8 transition-all duration-300 origin-top" style={{ transform: `scale(${zoom / 100})` }}>
            
            {/* PAGINA 1: Portada */}
            {isSectionEnabled('portada') && (
              <div 
                className="bg-white shadow-lg relative shrink-0 overflow-hidden"
                style={{ 
                  width: isLandscape ? '297mm' : '210mm',
                  minHeight: 'auto',
                }}
              >
                <div className="p-16 flex flex-col gap-8 h-full pointer-events-none">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-4">
                         <div className="w-8 h-8 rounded-lg bg-emerald-600" />
                         <span className="text-xl font-bold text-slate-800">SecopPRO</span>
                      </div>
                      {generatedAiContent.portada ? (
                         <div className="prose prose-sm prose-slate max-w-none">
                           <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{generatedAiContent.portada}</ReactMarkdown>
                         </div>
                      ) : (
                        <>
                          <h1 className="text-3xl font-bold text-slate-800 mb-2 uppercase tracking-wide">{reportInfo.title}</h1>
                          {reportInfo.subtitle && <h2 className="text-lg font-medium text-emerald-600">{reportInfo.subtitle}</h2>}
                        </>
                      )}
                    </div>
                    <div className="text-right text-sm text-slate-500">
                      <p>Fecha: {reportInfo.date}</p>
                      <p>Pág. 1</p>
                    </div>
                  </div>
                </div>
                {/* Capa de Marca de Agua Superpuesta */}
                {watermark.enabled && (
                  <div className={`absolute inset-0 overflow-hidden pointer-events-none p-16 flex ${getWatermarkPositionClass()}`}>
                    <div className="font-bold whitespace-nowrap select-none" style={{ color: watermark.color, opacity: watermark.opacity / 100, fontSize: `${watermark.size}px`, transform: `rotate(${watermark.rotation})`, transformOrigin: 'center center' }}>
                      {watermark.text}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PAGINA 2: Resumen Ejecutivo */}
            {isSectionEnabled('resumen') && (
              <div 
                className="bg-white shadow-lg relative shrink-0 overflow-hidden"
                style={{ 
                  width: isLandscape ? '297mm' : '210mm',
                  minHeight: 'auto',
                }}
              >
                <div className="p-16 flex flex-col gap-8 h-full pointer-events-none">
                  <div className="mb-4">
                    {generatedAiContent.resumen ? (
                      <div className="prose prose-sm prose-slate max-w-none">
                        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{generatedAiContent.resumen}</ReactMarkdown>
                      </div>
                    ) : (
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase">Resumen Ejecutivo</h3>
                        <div className="grid grid-cols-3 gap-4">
                           <div className="border border-slate-200 rounded-lg p-4 flex gap-4 items-center">
                             <div className="w-10 h-10 rounded bg-blue-50" />
                             <div>
                               <div className="text-2xl font-bold text-slate-800">1.248</div>
                               <div className="text-xs text-slate-500">Procesos analizados</div>
                             </div>
                           </div>
                           <div className="border border-slate-200 rounded-lg p-4 flex gap-4 items-center">
                             <div className="w-10 h-10 rounded bg-red-50" />
                             <div>
                               <div className="text-2xl font-bold text-slate-800">57</div>
                               <div className="text-xs text-slate-500">Alertas encontradas</div>
                             </div>
                           </div>
                           <div className="border border-slate-200 rounded-lg p-4 flex gap-4 items-center">
                             <div className="w-10 h-10 rounded bg-emerald-50" />
                             <div>
                               <div className="text-2xl font-bold text-slate-800">95,4%</div>
                               <div className="text-xs text-slate-500">Tasa de cumplimiento</div>
                             </div>
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {/* Capa de Marca de Agua Superpuesta */}
                {watermark.enabled && (
                  <div className={`absolute inset-0 overflow-hidden pointer-events-none p-16 flex ${getWatermarkPositionClass()}`}>
                    <div className="font-bold whitespace-nowrap select-none" style={{ color: watermark.color, opacity: watermark.opacity / 100, fontSize: `${watermark.size}px`, transform: `rotate(${watermark.rotation})`, transformOrigin: 'center center' }}>
                      {watermark.text}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PAGINA 3: Resultados */}
            {isSectionEnabled('resultados') && (
              <div 
                className="bg-white shadow-lg relative shrink-0 overflow-hidden"
                style={{ width: isLandscape ? '297mm' : '210mm', minHeight: 'auto' }}
              >
                <div className="p-16 flex flex-col gap-8 h-full pointer-events-none">
                  <div>
                    {generatedAiContent.resultados ? (
                      <div className="prose prose-sm prose-slate max-w-none">
                        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{generatedAiContent.resultados}</ReactMarkdown>
                      </div>
                    ) : (
                      <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase">Tabla de Resultados</h3>
                    )}
                  </div>
                </div>
                {watermark.enabled && (
                  <div className={`absolute inset-0 overflow-hidden pointer-events-none p-16 flex ${getWatermarkPositionClass()}`}>
                    <div className="font-bold whitespace-nowrap select-none" style={{ color: watermark.color, opacity: watermark.opacity / 100, fontSize: `${watermark.size}px`, transform: `rotate(${watermark.rotation})`, transformOrigin: 'center center' }}>
                      {watermark.text}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PAGINA 4: Comparaciones y Análisis */}
            {isSectionEnabled('comparaciones') && (
              <div 
                className="bg-white shadow-lg relative shrink-0 overflow-hidden"
                style={{ width: isLandscape ? '297mm' : '210mm', minHeight: 'auto' }}
              >
                <div className="p-16 flex flex-col gap-8 h-full pointer-events-none">
                  <div>
                    {generatedAiContent.comparaciones ? (
                      <div className="prose prose-sm prose-slate max-w-none">
                        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{generatedAiContent.comparaciones}</ReactMarkdown>
                      </div>
                    ) : (
                      <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase">Comparaciones y Análisis</h3>
                    )}
                  </div>
                </div>
                {watermark.enabled && (
                  <div className={`absolute inset-0 overflow-hidden pointer-events-none p-16 flex ${getWatermarkPositionClass()}`}>
                    <div className="font-bold whitespace-nowrap select-none" style={{ color: watermark.color, opacity: watermark.opacity / 100, fontSize: `${watermark.size}px`, transform: `rotate(${watermark.rotation})`, transformOrigin: 'center center' }}>
                      {watermark.text}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PAGINA 5: Gráficos y Visualizaciones */}
            {isSectionEnabled('graficos') && (
              <div 
                className="bg-white shadow-lg relative shrink-0 overflow-hidden"
                style={{ width: isLandscape ? '297mm' : '210mm', minHeight: 'auto' }}
              >
                <div className="p-16 flex flex-col gap-8 h-full pointer-events-none">
                  <div>
                    {generatedAiContent.graficos ? (
                      <div className="prose prose-sm prose-slate max-w-none">
                        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{generatedAiContent.graficos}</ReactMarkdown>
                      </div>
                    ) : (
                      <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase">Gráficos y Visualizaciones</h3>
                    )}
                  </div>
                </div>
                {watermark.enabled && (
                  <div className={`absolute inset-0 overflow-hidden pointer-events-none p-16 flex ${getWatermarkPositionClass()}`}>
                    <div className="font-bold whitespace-nowrap select-none" style={{ color: watermark.color, opacity: watermark.opacity / 100, fontSize: `${watermark.size}px`, transform: `rotate(${watermark.rotation})`, transformOrigin: 'center center' }}>
                      {watermark.text}
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* PAGINA 6: Análisis a Adjudicatarios */}
            {isSectionEnabled('adjudicatarios') && (
              <div 
                className="bg-white shadow-lg relative shrink-0 overflow-hidden"
                style={{ width: isLandscape ? '297mm' : '210mm', minHeight: 'auto' }}
              >
                <div className="p-16 flex flex-col gap-8 h-full pointer-events-none">
                  <div>
                    {generatedAiContent.adjudicatarios ? (
                      <div className="prose prose-sm prose-slate max-w-none">
                        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{generatedAiContent.adjudicatarios}</ReactMarkdown>
                      </div>
                    ) : (
                      <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase">Análisis a Adjudicatarios</h3>
                    )}
                  </div>
                </div>
                {watermark.enabled && (
                  <div className={`absolute inset-0 overflow-hidden pointer-events-none p-16 flex ${getWatermarkPositionClass()}`}>
                    <div className="font-bold whitespace-nowrap select-none" style={{ color: watermark.color, opacity: watermark.opacity / 100, fontSize: `${watermark.size}px`, transform: `rotate(${watermark.rotation})`, transformOrigin: 'center center' }}>
                      {watermark.text}
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* PAGINA 7: Conclusiones y Recomendaciones */}
            {isSectionEnabled('conclusiones') && (
              <div 
                className="bg-white shadow-lg relative shrink-0 overflow-hidden"
                style={{ width: isLandscape ? '297mm' : '210mm', minHeight: 'auto' }}
              >
                <div className="p-16 flex flex-col gap-8 h-full pointer-events-none">
                  <div>
                    {generatedAiContent.conclusiones ? (
                      <div className="prose prose-sm prose-slate max-w-none">
                        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{generatedAiContent.conclusiones}</ReactMarkdown>
                      </div>
                    ) : (
                      <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase">Conclusiones y Recomendaciones</h3>
                    )}
                  </div>
                </div>
                {watermark.enabled && (
                  <div className={`absolute inset-0 overflow-hidden pointer-events-none p-16 flex ${getWatermarkPositionClass()}`}>
                    <div className="font-bold whitespace-nowrap select-none" style={{ color: watermark.color, opacity: watermark.opacity / 100, fontSize: `${watermark.size}px`, transform: `rotate(${watermark.rotation})`, transformOrigin: 'center center' }}>
                      {watermark.text}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* PAGINA 8: Anexos */}
            {isSectionEnabled('anexos') && (
              <div 
                className="bg-white shadow-lg relative shrink-0 overflow-hidden"
                style={{ width: isLandscape ? '297mm' : '210mm', minHeight: 'auto' }}
              >
                <div className="p-16 flex flex-col gap-8 h-full pointer-events-none">
                  <div>
                    {generatedAiContent.anexos ? (
                      <div className="prose prose-sm prose-slate max-w-none">
                        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{generatedAiContent.anexos}</ReactMarkdown>
                      </div>
                    ) : (
                      <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase">Anexos</h3>
                    )}
                  </div>
                </div>
                {watermark.enabled && (
                  <div className={`absolute inset-0 overflow-hidden pointer-events-none p-16 flex ${getWatermarkPositionClass()}`}>
                    <div className="font-bold whitespace-nowrap select-none" style={{ color: watermark.color, opacity: watermark.opacity / 100, fontSize: `${watermark.size}px`, transform: `rotate(${watermark.rotation})`, transformOrigin: 'center center' }}>
                      {watermark.text}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
