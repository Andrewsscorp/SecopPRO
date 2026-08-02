import React, { useState } from 'react';
import { usePdfExporterStore, SectionId, SectionItem } from '../store';
import { GripVertical, Check, Settings, Bot, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

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

  const handleGenerate = async (sectionId: string, profundidad: string) => {
    setOpenSettingsId(null);
    try {
      setIsGeneratingAI(sectionId as SectionId, true);
      toast.loading(`Generando análisis para ${sectionId}...`, { id: `ai-${sectionId}` });

      const endpoints: Record<string, string> = {
        'portada': 'generate-cover',
        'resumen': 'generate-executive-summary',
        'resultados': 'generate-results',
        'comparaciones': 'generate-comparisons',
        'graficos': 'generate-graphics'
      };

      const endpoint = endpoints[sectionId];
      if (!endpoint) return;
      
      const res = await fetch(`http://localhost:8000/api/pdf/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, profundidad })
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

  const aiCapableSections = ['portada', 'resumen', 'resultados', 'comparaciones', 'graficos'];

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
                    <button 
                      onClick={() => setOpenSettingsId(openSettingsId === section.id ? null : section.id)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      title="Analizar con Inteligencia Artificial"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
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
            <span className="text-xs font-medium text-slate-600">Uso de IA Gemini</span>
          </div>
          <div className="flex gap-3 text-[10px] font-mono text-slate-500">
            <span>Usados: <strong className="text-blue-600">{tokensUsados}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
};

