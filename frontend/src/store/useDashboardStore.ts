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
    nombre_contratista: boolean;
    nit_contratista: boolean;
    contratista: boolean;
    nit: boolean;
    valor: boolean;
    modalidad: boolean;
    estado: boolean;
    
    // Requeridas
    nombre_entidad: boolean;
    nit_entidad: boolean;
    ciudad: boolean;
    valor_contrato: boolean;
    fecha_contrato: boolean;
    nombre_representante: boolean;
    identificacion_representante: boolean;
    telefono_representante: boolean;
    correo_representante: boolean;
    tipo_contrato: boolean;
    
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
    
    // TODAS LAS DEMAS COLUMNAS SECOP (Ocultas por defecto)
    codigo_entidad: boolean;
    departamento: boolean;
    fecha_de_inicio_del_contrato: boolean;
    fecha_de_fin_del_contrato: boolean;
    duraci_n_del_contrato: boolean;
    dias_adicionados: boolean;
    fecha_de_notificaci_n_de_prorrogaci_n: boolean;
    el_contrato_puede_ser_prorrogado: boolean;
    id_contrato: boolean;
    referencia_del_contrato: boolean;
    proceso_de_compra: boolean;
    descripcion_del_proceso: boolean;
    codigo_de_categoria_principal: boolean;
    condiciones_de_entrega: boolean;
    justificacion_modalidad_de: boolean;
    modalidad_de_contratacion: boolean;
    urlproceso: boolean;
    es_grupo: boolean;
    es_pyme: boolean;
    codigo_proveedor: boolean;
    tipodocproveedor: boolean;
    tipo_de_identificaci_n_representante_legal: boolean;
    nacionalidad_representante_legal: boolean;
    domicilio_representante_legal: boolean;
    g_nero_representante_legal: boolean;
    valor_pendiente_de_ejecucion: boolean;
    valor_pagado: boolean;
    valor_pendiente_de_pago: boolean;
    valor_amortizado: boolean;
    valor_facturado: boolean;
    valor_de_pago_adelantado: boolean;
    saldo_cdp: boolean;
    saldo_vigencia: boolean;
    nombre_del_banco: boolean;
    tipo_de_cuenta: boolean;
    n_mero_de_cuenta: boolean;
    nombre_ordenador_de_pago: boolean;
    nombre_ordenador_del_gasto: boolean;
    nombre_supervisor: boolean;
    tipo_de_documento_supervisor: boolean;
    n_mero_de_documento_supervisor: boolean;
    documentos_tipo: boolean;
    descripcion_documentos_tipo: boolean;
    ultima_actualizacion: boolean;
    liquidaci_n: boolean;
    fecha_inicio_liquidacion: boolean;
    fecha_fin_liquidacion: boolean;
    obligaci_n_ambiental: boolean;
    obligaciones_postconsumo: boolean;
    cantidad_documentos_pdf: boolean;
    nombre_pdf: boolean;
    sha_pdf: boolean;
    total_contratos: boolean;
    valor_total_contratos: boolean;
    fecha_primer_contrato: boolean;
    lista_entidades_contrato: boolean;
  };
  
  // Column Ordering
  columnOrder: string[];
  setColumnOrder: (order: string[]) => void;
  
  toggleColumn: (key: string) => void;
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
    numero_proceso: false,
    entidad: false,
    objeto: false,
    nombre_contratista: true,
    nit_contratista: true,
    contratista: false,
    nit: false,
    valor: false,
    modalidad: false,
    estado: false,
    nombre_entidad: true,
    nit_entidad: true,
    ciudad: true,
    valor_contrato: true,
    fecha_contrato: true,
    nombre_representante: true,
    identificacion_representante: true,
    telefono_representante: true,
    correo_representante: true,
    tipo_contrato: true,
    documentos: false,
    contratos: false,
    pagos: false,
    actas: false,
    garantias: false,
    polizas: false,
    representante: false,
    regla_firma_pub: true,
    regla_firma_inicio: true,
    regla_inicio_fin: true,
    ocr_poliza: true,
    ocr_garantia: true,
    ocr_anticipo: true,
    codigo_entidad: false,
    departamento: false,
    fecha_de_inicio_del_contrato: false,
    fecha_de_fin_del_contrato: false,
    duraci_n_del_contrato: false,
    dias_adicionados: false,
    fecha_de_notificaci_n_de_prorrogaci_n: false,
    el_contrato_puede_ser_prorrogado: false,
    id_contrato: false,
    referencia_del_contrato: false,
    proceso_de_compra: false,
    descripcion_del_proceso: false,
    codigo_de_categoria_principal: false,
    condiciones_de_entrega: false,
    justificacion_modalidad_de: false,
    modalidad_de_contratacion: false,
    urlproceso: false,
    es_grupo: false,
    es_pyme: false,
    codigo_proveedor: false,
    tipodocproveedor: false,
    tipo_de_identificaci_n_representante_legal: false,
    nacionalidad_representante_legal: false,
    domicilio_representante_legal: false,
    g_nero_representante_legal: false,
    valor_pendiente_de_ejecucion: false,
    valor_pagado: false,
    valor_pendiente_de_pago: false,
    valor_amortizado: false,
    valor_facturado: false,
    valor_de_pago_adelantado: false,
    saldo_cdp: false,
    saldo_vigencia: false,
    nombre_del_banco: false,
    tipo_de_cuenta: false,
    n_mero_de_cuenta: false,
    nombre_ordenador_de_pago: false,
    nombre_ordenador_del_gasto: false,
    nombre_supervisor: false,
    tipo_de_documento_supervisor: false,
    n_mero_de_documento_supervisor: false,
    documentos_tipo: false,
    descripcion_documentos_tipo: false,
    ultima_actualizacion: false,
    liquidaci_n: false,
    fecha_inicio_liquidacion: false,
    fecha_fin_liquidacion: false,
    obligaci_n_ambiental: false,
    obligaciones_postconsumo: false,
    cantidad_documentos_pdf: false,
    nombre_pdf: false,
    sha_pdf: false,
    total_contratos: false,
    valor_total_contratos: false,
    fecha_primer_contrato: false,
    lista_entidades_contrato: false
  },
  
  columnOrder: [
    'nombre_entidad',
    'nit_entidad',
    'ciudad',
    'nombre_contratista',
    'nit_contratista',
    'valor_contrato',
    'fecha_contrato',
    'nombre_representante',
    'identificacion_representante',
    'telefono_representante',
    'correo_representante',
    'tipo_contrato',
    'numero_proceso',
    'estado',
    'departamento',
    'codigo_entidad',
    'urlproceso',
    'fecha_de_inicio_del_contrato',
    'fecha_de_fin_del_contrato',
    'duraci_n_del_contrato',
    'dias_adicionados',
    'id_contrato',
    'referencia_del_contrato',
    'proceso_de_compra',
    'descripcion_del_proceso',
    'codigo_de_categoria_principal',
    'condiciones_de_entrega',
    'justificacion_modalidad_de',
    'modalidad_de_contratacion',
    'es_grupo',
    'es_pyme',
    'codigo_proveedor',
    'tipodocproveedor',
    'nacionalidad_representante_legal',
    'domicilio_representante_legal',
    'g_nero_representante_legal',
    'valor_pendiente_de_ejecucion',
    'valor_pagado',
    'valor_pendiente_de_pago',
    'valor_amortizado',
    'valor_facturado',
    'valor_de_pago_adelantado',
    'saldo_cdp',
    'saldo_vigencia',
    'nombre_del_banco',
    'tipo_de_cuenta',
    'n_mero_de_cuenta',
    'nombre_ordenador_de_pago',
    'nombre_ordenador_del_gasto',
    'nombre_supervisor',
    'tipo_de_documento_supervisor',
    'n_mero_de_documento_supervisor',
    'liquidaci_n',
    'fecha_inicio_liquidacion',
    'fecha_fin_liquidacion',
    'obligaci_n_ambiental',
    'obligaciones_postconsumo',
    'documentos_tipo',
    'descripcion_documentos_tipo',
    'ultima_actualizacion',
    'el_contrato_puede_ser_prorrogado',
    'fecha_de_notificaci_n_de_prorrogaci_n',
    'regla_firma_pub',
    'regla_firma_inicio',
    'regla_inicio_fin',
    'ocr_poliza',
    'ocr_garantia',
    'ocr_anticipo',
    'cantidad_documentos_pdf',
    'nombre_pdf',
    'sha_pdf',
    'total_contratos',
    'valor_total_contratos',
    'fecha_primer_contrato',
    'lista_entidades_contrato'
  ],
  setColumnOrder: (order) => set({ columnOrder: order }),
  
  toggleColumn: (key) => set((state) => ({
    selectedColumns: {
      ...state.selectedColumns,
      [key]: !state.selectedColumns[key as keyof DashboardState['selectedColumns']]
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
