'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send, Trash2, Sparkles, Bot, ChevronDown, Check } from 'lucide-react';

const formatMarkdown = (text: string) => {
  if (!text) return null;
  
  const lines = text.split('\n');
  
  return lines.map((line, i) => {
    const isListItem = line.trim().match(/^[-*]\s+(.*)/);
    let content = line;
    let isList = false;
    
    if (isListItem) {
      content = isListItem[1];
      isList = true;
    }
    
    const parts = content.split(/(\*\*.*?\*\*)/g);
    
    const formattedLine = parts.map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j} className="font-bold text-teal-950">{part.slice(2, -2)}</strong>;
      }
      return <span key={j}>{part}</span>;
    });

    if (isList) {
      return (
        <div key={i} className="flex gap-2 my-1">
          <span className="text-emerald-500 mt-[2px] font-bold">•</span>
          <span className="text-gray-800">{formattedLine}</span>
        </div>
      );
    }
    
    return (
      <span key={i} className="text-gray-800">
        {formattedLine}
        {i < lines.length - 1 && <br />}
      </span>
    );
  });
};

export default function GlobalChat() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{role: string, content: string}[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  
  const [activeProviders, setActiveProviders] = useState<{id: string, name: string}[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, chatLoading, isChatOpen, showConfirmDelete]);

  useEffect(() => {
    const fetchKeys = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/settings/keys');
        const data = await res.json();
        if (data.status === 'success' && data.data) {
          const providers = [];
          if (data.data.groq?.is_active) providers.push({ id: 'groq', name: 'Groq (Llama 3)' });
          if (data.data.gemini?.is_active) providers.push({ id: 'gemini', name: 'Google Gemini' });
          
          setActiveProviders(providers);
          
          const savedProvider = localStorage.getItem('secop_chat_provider');
          if (savedProvider && providers.find(p => p.id === savedProvider)) {
            setSelectedProvider(savedProvider);
          } else if (providers.length > 0) {
            setSelectedProvider(providers[0].id);
          }
        }
      } catch (err) {
        console.error('API Keys fetch error, ignoring:', err);
      }
    };
    
    if (isChatOpen) {
      fetchKeys();
    }
  }, [isChatOpen]);

  const handleProviderSelect = (id: string) => {
    setSelectedProvider(id);
    localStorage.setItem('secop_chat_provider', id);
  };

  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    if (activeProviders.length === 0) {
      setChatMessages(prev => [...prev, {role: 'ai', content: "Error: No tienes ninguna API activa. Por favor configúralas en Ajustes."}]);
      return;
    }
    
    const userMessage = chatInput;
    setChatMessages(prev => [...prev, {role: 'user', content: userMessage}]);
    setChatInput('');
    setChatLoading(true);
    
    try {
      const res = await fetch('http://localhost:8000/api/ai/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ message: userMessage, provider: selectedProvider })
      });
      const data = await res.json();
      
      if (res.ok && data.response) {
        setChatMessages(prev => [...prev, {role: 'ai', content: data.response}]);
      } else {
        setChatMessages(prev => [...prev, {role: 'ai', content: "Error: " + (data.detail || data.error || "Fallo interno")}]);
      }
    } catch (e) {
      setChatMessages(prev => [...prev, {role: 'ai', content: "Error de red conectando al backend de SecopPRO."}]);
    }
    setChatLoading(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isChatOpen && (
        <div className="bg-white/60 backdrop-blur-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] rounded-3xl w-[400px] h-[550px] mb-4 flex flex-col transition-all duration-300 ease-out transform origin-bottom-right border border-white/60">
          
          {/* Header Glassmorphism Premium */}
          <div className="bg-gradient-to-br from-emerald-600/90 to-teal-800/90 backdrop-blur-2xl px-6 py-5 flex flex-col gap-4 border-b border-white/20 shadow-sm relative rounded-t-3xl">
            
            {/* Fondo con destellos de luz sutiles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-t-3xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl transform translate-x-10 -translate-y-10"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-emerald-400/20 rounded-full blur-2xl transform -translate-x-10 translate-y-10"></div>
            </div>

            <div className="flex justify-between items-center text-white relative z-10">
              <h3 className="font-bold flex items-center gap-2.5 text-[19px] tracking-tight drop-shadow-sm">
                <div className="p-1.5 bg-white/20 rounded-lg shadow-inner border border-white/20">
                  <Sparkles className="w-5 h-5 text-emerald-50" />
                </div>
                Auditor IA
              </h3>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={() => setShowConfirmDelete(true)} 
                  title="Limpiar chat"
                  className="hover:bg-white/20 p-2.5 rounded-full transition-all duration-200 text-white/90 hover:text-white"
                >
                  <Trash2 className="w-4 h-4"/>
                </button>
                <button 
                  onClick={() => setIsChatOpen(false)} 
                  title="Cerrar chat"
                  className="hover:bg-red-500/80 hover:shadow-lg p-2.5 rounded-full transition-all duration-200 text-white/90 hover:text-white"
                >
                  <X className="w-4 h-4"/>
                </button>
              </div>
            </div>
            
            {/* Animated Switch (Segmented Control) Premium */}
            <div className="flex items-center justify-between mt-1 z-20">
              <span className="flex items-center gap-1.5 font-medium tracking-wide text-[13px] text-emerald-100/90">
                <Bot className="w-4 h-4 text-emerald-200"/> IA Activa:
              </span>
              
              <div className="relative flex items-center bg-black/20 backdrop-blur-md p-1 rounded-xl shadow-inner border border-white/10 w-fit">
                {activeProviders.length === 0 ? (
                  <span className="px-4 py-1.5 text-[12px] text-gray-400">Sin conexión</span>
                ) : (
                  <>
                    {activeProviders.map((p) => (
                      <button 
                        key={p.id}
                        onClick={() => handleProviderSelect(p.id)}
                        className={`relative z-10 px-3.5 py-1.5 text-[13px] font-bold rounded-lg transition-colors duration-300 w-[125px] text-center ${selectedProvider === p.id ? 'text-white drop-shadow-md' : 'text-emerald-100/70 hover:text-white'}`}
                      >
                        {p.name}
                      </button>
                    ))}
                    {/* The sliding background */}
                    <div 
                      className="absolute top-1 bottom-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg shadow-md border border-emerald-400/50 transition-all duration-300 ease-out z-0"
                      style={{
                        left: `${(activeProviders.findIndex(p => p.id === selectedProvider) >= 0 ? activeProviders.findIndex(p => p.id === selectedProvider) : 0) * (100 / activeProviders.length)}%`,
                        marginLeft: activeProviders.findIndex(p => p.id === selectedProvider) > 0 ? '4px' : '4px',
                        width: `calc(${100 / activeProviders.length}% - 8px)`
                      }}
                    ></div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Inline Delete Confirmation Premium */}
          {showConfirmDelete && (
            <div className="bg-white/95 backdrop-blur-md border-b border-gray-100 p-4 flex flex-col items-center justify-center gap-3 text-sm animate-in slide-in-from-top-2 shadow-sm relative z-50">
              <span className="text-gray-800 font-bold tracking-tight">¿Deseas eliminar todo el historial?</span>
              <div className="flex gap-3 w-full">
                <button 
                  onClick={() => setShowConfirmDelete(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-xl hover:bg-gray-200 transition-all duration-200 font-bold"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => { setChatMessages([]); setShowConfirmDelete(false); }}
                  className="flex-1 bg-gradient-to-r from-red-500 to-rose-600 text-white py-2 rounded-xl hover:shadow-lg hover:shadow-red-500/20 transition-all duration-200 font-bold"
                >
                  Sí, Eliminar
                </button>
              </div>
            </div>
          )}
          
          {/* Área de mensajes con fondo sutil */}
          <div className="flex-1 p-5 overflow-y-auto bg-gray-50/40 flex flex-col gap-5 custom-scrollbar relative z-10">
            {chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full opacity-70 space-y-4">
                <div className="w-16 h-16 bg-white rounded-3xl shadow-md border border-gray-100 flex items-center justify-center transform rotate-3 hover:rotate-12 transition-transform duration-500">
                  <Bot className="w-8 h-8 text-emerald-600" />
                </div>
                <p className="text-center text-gray-600 text-[14px] font-medium leading-relaxed px-6">
                  Estoy listo para auditar tus contratos.<br/>Hazme una pregunta para empezar.
                </p>
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} className={`p-4 text-[13.5px] rounded-2xl max-w-[88%] shadow-sm leading-relaxed tracking-wide ${
                  msg.role === 'user' 
                    ? 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white self-end rounded-br-sm shadow-emerald-500/20' 
                    : 'bg-white/90 backdrop-blur-sm border border-white text-gray-800 self-start rounded-bl-sm shadow-gray-200/50'
                }`}>
                  {msg.role === 'ai' ? formatMarkdown(msg.content) : msg.content}
                </div>
              ))
            )}
            {chatLoading && (
              <div className="p-4 text-sm rounded-2xl max-w-[85%] shadow-sm bg-white/90 backdrop-blur-sm border border-white text-gray-800 self-start rounded-bl-sm flex gap-1.5 items-center">
                <span className="w-2 h-2 rounded-full bg-emerald-500/80 animate-pulse"></span>
                <span className="w-2 h-2 rounded-full bg-emerald-500/80 animate-pulse delay-100"></span>
                <span className="w-2 h-2 rounded-full bg-emerald-500/80 animate-pulse delay-200"></span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Input Area Glassmorphism */}
          <div className="p-4 border-t border-white/50 bg-white/70 backdrop-blur-xl flex gap-3 shadow-[0_-10px_30px_rgba(0,0,0,0.02)] relative z-20 rounded-b-3xl">
            <input 
              type="text" 
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendChat()}
              placeholder="Escribe tu consulta aquí..."
              className="flex-1 text-[13.5px] font-medium bg-white border border-gray-200/80 rounded-full px-5 py-3 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 transition-all shadow-sm placeholder:text-gray-400"
            />
            <button 
              onClick={handleSendChat}
              disabled={chatLoading}
              className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-3.5 rounded-full shadow-lg hover:shadow-emerald-500/30 disabled:opacity-50 transform hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
            >
              <Send className="w-4.5 h-4.5 ml-0.5"/>
            </button>
          </div>
        </div>
      )}
      
      {/* Fab Button Flotante con Glassmorphism */}
      <button 
        onClick={() => setIsChatOpen(!isChatOpen)}
        className={`p-4 rounded-full shadow-2xl text-white transition-all duration-400 transform hover:scale-110 active:scale-95 z-50 flex items-center justify-center border ${
          isChatOpen 
            ? 'bg-gray-800 hover:bg-gray-900 rotate-90 border-gray-700' 
            : 'bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-emerald-400/30'
        }`}
      >
        {isChatOpen ? <X className="w-6 h-6"/> : <MessageSquare className="w-6 h-6"/>}
      </button>
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(16, 185, 129, 0.3);
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(16, 185, 129, 0.6);
        }
      `}</style>
    </div>
  );
}
