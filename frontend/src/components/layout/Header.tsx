'use client';

import { User, Activity, Bell, Search, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function Header() {
  const pathname = usePathname();
  const [time, setTime] = useState('');

  useEffect(() => {
    const updateTime = () => setTime(new Date().toLocaleTimeString('es-CO', { hour12: false }));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const getBreadcrumb = () => {
    if (pathname.includes('/settings')) return 'Centro de Comando / Configuración';
    if (pathname.includes('/results')) return 'Análisis Forense / Motor IA';
    if (pathname.includes('/documents')) return 'Bóveda Forense / Repositorio';
    return 'Plataforma Principal';
  };

  return (
    <header className="h-24 w-full bg-transparent flex items-center justify-between px-8 z-40 relative">
      <div className="flex flex-col">
        <h2 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-3">
          {getBreadcrumb()}
        </h2>
        <div className="flex items-center gap-2 mt-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Enlace Seguro TSL Activo</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="hidden md:flex bg-white/60 backdrop-blur-md border border-white shadow-sm rounded-full px-4 py-2 items-center gap-3">
          <Activity className="w-4 h-4 text-emerald-500" />
          <span className="text-xs font-bold text-slate-600 font-mono">{time}</span>
          <div className="w-px h-4 bg-slate-200" />
          
          {/* Toggle IA Local / API */}
          <button 
            onClick={() => {
              const current = localStorage.getItem('global_ai_mode') === 'local';
              const nextMode = current ? 'api' : 'local';
              localStorage.setItem('global_ai_mode', nextMode);
              // Disparar evento para que GlobalChat y otros se actualicen si es necesario
              window.dispatchEvent(new Event('storage'));
              // Forzar un refresh rápido para aplicar cambios globales si se requiere
              // o simplemente confiar en que el chat lo leerá al abrirse.
              const el = document.getElementById('ia-toggle-text');
              if(el) el.innerText = nextMode === 'local' ? 'IA Local Activada' : 'API Cloud (Gemini/Groq)';
            }}
            className="flex items-center gap-2 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-full cursor-pointer transition-colors border border-gray-200"
          >
            <ShieldCheck className="w-4 h-4 text-blue-500" />
            <span id="ia-toggle-text" className="text-[11px] font-bold text-slate-700">
              {typeof window !== 'undefined' && localStorage.getItem('global_ai_mode') === 'local' 
                ? 'IA Local Activada' 
                : 'API Cloud (Gemini/Groq)'}
            </span>
          </button>
        </div>

        <button className="relative p-2 text-slate-400 hover:text-slate-700 transition-colors bg-white/60 backdrop-blur-md rounded-full shadow-sm border border-white">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border border-white" />
        </button>

        <div className="flex items-center gap-3 cursor-pointer hover:bg-white/80 p-1.5 pr-4 rounded-full transition-all bg-white/60 backdrop-blur-md border border-white shadow-sm group">
          <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center text-white shadow-inner">
            <User className="w-5 h-5" />
          </div>
          <span className="text-sm font-bold text-slate-700 group-hover:text-emerald-700 transition-colors">Usuario</span>
          <svg className="w-4 h-4 text-slate-400 group-hover:text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </header>
  );
}
