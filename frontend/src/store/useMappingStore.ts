import { create } from 'zustand';

export interface MappedColumn {
  excelCol: string;
  secopField: string | null;
  isValid: boolean;
  isKey: boolean;
}

interface MappingState {
  mappedColumns: MappedColumn[];
  configToggles: {
    infoBasica: boolean;
    documentos: boolean;
    ejecucion: boolean;
    supervisor: boolean;
    contratista: boolean;
    garantias: boolean;
    pagos: boolean;
    licitaciones: boolean;
  };
  ocrSearchTerm: string;
  analysisConfig: {
    name: string;
    cutOffDate: string;
    runScraper: boolean;
  };
  setMappedColumns: (columns: MappedColumn[]) => void;
  updateColumnMapping: (excelCol: string, secopField: string | null) => void;
  setKeyColumn: (excelCol: string) => void;
  clearAllMappings: () => void;
  toggleConfig: (key: keyof MappingState['configToggles']) => void;
  toggleAllConfig: (value: boolean) => void;
  setOcrSearchTerm: (term: string) => void;
  setAnalysisConfig: (name: string, date: string, runScraper?: boolean) => void;
  getApiPayload: () => any;
}

export const useMappingStore = create<MappingState>((set, get) => ({
  mappedColumns: [],
  configToggles: {
    infoBasica: true,
    documentos: true,
    ejecucion: true,
    supervisor: true,
    contratista: true,
    garantias: true,
    pagos: true,
    licitaciones: true,
  },
  ocrSearchTerm: '',
  analysisConfig: {
    name: '',
    cutOffDate: '',
    runScraper: true,
  },
  setMappedColumns: (columns) => set({ mappedColumns: columns }),
  updateColumnMapping: (excelCol, secopField) => set((state) => {
    const newColumns = state.mappedColumns.map(c => {
      if (c.excelCol === excelCol) {
        const isValid = !!secopField; // Es válido si tiene un campo seleccionado
        const isKey = isValid ? c.isKey : false; // Si deja de ser válido, pierde la llave
        return { ...c, secopField, isValid, isKey };
      }
      return c;
    });
    return { mappedColumns: newColumns };
  }),
  setKeyColumn: (excelCol) => set((state) => {
    const newColumns = state.mappedColumns.map(c => ({
      ...c,
      // Solo una columna puede ser llave, y debe ser válida
      isKey: c.excelCol === excelCol && c.isValid
    }));
    return { mappedColumns: newColumns };
  }),
  clearAllMappings: () => set((state) => ({
    mappedColumns: state.mappedColumns.map(c => ({
      ...c,
      secopField: null,
      isValid: false,
      isKey: false
    }))
  })),
  toggleConfig: (key) => set((state) => ({
    configToggles: {
      ...state.configToggles,
      [key]: !state.configToggles[key]
    }
  })),
  toggleAllConfig: (value) => set((state) => ({
    configToggles: {
      infoBasica: value,
      documentos: value,
      ejecucion: value,
      supervisor: value,
      contratista: value,
      garantias: value,
      pagos: value,
      licitaciones: value,
    }
  })),
  setOcrSearchTerm: (term) => set({ ocrSearchTerm: term }),
  setAnalysisConfig: (name, cutOffDate, runScraper = true) => set({ analysisConfig: { name, cutOffDate, runScraper } }),
  getApiPayload: () => {
    const state = get();
    return {
      mappedColumns: state.mappedColumns,
      configToggles: state.configToggles,
      analysisConfig: state.analysisConfig,
      ocrSearchTerm: state.ocrSearchTerm,
      runScraper: state.analysisConfig.runScraper // Pasarlo a nivel raíz para que FastAPI lo vea fácil
    };
  }
}));
