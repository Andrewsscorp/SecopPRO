'use client';

import { useLayoutStore } from '@/store/useLayoutStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, Settings, Key, HelpCircle, Hexagon, Menu, ChevronLeft, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const { isSidebarOpen, toggleSidebar } = useLayoutStore();
  const pathname = usePathname();

  const navItems = [
    { name: 'Motor IA (SECOP)', icon: Search, href: '/results' },
    { name: 'Bóveda Forense', icon: FileText, href: '/documents' },
    { name: 'Configuración API', icon: Settings, href: '/settings/apis' },
    { name: 'Licenciamiento', icon: Key, href: '/license' },
  ];

  const bottomItems = [
    { name: 'Soporte y Ayuda', icon: HelpCircle, href: '/help' },
  ];

  return (
    <motion.aside
      initial={false}
      animate={{ width: isSidebarOpen ? 280 : 88 }}
      className="bg-slate-950 border-r border-slate-800 h-screen sticky top-0 flex flex-col z-50 overflow-visible shrink-0 shadow-[20px_0_40px_rgba(0,0,0,0.3)] relative"
    >
      {/* Background Decorativo Oscuro */}
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.05] pointer-events-none mix-blend-overlay" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 via-transparent to-slate-950/80 pointer-events-none" />

      {/* Botón de Hamburguesa Flotante y Animado */}
      <div className="absolute -right-5 top-8 z-50">
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={toggleSidebar}
          className="relative flex items-center justify-center w-10 h-10 bg-emerald-500 rounded-full text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_30px_rgba(16,185,129,0.6)] hover:bg-emerald-400 transition-all border-2 border-slate-900 group"
        >
          {/* Anillo de pulso exterior */}
          <div className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-20" />
          {isSidebarOpen ? <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" /> : <Menu className="w-5 h-5 group-hover:scale-110 transition-transform" />}
        </motion.button>
      </div>

      {/* Header / Logo */}
      <div className="h-24 flex items-center px-6 border-b border-slate-800/80 shrink-0 relative z-10">
        <div className="flex items-center gap-4 overflow-hidden whitespace-nowrap">
          <div className="relative group shrink-0">
            <div className="absolute inset-0 bg-emerald-500 rounded-xl blur-lg opacity-40 group-hover:opacity-80 transition-opacity duration-500" />
            <div className="relative bg-slate-900 text-emerald-400 p-2.5 rounded-xl border border-emerald-500/30">
              <Hexagon className="w-6 h-6 fill-current" />
            </div>
          </div>
          <AnimatePresence>
            {isSidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col"
              >
                <span className="font-black text-2xl tracking-tight text-white drop-shadow-sm">
                  Secop<span className="text-emerald-400">PRO</span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Enterprise AI</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-8 px-4 flex flex-col gap-2 relative z-10 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link key={item.name} href={item.href} className="w-full relative group block">
              <div 
                className={`flex items-center px-4 py-3.5 rounded-2xl transition-all duration-300 overflow-hidden whitespace-nowrap relative
                  ${isActive 
                    ? 'bg-emerald-500/10 border-l-4 border-emerald-500 shadow-inner' 
                    : 'border-l-4 border-transparent hover:bg-slate-800/50 hover:border-slate-700'
                  }`}
              >
                <item.icon className={`w-5 h-5 shrink-0 transition-all duration-300 relative z-10 
                  ${isActive 
                    ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)] scale-110' 
                    : 'text-slate-400 group-hover:text-emerald-400 group-hover:scale-110'
                  }`} 
                />
                <AnimatePresence>
                  {isSidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0, width: 0, x: -10 }}
                      animate={{ opacity: 1, width: 'auto', x: 0 }}
                      exit={{ opacity: 0, width: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      className={`ml-4 text-[15px] transition-colors relative z-10
                        ${isActive ? 'font-bold text-white' : 'font-medium text-slate-400 group-hover:text-slate-200'}
                      `}
                    >
                      {item.name}
                    </motion.span>
                  )}
                </AnimatePresence>
                
                {isActive && !isSidebarOpen && (
                  <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* System Status / Bottom Area */}
      <div className="p-4 border-t border-slate-800/80 shrink-0 relative z-10 bg-slate-900/50">
        {/* Status Bubble */}
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="mb-4 bg-slate-900/80 rounded-2xl p-4 border border-slate-700/50 shadow-lg flex items-start gap-3 relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full pointer-events-none" />
              <div className="bg-emerald-500/20 text-emerald-400 p-2 rounded-xl shrink-0 border border-emerald-500/20">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-0.5">Estado Core</p>
                <p className="text-[11px] text-emerald-400/80 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Operativo y seguro
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {bottomItems.map((item) => (
          <Link key={item.name} href={item.href} className="w-full">
            <div className="flex items-center px-4 py-3 rounded-2xl text-slate-400 hover:bg-slate-800 hover:border-slate-700 border border-transparent hover:text-white transition-all group overflow-hidden whitespace-nowrap">
              <item.icon className="w-5 h-5 shrink-0 group-hover:text-emerald-400 group-hover:rotate-12 transition-all" />
              <AnimatePresence>
                {isSidebarOpen && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="ml-4 text-[15px] font-medium"
                  >
                    {item.name}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </Link>
        ))}
      </div>
    </motion.aside>
  );
}
