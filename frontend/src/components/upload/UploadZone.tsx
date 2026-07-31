'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import { CloudUpload, FileText, Trash2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { validateFileSize, ACCEPTED_MIME_TYPES, isValidFileType } from '@/lib/validations';
import { extractHeaders } from '@/lib/excelParser';
import { generateFileHash } from '@/lib/crypto';
import { useFileStore } from '@/store/useFileStore';

export default function UploadZone() {
  const router = useRouter();
  const { file, fileHash, setFileAndColumns, clearFile } = useFileStore();

  const onDrop = useCallback(async (acceptedFiles: File[], fileRejections: any[]) => {
    // 1. Manejo de Errores Rápidos
    if (fileRejections.length > 0) {
      const error = fileRejections[0].errors[0];
      if (error.code === 'file-too-large') {
        toast.error('El archivo excede el tamaño máximo permitido de 50MB.');
      } else if (error.code === 'file-invalid-type') {
        toast.error('Formato no soportado. Sube un archivo .xlsx, .xls, .csv o .pdf.');
      } else {
        toast.error('Error al intentar cargar el archivo.');
      }
      return;
    }

    const droppedFile = acceptedFiles[0];
    if (!droppedFile) return;

    if (!validateFileSize(droppedFile)) {
      toast.error('El archivo excede el tamaño máximo permitido de 50MB.');
      return;
    }
    
    if (!isValidFileType(droppedFile)) {
        toast.error('Formato no soportado. Sube un archivo .xlsx, .xls, .csv o .pdf.');
        return;
    }

    // 2. Procesamiento Exitoso (Zero-Latency)
    const toastId = toast.loading('Calculando firma digital y procesando archivo...');
    
    try {
      // Extraemos columnas y calculamos el hash en paralelo para optimizar el tiempo
      const [columns, hash] = await Promise.all([
        extractHeaders(droppedFile),
        generateFileHash(droppedFile)
      ]);
      
      setFileAndColumns(droppedFile, columns, hash);
      toast.success('Archivo procesado exitosamente', { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error inesperado', { id: toastId });
    }
  }, [setFileAndColumns]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_MIME_TYPES,
    maxSize: 50 * 1024 * 1024,
    multiple: false
  });

  // Renderizado Condicional: Estado B (Archivo cargado)
  if (file) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white h-full w-full max-w-4xl mx-auto rounded-2xl shadow-sm border border-gray-50">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-lg border border-gray-200 rounded-2xl p-8 bg-white shadow-sm"
        >
          <div className="flex items-start gap-4 mb-6">
            <div className="p-4 bg-emerald-50 text-emerald-600 rounded-xl">
              <FileText className="w-8 h-8" />
            </div>
            <div className="flex-1 overflow-hidden">
              <h4 className="text-lg font-semibold text-gray-900 truncate" title={file.name}>
                {file.name}
              </h4>
              <p className="text-sm text-gray-500 font-medium">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>

          <div className="mb-8">
            <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Firma Digital (SHA-256)
            </span>
            <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg overflow-x-auto">
              <code className="text-sm text-gray-700 font-mono whitespace-nowrap">
                {fileHash}
              </code>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={clearFile}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar
            </button>
            <button
              onClick={() => router.push('/mapping')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl font-medium shadow-sm transition-colors"
            >
              Siguiente
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Renderizado Condicional: Estado A (Sin archivo)
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-white h-full w-full max-w-4xl mx-auto rounded-2xl shadow-sm border border-gray-50">
      
      <div 
        {...getRootProps()} 
        className={`w-full p-12 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ease-in-out
          ${isDragActive ? 'border-emerald-500 bg-emerald-50 scale-[1.01]' : 'border-gray-200 hover:border-emerald-400 hover:bg-gray-50'}`}
      >
        <input {...getInputProps()} />
        
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="w-24 h-24 mb-6 bg-emerald-50 rounded-full flex items-center justify-center"
        >
          <CloudUpload className={`w-12 h-12 ${isDragActive ? 'text-emerald-600 animate-bounce' : 'text-emerald-500'}`} />
        </motion.div>

        <h3 className="text-2xl font-bold text-gray-800 mb-2">
          Upload your Excel or PDF files here
        </h3>
        <p className="text-gray-500 mb-8">
          Arrastra y suelta tus archivos aquí o haz clic para buscar
        </p>

        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium shadow-md hover:bg-emerald-700 transition-colors flex items-center gap-2"
        >
          <CloudUpload className="w-5 h-5" />
          Seleccionar archivos
        </motion.button>
      </div>

      <p className="mt-8 text-sm text-gray-400">
        Formatos soportados: .xlsx, .xls, .csv, .pdf
      </p>
    </div>
  );
}
