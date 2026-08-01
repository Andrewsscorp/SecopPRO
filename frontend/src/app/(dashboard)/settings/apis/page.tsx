'use client';

import { useState, useEffect } from 'react';
import { ShieldCheck, Eye, EyeOff, Activity, AlertCircle, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';

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

  const tabs = ['Generales', 'APIs', 'Descargas', 'Rutas', 'Notificaciones', 'Seguridad'];

  // Cargar configs actuales (sin las keys)
  useEffect(() => {
    fetch('http://localhost:8000/api/settings/keys')
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
      const res = await fetch('http://localhost:8000/api/settings/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs[provider])
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(prev => ({ ...prev, [provider]: { type: 'success', msg: 'Configuración guardada' } }));
        toast.success(`Configuración guardada para ${provider.toUpperCase()}`);
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

  const handleTest = async (provider: string) => {
    if (!configs[provider].api_key) {
      setStatus(prev => ({ ...prev, [provider]: { type: 'error', msg: 'Ingresa una llave para probar' } }));
      setTimeout(() => setStatus(prev => ({ ...prev, [provider]: { type: null, msg: '' } })), 3000);
      return;
    }
    
    setLoadingTest(prev => ({ ...prev, [provider]: true }));
    try {
      const res = await fetch('http://localhost:8000/api/settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: configs[provider].api_key })
      });
      if (res.ok) {
        setStatus(prev => ({ ...prev, [provider]: { type: 'success', msg: 'Conexión exitosa' } }));
      } else {
        setStatus(prev => ({ ...prev, [provider]: { type: 'error', msg: 'Credenciales inválidas' } }));
      }
    } catch (e) {
      setStatus(prev => ({ ...prev, [provider]: { type: 'error', msg: 'Error de red' } }));
    }
    setLoadingTest(prev => ({ ...prev, [provider]: false }));
    setTimeout(() => setStatus(prev => ({ ...prev, [provider]: { type: null, msg: '' } })), 3000);
  };

  const ProviderCard = ({ title, desc, provider, models }: { title: string, desc: string, provider: string, models: string[] }) => {
    const isConfigured = !!configs[provider].model && configs[provider].is_active;
    const isActive = configs[provider].is_active;
    
    // Estados locales sugeridos
    const [isTesting, setIsTesting] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'No conectado' | 'Conectado' | 'Error'>(isConfigured ? 'Conectado' : 'No conectado');

    const handleDelete = async () => {
      if (!confirm(`¿Estás seguro de que quieres eliminar completamente la API de ${title}? Esto la desconectará del sistema de forma permanente.`)) return;
      
      setIsDeleting(true);
      try {
        const res = await fetch(`http://localhost:8000/api/settings/keys/${provider}`, {
          method: 'DELETE'
        });
        
        if (res.ok) {
          toast.success(`API de ${title} eliminada correctamente`);
          setConnectionStatus('No conectado');
          handleUpdate(provider, 'api_key', '');
          handleUpdate(provider, 'is_active', false);
          // Reinicia también el state visual del config
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
        const res = await fetch('http://localhost:8000/api/settings/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, api_key: configs[provider].api_key })
        });
        
        if (res.ok) {
          setConnectionStatus('Conectado');
          toast.success(`Conexión exitosa con ${title}!`, { description: "La API respondió correctamente." });
        } else {
          setConnectionStatus('Error');
          const data = await res.json();
          toast.error(`Error de conexión con ${title}`, { description: data.detail || "Revisa tus credenciales" });
        }
      } catch (e) {
        setConnectionStatus('Error');
        toast.error(`Error de red probando ${title}`);
      }
      setIsTesting(false);
    };
    
    const disabledClasses = !isActive ? "opacity-50 cursor-not-allowed pointer-events-none" : "";

    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col md:flex-row gap-8 mb-6 min-h-[260px]">
        <div className="md:w-1/3 flex flex-col">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mb-4 text-2xl font-bold text-gray-800">
            {title.charAt(0)}
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
          <p className="text-sm text-gray-500 mb-4">{desc}</p>
          <div className="mt-auto flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${isConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
              {isConfigured ? 'Configurado' : 'No configurado'}
            </span>
          </div>
        </div>

        <div className="md:w-2/3 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <label className="text-sm font-semibold text-gray-700">Clave API</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{isActive ? 'Activado' : 'Desactivado'}</span>
              <button 
                onClick={() => handleUpdate(provider, 'is_active', !isActive)}
                className={`w-10 h-5 rounded-full transition-colors relative flex items-center ${isActive ? 'bg-emerald-500' : 'bg-gray-300'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute transition-transform shadow-sm ${isActive ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
          
          <div className="flex gap-2">
            <div className="relative flex-1 h-10">
              <input 
                type={showKey[provider] ? "text" : "password"} 
                value={configs[provider].api_key}
                onChange={(e) => handleUpdate(provider, 'api_key', e.target.value)}
                placeholder={`Ingresa tu clave API de ${title}`}
                autoComplete="off"
                spellCheck="false"
                disabled={!isActive}
                className={`w-full h-full pl-3 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-opacity ${disabledClasses}`}
              />
              <button 
                onClick={() => setShowKey(prev => ({...prev, [provider]: !prev[provider]}))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showKey[provider] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button 
              onClick={handleTestConnection}
              disabled={!isActive || isTesting || !configs[provider].api_key}
              className={`flex items-center gap-2 px-4 h-10 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-opacity ${disabledClasses}`}
            >
              {isTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
              Probar conexión
            </button>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <label className="text-sm font-semibold text-gray-700">Modelo preferido</label>
            <select 
              value={configs[provider].model}
              onChange={(e) => handleUpdate(provider, 'model', e.target.value)}
              disabled={!isActive}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white transition-opacity ${disabledClasses}`}
            >
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="flex justify-between items-center mt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Estado</span>
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'Conectado' ? 'bg-emerald-500' :
                  connectionStatus === 'Error' ? 'bg-red-500' : 'bg-gray-400'
                }`} />
                <span className="text-sm text-gray-600">{connectionStatus}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 min-h-[40px]">
              <div className="w-48 flex justify-end">
                {status[provider].type && (
                  <span className={`text-sm flex items-center gap-1 ${status[provider].type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {status[provider].type === 'error' ? <AlertCircle className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                    {status[provider].msg}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleDelete}
                  disabled={isDeleting || !configs[provider].api_key}
                  className={`bg-red-50 text-red-600 h-10 px-3 rounded-lg text-sm font-medium hover:bg-red-100 hover:text-red-700 transition-colors flex items-center justify-center gap-2 border border-red-200 disabled:opacity-50`}
                  title="Eliminar API de la base de datos"
                >
                  {isDeleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => handleSave(provider)}
                  disabled={saving[provider]}
                  className={`bg-emerald-600 h-10 text-white px-4 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-opacity flex items-center gap-2 ${saving[provider] ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {saving[provider] ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Guardar configuración
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Ajustes</h1>
          <p className="text-gray-500 mt-1">Configura las opciones generales del sistema.</p>
        </div>
        <div className="bg-emerald-50 text-emerald-700 px-4 py-3 rounded-lg flex items-start gap-3 border border-emerald-100 max-w-xs">
          <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-xs">
            <strong>Tus claves API se almacenan encriptadas</strong><br/>
            y solo se usan para las funciones habilitadas.
          </p>
        </div>
      </div>

      <div className="flex gap-6 border-b border-gray-200 mb-8 overflow-x-auto">
        {tabs.map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 px-1 whitespace-nowrap text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'APIs' && (
        <div className="animate-in fade-in duration-300">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-100 p-2 rounded-lg">
              <ShieldCheck className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Configuración de APIs</h2>
              <p className="text-sm text-gray-500">Conecta servicios de inteligencia artificial para potenciar el análisis y la extracción de información.</p>
            </div>
          </div>

          <ProviderCard 
            title="Google Gemini"
            desc="Integra el modelo Gemini de Google para análisis inteligente de documentos y extracción de información."
            provider="gemini"
            models={['gemini-pro-latest', 'gemini-flash-latest']}
          />

          <ProviderCard 
            title="Groq (Llama 3)"
            desc="Usa Groq (Llama 3) para análisis ultrarrápido y generación de insights en tus auditorías."
            provider="groq"
            models={['llama-3.1-8b-instant', 'llama3-70b-8192']}
          />

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 mt-8">
            <AlertCircle className="w-5 h-5 text-blue-500 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-blue-800 mb-1">Importante</h4>
              <p className="text-xs text-blue-600">
                Las APIs permiten funciones avanzadas como análisis semántico, extracción inteligente de datos y generación de resúmenes.<br/>
                <strong>Tu información y documentos nunca se almacenan en los servidores de los proveedores.</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Seguridad' && (
        <div className="animate-in fade-in duration-300">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-red-100 p-2 rounded-lg">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800">Seguridad y Mantenimiento Avanzado</h2>
              <p className="text-sm text-gray-500">Controles de bajo nivel para desarrolladores. Úselo bajo su propio riesgo.</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-red-200 p-6 shadow-sm min-h-[260px] relative overflow-hidden">
            {/* Adorno de fondo peligro */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-red-50 rounded-full blur-3xl transform translate-x-32 -translate-y-32 pointer-events-none opacity-60"></div>
            
            <div className="flex flex-col md:flex-row gap-8 relative z-10">
              <div className="md:w-1/3 flex flex-col">
                <div className="w-12 h-12 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center mb-4">
                  <Activity className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">Reinicio de Emergencia</h3>
                <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                  Cierra forzosamente los puertos activos (3000 y 8000) y reinicia automáticamente el motor principal para solucionar bloqueos de memoria o puertos huerfanos ("port already in use").
                </p>
                <div className="mt-auto bg-red-50 text-red-700 px-3 py-2 rounded-lg border border-red-100 text-xs font-medium">
                  Requiere clave maestra.
                </div>
              </div>

              <div className="md:w-2/3 flex flex-col justify-center">
                <div className="bg-gray-50/50 rounded-xl p-6 border border-gray-100">
                  <label className="text-sm font-bold text-gray-800 mb-1 block">Clave de Desarrollador</label>
                  <p className="text-xs text-gray-500 mb-4">Ingrese la credencial criptográfica para autorizar la limpieza de procesos.</p>
                  
                  <div className="flex flex-col gap-3">
                    <div className="relative">
                      <input 
                        type="password" 
                        id="dev-password"
                        placeholder="••••••••••••"
                        className="w-full pl-4 pr-10 py-3 bg-white border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all shadow-sm"
                      />
                    </div>
                    <button 
                      onClick={async (e) => {
                        const input = document.getElementById('dev-password') as HTMLInputElement;
                        if(!input.value) return toast.error('Ingrese la clave primero');
                        
                        setIsRestarting(true);
                        setRestartMessage('Autorizando limpieza...');
                        
                        const startPolling = () => {
                          setRestartMessage('Destruyendo procesos huérfanos...');
                          setTimeout(() => setRestartMessage('Liberando puertos 8000 y 3000...'), 2000);
                          setTimeout(() => setRestartMessage('Reiniciando servidor...'), 4000);
                          
                          setTimeout(() => {
                            const interval = setInterval(async () => {
                              try {
                                const pingRes = await fetch('http://localhost:8000/api/settings/ping');
                                if(pingRes.ok) {
                                  clearInterval(interval);
                                  setRestartMessage('¡Conexión establecida! Recargando...');
                                  sessionStorage.setItem('restarted_success', 'true');
                                  setTimeout(() => window.location.reload(), 1000);
                                }
                              } catch(e) {}
                            }, 2000);
                          }, 6000);
                        };

                        try {
                          const res = await fetch('http://localhost:8000/api/settings/restart-system', {
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
                           startPolling(); // Fallback en caso de que el fetch aborte por la muerte inminente
                        }
                      }}
                      className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold py-3 px-4 rounded-xl shadow-md hover:shadow-lg hover:shadow-red-500/20 transition-all active:scale-[0.98]"
                    >
                      Reiniciar Servidores y Puertos
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab !== 'APIs' && activeTab !== 'Seguridad' && (
        <div className="py-20 text-center text-gray-400">
          Esta sección ({activeTab}) está en construcción.
        </div>
      )}

      {/* Overlay de Reinicio Fantasma */}
      {isRestarting && (
        <div className="fixed inset-0 bg-gray-900/90 z-50 flex items-center justify-center backdrop-blur-sm animate-in fade-in duration-500">
          <div className="bg-white p-8 rounded-2xl max-w-md w-full mx-4 shadow-2xl flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
              <RefreshCw className="w-8 h-8 text-red-600 animate-spin" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Reinicio de Emergencia</h2>
            <p className="text-gray-500 mb-8 text-sm">Por favor no cierre esta ventana mientras el sistema realiza el mantenimiento profundo.</p>
            
            <div className="w-full bg-gray-100 rounded-full h-2 mb-4 overflow-hidden">
              <div className="bg-red-500 h-full rounded-full animate-pulse" style={{ width: '100%' }}></div>
            </div>
            
            <p className="text-red-600 font-medium text-sm animate-pulse">{restartMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
