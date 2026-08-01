<div align="center">
  <img src="https://via.placeholder.com/150/059669/FFFFFF?text=SecopPRO" alt="SecopPRO Logo" width="120" />
  <h1>SecopPRO Analytics & AI</h1>
  <p><strong>Plataforma de Inteligencia y Auditoría Forense para la Contratación Pública en Colombia (SECOP)</strong></p>
</div>

---

## 🚀 Visión General

**SecopPRO** es una herramienta corporativa de vanguardia diseñada para auditar, analizar y visualizar de manera masiva los procesos de contratación del estado colombiano. A través de la extracción de datos de SECOP y el poder de la **Inteligencia Artificial**, SecopPRO procesa miles de contratos en segundos para detectar anomalías, generar resúmenes ejecutivos y exportar sábanas de datos tabuladas.

El sistema prioriza la estética (**Glassmorphism** y diseños corporativos premium), el rendimiento y la facilidad de uso.

## ✨ Características Principales

### 🧠 Auditoría Forense por Inteligencia Artificial
Conectado a **Groq AI**, el sistema analiza el historial completo de cualquier contratista (NIT), generando dictámenes profundos en tiempo real sobre la salud de su contratación (hitos, variaciones de montos, concentración de entidades).

### 📊 Dashboard Interactivo & Analítica Visual
- Visualización de "Top 5 Entidades" mediante diagramas circulares (`Recharts`).
- Distribución de contratos por año y detección de picos atípicos.
- Filtros dinámicos en tiempo real sobre sábanas de datos gigantes.

### 📄 Exportación PDF Retina-Ready (A4)
SecopPRO incorpora un motor de renderizado PDF a medida (basado en `jsPDF` y `html-to-image`):
- **Resolución 3x (Print Quality):** Los reportes nunca son borrosos; se capturan a densidades extremas para una legibilidad física inmaculada.
- **Paginación Matemática ("Slicing"):** El sistema divide automáticamente el dictamen larguísimo de la IA en perfectas páginas A4 continuas.
- **Márgenes y Membrete Corporativo:** Integración nativa de márgenes protectores (20mm y 25mm) y estampado de pies de página ("Informe generado por software SecopPRO...").

### 📈 Exportación de Excel Dinámico (`exceljs`)
Despídete de los CSV simples. El exportador de SecopPRO genera `.xlsx` nativos:
- **Autodescubrimiento:** Escanea dinámicamente *todas* las columnas y campos ocultos del API para no perder un solo dato.
- **Estética Pastel & Zebra Striping:** Fondos esmeralda para encabezados y filas alternadas para fácil lectura visual de miles de registros.
- **Data-Aware:** Detecta matemáticamente columnas relacionadas con dinero ("valor") y aplica formatos de contabilidad nativos (`$#,##0.00`). Alineación automática de fechas y códigos.

---

## 🛠 Stack Tecnológico

El proyecto cuenta con una arquitectura Full-Stack moderna y desacoplada:

**Frontend (Client-Side Rendering & UI)**
- **Next.js / React 18**: Núcleo reactivo e interactivo.
- **Tailwind CSS v3.4+**: Estilos, utilidades y Glassmorphism.
- **Lucide React**: Iconografía corporativa limpia.
- **ExcelJS**: Manipulación binaria de reportes XLSX en el navegador.
- **html-to-image + jsPDF**: Pipeline de renderizado PDF en el lado del cliente (sin afectar el hilo principal).
- **Recharts**: Dashboards y analítica visual.

**Backend (Data & AI Layer)**
- **FastAPI (Python)**: Alto rendimiento y asincronismo para scraping/API.
- **Pandas**: Procesamiento pesado de conjuntos de datos y cruces masivos de bases del estado.
- **SQLAlchemy**: ORM y comunicación con la base de datos.
- **Groq LLM**: Motor de inferencia ultrarrápida para auditoría textual.

---

## 📂 Arquitectura de Módulos (Frontend)

- `/src/components/modals/ContractorReportModal.tsx`: El corazón analítico. Un modal dinámico a pantalla completa que recibe un NIT, consulta su historial al backend, detona la IA, pinta el historial tabulado y permite las exportaciones magistrales.
- `/src/app/results/page.tsx`: Dashboard principal y capa de ingesta de datos.
- `/src/components/upload/UploadZone.tsx`: Zona de carga de documentos, compatibilidad con lectura de anexos locales e integración con OCR (Tesseract / OpenCV) desde el backend.

---

## 📜 Control de Versiones
Revisar el archivo `CHANGELOG.md` para visualizar el registro histórico de mejoras y parches bajo el formato **Semantic Versioning (SemVer)**. La versión actual es la **2.2.0**, destacando la liberación del exportador de Excel dinámico y la estabilización matemática del PDF en páginas A4.

---
> *"Diseñado con precisión algorítmica y excelencia estética."* - **SecopPRO**
