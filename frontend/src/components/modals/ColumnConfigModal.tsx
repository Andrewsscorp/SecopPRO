import { useState } from 'react';
import { useDashboardStore } from '@/store/useDashboardStore';
import { X, GripVertical, Check, LayoutTemplate, Search, HelpCircle } from 'lucide-react';

export const COLUMNS_DICT: Record<string, { title: string, description: string }> = {
  nombre_entidad: { title: "Nombre Entidad", description: "Nombre oficial de la entidad pública" },
  nit_entidad: { title: "NIT Entidad", description: "Número de Identificación Tributaria de la entidad" },
  ciudad: { title: "Ciudad", description: "Ciudad donde se ejecuta o firma el contrato" },
  nombre_contratista: { title: "Nombre Contratista", description: "Nombre del proveedor adjudicado" },
  nit_contratista: { title: "NIT/Cédula Contratista", description: "Documento de identidad del proveedor" },
  valor_contrato: { title: "Valor Contrato", description: "Valor económico total del contrato" },
  fecha_contrato: { title: "Fecha Contrato", description: "Fecha en la que se firma el contrato" },
  nombre_representante: { title: "Nombre Rep. Legal", description: "Nombre del representante legal" },
  identificacion_representante: { title: "Cédula/NIT Rep.", description: "Documento del representante legal" },
  telefono_representante: { title: "Teléfono Rep.", description: "Teléfono de contacto del representante" },
  correo_representante: { title: "Correo Rep.", description: "Email de contacto del representante" },
  tipo_contrato: { title: "Tipo Contrato", description: "Clasificación del contrato (ej. Prestación de Servicios)" },
  numero_proceso: { title: "Número Proceso", description: "Llave única de búsqueda o referencia SECOP" },
  regla_firma_pub: { title: "Firma +3 vs Pub", description: "Alerta: Fecha de firma + 3 días menor a publicación" },
  regla_firma_inicio: { title: "Firma vs Inicio", description: "Alerta: Fecha de firma debe ser antes del inicio" },
  regla_inicio_fin: { title: "Inicio vs Fin", description: "Alerta: Fecha de inicio debe ser anterior al fin" },
  estado: { title: "Estado", description: "Estado general del análisis o contrato" },
  departamento: { title: "Departamento", description: "Departamento geográfico de ejecución" },
  codigo_entidad: { title: "Código de Entidad", description: "Código interno de la entidad en SECOP" },
  urlproceso: { title: "URL del Proceso", description: "Enlace directo al contrato en SECOP" },
  fecha_de_inicio_del_contrato: { title: "Fecha Inicio", description: "Fecha de inicio del contrato" },
  fecha_de_fin_del_contrato: { title: "Fecha Fin", description: "Fecha de finalización pactada" },
  duraci_n_del_contrato: { title: "Duración", description: "Tiempo de duración pactado (días, meses)" },
  dias_adicionados: { title: "Días Adicionados", description: "Días extras agregados al tiempo original" },
  id_contrato: { title: "ID Contrato", description: "ID interno único del contrato" },
  referencia_del_contrato: { title: "Referencia Contrato", description: "Referencia textual del contrato" },
  proceso_de_compra: { title: "Proceso de Compra", description: "Número/ID del proceso general" },
  descripcion_del_proceso: { title: "Descripción del Proceso", description: "Detalles amplios o justificación" },
  codigo_de_categoria_principal: { title: "Código Categoría", description: "Código UNSPSC o de clasificación" },
  condiciones_de_entrega: { title: "Condiciones de Entrega", description: "Lugar o forma de entrega" },
  justificacion_modalidad_de: { title: "Justificación Modalidad", description: "Razón jurídica de la contratación" },
  modalidad_de_contratacion: { title: "Modalidad", description: "Forma de contrato (Contratación Directa, Licitación)" },
  es_grupo: { title: "¿Es Grupo?", description: "Si el contratista es un consorcio o unión temporal" },
  es_pyme: { title: "¿Es PyME?", description: "Si el contratista está clasificado como PyME" },
  codigo_proveedor: { title: "Código Proveedor", description: "ID interno del proveedor" },
  tipodocproveedor: { title: "Tipo Doc. Proveedor", description: "Tipo de documento (NIT, CC, CE)" },
  nacionalidad_representante_legal: { title: "Nacionalidad Rep.", description: "Nacionalidad del representante legal" },
  domicilio_representante_legal: { title: "Domicilio Rep.", description: "Dirección o ciudad de domicilio del rep." },
  g_nero_representante_legal: { title: "Género Rep.", description: "Género registrado del representante legal" },
  valor_pendiente_de_ejecucion: { title: "Valor Pend. Ejecución", description: "Saldo pendiente por ejecutar" },
  valor_pagado: { title: "Valor Pagado", description: "Dinero desembolsado a la fecha" },
  valor_pendiente_de_pago: { title: "Valor Pend. Pago", description: "Dinero ejecutado pero no desembolsado" },
  valor_amortizado: { title: "Valor Amortizado", description: "Anticipos que ya fueron amortizados" },
  valor_facturado: { title: "Valor Facturado", description: "Total de facturas radicadas" },
  valor_de_pago_adelantado: { title: "Pago Adelantado", description: "Monto de anticipo entregado" },
  saldo_cdp: { title: "Saldo CDP", description: "Saldo del Certificado de Disponibilidad Presupuestal" },
  saldo_vigencia: { title: "Saldo Vigencia", description: "Saldo de vigencia futura si aplica" },
  nombre_del_banco: { title: "Nombre del Banco", description: "Banco de la cuenta del proveedor" },
  tipo_de_cuenta: { title: "Tipo de Cuenta", description: "Ahorros o corriente" },
  n_mero_de_cuenta: { title: "Número de Cuenta", description: "Cuenta bancaria de desembolso" },
  nombre_ordenador_de_pago: { title: "Ordenador de Pago", description: "Funcionario responsable de los pagos" },
  nombre_ordenador_del_gasto: { title: "Ordenador del Gasto", description: "Funcionario responsable de contratar" },
  nombre_supervisor: { title: "Nombre Supervisor", description: "Funcionario responsable de la supervisión" },
  tipo_de_documento_supervisor: { title: "Tipo Doc. Supervisor", description: "CC o documento del supervisor" },
  n_mero_de_documento_supervisor: { title: "Doc. Supervisor", description: "Identificación del supervisor" },
  liquidaci_n: { title: "Liquidación", description: "Si requiere o tiene liquidación" },
  fecha_inicio_liquidacion: { title: "Inicio Liquidación", description: "Fecha de inicio del trámite de liquidación" },
  fecha_fin_liquidacion: { title: "Fin Liquidación", description: "Fecha final de liquidación" },
  obligaci_n_ambiental: { title: "Obligación Ambiental", description: "Si incluye clausulas ambientales" },
  obligaciones_postconsumo: { title: "Obligación Postconsumo", description: "Si incluye manejo postconsumo" },
  documentos_tipo: { title: "Documentos Tipo", description: "Uso de pliegos tipo" },
  descripcion_documentos_tipo: { title: "Desc. Documentos Tipo", description: "Detalle de los pliegos tipo" },
  ultima_actualizacion: { title: "Última Actualización", description: "Última fecha de modificación en SECOP" },
  el_contrato_puede_ser_prorrogado: { title: "¿Prorrogable?", description: "Indica si admite prórrogas" },
  fecha_de_notificaci_n_de_prorrogaci_n: { title: "Fecha Prórroga", description: "Notificación de la extensión" },
  cantidad_documentos_pdf: { title: "Cantidad PDFs", description: "Cantidad de documentos descargados y procesados" },
  nombre_pdf: { title: "Nombres de los PDFs", description: "Lista de nombres de archivos PDF procesados" },
  sha_pdf: { title: "SHA-256 PDFs", description: "Hash criptográfico de los PDFs para verificar integridad" },
  total_contratos: { title: "Total Contratos Tercero", description: "Total histórico de contratos del tercero" },
  valor_total_contratos: { title: "Valor Total Tercero", description: "Suma del valor de todos los contratos del tercero" },
  fecha_primer_contrato: { title: "Primer Contrato Tercero", description: "Fecha del contrato más antiguo registrado" },
  lista_entidades_contrato: { title: "Entidades del Tercero", description: "Lista de entidades con las que ha contratado" }
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ColumnConfigModal({ isOpen, onClose }: Props) {
  const { columnOrder, selectedColumns, toggleColumn, setColumnOrder, toggleAllColumns } = useDashboardStore();
  
  // Local state for search & dragging
  const [searchTerm, setSearchTerm] = useState('');
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  // Derived filtered items
  const filteredOrder = columnOrder.filter(colKey => {
    const info = COLUMNS_DICT[colKey as string];
    if (!info) return colKey.toLowerCase().includes(searchTerm.toLowerCase());
    return info.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
           info.description.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Handle Drag Start
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, colKey: string) => {
    const actualIndex = columnOrder.indexOf(colKey as any);
    setDraggedItemIndex(actualIndex);
    e.dataTransfer.effectAllowed = "move";
    setTimeout(() => {
      if(e.target && (e.target as HTMLElement).classList) {
        (e.target as HTMLElement).classList.add("opacity-50");
      }
    }, 0);
  };

  // Handle Drag Over
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetColKey: string) => {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = "move";
    
    const targetIndex = columnOrder.indexOf(targetColKey as any);
    if (draggedItemIndex === null || draggedItemIndex === targetIndex) return;
    
    const newOrder = [...columnOrder];
    const draggedItem = newOrder[draggedItemIndex];
    
    newOrder.splice(draggedItemIndex, 1);
    newOrder.splice(targetIndex, 0, draggedItem);
    
    setColumnOrder(newOrder as any);
    setDraggedItemIndex(targetIndex);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    if(e.target && (e.target as HTMLElement).classList) {
      (e.target as HTMLElement).classList.remove("opacity-50");
    }
    setDraggedItemIndex(null);
  };

  // Direct Position Input handler
  const handlePositionChange = (colKey: string, newPosStr: string) => {
    if (!newPosStr) return;
    let targetIndex = parseInt(newPosStr, 10) - 1; // Convert 1-based to 0-based index
    if (isNaN(targetIndex)) return;
    
    targetIndex = Math.max(0, Math.min(targetIndex, columnOrder.length - 1));
    const currentIndex = columnOrder.indexOf(colKey as any);
    if (currentIndex === targetIndex) return;
    
    const newOrder = [...columnOrder];
    const item = newOrder[currentIndex];
    newOrder.splice(currentIndex, 1);
    newOrder.splice(targetIndex, 0, item);
    
    setColumnOrder(newOrder as any);
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-700 to-teal-800">
          <div className="flex items-center gap-3 text-white">
            <LayoutTemplate className="w-5 h-5" />
            <div>
              <h2 className="text-lg font-bold">Configurar Columnas</h2>
              <p className="text-emerald-100 text-xs">Añade o reorganiza la información de la tabla ({columnOrder.length} disponibles)</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 flex flex-col min-h-0">
          {/* Search Bar & Actions */}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Buscar columnas por nombre o descripción..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <button onClick={() => toggleAllColumns(true)} className="px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors">Marcar Todas</button>
            <button onClick={() => toggleAllColumns(false)} className="px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors">Desmarcar Todas</button>
          </div>
          
          <div className="text-xs text-gray-500 mb-2 flex justify-between px-2">
            <span>Posición y Arrastre</span>
            <span>Visibilidad</span>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl flex-1 overflow-y-auto p-2">
            {filteredOrder.map((colKey) => {
              const actualIndex = columnOrder.indexOf(colKey as any);
              const displayIndex = actualIndex + 1; // 1-based for the user
              const isSelected = selectedColumns[colKey as keyof typeof selectedColumns];
              const info = COLUMNS_DICT[colKey as string] || { title: colKey, description: "N/A" };
              
              return (
                <div
                  key={colKey}
                  draggable
                  onDragStart={(e) => handleDragStart(e, colKey as string)}
                  onDragOver={(e) => handleDragOver(e, colKey as string)}
                  onDragEnd={handleDragEnd}
                  className={`
                    flex items-center gap-3 p-3 mb-1.5 rounded-lg border transition-all cursor-grab active:cursor-grabbing group
                    ${isSelected ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-100 border-transparent opacity-60'}
                    hover:border-emerald-300
                  `}
                >
                  {/* Position Input */}
                  <input 
                    type="text"
                    defaultValue={displayIndex}
                    title="Escribe un número y presiona Enter para mover"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handlePositionChange(colKey as string, e.currentTarget.value);
                      }
                    }}
                    onBlur={(e) => handlePositionChange(colKey as string, e.target.value)}
                    className="w-9 text-center bg-gray-50 border border-gray-200 rounded py-1 text-xs text-gray-500 group-hover:border-emerald-300 focus:bg-white focus:outline-none focus:border-emerald-500 cursor-text transition-colors"
                  />

                  {/* Drag Handle */}
                  <div className="text-gray-400 group-hover:text-gray-600 cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-5 h-5" />
                  </div>
                  
                  {/* Title & Tooltip */}
                  <div className={`flex-1 font-medium text-sm flex items-center gap-2 ${isSelected ? 'text-gray-800' : 'text-gray-500 line-through'}`}>
                    {info.title}
                    <div className="relative group/tooltip flex items-center justify-center">
                      <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 p-2 bg-gray-900 text-white text-[10px] rounded opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none">
                        {info.description}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-gray-900"></div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Toggle */}
                  <button
                    onClick={() => toggleColumn(colKey as any)}
                    className={`
                      relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none
                      ${isSelected ? 'bg-emerald-500' : 'bg-gray-300'}
                    `}
                  >
                    <span
                      className={`
                        pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                        ${isSelected ? 'translate-x-4' : 'translate-x-0'}
                      `}
                    />
                  </button>
                </div>
              );
            })}
            
            {filteredOrder.length === 0 && (
              <div className="p-8 text-center text-sm text-gray-500">
                No se encontraron columnas que coincidan con la búsqueda.
              </div>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" /> Listo
          </button>
        </div>
      </div>
    </div>
  );
}
