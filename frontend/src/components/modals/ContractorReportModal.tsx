import React, { useEffect, useState, useMemo, useRef } from 'react';
import { X, Bot, AlertTriangle, FileText, BarChart3, Clock, Building, Maximize2, Minimize2, SlidersHorizontal, Copy, Check, Download, FileSpreadsheet, Image as ImageIcon, BarChart as ChartIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import * as htmlToImage from 'html-to-image';
import type * as ExcelJS from 'exceljs';

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
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  
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
    wrapperRef: React.RefObject<HTMLDivElement | null>, 
    headerRef: React.RefObject<HTMLDivElement | null>,
    contentRef: React.RefObject<HTMLDivElement | null>,
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

  const handleDownloadPDF = async () => {
    if (!chart1ContentRef.current || !chart2ContentRef.current) return;
    setIsGeneratingPDF(true);
    try {
      const { jsPDF } = await import('jspdf');
      const { marked } = await import('marked');

      // Helper to temporarily remove scrollbars for perfect image capture
      const removeScrollbars = (contentRef: React.RefObject<HTMLDivElement | null>) => {
        const scrollables = contentRef.current?.querySelectorAll('.overflow-y-auto, .max-h-24, .max-h-28, .custom-scrollbar') || [];
        scrollables.forEach(el => {
          const e = el as HTMLElement;
          e.dataset.originalOverflow = e.style.overflow;
          e.dataset.originalMaxHeight = e.style.maxHeight;
          e.style.overflow = 'visible';
          e.style.maxHeight = 'none';
        });
      };
      
      const restoreScrollbars = (contentRef: React.RefObject<HTMLDivElement | null>) => {
        const scrollables = contentRef.current?.querySelectorAll('.overflow-y-auto, .max-h-24, .max-h-28, .custom-scrollbar') || [];
        scrollables.forEach(el => {
          const e = el as HTMLElement;
          e.style.overflow = e.dataset.originalOverflow || '';
          e.style.maxHeight = e.dataset.originalMaxHeight || '';
        });
      };

      // 1. Prepare DOM
      removeScrollbars(chart1ContentRef);
      removeScrollbars(chart2ContentRef);
      
      // Wait for React to apply layout changes
      await new Promise(r => setTimeout(r, 400));
      
      // 2. Capture charts as images using the safe htmlToImage library
      const chart1Img = await htmlToImage.toPng(chart1ContentRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 });
      const chart2Img = await htmlToImage.toPng(chart2ContentRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 });
      
      // Restore DOM
      restoreScrollbars(chart1ContentRef);
      restoreScrollbars(chart2ContentRef);
      
      // 3. Create a viewport-bound hidden container to force Chrome to paint it (avoids blank image)
      const pdfContainer = document.createElement('div');
      pdfContainer.style.position = 'fixed';
      pdfContainer.style.top = '0';
      pdfContainer.style.left = '0';
      pdfContainer.style.width = '100vw';
      pdfContainer.style.height = '100vh';
      pdfContainer.style.overflow = 'hidden'; 
      pdfContainer.style.zIndex = '-9999';
      pdfContainer.style.pointerEvents = 'none';
      pdfContainer.style.opacity = '0.01';
      
      const parsedMarkdown = await marked.parse(data?.reporte_ia || 'Sin reporte disponible.');
            // PAGE 1: Text Report
      const page1 = document.createElement('div');
      page1.style.width = '800px';
      page1.style.backgroundColor = '#ffffff';
      page1.style.padding = '20px'; // Less internal padding, we use PDF margins now
      page1.style.fontFamily = 'Helvetica, Arial, sans-serif';
      page1.style.color = '#1f2937';
      
      page1.innerHTML = `
        <div style="border-bottom: 3px solid #059669; padding-bottom: 15px; margin-bottom: 25px;">
           <h1 style="color: #064e3b; font-size: 26px; text-transform: uppercase; margin: 0 0 8px 0; font-weight: bold;">Análisis: ${data?.nombre}</h1>
           <p style="color: #4b5563; font-size: 14px; margin: 0; font-weight: bold;">NIT: ${data?.documento} &nbsp;|&nbsp; Fecha: ${dateStr}</p>
        </div>
        
        <div style="margin-bottom: 20px; font-size: 15px; line-height: 1.8; text-align: justify;">
           <style>
             .markdown-content h1, .markdown-content h2, .markdown-content h3 { color: #064e3b; font-weight: bold; margin-top: 20px; margin-bottom: 12px; }
             .markdown-content h1 { font-size: 20px; border-bottom: 2px solid #059669; padding-bottom: 6px; }
             .markdown-content h2 { font-size: 17px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
             .markdown-content h3 { font-size: 15px; }
             .markdown-content p { margin-bottom: 15px; }
             .markdown-content ul { padding-left: 20px; margin-bottom: 15px; }
             .markdown-content li { margin-bottom: 8px; }
             .markdown-content strong { color: #111827; }
           </style>
           <div class="markdown-content">
             ${parsedMarkdown}
           </div>
        </div>
      `;
      
      // PAGE 2: Charts
      const page2 = document.createElement('div');
      page2.style.width = '800px';
      page2.style.backgroundColor = '#ffffff';
      page2.style.padding = '20px';
      page2.style.fontFamily = 'Helvetica, Arial, sans-serif';
      page2.style.color = '#1f2937';
      
      page2.innerHTML = `
        <div style="border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 30px;">
           <h2 style="color: #064e3b; font-size: 22px; margin: 0; font-weight: bold;">Anexo Gráfico</h2>
        </div>
        
        <div style="margin-bottom: 40px;">
           <h3 style="color: #047857; margin-bottom: 15px; font-size: 16px; font-weight: bold;">Contratos por Año</h3>
           <img src="${chart1Img}" style="width: 100%; max-width: 700px; display: block; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px;" />
        </div>
        
        <div>
           <h3 style="color: #047857; margin-bottom: 15px; font-size: 16px; font-weight: bold;">Top 5 Entidades Contratantes</h3>
           <img src="${chart2Img}" style="width: 100%; max-width: 700px; display: block; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px;" />
        </div>
      `;
      
      pdfContainer.appendChild(page1);
      pdfContainer.appendChild(page2);
      document.body.appendChild(pdfContainer);
      
      // Allow DOM to settle and images to decode
      await new Promise(r => setTimeout(r, 600));
      
      // 4. Generate images for each block (pixelRatio 3 for extremely sharp retina print quality)
      await htmlToImage.toPng(page1, { backgroundColor: '#ffffff', style: { opacity: '1' } }); // Warm up
      const img1 = await htmlToImage.toPng(page1, { backgroundColor: '#ffffff', pixelRatio: 3, style: { opacity: '1' } });
      const img2 = await htmlToImage.toPng(page2, { backgroundColor: '#ffffff', pixelRatio: 3, style: { opacity: '1' } });
      
      const rect1 = page1.getBoundingClientRect();
      const rect2 = page2.getBoundingClientRect();
      
      document.body.removeChild(pdfContainer);
      
      // 5. Build Standard A4 jsPDF with True Margins
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pageWidth = 210;
      const pageHeight = 297;
      
      const marginTop = 20;
      const marginBottom = 25;
      const marginSide = 20;
      
      const usableWidth = pageWidth - (marginSide * 2);
      const usableHeight = pageHeight - marginTop - marginBottom;
      
      // Helper to slice long images with physical white masks for margins
      const drawImageSlicedWithMargins = (imgData: string, rect: DOMRect, isNewPage = false) => {
        if (isNewPage) pdf.addPage();
        const imgRatio = rect.height / rect.width;
        const pdfImgWidth = usableWidth;
        const pdfImgHeight = usableWidth * imgRatio;
        
        let heightLeft = pdfImgHeight;
        let yPosition = marginTop;
        
        while (heightLeft > 0) {
          // Draw the image
          pdf.addImage(imgData, 'PNG', marginSide, yPosition, pdfImgWidth, pdfImgHeight);
          
          // Draw Top White Mask (hides image bleeding into top margin)
          pdf.setFillColor(255, 255, 255);
          pdf.rect(0, 0, pageWidth, marginTop, 'F');
          
          // Draw Bottom White Mask (hides image bleeding into bottom margin)
          pdf.rect(0, pageHeight - marginBottom, pageWidth, marginBottom, 'F');
          
          heightLeft -= usableHeight;
          
          if (heightLeft > 0) {
            yPosition -= usableHeight; // Shift image UP for the next page slice
            pdf.addPage();
          }
        }
      };
      
      drawImageSlicedWithMargins(img1, rect1, false);
      drawImageSlicedWithMargins(img2, rect2, true);
      
      // 6. Inject Footer "Membrete" on ALL pages cleanly inside the bottom margin
      const totalPages = (pdf as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text(
          'Informe generado por software SecopPRO by Andrés Suárez', 
          pageWidth / 2, 
          pageHeight - 10, // Perfectly inside the 25mm bottom mask
          { align: 'center' }
        );
      }
      
      pdf.save(`Analisis_${data?.documento}.pdf`);
      
    } catch (err: any) {
      console.error("PDF Error:", err);
      alert("Hubo un error al generar el PDF corporativo: " + (err.message || String(err)));
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!filteredData || filteredData.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }
    setIsGeneratingExcel(true);
    
    try {
      // Import dynamically to avoid bloating initial load
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'SecopPRO';
      workbook.created = new Date();
      
      const sheet = workbook.addWorksheet('Historial Contratos');
      
      // Estilo de encabezado elegante con colores pastel (verde esmeralda suave)
      const headerStyle = {
        font: { bold: true, color: { argb: 'FF064E3B' }, size: 11, name: 'Calibri' },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } } as ExcelJS.Fill, // emerald-100
        alignment: { vertical: 'middle', horizontal: 'center' } as Partial<ExcelJS.Alignment>,
        border: {
          top: { style: 'thin', color: { argb: 'FF10B981' } },
          bottom: { style: 'medium', color: { argb: 'FF10B981' } },
          left: { style: 'thin', color: { argb: 'FF10B981' } },
          right: { style: 'thin', color: { argb: 'FF10B981' } }
        } as Partial<ExcelJS.Borders>
      };
      
      // Generar columnas dinámicamente basadas en allKeys
      const formatHeader = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      sheet.columns = allKeys.map(key => ({
        header: formatHeader(key),
        key: key,
        width: key.includes('descripcion') || key.includes('objeto') ? 60 : 30
      }));
      
      // Aplicar estilos a la cabecera
      sheet.getRow(1).height = 30;
      sheet.getRow(1).eachCell((cell) => {
        cell.style = headerStyle;
      });
      
      // Estilos alternados para las filas (zebra)
      const rowStyleEven: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }; // gray-50
      const rowStyleOdd: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }; // white
      
      // Rellenar datos iterando sobre todas las llaves dinámicamente
      filteredData.forEach((c: any, index: number) => {
        const rowData: Record<string, any> = {};
        
        allKeys.forEach(key => {
          let val = c[key];
          // Convertir a número si es un campo de valor
          if (key.toLowerCase().includes('valor') && typeof val !== 'undefined' && val !== null) {
             const parsed = parseFloat(val);
             val = isNaN(parsed) ? val : parsed;
          }
          rowData[key] = (val !== null && val !== undefined && val !== '') ? val : 'N/A';
        });
        
        const row = sheet.addRow(rowData);
        
        // Aplicar estilos a las celdas
        const isEven = index % 2 === 0;
        row.height = 35; // Altura para que respire el texto
        
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const currentKey = allKeys[colNumber - 1]; // colNumber is 1-indexed
          const isDescription = currentKey.includes('descripcion') || currentKey.includes('objeto');
          
          cell.alignment = { vertical: 'middle', wrapText: isDescription };
          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF374151' } };
          cell.fill = isEven ? rowStyleEven : rowStyleOdd;
          cell.border = {
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
          };
          
          // Formato moneda para columnas que contengan "valor"
          if (currentKey.toLowerCase().includes('valor')) {
            cell.numFmt = '"$"#,##0.00';
            cell.alignment = { ...cell.alignment, horizontal: 'right' };
            cell.font = { ...cell.font, bold: true, color: { argb: 'FF059669' } }; // Valor en verde
          }
          
          // Centrar fechas, códigos y estados
          if (currentKey.includes('fecha') || currentKey.includes('estado') || currentKey.includes('codigo')) {
             cell.alignment = { ...cell.alignment, horizontal: 'center' };
          }
        });
      });
      
      // Congelar la fila superior (encabezados) y la primera columna (opcional, mejor solo superior para data ancha)
      sheet.views = [
        { state: 'frozen', xSplit: 0, ySplit: 1 }
      ];
      
      // Generar archivo
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Análisis_Contratos_Detallado_${data.documento}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
    } catch (err) {
      console.error("Error generando Excel:", err);
      alert("Hubo un error al generar el archivo Excel corporativo.");
    } finally {
      setIsGeneratingExcel(false);
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
                            label={({name, value}) => `${name?.substring(0,22) || 'Desconocido'} (${value})`}
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
            <button 
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
                isGeneratingPDF 
                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' 
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200'
              }`}
            >
              {isGeneratingPDF ? (
                 <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                 <FileText className="w-4 h-4" />
              )}
              {isGeneratingPDF ? 'Generando PDF...' : 'Descargar PDF'}
            </button>
            <button 
              onClick={handleDownloadExcel} 
              disabled={isGeneratingExcel}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
                isGeneratingExcel
                  ? 'bg-emerald-50 text-emerald-400 border-emerald-200 cursor-not-allowed'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
              }`}
            >
              {isGeneratingExcel ? (
                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              {isGeneratingExcel ? 'Generando Excel...' : 'Descargar Excel'}
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
