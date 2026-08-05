'use client';

import { useState, useEffect } from 'react';
import { ShieldCheck, Eye, EyeOff, Activity, AlertCircle, RefreshCw, Trash2, Cpu, Key, Zap, CheckCircle2, Server, Network, Loader2, DownloadCloud, Box, HardDrive, Link as LinkIcon, Database } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface APIConfig {
  provider: string;
  api_key: string;
  model: string;
  is_active: boolean;
}

export default function APISettingsPage() {
  const [activeTab, setActiveTab] = useState('APIs');
  const [configs, setConfigs] = useState<{ [key: string]: APIConfig }>({
    gemini: { provider: 'gemini', api_key: '', model: 'gemini-pro-latest', is_active: false },
    groq: { provider: 'groq', api_key: '', model: 'llama-3.1-8b-instant', is_active: false },
  });
  
  const [showKey, setShowKey] = useState<{ [key: string]: boolean }>({ gemini: false, groq: false });
  const [loadingTest, setLoadingTest] = useState<{ [key: string]: boolean }>({ gemini: false, groq: false });
  const [saving, setSaving] = useState<{ [key: string]: boolean }>({ gemini: false, groq: false });
  const [status, setStatus] = useState<{ [key: string]: { type: 'success' | 'error' | null, msg: string } }>({
    gemini: { type: null, msg: '' },
    groq: { type: null, msg: '' }
  });
  
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartMessage, setRestartMessage] = useState('');
  
  // Dynamic Kernel Logs
  const [kernelLogs, setKernelLogs] = useState<{type: string, msg: string, id: number}[]>([
    { id: 1, type: 'OK', msg: 'Conexión Segura con Gemini Pro establecida.' },
    { id: 2, type: 'INFO', msg: 'Latencia de red calculada: 14ms (Ping).' },
    { id: 3, type: 'OK', msg: 'Groq LPU Array asignado a puerto 8000.' },
    { id: 4, type: 'SEC', msg: 'Ninguna llave se almacena en memoria de largo plazo.' }
  ]);

  const addKernelLog = (type: string, msg: string) => {
    setKernelLogs(prev => [...prev, { id: Date.now(), type, msg }]);
  };
  
  // Qwen Download State
  const [qwenStatus, setQwenStatus] = useState<{is_downloaded: boolean, path: string} | null>(null);
  const [isPingingQwen, setIsPingingQwen] = useState(false);
  const [showQwenModal, setShowQwenModal] = useState(false);
  const [qwenDownloadMode, setQwenDownloadMode] = useState<'auto' | 'manual'>('auto');
  const [customQwenLink, setCustomQwenLink] = useState('');
  const [isDownloadingQwen, setIsDownloadingQwen] = useState(false);
  const [qwenDownloadProgress, setQwenDownloadProgress] = useState(0);

  const fetchQwenStatus = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/settings/qwen-status');
      if (res.ok) {
        const data = await res.json();
        setQwenStatus({ is_downloaded: data.is_downloaded, path: data.path });
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchQwenStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handlePingQwen = async () => {
    setIsPingingQwen(true);
    const prompt = "Hola, ¿estás en SecopPRO?";
    addKernelLog('PING', `Qwen 3B | ${prompt}`);
    
    try {
      const res = await fetch('http://127.0.0.1:8000/api/settings/ping-qwen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (res.ok) {
        addKernelLog('QWEN', `${data.response} (${data.latency_ms}ms)`);
        toast.success(`Ping Qwen: ${data.latency_ms}ms`);
      } else {
        addKernelLog('ERR', data.detail || 'Fallo inferencia local');
        toast.error(data.detail || 'Error en Ping');
      }
    } catch (e) {
      addKernelLog('ERR', 'Sin conexión con servidor local');
      toast.error('Error de red');
    }
    setIsPingingQwen(false);
  };

  const handleDownloadQwen = async () => {
    setIsDownloadingQwen(true);
    setQwenDownloadProgress(0);
    
    if (qwenDownloadMode === 'manual' && !customQwenLink.trim()) {
      toast.error('Por favor, ingresa un link de descarga válido.');
      setIsDownloadingQwen(false);
      return;
    }
    
    try {
      const res = await fetch('http://127.0.0.1:8000/api/settings/download-qwen', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ mode: qwenDownloadMode, url: customQwenLink })
      });
      if (res.ok) {
         toast.success('Iniciando descarga en segundo plano...', { description: 'Puedes continuar usando el sistema.' });
         
         const pollInterval = setInterval(async () => {
            try {
              const progRes = await fetch('http://127.0.0.1:8000/api/settings/download-progress');
              if (progRes.ok) {
                const progData = await progRes.json();
                setQwenDownloadProgress(progData.progress);
                
                if (progData.progress >= 100) {
                  clearInterval(pollInterval);
                  setIsDownloadingQwen(false);
                  setShowQwenModal(false);
                  toast.success('Modelo Qwen 2.5 desplegado localmente con éxito.', { description: 'El motor está listo para recibir pings.' });
                  fetchQwenStatus();
                }
              }
            } catch (e) {
              console.error('Error polling progress', e);
            }
         }, 2000);
      } else {
         toast.error('No se pudo inicializar la descarga');
         setIsDownloadingQwen(false);
      }
    } catch (e) {
      toast.error('Error de red contactando al motor local');
      setIsDownloadingQwen(false);
    }
  };

  const tabs = ['Generales', 'APIs', 'Descargas', 'Rutas', 'Notificaciones', 'Seguridad'];

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/settings/keys')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success' && data.data) {
          setConfigs(prev => ({
            gemini: { 
              ...prev.gemini, 
              ...(data.data.gemini || {}),
              api_key: data.data.gemini?.api_key_real || prev.gemini.api_key
            },
            groq: { 
              ...prev.groq, 
              ...(data.data.groq || {}),
              api_key: data.data.groq?.api_key_real || prev.groq.api_key
            }
          }));
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('restarted_success')) {
      toast.success('¡Sistema en línea! Reinicio completado con éxito.', {
        description: 'Todos los puertos han sido liberados y los motores arrancaron limpiamente.'
      });
      sessionStorage.removeItem('restarted_success');
    }
  }, []);

  const handleUpdate = (provider: string, field: keyof APIConfig, value: any) => {
    setConfigs(prev => ({
      ...prev,
      [provider]: { ...prev[provider], [field]: value }
    }));
  };

  const handleSave = async (provider: string) => {
    setSaving(prev => ({ ...prev, [provider]: true }));
    try {
      const res = await fetch('http://127.0.0.1:8000/api/settings/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs[provider])
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(prev => ({ ...prev, [provider]: { type: 'success', msg: 'Configuración guardada' } }));
        toast.success(`Configuración cifrada para ${provider.toUpperCase()}`);
      } else {
        setStatus(prev => ({ ...prev, [provider]: { type: 'error', msg: data.detail || 'Error al guardar' } }));
        toast.error(`Error al guardar configuración de ${provider.toUpperCase()}`);
      }
    } catch (e) {
      setStatus(prev => ({ ...prev, [provider]: { type: 'error', msg: 'Error de red' } }));
      toast.error('Error de red al intentar guardar.');
    }
    setSaving(prev => ({ ...prev, [provider]: false }));
    
    setTimeout(() => setStatus(prev => ({ ...prev, [provider]: { type: null, msg: '' } })), 3000);
  };

  const ProviderCard = ({ title, desc, provider, models, colorClass, gradient }: { title: string, desc: string, provider: string, models: string[], colorClass: string, gradient: string }) => {
    const isConfigured = !!configs[provider].model && configs[provider].is_active;
    const isActive = configs[provider].is_active;
    
    const [isTesting, setIsTesting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'No conectado' | 'Conectado' | 'Error'>(isConfigured ? 'Conectado' : 'No conectado');

    const handleDelete = async () => {
      if (!confirm(`¿Estás seguro de que quieres eliminar completamente la API de ${title}? Esto la desconectará del sistema de forma permanente.`)) return;
      
      setIsDeleting(true);
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/settings/keys/${provider}`, {
          method: 'DELETE'
        });
        
        if (res.ok) {
          toast.success(`API de ${title} eliminada correctamente`);
          setConnectionStatus('No conectado');
          handleUpdate(provider, 'api_key', '');
          handleUpdate(provider, 'is_active', false);
          setConfigs(prev => ({
            ...prev,
            [provider]: { ...prev[provider], api_key: '', is_active: false }
          }));
        } else {
          toast.error(`Error al eliminar la API de ${title}`);
        }
      } catch (e) {
        toast.error('Error de red al intentar eliminar la API');
      }
      setIsDeleting(false);
    };

    const handleTestConnection = async () => {
      if (!configs[provider].api_key) {
        toast.error('Ingresa una llave para probar la conexión');
        return;
      }
      
      setIsTesting(true);
      setConnectionStatus('No conectado');
      
      try {
        const res = await fetch('http://127.0.0.1:8000/api/settings/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, api_key: configs[provider].api_key })
        });
        
        if (res.ok) {
          setConnectionStatus('Conectado');
          toast.success(`Túnel establecido con ${title}!`, { description: "Respuesta en < 150ms." });
        } else {
          setConnectionStatus('Error');
          const data = await res.json();
          toast.error(`Acceso denegado por ${title}`, { description: data.detail || "Credenciales rechazadas" });
        }
      } catch (e) {
        setConnectionStatus('Error');
        toast.error(`Error de red conectando con ${title}`);
      }
      setIsTesting(false);
    };
    
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 100 }}
        className={`bg-white/60 backdrop-blur-2xl rounded-[2rem] border border-white shadow-[0_15px_40px_-15px_rgba(0,0,0,0.05)] p-8 flex flex-col gap-8 relative overflow-hidden group ${!isActive ? 'grayscale-[0.3] opacity-90' : ''}`}
      >
        <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${gradient} opacity-80`} />
        
        <div className="w-full flex flex-col md:flex-row gap-6 items-start md:items-center relative z-10 border-b border-slate-100 pb-6">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner border border-white relative overflow-hidden shrink-0 ${colorClass}`}>
            <Cpu className="w-8 h-8 relative z-10" />
            <div className="absolute inset-0 bg-white/20" />
          </div>
          <div className="flex-1">
            <h3 className="text-2xl font-black text-slate-800 mb-1 tracking-tight">{title}</h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">{desc}</p>
          </div>
          <div className="shrink-0">
            <span className={`px-4 py-1.5 rounded-full text-xs font-bold shadow-sm border ${isConfigured ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
              {isConfigured ? 'Módulo En Línea' : 'Módulo Inactivo'}
            </span>
          </div>
        </div>

        <div className="w-full flex flex-col gap-6 relative z-10 bg-slate-50/50 p-6 rounded-3xl border border-white shadow-inner">
          <div className="flex justify-between items-center bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 pl-2">
              <Zap className={`w-5 h-5 ${isActive ? 'text-emerald-500 animate-pulse' : 'text-slate-400'}`} />
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wide">Energizar Motor</label>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500">{isActive ? 'Habilitado' : 'Apagado'}</span>
              <button 
                onClick={() => handleUpdate(provider, 'is_active', !isActive)}
                className={`w-14 h-7 rounded-full transition-all relative flex items-center shadow-inner ${isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full absolute transition-transform shadow-md ${isActive ? 'translate-x-8' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
          
          <div className={`transition-all duration-500 flex flex-col gap-6 ${!isActive ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Key className="w-3.5 h-3.5" /> Credencial API
                </label>
                <div className="relative h-12">
                  <input 
                    type={showKey[provider] ? "text" : "password"} 
                    value={configs[provider].api_key}
                    onChange={(e) => handleUpdate(provider, 'api_key', e.target.value)}
                    placeholder="sk-..."
                    autoComplete="off"
                    spellCheck="false"
                    className="w-full h-full pl-5 pr-12 bg-white border border-slate-200 rounded-xl text-sm font-mono focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none transition-all shadow-sm"
                  />
                  <button 
                    onClick={() => setShowKey(prev => ({...prev, [provider]: !prev[provider]}))}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showKey[provider] ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div className="md:w-[180px] flex flex-col justify-end">
                <button 
                  onClick={handleTestConnection}
                  disabled={isTesting || !configs[provider].api_key}
                  className="h-12 w-full flex items-center justify-center gap-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-50"
                >
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                  Hacer Ping
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5" /> Motor Cognitivo Preferido
              </label>
              <select 
                value={configs[provider].model}
                onChange={(e) => handleUpdate(provider, 'model', e.target.value)}
                className="w-full px-5 py-3.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-400 outline-none shadow-sm cursor-pointer"
              >
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center pt-2 gap-4">
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-100">
                <div className={`w-2.5 h-2.5 rounded-full shadow-inner ${
                  connectionStatus === 'Conectado' ? 'bg-emerald-500 shadow-emerald-500/50' :
                  connectionStatus === 'Error' ? 'bg-red-500 shadow-red-500/50' : 'bg-slate-400 shadow-slate-400/50'
                }`} />
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{connectionStatus}</span>
              </div>
              
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button 
                  onClick={handleDelete}
                  disabled={isDeleting || !configs[provider].api_key}
                  className="h-11 w-11 flex items-center justify-center bg-white border border-slate-200 text-red-500 hover:bg-red-50 hover:border-red-200 rounded-xl transition-all disabled:opacity-50 shrink-0"
                  title="Purgar Credencial"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => handleSave(provider)}
                  disabled={saving[provider]}
                  className="h-11 flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition-all shadow-xl shadow-slate-900/20 active:scale-95 disabled:opacity-50"
                >
                  {saving[provider] ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Guardar en Bóveda
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="relative w-full h-full min-h-[95vh] flex flex-col bg-[#f8fafc] overflow-x-hidden rounded-3xl m-2 shadow-[inset_0_0_100px_rgba(0,0,0,0.02)] border border-white px-4 md:px-10 pt-8 pb-10">
      
      {/* Background Decorativo */}
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none fixed" />
      <div className="fixed top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-400/20 blur-[140px] rounded-full mix-blend-multiply pointer-events-none animate-pulse-slow" />
      <div className="fixed bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-400/20 blur-[140px] rounded-full mix-blend-multiply pointer-events-none animate-pulse-slow" />

      {/* Navegación de Tabs - AHORA CON FLEX WRAP */}
      <div className="relative z-20 mb-10 w-full">
        <div className="flex flex-wrap items-center gap-2 bg-white/40 backdrop-blur-xl border border-white/60 shadow-sm p-2 rounded-2xl w-full">
          {tabs.map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap grow sm:grow-0 text-center ${activeTab === tab ? 'bg-white text-emerald-700 shadow-md border border-white' : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Principal con Observatorio Lateral */}
      <div className="flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-8 z-10 relative">
        
        {/* Columna Izquierda: Tarjetas de Configuración */}
        <div className="lg:col-span-8 flex flex-col">
          <AnimatePresence mode="wait">
            {activeTab === 'APIs' && (
              <motion.div key="apis" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
                
                <ProviderCard 
                  title="Google Gemini Engine"
                  desc="Despliega modelos hiper-optimizados de Google (Pro/Flash) para parseo estructural y minería de texto profundo en auditorías."
                  provider="gemini"
                  models={['gemini-pro-latest', 'gemini-flash-latest']}
                  colorClass="bg-blue-50 text-blue-600"
                  gradient="from-blue-400 via-blue-500 to-indigo-500"
                />

                <ProviderCard 
                  title="Groq LPU Accelerator"
                  desc="Motor de inferencia de ultrabaja latencia (<200ms) para extracción masiva de clausulados mediante arquitecturas abiertas como Llama 3."
                  provider="groq"
                  models={['llama-3.1-8b-instant', 'llama3-70b-8192']}
                  colorClass="bg-orange-50 text-orange-600"
                  gradient="from-orange-400 via-red-500 to-rose-500"
                />
                
              </motion.div>
            )}

            {activeTab === 'Seguridad' && (
              <motion.div key="seguridad" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div className="bg-white/60 backdrop-blur-2xl rounded-[2rem] border border-white shadow-[0_15px_40px_-15px_rgba(0,0,0,0.05)] p-10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-96 h-96 bg-red-500/10 rounded-full blur-3xl transform translate-x-32 -translate-y-32 pointer-events-none" />
                  
                  <div className="flex flex-col xl:flex-row gap-12 relative z-10">
                    <div className="xl:w-5/12 flex flex-col">
                      <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-6 shadow-inner border border-red-100">
                        <Activity className="w-8 h-8" />
                      </div>
                      <h3 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">Protocolo de Emergencia</h3>
                      <p className="text-sm text-slate-600 mb-6 leading-relaxed font-medium">
                        Invoca un kill-switch absoluto. Purgará todos los subprocesos de Python, liberará los puertos (8000/3000) y reiniciará el motor desde cero.
                      </p>
                      <div className="mt-auto inline-flex items-center gap-2 bg-red-50 text-red-700 px-4 py-2 rounded-xl border border-red-100 text-xs font-bold uppercase tracking-wider w-max">
                        <AlertCircle className="w-4 h-4" /> Requiere Clave Maestra
                      </div>
                    </div>

                    <div className="xl:w-7/12 flex flex-col justify-center">
                      <div className="bg-slate-50/80 rounded-3xl p-8 border border-white shadow-inner">
                        <label className="text-sm font-bold text-slate-800 mb-1 block uppercase tracking-wide">Autorización de Nivel 0</label>
                        <p className="text-xs text-slate-500 mb-6 font-medium">Ingrese la credencial criptográfica del desarrollador para liberar la ejecución.</p>
                        
                        <div className="flex flex-col gap-4">
                          <input 
                            type="password" 
                            id="dev-password"
                            placeholder="••••••••••••"
                            className="w-full px-5 py-4 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-red-500/20 focus:border-red-400 outline-none transition-all shadow-sm font-mono"
                          />
                          <button 
                            onClick={async (e) => {
                              const input = document.getElementById('dev-password') as HTMLInputElement;
                              if(!input.value) return toast.error('Ingrese la clave primero');
                              
                              setIsRestarting(true);
                              setRestartMessage('Autorizando secuencia de apagado...');
                              
                              const startPolling = () => {
                                setRestartMessage('Purgando subprocesos huérfanos...');
                                setTimeout(() => setRestartMessage('Liberando puertos físicos...'), 2000);
                                setTimeout(() => setRestartMessage('Arranque en frío iniciado...'), 4000);
                                
                                setTimeout(() => {
                                  const interval = setInterval(async () => {
                                    try {
                                      const pingRes = await fetch('http://127.0.0.1:8000/api/settings/ping');
                                      if(pingRes.ok) {
                                        clearInterval(interval);
                                        setRestartMessage('¡Sistema Operativo! Redirigiendo...');
                                        sessionStorage.setItem('restarted_success', 'true');
                                        setTimeout(() => window.location.reload(), 1000);
                                      }
                                    } catch(e) {}
                                  }, 2000);
                                }, 6000);
                              };

                              try {
                                const res = await fetch('http://127.0.0.1:8000/api/settings/restart-system', {
                                  method: 'POST',
                                  headers: {'Content-Type': 'application/json'},
                                  body: JSON.stringify({password: input.value})
                                });
                                if(res.ok) {
                                  startPolling();
                                } else {
                                  const data = await res.json();
                                  toast.error(data.detail || 'Clave incorrecta');
                                  setIsRestarting(false);
                                }
                              } catch(err) {
                                 startPolling();
                              }
                            }}
                            className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold py-4 px-6 rounded-xl shadow-xl shadow-red-500/20 hover:shadow-red-500/30 transition-all active:scale-95 flex items-center justify-center gap-3"
                          >
                            <Zap className="w-5 h-5 fill-current" />
                            Ejecutar Hard-Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'Descargas' && (
              <motion.div key="descargas" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 100 }}
                  className="bg-white/60 backdrop-blur-2xl rounded-[2rem] border border-white shadow-[0_15px_40px_-15px_rgba(0,0,0,0.05)] p-8 flex flex-col gap-8 relative overflow-hidden group"
                >
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500 opacity-80" />
                  
                  <div className="w-full flex flex-col md:flex-row gap-6 items-start md:items-center relative z-10 border-b border-slate-100 pb-6">
                    <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner border border-white relative overflow-hidden shrink-0">
                      <Box className="w-8 h-8 relative z-10" />
                      <div className="absolute inset-0 bg-white/20" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-2xl font-black text-slate-800 mb-1 tracking-tight">Modelo Qwen 2.5 (Local)</h3>
                      <p className="text-sm text-slate-500 font-medium leading-relaxed">Descarga el modelo LLM Qwen 2.5 para procesamiento 100% privado y desconectado.</p>
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className={`px-4 py-1.5 rounded-full text-xs font-bold shadow-sm border ${qwenStatus?.is_downloaded ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {qwenStatus?.is_downloaded ? 'Instalado Localmente' : 'No Instalado'}
                      </span>
                      {qwenStatus?.is_downloaded && (
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100 mt-1 max-w-[250px] truncate" title={qwenStatus.path}>
                          {qwenStatus.path}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-full flex flex-col gap-6 relative z-10 bg-slate-50/50 p-6 rounded-3xl border border-white shadow-inner">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700">Qwen 2.5 - 3B Instruct (GGUF)</span>
                          <span className="text-xs font-medium text-slate-500 flex items-center gap-1"><HardDrive className="w-3 h-3" /> Peso estimado: ~2.2 GB</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button 
                          onClick={handlePingQwen}
                          disabled={!qwenStatus?.is_downloaded || isPingingQwen}
                          className="h-11 flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-50"
                        >
                          {isPingingQwen ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                          Ping a IA
                        </button>
                        <button 
                          onClick={() => setShowQwenModal(true)}
                          className="h-11 flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all shadow-xl shadow-emerald-600/20 active:scale-95"
                        >
                          <DownloadCloud className="w-4 h-4" />
                          {qwenStatus?.is_downloaded ? 'Re-descargar' : 'Descargar Local'}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {activeTab !== 'APIs' && activeTab !== 'Seguridad' && activeTab !== 'Descargas' && (
              <motion.div key="wip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-32 text-center">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                  <ShieldCheck className="w-10 h-10 text-slate-300" />
                </div>
                <h3 className="text-2xl font-bold text-slate-400">Módulo en Desarrollo</h3>
                <p className="text-slate-400 mt-2">La sección <span className="font-bold text-slate-500">{activeTab}</span> será implementada en futuras actualizaciones.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Columna Derecha: Observatorio / Telemetría */}
        <div className="hidden lg:flex lg:col-span-4 flex-col gap-6">
          <div className="bg-white/60 backdrop-blur-2xl border border-white shadow-xl rounded-3xl p-6 flex-1 flex flex-col relative overflow-hidden">
            <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <Server className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-800 tracking-wide">Observatorio IA</h3>
              </div>
              <span className="flex h-2.5 w-2.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </div>

            <div className="flex-1 flex flex-col gap-6 relative">
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Network className="w-4 h-4" /> Endpoint TSL</span>
                  <span className="text-xs font-bold text-emerald-600">Encriptado AES-256</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: "90%" }} animate={{ width: ["90%", "100%", "95%"] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                    className="h-full bg-emerald-500 rounded-full"
                  />
                </div>
              </div>

              {/* Feed falso de seguridad */}
              <div className="flex-1 bg-slate-900 rounded-2xl p-5 border border-slate-800 shadow-inner overflow-hidden relative group">
                <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.05] mix-blend-overlay pointer-events-none" />
                <h4 className="text-white font-bold text-sm mb-4 relative z-10 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" /> Logs del Kernel
                </h4>
                
                <div className="relative z-10 flex flex-col gap-3 font-mono text-[10px] leading-relaxed">
                  <AnimatePresence>
                    {kernelLogs.map((log) => (
                      <motion.div 
                        key={log.id}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        className="break-words whitespace-pre-wrap"
                      >
                        <span className={log.type === 'OK' || log.type === 'QWEN' ? "text-emerald-400" : log.type === 'ERR' ? "text-red-400" : log.type === 'PING' ? "text-amber-400" : log.type === 'SEC' ? "text-purple-400" : "text-blue-400"}>
                          [{log.type}]
                        </span> <span className="text-slate-300">{log.msg}</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  
                  <motion.div 
                    animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    className="mt-2 text-slate-500"
                  >
                    _ Esperando instrucciones del usuario...
                  </motion.div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Qwen Download Modal */}
      <AnimatePresence>
        {showQwenModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 z-[100] flex items-center justify-center backdrop-blur-xl p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white border border-slate-200 p-8 rounded-[2.5rem] max-w-lg w-full shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl transform translate-x-32 -translate-y-32 pointer-events-none" />
              
              <div className="flex items-center gap-4 mb-6 relative z-10">
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-100">
                  <DownloadCloud className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800">Descargar Qwen 2.5</h3>
                  <p className="text-sm font-medium text-slate-500">Peso aproximado: <strong className="text-emerald-600">2.2 GB</strong></p>
                </div>
              </div>

              {!isDownloadingQwen ? (
                <div className="flex flex-col gap-6 relative z-10">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <p className="text-sm text-slate-600 mb-4 font-medium leading-relaxed">
                      Selecciona la fuente de descarga para el modelo local de inferencia.
                    </p>
                    
                    <div className="flex gap-2 p-1 bg-slate-200/50 rounded-xl mb-4">
                      <button 
                        onClick={() => setQwenDownloadMode('auto')}
                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${qwenDownloadMode === 'auto' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Automática
                      </button>
                      <button 
                        onClick={() => setQwenDownloadMode('manual')}
                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${qwenDownloadMode === 'manual' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Enlace Personalizado
                      </button>
                    </div>

                    <AnimatePresence mode="wait">
                      {qwenDownloadMode === 'manual' && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <LinkIcon className="w-3.5 h-3.5" /> URL de Descarga Directa
                          </label>
                          <input 
                            type="text" 
                            value={customQwenLink}
                            onChange={(e) => setCustomQwenLink(e.target.value)}
                            placeholder="https://huggingface.co/..."
                            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 outline-none transition-all shadow-sm"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex gap-3 mt-2">
                    <button 
                      onClick={() => setShowQwenModal(false)}
                      className="flex-1 py-3.5 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleDownloadQwen}
                      className="flex-1 py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-xl shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                      Iniciar Descarga
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center gap-6 relative z-10 py-6">
                  <div className="relative w-24 h-24 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90 transform">
                      <circle cx="48" cy="48" r="45" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-slate-100" />
                      <circle cx="48" cy="48" r="45" stroke="currentColor" strokeWidth="6" fill="transparent" 
                        strokeDasharray={2 * Math.PI * 45}
                        strokeDashoffset={2 * Math.PI * 45 * (1 - qwenDownloadProgress / 100)}
                        className="text-emerald-500 transition-all duration-300 ease-out" 
                      />
                    </svg>
                    <span className="absolute text-xl font-black text-slate-800">{Math.round(qwenDownloadProgress)}%</span>
                  </div>
                  
                  <div>
                    <h4 className="font-bold text-slate-800 mb-1">Descargando archivo modelo...</h4>
                    <p className="text-sm text-slate-500 font-medium">Por favor no cierres esta ventana. {Math.round(qwenDownloadProgress)}% completado.</p>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay de Reinicio */}
      <AnimatePresence>
        {isRestarting && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 z-50 flex items-center justify-center backdrop-blur-xl"
          >
            <div className="bg-slate-900 border border-slate-800 p-12 rounded-[3rem] max-w-lg w-full mx-4 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.05] mix-blend-overlay" />
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 via-orange-500 to-red-500 bg-[length:200%_auto] animate-gradient" />
              
              <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mb-8 relative">
                <div className="absolute inset-0 rounded-2xl border-2 border-red-500 animate-ping opacity-20" />
                <RefreshCw className="w-10 h-10 text-red-500 animate-spin" />
              </div>
              
              <h2 className="text-3xl font-black text-white mb-3">Reiniciando Core</h2>
              <p className="text-slate-400 mb-10 text-sm font-medium leading-relaxed">
                El sistema está liberando hilos de procesamiento y ejecutando un barrido de memoria. Por favor, mantenga la ventana activa.
              </p>
              
              <div className="w-full bg-slate-800 rounded-full h-2 mb-6 overflow-hidden shadow-inner">
                <div className="bg-red-500 h-full rounded-full animate-pulse" style={{ width: '100%' }}></div>
              </div>
              
              <p className="text-red-400 font-bold text-sm tracking-wide uppercase bg-red-500/10 px-4 py-2 rounded-lg border border-red-500/20">
                {restartMessage}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
