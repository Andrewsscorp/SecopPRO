'use client';

import { useLayoutStore } from '@/store/useLayoutStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, Settings, Key, HelpCircle, Hexagon, Menu, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const { isSidebarOpen, toggleSidebar } = useLayoutStore();
  const pathname = usePathname();

  const navItems = [
    { name: 'Buscar en SECOP', icon: Search, href: '/results' },
    { name: 'Documentos', icon: FileText, href: '/documents' },
    { name: 'Ajustes', icon: Settings, href: '/settings/apis' },
    { name: 'Licencia', icon: Key, href: '/license' },
  ];

  const bottomItems = [
    { name: 'Ayuda', icon: HelpCircle, href: '/help' },
  ];

  return (
    <motion.aside
      initial={false}
      animate={{ width: isSidebarOpen ? 250 : 80 }}
      className="bg-white border-r border-gray-200 h-screen sticky top-0 flex flex-col z-40 overflow-hidden shrink-0"
    >
      {/* Header / Logo */}
      <div className="h-16 flex items-center px-4 border-b border-gray-100 justify-between shrink-0">
        <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
          <div className="bg-emerald-100 text-emerald-600 p-1.5 rounded-lg shrink-0">
            <Hexagon className="w-6 h-6 fill-current" />
          </div>
          <AnimatePresence>
            {isSidebarOpen && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="font-bold text-xl text-gray-800"
              >
                SecopPRO
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <button 
          onClick={toggleSidebar}
          className="text-gray-400 hover:text-emerald-600 transition-colors p-1"
        >
          {isSidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-6 px-3 flex flex-col gap-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link key={item.name} href={item.href} className="w-full">
              <div 
                className={`flex items-center px-3 py-3 rounded-xl transition-all group overflow-hidden whitespace-nowrap
                  ${isActive 
                    ? 'bg-emerald-50 text-emerald-700 font-medium' 
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                  }`}
              >
                <item.icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-emerald-600' : 'text-gray-400 group-hover:text-emerald-500'}`} />
                <AnimatePresence>
                  {isSidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.2 }}
                      className="ml-3"
                    >
                      {item.name}
                    </motion.span>
                  )}
                </AnimatePresence>
                {isActive && isSidebarOpen && (
                  <div className="ml-auto w-1.5 h-6 bg-emerald-500 rounded-full" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Navigation */}
      <div className="p-3 border-t border-gray-100 shrink-0">
        {bottomItems.map((item) => (
          <Link key={item.name} href={item.href} className="w-full">
            <div className="flex items-center px-3 py-3 rounded-xl text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-all group overflow-hidden whitespace-nowrap">
              <item.icon className="w-5 h-5 shrink-0 text-gray-400 group-hover:text-emerald-500" />
              <AnimatePresence>
                {isSidebarOpen && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="ml-3"
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
