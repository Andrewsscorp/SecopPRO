import React, { useState, useEffect } from 'react';
import { usePdfExporterStore, SectionId, SectionItem } from '../store';
import { GripVertical, Check, Settings, Bot, Loader2, Sparkles, Users, X, DownloadCloud } from 'lucide-react';
import { toast } from 'sonner';
import ScraperControlModal from '../../modals/ScraperControlModal';

interface SectionsControlProps {
  jobId: string;
}

export const SectionsControl: React.FC<SectionsControlProps> = ({ jobId }) => {
  const { 
    sections, setSections, toggleSection, 
    isGeneratingAI, setIsGeneratingAI, 
    setGeneratedAiContent,
    tokensUsados, setTokensUsados
  } = usePdfExporterStore();
  
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [openSettingsId, setOpenSettingsId] = useState<string | null>(null);
  
  // Estado para el modal de Adjudicatarios
  const [showContractorsModal, setShowContractorsModal] = useState(false);
  const [availableContractors, setAvailableContractors] = useState<any[]>([]);
  const [loadingContractors, setLoadingContractors] = useState(false);
  const { selectedContractors, setSelectedContractors } = usePdfExporterStore();
  
  // Estado para el modal de Scraper
  const [showScraperModal, setShowScraperModal] = useState(false);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      if (e.target instanceof HTMLElement) {
        e.target.classList.add('opacity-50');
      }
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    setDraggedIndex(null);
    if (e.target instanceof HTMLElement) {
      e.target.classList.remove('opacity-50');
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newSections = [...sections];
    const draggedItem = newSections[draggedIndex];
    newSections.splice(draggedIndex, 1);
    newSections.splice(index, 0, draggedItem);
    
    setDraggedIndex(index);
    setSections(newSections);
  };

  // Precargar caché al montar
  useEffect(() => {
    if (!jobId) return;
    
    // Limpiar estado para evitar mezclar datos de distintos análisis
    setGeneratedAiContent({
      portada: null,
      resumen: null,
      resultados: null,
      comparaciones: null,
      graficos: null,
      adjudicatarios: null,
      conclusiones: null,
      anexos: null
    });
    setTokensUsados(0);

    fetch(`http://localhost:8000/api/pdf/check-cache/${jobId}`)
      .then(res => res.json())
      .then(data => {
        if (data.exists) {
          const contentToUpdate: Record<string, string> = {};
          if (data.portada) contentToUpdate.portada = data.portada;
          if (data.resumen) contentToUpdate.resumen = data.resumen;
          if (data.resultados) contentToUpdate.resultados = data.resultados;
          if (data.comparaciones) contentToUpdate.comparaciones = data.comparaciones;
          if (data.graficos) contentToUpdate.graficos = data.graficos;
          if (data.adjudicatarios) contentToUpdate.adjudicatarios = data.adjudicatarios;
          if (data.conclusiones) contentToUpdate.conclusiones = data.conclusiones;
          if (data.anexos) contentToUpdate.anexos = data.anexos;
          
          setGeneratedAiContent(contentToUpdate);
          
          if (data.tokens_usados) {
            setTokensUsados(data.tokens_usados);
          }
        }
      })
      .catch(err => console.error("Error comprobando caché:", err));
  }, [jobId]);

  const handleGenerate = async (sectionId: string, profundidad: string) => {
    setOpenSettingsId(null);
    
    if (sectionId === 'conclusiones') {
      const st = usePdfExporterStore.getState();
      const hasContent = st.generatedAiContent.resumen || st.generatedAiContent.resultados || st.generatedAiContent.comparaciones || st.generatedAiContent.adjudicatarios;
      if (!hasContent) {
        toast.error('Debes generar al menos un módulo previo (Resumen, Comparaciones, etc.) para que la IA tenga contexto para concluir.');
        return;
      }
    }

    const existingContent = (usePdfExporterStore.getState().generatedAiContent as any)[sectionId];
    let force_regenerate = false;
    
    if (existingContent) {
        const confirmMsg = "Ya existe un análisis generado en la base de datos para este bloque.\n\n¿Seguro que deseas sobreescribirlo generando uno nuevo?\n(Se consumirán tokens de IA)";
        if (!window.confirm(confirmMsg)) {
            return;
        }
        force_regenerate = true;
    }
    
    try {
      setIsGeneratingAI(sectionId as SectionId, true);
      toast.loading(`Generando análisis para ${sectionId}...`, { id: `ai-${sectionId}` });

      const endpoints: Record<string, string> = {
        'portada': 'generate-cover',
        'resumen': 'generate-executive-summary',
        'resultados': 'generate-results',
        'comparaciones': 'generate-comparisons',
        'graficos': 'generate-graphics',
        'adjudicatarios': 'generate-contractors',
        'conclusiones': 'generate-conclusions',
        'anexos': 'generate-anexos'
      };

      const endpoint = endpoints[sectionId];
      if (!endpoint) return;
      
      const payload: any = { job_id: jobId, profundidad, force_regenerate };
      if (sectionId === 'adjudicatarios') {
        payload.selected_nits = usePdfExporterStore.getState().selectedContractors;
      }

      const res = await fetch(`http://localhost:8000/api/pdf/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok || !res.body) throw new Error(`Error en el stream de ${sectionId}`);
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      
      // Limpiamos el contenido anterior antes de empezar a escribir para asegurar el tiempo real
      setGeneratedAiContent({ [sectionId]: "" });
      let fieldText = "";
      
      let baseTokens = usePdfExporterStore.getState().tokensUsados;
      let currentStreamTokens = 0;
      
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        
        buffer = lines.pop() || "";
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            let hasError = null;
            try {
              const dataStr = line.substring(6).trim();
              if (dataStr === "[DONE]") continue;
              
              const data = JSON.parse(dataStr);
              if (data.error) {
                hasError = data.error;
              } else {
                if (data.chunk) {
                  fieldText += data.chunk;
                  setGeneratedAiContent({ [sectionId]: fieldText });
                }
                if (data.usage) {
                  currentStreamTokens = data.usage.totalTokenCount || 0;
                  setTokensUsados(baseTokens + currentStreamTokens);
                }
              }
            } catch (e) {
              console.warn("No se pudo parsear fragmento JSON:", line, e);
            }
            if (hasError) throw new Error(hasError);
          }
        }
      }
      toast.success(`${sectionId} completado`, { id: `ai-${sectionId}` });
    } catch (error) {
      console.error(error);
      toast.error(`Error procesando ${sectionId}`, { id: `ai-${sectionId}` });
    } finally {
      setIsGeneratingAI(sectionId as SectionId, false);
    }
  };

  const aiCapableSections = ['portada', 'resumen', 'resultados', 'comparaciones', 'graficos', 'adjudicatarios', 'conclusiones', 'anexos'];

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-slate-800 mb-1">1. Contenido del reporte</h3>
      <p className="text-xs text-slate-500 mb-4">Selecciona las secciones. Usa el engranaje para analizar con IA por bloque.</p>
      
      <div className="space-y-2">
        
        {sections.map((section, index) => {
          const isAiCapable = aiCapableSections.includes(section.id);
          const isGenerating = isGeneratingAI[section.id as SectionId];

          return (
            <div
              key={section.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, index)}
              className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-grab active:cursor-grabbing group transition-colors duration-150 relative"
            >
              <GripVertical className="w-4 h-4 text-slate-300 group-hover:text-slate-400 shrink-0" />
              
              <button
                onClick={() => toggleSection(section.id)}
                className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                  section.enabled 
                    ? 'bg-emerald-600 border-emerald-600 text-white' 
                    : 'bg-white border-slate-300'
                }`}
              >
                {section.enabled && <Check className="w-3 h-3" />}
              </button>
              
              <div className="flex-1 min-w-0">
                <div className={`text-sm truncate ${section.enabled ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                  {section.name}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {section.description}
                </div>
              </div>

              {section.enabled && isAiCapable && (
                <div className="relative shrink-0 ml-2">
                  {isGenerating ? (
                    <div className="p-1.5 flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 rounded-md">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generando
                    </div>
                  ) : (
                      <div className="flex items-center gap-1">
                      {section.id === 'anexos' && (
                        <button 
                          onClick={() => setShowScraperModal(true)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                          title="Abrir Buscador de Anexos (Scraper)"
                        >
                          <DownloadCloud className="w-4 h-4" />
                        </button>
                      )}
                      {section.id === 'adjudicatarios' && (
                        <button 
                          onClick={() => {
                            setShowContractorsModal(true);
                            if (availableContractors.length === 0) {
                              setLoadingContractors(true);
                              fetch(`http://localhost:8000/api/pdf/contractors/${jobId}`)
                                .then(res => res.json())
                                .then(data => setAvailableContractors(data.contractors || []))
                                .catch(err => console.error(err))
                                .finally(() => setLoadingContractors(false));
                            }
                          }}
                          className={`p-1.5 rounded-md transition-colors ${selectedContractors.length > 0 ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                          title="Filtrar Adjudicatarios"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => setOpenSettingsId(openSettingsId === section.id ? null : section.id)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="Analizar con Inteligencia Artificial"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {openSettingsId === section.id && !isGenerating && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-slate-200 z-50 py-1">
                        <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
                          <Bot className="w-4 h-4 text-blue-600" />
                          <span className="text-xs font-semibold text-slate-700">Analizar bloque</span>
                        </div>
                        <button onClick={() => handleGenerate(section.id, 'basico')} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs text-slate-600 flex items-center justify-between group">
                          <span>Básico</span>
                          <span className="text-[9px] text-slate-400 group-hover:text-blue-500">Rápido</span>
                        </button>
                        <button onClick={() => handleGenerate(section.id, 'medio')} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs text-slate-600 flex items-center justify-between group">
                          <span>Medio</span>
                          <span className="text-[9px] text-slate-400 group-hover:text-blue-500">Estándar</span>
                        </button>
                        <button onClick={() => handleGenerate(section.id, 'profundo')} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs text-slate-600 flex items-center justify-between group">
                          <span>Profundo</span>
                          <span className="text-[9px] text-slate-400 group-hover:text-blue-500">Exhaustivo</span>
                        </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info de Tokens */}
      {tokensUsados > 0 && (
        <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-slate-600">Uso de IA SecopPRO</span>
          </div>
          <div className="flex gap-3 text-[10px] font-mono text-slate-500">
            <span>Usados: <strong className="text-blue-600">{tokensUsados}</strong></span>
          </div>
        </div>
      )}

      {/* Modal de Selección de Adjudicatarios */}
      {showContractorsModal && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-600" />
                  Filtrar Adjudicatarios a Analizar
                </h3>
                <p className="text-xs text-slate-500 mt-1">Si no seleccionas ninguno, se analizarán los 10 con mayor cuantía por defecto.</p>
              </div>
              <button onClick={() => setShowContractorsModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 flex gap-2 border-b border-slate-100">
              <button 
                onClick={() => setSelectedContractors(availableContractors.map(c => c.nit))}
                className="text-xs font-medium px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
              >
                Seleccionar Todos
              </button>
              <button 
                onClick={() => setSelectedContractors([])}
                className="text-xs font-medium px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
              >
                Limpiar
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              {loadingContractors ? (
                <div className="flex items-center justify-center py-12 gap-2 text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Cargando contratistas...</span>
                </div>
              ) : (
                <div className="space-y-1">
                  {availableContractors.map((c, idx) => (
                    <label key={idx} className="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                      <div className="flex-shrink-0 mt-0.5">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          checked={selectedContractors.includes(c.nit)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedContractors([...selectedContractors, c.nit]);
                            } else {
                              setSelectedContractors(selectedContractors.filter(nit => nit !== c.nit));
                            }
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 line-clamp-1">{c.nombre}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span>NIT: {c.nit}</span>
                          <span>&bull;</span>
                          <span className="font-mono text-emerald-600">
                            ${Number(c.valor.toString().replace(/,/g, '').replace(/\./g, '')).toLocaleString('es-CO')}
                          </span>
                        </div>
                      </div>
                    </label>
                  ))}
                  {availableContractors.length === 0 && !loadingContractors && (
                    <p className="text-center text-sm text-slate-500 py-8">No se encontraron contratistas.</p>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setShowContractorsModal(false)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
              >
                Guardar Selección ({selectedContractors.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal del Scraper de Anexos */}
      <ScraperControlModal
        isOpen={showScraperModal}
        onClose={() => setShowScraperModal(false)}
        jobId={jobId}
      />
    </div>
  );
};

