import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { DEFAULT_CONFIGS, LLMProvider, LLMConfig } from '../utils';
import { Save, RotateCcw, Server, Shield, Globe, Activity, Check, AlertCircle, Loader2 } from 'lucide-react';
import { AIService } from '../services/aiService';

export const Settings: React.FC = () => {
  const { config, updateConfig, resetConfig } = useAppContext();
  
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  
  // Store provider-specific configs in localStorage
  const [providerConfigs, setProviderConfigs] = useState<Record<LLMProvider, LLMConfig>>(() => {
    const saved = localStorage.getItem('wrytica_provider_configs');
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      gemini: DEFAULT_CONFIGS.gemini,
      ollama: DEFAULT_CONFIGS.ollama,
      lmstudio: DEFAULT_CONFIGS.lmstudio
    };
  });

  // Save current config to provider-specific storage when it changes
  React.useEffect(() => {
    const newProviderConfigs = {
      ...providerConfigs,
      [config.provider]: config
    };
    setProviderConfigs(newProviderConfigs);
    localStorage.setItem('wrytica_provider_configs', JSON.stringify(newProviderConfigs));
  }, [config]);

  const handleProviderChange = (provider: LLMProvider) => {
    // Load saved config for this provider, or use defaults
    const savedConfig = providerConfigs[provider] || DEFAULT_CONFIGS[provider];
    updateConfig({ ...savedConfig, provider });
    setTestStatus('idle');
    setTestMessage('');
  };

  const handleTestConnection = async () => {
    setTestStatus('loading');
    setTestMessage('');
    try {
      await AIService.testConnection(config);
      setTestStatus('success');
      setTestMessage('Connection successful!');
      setTimeout(() => setTestStatus('idle'), 3000);
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err.message || 'Connection failed.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="space-y-2">
         <h2 className="text-3xl font-bold text-slate-800 dark:text-white">Settings</h2>
         <p className="text-slate-500 dark:text-slate-400">Configure your AI providers for hybrid online/offline workflows.</p>
      </div>
      
      {/* Provider Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         {([
           { id: 'gemini', label: 'Online (Gemini)', icon: Globe, desc: 'Best quality, Multimodal' },
           { id: 'ollama', label: 'Offline (Ollama)', icon: Shield, desc: 'Private, Local Inference' },
           { id: 'lmstudio', label: 'Offline (LM Studio)', icon: Server, desc: 'OpenAI Compatible' }
         ] as const).map((opt) => (
           <button
             key={opt.id}
             onClick={() => handleProviderChange(opt.id)}
             className={`p-4 rounded-xl border-2 text-left transition-all ${config.provider === opt.id 
               ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-500' 
               : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-surface hover:border-primary-300'}`}
           >
             <div className="flex items-center space-x-2 mb-2">
               <opt.icon size={20} className={config.provider === opt.id ? 'text-primary-600' : 'text-slate-400'} />
               <span className={`font-bold ${config.provider === opt.id ? 'text-primary-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>{opt.label}</span>
             </div>
             <p className="text-xs text-slate-500">{opt.desc}</p>
           </button>
         ))}
      </div>

      {/* Configuration Form */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border p-8 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
           <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${config.provider === 'gemini' ? 'bg-green-500' : 'bg-orange-500'}`}></div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white capitalize">{config.provider} Configuration</h3>
           </div>
           
           {/* Test Connection Button */}
           <button
             onClick={handleTestConnection}
             disabled={testStatus === 'loading'}
             className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors
               ${testStatus === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                 testStatus === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
               }`}
           >
              {testStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : 
               testStatus === 'success' ? <Check size={14} /> :
               testStatus === 'error' ? <AlertCircle size={14} /> :
               <Activity size={14} />
              }
              <span>{testStatus === 'loading' ? 'Testing...' : 'Test Connection'}</span>
           </button>
        </div>
        
        {/* Status Message */}
        {testMessage && (
          <div className={`text-sm p-3 rounded-lg border flex items-start space-x-2 break-words
            ${testStatus === 'success' ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200' : 
              'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'}`}>
             <span className="mt-0.5 shrink-0">{testStatus === 'success' ? <Check size={16}/> : <AlertCircle size={16}/>}</span>
             <div className="flex-1">
               <p className="font-semibold">{testMessage}</p>
             </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          
          {/* API Key (Only for Gemini) */}
          {config.provider === 'gemini' && (
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Gemini API Key</label>
              <input 
                type="password" 
                value={config.apiKey || ''}
                onChange={(e) => updateConfig({ apiKey: e.target.value })}
                placeholder="Enter your Gemini API key..."
                className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                  <p className="font-semibold">🔑 How to get your API key:</p>
                  <p>1. Visit <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Google AI Studio</a></p>
                  <p>2. Sign in and click "Create API Key"</p>
                  <p>3. Copy and paste it here</p>
                  <p className="mt-2 text-blue-700 dark:text-blue-300">🔒 Your API key is stored locally and never shared.</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Base URL (Hidden for Gemini) */}
          {config.provider !== 'gemini' && (
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Base URL</label>
              <input 
                type="text" 
                value={config.baseUrl}
                onChange={(e) => updateConfig({ baseUrl: e.target.value })}
                className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
              <p className="text-xs text-slate-400">Default: Ollama (http://localhost:11434), LM Studio (http://localhost:1234)</p>
            </div>
          )}

          {/* Model Name */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Model Name</label>
            <input 
              type="text" 
              value={config.modelName}
              onChange={(e) => updateConfig({ modelName: e.target.value })}
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            />
            <p className="text-xs text-slate-400">
              {config.provider === 'gemini' ? 'Recommended: gemini-2.5-flash' : 'Exact name of the model loaded in your local runner (e.g. llama3, mistral)'}
            </p>
          </div>

          {/* Context Limit */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Context Window Limit (Tokens)</label>
            <div className="flex items-center space-x-4">
              <input 
                type="number" 
                value={config.contextLimit}
                onChange={(e) => updateConfig({ contextLimit: parseInt(e.target.value) || 4096 })}
                className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
              <div className="text-xs text-slate-500 w-48">
                 Common Limits:<br/>
                 Llama 3 (8k): 8192<br/>
                 Mistral (32k): 32768
              </div>
            </div>
          </div>

        </div>

        <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end space-x-4">
           <button 
             onClick={resetConfig}
             className="px-4 py-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center space-x-2"
           >
             <RotateCcw size={16}/> <span>Reset Defaults</span>
           </button>
           <button className="px-6 py-2 bg-primary-600 text-white rounded-lg font-bold hover:bg-primary-700 flex items-center space-x-2">
             <Save size={18}/> <span>Settings Saved Automatically</span>
           </button>
        </div>
      </div>
    </div>
  );
};