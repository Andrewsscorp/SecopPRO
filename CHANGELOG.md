# 📜 Registro de Versiones (Changelog) - SecopPRO

Todos los cambios notables de este proyecto se documentarán en este archivo.

El formato está basado en los estándares de la industria **[Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/)**, y este proyecto se adhiere a **[Semantic Versioning](https://semver.org/lang/es/)** (SemVer).

## 📊 ¿Cómo funciona nuestro versionado?
Usamos el formato `X.Y.Z` (Ejemplo: `2.1.0`):
- **X (Mayor)**: Cambios gigantes estructurales (como cambiar toda la base de datos o rehacer el software desde cero).
- **Y (Menor)**: Nuevas funcionalidades o rediseños importantes que **no rompen** lo que ya funcionaba (ej. añadir descarga de imágenes o cambiar el diseño de la tabla).
- **Z (Parche)**: Arreglos de errores pequeños (bugs) invisibles o que no añaden funciones nuevas (ej. arreglar que un botón no hace clic).

---

## [2.6.0] - 2026-08-02 (Actual)
### ✨ Nuevas Funcionalidades (Features)
- **Scraper Híbrido de Anexos (Forensics):** Nueva arquitectura de extracción profunda que permite descargar anexos físicos para calcular su `SHA256` o hacer una extracción rápida (solo nombres) de forma secuencial, protegiendo la memoria del servidor.
- **Buscador de Extracción (ScraperControlModal):** Interfaz nativa conectada a la base de datos para buscar, filtrar (por estado y cuantía) y seleccionar múltiples contratos para extraer sus anexos simultáneamente sin ventanas emergentes de SO.
- **Smart Rule Validator (RAG):** Integración de un modelo para comparar reglas lógicas (Ej. Fecha de firma vs publicación) utilizando procesamiento de lenguaje natural y extracción inteligente sobre PDFs previamente scrapeados.

### 🐛 Correcciones (Bug Fixes)
- **Bloqueo del Modal de Caché:** Se eliminó la condicional estricta del caché. Ahora las 5 opciones principales de procesamiento (Ignorar PDFs, Re-descargar, Sobrescribir) aparecen siempre para dar control absoluto al analista incluso en Excel sin caché previa.

## [2.5.0] - 2026-08-01
### ✨ Nuevas Funcionalidades (Features)
- **Reintento de Análisis en Caliente:** Nueva arquitectura para volver a procesar análisis masivos desde la base de datos sin necesitar el archivo de Excel original, con un nuevo endpoint `/api/retry-job` impulsado por colas asíncronas de Python (`multiprocessing.Queue`).
- **Vista de Historial de Consultas:** Creación del dashboard `documents/page.tsx` para listar con paginación los análisis previos, con capacidades de retomar el procesamiento directo en tiempo real.

### 🚀 Rendimiento (Performance)
- **Eliminación del N+1 Query Problem:** El endpoint principal del dashboard (`/api/dashboard/stats` y `/search`) fue reescrito de cero utilizando consultas vectorizadas `in_` con diccionarios de memoria en Python, lo que redujo el tiempo de carga de 2,500 registros de 40 segundos a menos de 1 segundo de forma instantánea.

### 🐛 Correcciones (Bug Fixes)
- **Duplicidad de Contratos en Reintentos:** Se corrigió una fuga lógica en `secop_worker.py` que clonaba todos los metadatos de los contratos cada vez que el usuario presionaba "Reintentar Análisis". Ahora valida el vínculo de la base de datos antes de reinsertar.
- **Configuraciones CORS Globales:** Re-configuración de la capa de seguridad de FastAPI (CORS Middleware) para evitar `Failed to fetch` durante peticiones preflight (`OPTIONS`) cuando el cliente y servidor negocian puertos locales distintos.

---

## [2.4.0] - 2026-08-01
### ✨ Nuevas Funcionalidades (Features)
- **Motor de Reinicio Fantasma Multiplataforma:** Implementación de un sistema avanzado en Python (`psutil`) para limpiar procesos "zombie" o puertos bloqueados (`8000`, `3000`) desde el propio servidor de forma 100% silenciosa (`CREATE_NO_WINDOW`). Es agnóstico, adaptándose a Windows (mata consolas viejas), Linux y Docker.
- **UI de Seguridad y Reinicio Avanzado:** Pestaña de "Seguridad" en Ajustes con diseño *Glassmorphism* rojo. Pide credencial criptográfica para autorizar bloqueos.
- **Auto-sembrado de Clave Criptográfica:** El servidor inyecta automáticamente la clave maestra encriptada (AES-256) en la BD local durante su arranque si es una instalación nueva.

### 🎨 Experiencia de Usuario (UX)
- **Overlay Interactivo Post-Reinicio:** El frontend no se recarga ciegamente; despliega una pantalla completa inmersiva que detalla los pasos de apagado, pingeando en segundo plano hasta que el backend responde, recargando suavemente con un pop-up de "Sistema en línea".

---

## [2.3.0] - 2026-08-01
### ✨ Nuevas Funcionalidades (Features)
- **Exportador Excel Masivo Multi-Hoja:** Se integró lógica SOQL de descargas agrupadas en el backend (`export.py`) para extraer en lotes la historia completa de múltiples terceros simultáneamente. La exportación Excel genera una hoja maestra más pestañas adicionales para cada NIT, y todo el proceso nutre la base de datos local **sin** gastar tokens de Inteligencia Artificial (IA bajo demanda).
- **Indicadores Históricos y PDF Integrados:** El endpoint principal del Dashboard ahora mapea y cruza automáticamente en tiempo real (BD local) variables ricas como `cantidad_documentos_pdf`, `total_contratos`, y montos totales, permitiendo visualizar "El impacto" de cada contratista directamente en la tabla principal.
- **Configurador de Columnas Drag & Drop Avanzado:** El modal fue rediseñado para soportar manipulación masiva ("Marcar Todas / Desmarcar Todas"). 
- **Dialog Box Elegante de Exportación:** Nuevo popup visual sin emojis, con diseño _Glassmorphism_ que guía al usuario claramente si desea anexar historiales profundos o si requiere un volcado de tabla plano y rápido.

### 🐛 Correcciones (Bug Fixes)
- **Lazy IA Loading en Dashboard:** Se rediseñó el endpoint "del Ojito" (`contractor.py`) para consultar a Groq *únicamente* si el tercero no tiene reporte previo. Elimina peticiones redundantes.
- **Seguridad en Fallos de Red React (GlobalChat):** Integración de manejadores `try/catch` asíncronos en los `useEffect` de configuración para evitar el temido React Error Overlay cuando el `.bat` del backend aún no inicializa el servidor en `localhost`.

---

## [2.2.0] - 2026-08-01
### ✨ Nuevas Funcionalidades (Features)
- **Exportador Excel Inteligente y Dinámico (`exceljs`):** Se integró un motor de exportación Excel de última generación, completamente del lado del cliente, capaz de mapear automáticamente el 100% de las columnas ocultas del API de SECOP. Incluye autodescubrimiento de campos, formateo de moneda inteligente (reconoce campos "valor"), zebra striping corporativo y congelación de paneles.
- **Paginación PDF Nativa y Avanzada:** Se diseñó un algoritmo de segmentación matemática ("Slicing") que divide documentos ultra-largos generados por IA en perfectas páginas A4. Evita superposiciones mediante máscaras de sangría (márgenes blancos) y ancla el pie de página ("membrete corporativo") uniformemente en todas las páginas generadas.

### 🐛 Correcciones (Bug Fixes)
- **Motor PDF reconstruido (Resolución Retina):** Se eliminó por completo la dependencia `html2pdf.js` y `html2canvas` debido a fallos de compatibilidad con los espacios de color modernos de Tailwind v3.4+ (`oklch`/`lab`). Se migró a un ecosistema puro de `html-to-image` con `jsPDF` a 3x de Pixel Ratio (300+ DPI), erradicando las descargas "borrosas" o en blanco.
- **Rules of Hooks:** Se solventó un error de renderizado crítico en `ContractorReportModal` trasladando las declaraciones de estado al nivel superior del componente, restableciendo el ciclo de vida de React.

### ✨ Nuevas Características
- **Exportación Excel Automática:** Implementado el botón "Descargar Excel", el cual procesa iterativamente el arreglo de contratos y genera un documento CSV codificado en `UTF-8` con BOM (Byte Order Mark) para garantizar compatibilidad nativa e instantánea de tildes y formato numérico con Microsoft Excel.

---

## 🚀 [2.1.0] - 2026-08-01

### ✨ Añadido (Nuevas Funcionalidades)
- 📸 **Motor de Exportación Avanzado (`html-to-image`)**: Se reemplazó la librería antigua por una solución robusta para renderizar y exportar gráficas a PNG en altísima resolución (2x pixel ratio), eliminando fallos con elementos SVG.
- 🏢 **Membrete Corporativo Dinámico**: Las imágenes exportadas ahora inyectan dinámicamente un membrete que incluye el Nombre de la Empresa, NIT y Título de la Gráfica.
- 🕒 **Sellado de Tiempo**: Se agregó una sutil marca de tiempo ("Generado: dd/mm/aaaa hh:mm") en la esquina inferior derecha de las exportaciones PNG.
- 📋 **Acciones Rápidas (Portapapeles)**: Integración de botones interactivos de "Copiar" (con feedback visual de 2 segundos) para el Dictamen Forense de la IA y los Valores Totales Estimados.

### 🎨 Cambios Visuales y UX (Experiencia de Usuario)
- 🌙 **Rediseño Premium en Tablas**: El `ContractorReportModal` fue reestructurado. La tabla de historial ahora usa cabeceras oscuras (`bg-slate-800`) contrastadas con tipografía esmeralda para una alineación profesional y limpia.
- 📊 **Mejoras en Tipografía de Ejes**: Los años en las gráficas de barras ahora respetan un margen matemático (`tickMargin={10}`) y tienen un color verde esmeralda (`#059669`) en negrita.
- 🪟 **Modales Flotantes Perfectos**: La ampliación de gráficas dejó de estirarse por toda la pantalla. Ahora usan un "Lightbox" flotante centrado con dimensiones fijas, manteniendo la proporción perfecta.

### 🐛 Corregido (Bug Fixes)
- ✂️ **Recorte en Gráficas de Pastel**: Se corrigió un desbordamiento visual ajustando el `outerRadius` a `110` y aplicando alturas estáticas, evitando que los círculos parecieran óvalos recortados al ampliar.
- 🏃‍♂️ **Conflicto de Animaciones al Exportar**: Se desactivaron las animaciones internas de Recharts (`isAnimationActive={false}`) que causaban que la cámara tomara fotos de gráficas invisibles o "en construcción". Las "linecitas" y etiquetas de pastel ahora siempre se capturan.
- 📜 **Leyendas Ocultas**: El clonador de imágenes ahora destruye temporalmente las cajas de scroll antes de tomar la foto para garantizar que toda la lista de entidades se incluya en el PNG sin recortes.

---

## 🏗️ [2.0.0] - Versión Base Anterior

### ✨ Añadido
- 🧠 **Cerebro Forense Integrado**: Conexión con la API de Groq usando el modelo `llama-3.3-70b-versatile` con System Prompts especializados en auditoría profunda.
- 💾 **Caché Inteligente**: Implementación de base de datos local `contratacion_terceros` para guardar dictámenes y evitar consumos innecesarios de tokens a la IA.
- 📈 **Interfaz Base**: Creación inicial del dashboard de SecopPRO con modales de visualización.
