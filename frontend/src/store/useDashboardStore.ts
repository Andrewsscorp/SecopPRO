import { create } from 'zustand';

interface DashboardState {
  globalSearch: string;
  setGlobalSearch: (term: string) => void;
  
  // Stats
  stats: {
    procesosAnalizados: number;
    alertasEncontradas: number;
    tasaCumplimiento: number;
  };
  setStats: (stats: any) => void;
  
  // Data
  resultsData: any[];
  setResultsData: (data: any[]) => void;
  
  // Column Selection Toggles
  selectedColumns: {
    // General
    numero_proceso: boolean;
    entidad: boolean;
    objeto: boolean;
    contratista: boolean;
    nit: boolean;
    valor: boolean;
    modalidad: boolean;
    estado: boolean;
    
    // SECOP
    documentos: boolean;
    contratos: boolean;
    pagos: boolean;
    actas: boolean;
    garantias: boolean;
    polizas: boolean;
    representante: boolean;
    
    // Comparaciones Automáticas (Rule Engine)
    regla_firma_pub: boolean;
    regla_firma_inicio: boolean;
    regla_inicio_fin: boolean;
    
    // Hallazgos OCR
    ocr_poliza: boolean;
    ocr_garantia: boolean;
    ocr_anticipo: boolean;
  };
  toggleColumn: (key: keyof DashboardState['selectedColumns']) => void;
  toggleAllColumns: (value: boolean) => void;
  // Minimization & Progress State
  isMinimized: boolean;
  currentPdf: number;
  totalPdfs: number;
  toggleMinimize: () => void;
  setPdfProgress: (current: number, total: number) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  globalSearch: '',
  setGlobalSearch: (term) => set({ globalSearch: term }),
  
  // Minimization & Progress Initial State
  isMinimized: false,
  currentPdf: 0,
  totalPdfs: 0,
  toggleMinimize: () => set((state) => ({ isMinimized: !state.isMinimized })),
  setPdfProgress: (current, total) => set({ currentPdf: current, totalPdfs: total }),
  
  stats: {
    procesosAnalizados: 0,
    alertasEncontradas: 0,
    tasaCumplimiento: 0
  },
  setStats: (stats) => set({ stats }),
  
  resultsData: [],
  setResultsData: (data) => set({ resultsData: data }),
  
  selectedColumns: {
    // General (Default true)
    numero_proceso: true,
    entidad: true,
    objeto: false,
    contratista: true,
    nit: false,
    valor: true,
    modalidad: false,
    estado: true,
    
    // SECOP (Default false except some)
    documentos: false,
    contratos: false,
    pagos: false,
    actas: false,
    garantias: true,
    polizas: false,
    representante: false,
    
    // Comparaciones (Default true for demo)
    regla_firma_pub: true,
    regla_firma_inicio: false,
    regla_inicio_fin: false,
    
    // OCR
    ocr_poliza: true,
    ocr_garantia: true,
    ocr_anticipo: true,
  },
  
  toggleColumn: (key) => set((state) => ({
    selectedColumns: {
      ...state.selectedColumns,
      [key]: !state.selectedColumns[key]
    }
  })),
  
  toggleAllColumns: (value: boolean) => set((state) => {
    const newSelected = { ...state.selectedColumns };
    for (const key in newSelected) {
      newSelected[key as keyof DashboardState['selectedColumns']] = value;
    }
    return { selectedColumns: newSelected };
  })
}));
