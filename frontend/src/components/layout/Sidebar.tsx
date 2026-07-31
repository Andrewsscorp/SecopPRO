import Link from 'next/link';
import { UploadCloud, Settings, FileText, Key, HelpCircle, Layers } from 'lucide-react';

export default function Sidebar() {
  return (
    <aside className="w-64 border-r border-gray-100 bg-white flex flex-col h-screen">
      <div className="p-6 flex items-center gap-3">
        <Layers className="w-8 h-8 text-emerald-600" />
        <span className="text-xl font-bold text-gray-900 tracking-tight">SecopPRO</span>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-2">
        <Link 
          href="/" 
          className="flex items-center gap-3 px-4 py-3 bg-emerald-50 text-emerald-700 rounded-lg font-medium transition-colors"
        >
          <UploadCloud className="w-5 h-5" />
          Subir archivos
        </Link>
        <Link 
          href="#" 
          className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg font-medium transition-colors"
        >
          <Settings className="w-5 h-5" />
          Ajustes
        </Link>
        <Link 
          href="#" 
          className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg font-medium transition-colors"
        >
          <FileText className="w-5 h-5" />
          Documentos
        </Link>
        <Link 
          href="#" 
          className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg font-medium transition-colors"
        >
          <Key className="w-5 h-5" />
          Licencia
        </Link>
      </nav>

      <div className="p-4 border-t border-gray-100">
        <Link 
          href="#" 
          className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg font-medium transition-colors"
        >
          <HelpCircle className="w-5 h-5" />
          Ayuda
        </Link>
      </div>
    </aside>
  );
}
