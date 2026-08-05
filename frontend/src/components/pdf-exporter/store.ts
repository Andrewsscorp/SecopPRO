import { create } from 'zustand';

export type SectionId = 
  | 'portada' 
  | 'resumen' 
  | 'resultados' 
  | 'comparaciones' 
  | 'graficos' 
  | 'adjudicatarios'
  | 'conclusiones' 
  | 'anexos';

export interface SectionItem {
  id: SectionId;
  name: string;
  description: string;
  enabled: boolean;
}

const DEFAULT_SECTIONS: SectionItem[] = [
  { id: 'portada', name: 'Portada', description: 'Título del reporte, fecha, logo y resumen ejecutivo', enabled: true },
  { id: 'resumen', name: 'Resumen ejecutivo', description: 'Indicadores clave y métricas generales', enabled: true },
  { id: 'resultados', name: 'Tabla de resultados', description: 'Datos principales del análisis', enabled: true },
  { id: 'comparaciones', name: 'Comparaciones y análisis', description: 'Resultados de comparaciones automáticas', enabled: true },
  { id: 'graficos', name: 'Gráficos y visualizaciones', description: 'Gráficos de distribución y tendencias', enabled: true },
  { id: 'adjudicatarios', name: 'Análisis a Adjudicatarios', description: 'Historial y evaluación de contratistas', enabled: true },
  { id: 'conclusiones', name: 'Conclusiones y recomendaciones', description: 'Conclusiones del análisis y recomendaciones', enabled: true },
  { id: 'anexos', name: 'Anexos', description: 'Documentos relacionados y metodología', enabled: true },
];

interface PdfExporterState {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;

  sections: SectionItem[];
  setSections: (sections: SectionItem[]) => void;
  toggleSection: (id: SectionId) => void;

  pageSize: string;
  setPageSize: (size: string) => void;

  orientation: 'Vertical' | 'Horizontal';
  setOrientation: (orientation: 'Vertical' | 'Horizontal') => void;

  margins: string;
  setMargins: (margins: string) => void;

  quality: string;
  setQuality: (quality: string) => void;

  includePageNumber: boolean;
  setIncludePageNumber: (include: boolean) => void;

  includeTOC: boolean;
  setIncludeTOC: (include: boolean) => void;

  watermark: {
    enabled: boolean;
    text: string;
    opacity: number;
    size: number;
    rotation: string;
    position: string; // 'top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'
    color: string;
  };
  setWatermark: (settings: Partial<PdfExporterState['watermark']>) => void;

  reportInfo: {
    title: string;
    subtitle: string;
    date: string;
    preparedBy: string;
  };
  setReportInfo: (info: Partial<PdfExporterState['reportInfo']>) => void;

  zoom: number;
  setZoom: (zoom: number) => void;

  isGeneratingAI: Partial<Record<SectionId, boolean>>;
  setIsGeneratingAI: (id: SectionId, isGenerating: boolean) => void;

  generatedAiContent: {
    portada: string | null;
    resumen: string | null;
    resultados: string | null;
    comparaciones: string | null;
    graficos: string | null;
    adjudicatarios: string | null;
    conclusiones: string | null;
    anexos: string | null;
  };
  setGeneratedAiContent: (content: Partial<PdfExporterState['generatedAiContent']>) => void;

  tokensUsados: number;
  setTokensUsados: (tokens: number) => void;

  selectedContractors: string[];
  setSelectedContractors: (nits: string[]) => void;

  aiProvider: 'gemini' | 'groq' | 'local';
  setAiProvider: (provider: 'gemini' | 'groq' | 'local') => void;
}

const getTodayDateStr = () => {
  const d = new Date();
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};

export const usePdfExporterStore = create<PdfExporterState>((set) => ({
  isOpen: false,
  setIsOpen: (isOpen) => set({ isOpen }),

  sections: [...DEFAULT_SECTIONS],
  setSections: (sections) => set({ sections }),
  toggleSection: (id) => set((state) => ({
    sections: state.sections.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s)
  })),

  pageSize: 'A4 (210 x 297 mm)',
  setPageSize: (pageSize) => set({ pageSize }),

  orientation: 'Vertical',
  setOrientation: (orientation) => set({ orientation }),

  margins: 'Estándar',
  setMargins: (margins) => set({ margins }),

  quality: 'Alta (300 DPI)',
  setQuality: (quality) => set({ quality }),

  includePageNumber: true,
  setIncludePageNumber: (includePageNumber) => set({ includePageNumber }),

  includeTOC: true,
  setIncludeTOC: (includeTOC) => set({ includeTOC }),

  watermark: {
    enabled: true,
    text: 'CONFIDENCIAL - USO INTERNO',
    opacity: 20,
    size: 48,
    rotation: '45°',
    position: 'center',
    color: '#CBD5E1',
  },
  setWatermark: (w) => set((state) => ({ watermark: { ...state.watermark, ...w } })),

  reportInfo: {
    title: 'Reporte de Auditoría SECOP',
    subtitle: 'Análisis de contratos y procesos',
    date: getTodayDateStr(),
    preparedBy: 'SecopPRO - Sistema de Auditoría',
  },
  setReportInfo: (info) => set((state) => ({ reportInfo: { ...state.reportInfo, ...info } })),

  zoom: 125,
  setZoom: (zoom) => set({ zoom }),

  isGeneratingAI: {},
  setIsGeneratingAI: (id, isGenerating) => set((state) => ({ 
    isGeneratingAI: { ...state.isGeneratingAI, [id]: isGenerating } 
  })),

  generatedAiContent: {
    portada: null,
    resumen: null,
    resultados: null,
    comparaciones: null,
    graficos: null,
    adjudicatarios: null,
    conclusiones: null,
  },
  setGeneratedAiContent: (content) => set((state) => ({ 
    generatedAiContent: { ...state.generatedAiContent, ...content } 
  })),

  tokensUsados: 0,
  setTokensUsados: (tokensUsados) => set({ tokensUsados }),

  selectedContractors: [],
  setSelectedContractors: (selectedContractors) => set({ selectedContractors }),

  aiProvider: 'gemini',
  setAiProvider: (aiProvider) => set({ aiProvider }),
}));
