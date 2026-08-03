import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

export const generatePDF = async (isLandscape: boolean) => {
  const pages = document.querySelectorAll('.pdf-page');
  if (!pages || pages.length === 0) {
    toast.error('No hay páginas para exportar.');
    return;
  }

  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const toastId = toast.loading('Generando PDF en alta calidad, por favor espera...');

  try {
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i] as HTMLElement;
      
      const originalTransform = page.style.transform;
      page.style.transform = 'none';

      // --- PAGINATION LOGIC ---
      const pdfWidth = isLandscape ? 297 : 210;
      const pageHeight = isLandscape ? 210 : 297;
      
      const parent = page.parentElement;
      let originalParentTransform = '';
      let originalParentTransition = '';
      if (parent) {
        originalParentTransform = parent.style.transform;
        originalParentTransition = parent.style.transition;
        parent.style.transition = 'none'; // Disable animation for instant measurement
        parent.style.transform = 'scale(1)';
      }

      // Force synchronous reflow
      page.offsetHeight;

      // Wait a tiny bit for browser to strictly recalculate layout
      await new Promise(resolve => setTimeout(resolve, 50));

      const pxPerPage = (page.clientWidth * pageHeight) / pdfWidth;
      const marginPx = (page.clientWidth * 25) / pdfWidth; // 25mm margin top/bottom

      // Gather elements to avoid breaking
      const blocks = Array.from(page.querySelectorAll('p, h1, h2, h3, h4, h5, h6, img, li, tr, pre, blockquote')) as HTMLElement[];
      const addedSpacers: HTMLElement[] = [];
      const modifiedMargins: { el: HTMLElement, originalMargin: string }[] = [];

      for (let j = 0; j < blocks.length; j++) {
        const el = blocks[j];
        const pageRect = page.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        
        const relativeTop = elRect.top - pageRect.top;
        const elHeight = elRect.height;

        const currentPage = Math.floor(relativeTop / pxPerPage);
        const pageBottom = (currentPage + 1) * pxPerPage - marginPx;

        // If the element crosses the bottom boundary and fits on a single page
        if (relativeTop + elHeight > pageBottom && elHeight < (pxPerPage - 2 * marginPx)) {
            const targetTop = (currentPage + 1) * pxPerPage + marginPx;
            const pushAmount = targetTop - relativeTop;
            
            if (el.tagName.toLowerCase() === 'tr') {
                const spacerRow = document.createElement('tr');
                const spacerCell = document.createElement('td');
                spacerCell.style.height = `${pushAmount}px`;
                spacerCell.style.border = 'none';
                spacerCell.style.padding = '0';
                spacerCell.colSpan = 100;
                spacerRow.appendChild(spacerCell);
                el.parentNode?.insertBefore(spacerRow, el);
                addedSpacers.push(spacerRow);
            } else if (el.tagName.toLowerCase() === 'li') {
                const currentMargin = window.getComputedStyle(el).marginTop;
                modifiedMargins.push({ el, originalMargin: el.style.marginTop });
                el.style.marginTop = `${parseFloat(currentMargin || '0') + pushAmount}px`;
            } else {
                const spacer = document.createElement('div');
                spacer.style.height = `${pushAmount}px`;
                spacer.style.width = '100%';
                spacer.style.clear = 'both';
                el.parentNode?.insertBefore(spacer, el);
                addedSpacers.push(spacer);
            }
        }
      }

      const imgData = await toJpeg(page, {
        quality: 1.0,
        pixelRatio: 4,
        backgroundColor: '#ffffff'
      });
      
      const finalHeight = page.clientHeight;
      const pdfImgHeight = (finalHeight * pdfWidth) / page.clientWidth;
      
      // RESTORE DOM
      addedSpacers.forEach(spacer => spacer.remove());
      modifiedMargins.forEach(({ el, originalMargin }) => {
          el.style.marginTop = originalMargin;
      });
      if (parent) {
          parent.style.transition = originalParentTransition;
          parent.style.transform = originalParentTransform;
      }
      page.style.transform = originalTransform;
      // --- END PAGINATION LOGIC ---

      if (i > 0) {
        pdf.addPage();
      }

      let heightLeft = pdfImgHeight;
      let position = 0;

      // Primera página del bloque actual
      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfImgHeight);
      
      // Agregar pie de página
      pdf.setFontSize(8);
      pdf.setTextColor(150, 190, 225);
      pdf.text('Informe generado por SecopPRO', pdfWidth / 2, pageHeight - 10, { align: 'center' });
      
      heightLeft -= pageHeight;

      // Páginas adicionales si el bloque es muy largo
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfImgHeight);
        
        pdf.setFontSize(8);
        pdf.setTextColor(150, 190, 225);
        pdf.text('Informe generado por SecopPRO', pdfWidth / 2, pageHeight - 10, { align: 'center' });
        
        heightLeft -= pageHeight;
      }
    }

    pdf.save('Reporte_Auditoria_SecopPRO.pdf');
    toast.success('PDF generado exitosamente.', { id: toastId });
  } catch (error) {
    console.error('Error generando PDF:', error);
    toast.error('Error al generar el PDF.', { id: toastId });
  }
};
