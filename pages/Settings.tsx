import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { DEFAULT_CONFIGS, LLMProvider, LLMConfig, Guardrail, generateId, IngestionConfig, DEFAULT_INGESTION_CONFIG, PDF_EXTRACTION_MODE_STORAGE_KEY } from '../utils';
import { Save, RotateCcw, Server, Shield, Globe, Activity, Check, AlertCircle, Loader2, HardDrive, FileText } from 'lucide-react';
import { AIService } from '../services/aiService';
import { detectHardwareProfile, getRecommendations } from '../services/hardwareAdvisor';
import { saveIngestionConfig } from '../utils/ingestionConfig';
import { useBackendStatus } from '../hooks/useBackendStatus';

const ProcessingStatusRow: React.FC<{
  label: string;
  available?: boolean;
  loading?: boolean;
  availableText?: string;
  unavailableText?: string;
}> = ({ label, available, loading, availableText = 'Ready', unavailableText = 'Not available' }) => (
  <div className="flex items-center gap-2 text-xs">
    {loading ? (
      <Loader2 size={12} className="animate-spin text-slate-400" />
    ) : available ? (
      <Check size={12} className="text-green-500" />
    ) : (
      <AlertCircle size={12} className="text-amber-500" />
    )}
    <span className="text-slate-500 dark:text-slate-400">{label}:</span>
    <span className={available ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>
      {loading ? 'Checking...' : available ? availableText : unavailableText}
    </span>
  </div>
);

export const Settings: React.FC = () => {
  const { config, updateConfig, resetConfig, guardrails, addGuardrail, deleteGuardrail, retrievalMode, setRetrievalMode, selfImproveEnabled, setSelfImproveEnabled, hasGPU } = useAppContext();
  const backendStatus = useBackendStatus();
  
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

  const [guardrailName, setGuardrailName] = useState('');
  const [guardrailDescription, setGuardrailDescription] = useState('');
  const [guardrailTone, setGuardrailTone] = useState('Professional');
  const [guardrailFormatting, setGuardrailFormatting] = useState('');
  const [guardrailRequired, setGuardrailRequired] = useState('');
  const [guardrailProhibited, setGuardrailProhibited] = useState('');
  const [hardwareInfo, setHardwareInfo] = useState(() => detectHardwareProfile());
  const [rec, setRec] = useState(getRecommendations(hardwareInfo.profile));
  const deepExtractEnableCommand = 'powershell -ExecutionPolicy Bypass -File scripts/enable-deep-extract.ps1';

  // Ingestion configuration
  const [ingestionConfig, setIngestionConfig] = useState<IngestionConfig>(() => {
    try {
      const stored = localStorage.getItem('wrytica_ingestion_config');
      const pdfExtractionMode = localStorage.getItem(PDF_EXTRACTION_MODE_STORAGE_KEY);
      if (stored) {
        const parsed = { ...DEFAULT_INGESTION_CONFIG, ...JSON.parse(stored) };
        if (pdfExtractionMode === 'deep' || pdfExtractionMode === 'standard') {
          parsed.pdfExtractionMode = pdfExtractionMode;
        }
        return parsed;
      }
    } catch { /* use defaults */ }
    return { ...DEFAULT_INGESTION_CONFIG };
  });

  const updateIngestionConfig = (updates: Partial<IngestionConfig>) => {
    const updated = { ...ingestionConfig, ...updates };
    setIngestionConfig(updated);
    saveIngestionConfig(updated);
  };

  const parseList = (value: string) =>
    value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

  const handleAddGuardrail = () => {
    if (!guardrailName.trim()) return;
    const guardrail: Guardrail = {
      id: generateId(),
      name: guardrailName.trim(),
      description: guardrailDescription.trim() || 'Custom company guardrail.',
      tone: guardrailTone || 'Professional',
      formattingNotes: guardrailFormatting.trim(),
      requiredPhrases: parseList(guardrailRequired),
      prohibitedPhrases: parseList(guardrailProhibited),
    };
    addGuardrail(guardrail);
    setGuardrailName('');
    setGuardrailDescription('');
    setGuardrailTone('Professional');
    setGuardrailFormatting('');
    setGuardrailRequired('');
    setGuardrailProhibited('');
  };

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

  const handleAutoDetectLMStudio = async () => {
    setTestStatus('loading');
    setTestMessage('Querying LM Studio...');
    try {
      const resp = await fetch(`${config.baseUrl}/v1/models`);
      if (!resp.ok) throw new Error('Failed to reach LM Studio');
      const data = await resp.json();
      if (data.data && data.data.length > 0) {
        const model = data.data[0];
        // Try to find context limit in various possible fields
        const detectedContext = model.context_length || model.meta?.context_length || 4096;
        const detectedMax = Math.floor(detectedContext * 0.9); // Suggest 90% as max completion
        
        updateConfig({ 
          modelName: model.id,
          contextLimit: detectedContext,
          maxCompletionTokens: detectedMax
        });
        setTestStatus('success');
        setTestMessage(`Detected: ${model.id} (${detectedContext} context)`);
        setTimeout(() => setTestStatus('idle'), 5000);
      } else {
        throw new Error('No models found in LM Studio. Is a model loaded?');
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err.message || 'Detection failed');
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

      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Retrieval Mode</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Use PageIndex reasoning alone or layer a lightweight vector cache for faster lookups on large docs.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setRetrievalMode('pageindex')}
            className={`px-4 py-2 rounded-lg border text-sm font-semibold ${retrievalMode === 'pageindex' ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
          >
            PageIndex (vectorless)
          </button>
          <button
            onClick={() => setRetrievalMode('hybrid')}
            className={`px-4 py-2 rounded-lg border text-sm font-semibold ${retrievalMode === 'hybrid' ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
          >
            Hybrid (PageIndex + vector cache)
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Hybrid builds a hashed vector cache in-memory (no external DB) to accelerate retrieval. Works within laptop limits; falls back to PageIndex if empty.
        </p>
      </div>

      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Self-improvement</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Rerank retrieved snippets using your feedback (thumbs/comments). No model fine-tuning.</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={selfImproveEnabled} onChange={(e) => setSelfImproveEnabled(e.target.checked)} />
            <span>Enable</span>
          </label>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Runs on-device. If GPU is available ({hasGPU ? 'detected' : 'not detected'}), you can optionally pair with larger local models; otherwise stick to lite/quantized weights to stay under 16 GB RAM.
        </p>
      </div>

      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 text-xs text-slate-600 dark:text-slate-300">
        <p className="font-semibold text-slate-800 dark:text-white text-sm mb-1">Hardware hint</p>
        <p>
          We auto-detect GPU support in the browser. If a GPU is available, consider larger or vision-capable models; otherwise stay with lightweight quantized models to keep RAM under 16 GB.
        </p>
      </div>

      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">OCR & Document Processing</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Monitor backend readiness, resource usage, and OCR job performance.</p>
          </div>
          <Activity size={20} className="text-slate-400" />
        </div>
        <div className="text-xs space-y-3 text-slate-600 dark:text-slate-300">
          <ProcessingStatusRow label="Backend Status" available={backendStatus.available} availableText={`v${backendStatus.health?.version || '1.x'}`} />
          <ProcessingStatusRow label="Deep Extract" available={backendStatus.health?.features.deep_extract} />
          <ProcessingStatusRow label="Embeddings" available={backendStatus.health?.features.embeddings} />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            OCR jobs are processed asynchronously via background queue to prevent browser blocking. Progress updates stream in real-time.
            Monitor system resources in the job status cards during OCR processing.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Hardware Advisor</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Detect your device and suggest local model + context limits.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const info = detectHardwareProfile();
                setHardwareInfo(info);
                setRec(getRecommendations(info.profile));
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Detect
            </button>
            <button
              onClick={() => {
                updateConfig({ modelName: rec.textModel, contextLimit: rec.contextLimit });
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-white"
            >
              Apply suggestion
            </button>
          </div>
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
          <p>Profile: {hardwareInfo.profile} | GPU: {hardwareInfo.hasGPU ? 'Detected' : 'Not detected'} | RAM (approx): {hardwareInfo.deviceMemoryGB ? `${hardwareInfo.deviceMemoryGB} GB` : 'n/a'} | Renderer: {hardwareInfo.gpuRenderer || 'n/a'}</p>
          <p>Suggested text model: <span className="font-semibold">{rec.textModel}</span> | Context: {rec.contextLimit.toLocaleString()} tokens</p>
          {rec.visionModel && <p>Suggested vision model: <span className="font-semibold">{rec.visionModel}</span> | Max images: {rec.maxVisionImages}</p>}
          <p className="text-slate-500 dark:text-slate-400">{rec.notes}</p>
        </div>
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

           {config.provider === 'lmstudio' && (
             <button
               onClick={handleAutoDetectLMStudio}
               disabled={testStatus === 'loading'}
               className="flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300 transition-colors"
             >
               <Activity size={14} />
               <span>Auto-Detect Model</span>
             </button>
           )}
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
                  <p className="mt-2 text-blue-700 dark:text-blue-300">🔒 Your API key stays on this device and is never shared.</p>
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
              {config.provider === 'gemini' ? 'Recommended: gemini-2.0-flash' : 'Exact name of model loaded in your local runner (e.g., llama3.2:3b, mistral:7b)'}
            </p>
          </div>

          {/* Context Limit & Max Completion */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Context Window Limit (Tokens)</label>
              <input 
                type="number" 
                value={config.contextLimit}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 4096;
                  updateConfig({ contextLimit: Math.max(1024, Math.min(1000000, value)) });
                }}
                className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
              <p className="text-[10px] text-slate-400">Total memory (Input + Output). Range: 1,024 - 1,000,000. Llama 3.2 (8k): 8192, Mistral (32k): 32768.</p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Max Completion Tokens (Output)</label>
              <input 
                type="number" 
                value={config.maxCompletionTokens}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 2048;
                  updateConfig({ maxCompletionTokens: Math.max(512, Math.min(config.contextLimit - 100, value)) });
                }}
                className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
              <p className="text-[10px] text-slate-400">Maximum length for a single response. Range: 512 - Context Limit - 100.</p>
              {config.maxCompletionTokens >= config.contextLimit && (
                <p className="text-[10px] text-red-500">⚠️ Max completion should be less than context limit!</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Company Guardrails</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Add or adjust style/terminology rules that the AI must follow.</p>
            </div>
            <button
              onClick={handleAddGuardrail}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-xs font-semibold uppercase tracking-wide disabled:opacity-50"
              disabled={!guardrailName.trim()}
            >
              Add Guardrail
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={guardrailName}
              onChange={(e) => setGuardrailName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-surface text-sm"
              placeholder="Guardrail name (e.g., Legal Memo)"
            />
            <input
              value={guardrailTone}
              onChange={(e) => setGuardrailTone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-surface text-sm"
              placeholder="Preferred tone (Professional, Formal, etc.)"
            />
          </div>
          <textarea
            value={guardrailDescription}
            onChange={(e) => setGuardrailDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-surface text-sm resize-none"
            rows={2}
            placeholder="Describe the guardrail (audience, voice, do's/don'ts)..."
          />
          <textarea
            value={guardrailFormatting}
            onChange={(e) => setGuardrailFormatting(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-surface text-sm resize-none"
            rows={2}
            placeholder="Formatting notes (e.g., use bullets, no emoji, cite sources)..."
          />
          <div className="grid gap-3 md:grid-cols-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              value={guardrailRequired}
              onChange={(e) => setGuardrailRequired(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-surface text-sm"
              placeholder="Required terms/phrases (comma-separated)"
            />
            <input
              value={guardrailProhibited}
              onChange={(e) => setGuardrailProhibited(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-surface text-sm"
              placeholder="Prohibited terms/phrases (comma-separated)"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {guardrails.map((guardrail) => (
              <div key={guardrail.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-surface shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-white">{guardrail.name}</h4>
                  <button
                    onClick={() => deleteGuardrail(guardrail.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-3">{guardrail.description}</p>
                <div className="text-[11px] text-slate-500 flex flex-wrap gap-2">
                  {guardrail.requiredPhrases?.map(phrase => (
                    <span key={phrase} className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{phrase}</span>
                  ))}
                </div>
                <div className="text-[11px] text-slate-500 flex flex-wrap gap-2">
                  {guardrail.prohibitedPhrases?.map(phrase => (
                    <span key={phrase} className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 dark:bg-red-900/50">{phrase}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      {/* Ingestion Configuration */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <HardDrive size={20} className="text-emerald-500" />
              Ingestion Configuration
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Control how bulk folder indexing handles files, memory, and PDF processing.</p>
          </div>
          <button
            onClick={() => {
              setIngestionConfig({ ...DEFAULT_INGESTION_CONFIG });
              saveIngestionConfig({ ...DEFAULT_INGESTION_CONFIG });
            }}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Reset Defaults
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 p-4 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                <FileText size={16} className="text-blue-500" />
                PDF Extraction Mode
              </h4>
              <button
                onClick={() => backendStatus.refresh()}
                className="px-3 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800"
              >
                Refresh Status
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Choose between the existing fast text path and MinerU-powered deep extraction for scanned or layout-heavy PDFs.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-surface p-4 cursor-pointer">
              <input
                type="radio"
                name="pdfExtractionMode"
                value="standard"
                checked={ingestionConfig.pdfExtractionMode === 'standard'}
                onChange={() => updateIngestionConfig({ pdfExtractionMode: 'standard' })}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-white">Standard</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Fast extraction for digital PDFs with selectable text. Keeps the existing lightweight behavior.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-surface p-4 cursor-pointer">
              <input
                type="radio"
                name="pdfExtractionMode"
                value="deep"
                checked={ingestionConfig.pdfExtractionMode === 'deep'}
                onChange={() => updateIngestionConfig({ pdfExtractionMode: 'deep' })}
                className="mt-1"
              />
              <div>
                <div className="text-sm font-semibold text-slate-800 dark:text-white">Deep Extract</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Uses MinerU for OCR, layout, formulas, and tables. Best for scanned, academic, and complex financial PDFs.
                </div>
              </div>
            </label>
          </div>

          <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
            <ProcessingStatusRow
              label="Backend"
              available={backendStatus.available}
              loading={backendStatus.checking}
              availableText="Connected"
              unavailableText="Offline"
            />
            <ProcessingStatusRow
              label="MinerU"
              available={backendStatus.health?.features.deep_extract}
              loading={backendStatus.checking}
              availableText={
                backendStatus.health?.features.mineru_version
                  ? `Installed (${backendStatus.health.features.mineru_version})`
                  : 'Installed'
              }
              unavailableText="Not installed"
            />
            <ProcessingStatusRow
              label="GPU Mode"
              available={backendStatus.health?.features.deep_extract_gpu}
              loading={backendStatus.checking}
              availableText="Available"
              unavailableText="CPU fallback expected"
            />
            {backendStatus.health?.features.deep_extract_compute_reason && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Compute reason: {backendStatus.health.features.deep_extract_compute_reason}
              </div>
            )}
          </div>

          {ingestionConfig.pdfExtractionMode === 'deep' && !backendStatus.available && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300 space-y-3">
              <div>
                Deep Extract needs the Python backend running. Until the backend is available, PDFs will continue through the standard browser flow.
              </div>
              <div className="rounded-lg bg-white/70 dark:bg-slate-950/40 p-3 font-mono text-[11px] break-all">
                {deepExtractEnableCommand}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(deepExtractEnableCommand);
                    setTestStatus('success');
                    setTestMessage('Deep Extract setup command copied to clipboard.');
                    setTimeout(() => setTestStatus('idle'), 3000);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 text-[11px] font-semibold"
                >
                  Copy Enable Command
                </button>
                <button
                  onClick={() => window.open('http://localhost:8000/health', '_blank')}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 text-[11px] font-semibold"
                >
                  Open Health URL
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Max File Size (MB)</label>
            <input
              type="number"
              value={ingestionConfig.maxFileSizeMB}
              onChange={(e) => updateIngestionConfig({ maxFileSizeMB: Math.max(1, Math.min(100, parseInt(e.target.value) || 20)) })}
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            />
            <p className="text-[10px] text-slate-400">Files larger than this are skipped. Range: 1-100 MB. Default: 20 MB.</p>
            {ingestionConfig.maxFileSizeMB > 50 && (
              <p className="text-[10px] text-yellow-600">⚠️ Large file sizes may cause browser crashes</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Max PDF Pages</label>
            <input
              type="number"
              value={ingestionConfig.maxPdfPages}
              onChange={(e) => updateIngestionConfig({ maxPdfPages: Math.max(1, Math.min(200, parseInt(e.target.value) || 50)) })}
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            />
            <p className="text-[10px] text-slate-400">Max pages to extract per PDF. Range: 1-200. Default: 50.</p>
            {ingestionConfig.maxPdfPages > 100 && (
              <p className="text-[10px] text-yellow-600">⚠️ High page counts may cause processing delays</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Batch Size</label>
            <input
              type="number"
              value={ingestionConfig.batchSize}
              onChange={(e) => updateIngestionConfig({ batchSize: Math.max(5, Math.min(50, parseInt(e.target.value) || 10)) })}
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            />
            <p className="text-[10px] text-slate-400">Files per batch before flushing to storage. Range: 5-50. Default: 10.</p>
            {ingestionConfig.batchSize > 20 && (
              <p className="text-[10px] text-yellow-600">⚠️ Large batch sizes may cause memory issues</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Memory Threshold (MB)</label>
            <input
              type="number"
              value={ingestionConfig.memoryThresholdMB}
              onChange={(e) => updateIngestionConfig({ memoryThresholdMB: Math.max(100, Math.min(2000, parseInt(e.target.value) || 400)) })}
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            />
            <p className="text-[10px] text-slate-400">Stop indexing when processed data exceeds this. Range: 100-2000 MB. Default: 400 MB.</p>
            {ingestionConfig.memoryThresholdMB > 1000 && (
              <p className="text-[10px] text-yellow-600">⚠️ High memory threshold may cause browser crashes</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Max Stored Content Length (chars)</label>
            <input
              type="number"
              value={ingestionConfig.maxStoredContentLength}
              onChange={(e) => updateIngestionConfig({ maxStoredContentLength: Math.max(5000, Math.min(100000, parseInt(e.target.value) || 50000)) })}
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            />
            <p className="text-[10px] text-slate-400">Document content is truncated beyond this length to save memory. Chunks are still created from the full text. Range: 5,000-100,000. Default: 50,000 chars.</p>
            {ingestionConfig.maxStoredContentLength > 80000 && (
              <p className="text-[10px] text-yellow-600">⚠️ High content length may increase memory usage</p>
            )}
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

