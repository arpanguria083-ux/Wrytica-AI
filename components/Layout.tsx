import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Moon, Sun, Wifi, WifiOff, Cpu, AlertTriangle, Languages, ChevronDown, Shield, Sparkles, Database, MessageSquare, History, GitBranch, Download, Trash2, X, AlertCircle, HardDrive, Clock } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { Link } from 'react-router-dom';
import { SUPPORTED_LANGUAGES } from '../utils';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isDark, setIsDark] = useState(false);
  const { config, updateConfig, currentUsage, usagePercentage, isOverLimit, language, setLanguage, guardrails, selectedGuardrailId, setSelectedGuardrailId, hasGPU, getMemoryStats, retrievalMode, clearMemory, exportMemoryStats, storageMode, knowledgeBase } = useAppContext();
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isGuardrailMenuOpen, setIsGuardrailMenuOpen] = useState(false);
  const [isMemMonitorOpen, setIsMemMonitorOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const activeGuardrail = guardrails.find(g => g.id === selectedGuardrailId) || null;

  // Memory stats (async)
  const [memStats, setMemStats] = useState<{ kbDocs: number; kbChunks: number; chatSessions: number; vectors: number; historyEntries: number; kbSizeMB: number; chatSizeMB: number; historySizeMB: number; imageAssetCount: number; imageAssetSizeMB: number; totalSizeMB: number; diskSizeMB: number; diskFiles: number; diskCacheTimestamp: number | null } | null>(null);

  useEffect(() => {
    getMemoryStats().then(setMemStats);
  }, [storageMode, retrievalMode, knowledgeBase.length]);

  // Default stats when loading
  const defaultStats = { kbDocs: 0, kbChunks: 0, chatSessions: 0, vectors: 0, historyEntries: 0, kbSizeMB: 0, chatSizeMB: 0, historySizeMB: 0, imageAssetCount: 0, imageAssetSizeMB: 0, totalSizeMB: 0, diskSizeMB: 0, diskFiles: 0, diskCacheTimestamp: null };

  // Format cache timestamp
  const formatCacheTime = (timestamp: number | null) => {
    if (!timestamp) return null;
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };
  const stats = memStats || defaultStats;

  // Memory limit warnings (80% threshold)
  const LIMITS = { kbDocs: 500, chatSessions: 50, historyEntries: 200, vectors: 10000 };
  const WARN_THRESHOLD = 0.8;
  const getWarningLevel = (current: number, limit: number) => {
    const ratio = current / limit;
    if (ratio >= WARN_THRESHOLD) return { warn: true, critical: ratio >= 1 };
    return { warn: false, critical: false };
  };
  const kbWarning = getWarningLevel(stats.kbDocs, LIMITS.kbDocs);
  const chatWarning = getWarningLevel(stats.chatSessions, LIMITS.chatSessions);
  const historyWarning = getWarningLevel(stats.historyEntries, LIMITS.historyEntries);
  const vectorWarning = retrievalMode === 'hybrid' ? getWarningLevel(stats.vectors, LIMITS.vectors) : { warn: false, critical: false };
  const hasAnyWarning = kbWarning.warn || chatWarning.warn || historyWarning.warn || vectorWarning.warn;

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const toggleProvider = () => {
    if (config.provider === 'gemini') {
      updateConfig({ provider: 'ollama' }); // Default fallback
    } else {
      updateConfig({ provider: 'gemini' });
    }
  };

  const isOnline = config.provider === 'gemini';

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-dark-bg text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      <Sidebar />
      
      <main className="flex-1 ml-64 flex flex-col min-h-0 h-screen overflow-hidden">
        {/* Header / Top Bar */}
        <header className="h-16 bg-white dark:bg-dark-surface border-b border-slate-200 dark:border-dark-border flex items-center justify-between px-8 z-10 shrink-0 relative">
          <div className="flex items-center space-x-2 text-sm text-slate-500 dark:text-slate-400">
             <span className="bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider">
               v1.2.2 Multi-lingual
             </span>
          </div>

          <div className="flex items-center space-x-4">
             {/* Language Selector (Click-based) */}
             <div className="relative">
               <button 
                 onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                 className={`flex items-center space-x-2 px-3 py-1.5 text-sm font-medium rounded-full transition-colors border ${isLangMenuOpen ? 'bg-primary-50 border-primary-200 text-primary-700 dark:bg-primary-900/30 dark:border-primary-800' : 'bg-transparent border-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
               >
                  <Languages size={16} />
                  <span>{language}</span>
                  <ChevronDown size={14} className={`transition-transform duration-200 ${isLangMenuOpen ? 'rotate-180' : ''}`} />
               </button>
               
               {isLangMenuOpen && (
                 <>
                   <div className="fixed inset-0 z-40" onClick={() => setIsLangMenuOpen(false)}></div>
                   <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                      <div className="p-1 max-h-60 overflow-y-auto">
                        {SUPPORTED_LANGUAGES.map(lang => (
                          <button
                            key={lang}
                            onClick={() => {
                              setLanguage(lang);
                              setIsLangMenuOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm rounded-md transition-colors ${language === lang ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 font-semibold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                          >
                            {lang}
                          </button>
                        ))}
                      </div>
                   </div>
               </>
              )}
            </div>

             <div className="relative">
               <button
                 onClick={() => setIsGuardrailMenuOpen(!isGuardrailMenuOpen)}
                 className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium rounded-full transition-colors border border-transparent bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
               >
                 <Shield size={16} />
                 <span>{activeGuardrail ? activeGuardrail.name : 'No Guardrail'}</span>
                 <ChevronDown size={14} className={`transition-transform duration-200 ${isGuardrailMenuOpen ? 'rotate-180' : ''}`} />
               </button>
               {isGuardrailMenuOpen && (
                 <>
                   <div className="fixed inset-0 z-40" onClick={() => setIsGuardrailMenuOpen(false)} />
                   <div className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                     <div className="p-1 max-h-72 overflow-y-auto">
                       <button
                         onClick={() => {
                           setSelectedGuardrailId(null);
                           setIsGuardrailMenuOpen(false);
                         }}
                         className="w-full text-left px-4 py-2 text-sm rounded-md transition-colors text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                       >
                         None
                       </button>
                       {guardrails.map((guardrail) => (
                         <button
                           key={guardrail.id}
                           onClick={() => {
                             setSelectedGuardrailId(guardrail.id);
                             setIsGuardrailMenuOpen(false);
                           }}
                           className={`w-full text-left px-4 py-2 text-sm rounded-md transition-colors ${selectedGuardrailId === guardrail.id ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 font-semibold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                         >
                           {guardrail.name}
                         </button>
                       ))}
                     </div>
                   </div>
                 </>
               )}
             </div>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>
            <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-semibold ${hasGPU ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
              <Sparkles size={14} />
              <span>{hasGPU ? 'GPU detected: enable bigger models' : 'CPU mode: keep lite models'}</span>
            </div>

            {/* Quick Toggle */}
            <button 
               onClick={toggleProvider}
               className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${!isOnline ? 'bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-300' : 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'}`}
               title={`Switch to ${isOnline ? 'Local' : 'Online'} Mode`}
             >
               {!isOnline ? <WifiOff size={14} /> : <Wifi size={14} />}
               <span>{isOnline ? 'Online' : `Offline`}</span>
             </button>

             {/* Theme Toggle */}
            <button 
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-colors"
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary-400 to-blue-500 border-2 border-white dark:border-slate-600 shadow-sm"></div>
          </div>
        </header>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-auto p-8 relative scroll-smooth pb-16">
          {children}
        </div>

        {/* Context Calculator Footer */}
        <div className="h-10 bg-white dark:bg-dark-surface border-t border-slate-200 dark:border-dark-border flex items-center justify-between px-6 text-xs text-slate-500 z-20 shrink-0">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1 font-medium">
              <Cpu size={12} />
              <span>Model: <span className="text-slate-800 dark:text-slate-200">{config.modelName}</span></span>
            </span>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
            <span className="hidden sm:inline">Provider: {config.provider}</span>
            {config.provider !== 'gemini' && (
               <span className="hidden sm:inline text-slate-400 ml-2">({config.baseUrl})</span>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {/* Memory Monitor Button */}
            <button
              onClick={() => setIsMemMonitorOpen(!isMemMonitorOpen)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${isMemMonitorOpen ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400' : hasAnyWarning ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              title="Memory Usage"
            >
              {hasAnyWarning && <AlertTriangle size={10} className={(kbWarning.critical || chatWarning.critical || historyWarning.critical) ? 'animate-pulse text-red-500' : ''} />}
              <Database size={12} />
              <span className="font-medium">Memory</span>
            </button>

            {isMemMonitorOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsMemMonitorOpen(false)} />
                <div className="absolute bottom-12 right-6 bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border rounded-lg shadow-xl p-3 min-w-[240px] z-50">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Memory Usage</div>
                  <div className="space-y-1.5">
                    {/* Warning indicator for Knowledge Base */}
                    <div className="flex items-center justify-between">
                      <span className={`flex items-center gap-1.5 ${kbWarning.critical ? 'text-red-600 dark:text-red-400' : kbWarning.warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}`}>
                        {kbWarning.warn && <AlertTriangle size={10} className={kbWarning.critical ? 'animate-pulse' : ''} />}
                        <Database size={12} className={kbWarning.critical ? 'text-red-500' : kbWarning.warn ? 'text-amber-500' : 'text-blue-500'} />
                        <span>Knowledge Base</span>
                      </span>
                      <span className={`font-mono ${kbWarning.critical ? 'text-red-600 dark:text-red-400 font-bold' : kbWarning.warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200'}`}>{stats.kbDocs}/{LIMITS.kbDocs} docs · {stats.kbChunks} chunks {stats.kbSizeMB > 0 && <span className="text-blue-500 text-[10px]">({stats.kbSizeMB} MB)</span>}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                        <Database size={12} className="text-fuchsia-500" />
                        <span>Vision Assets</span>
                      </span>
                      <span className="font-mono text-slate-800 dark:text-slate-200">{stats.imageAssetCount} {stats.imageAssetSizeMB > 0 && <span className="text-fuchsia-500 text-[10px]">({stats.imageAssetSizeMB} MB)</span>}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`flex items-center gap-1.5 ${chatWarning.critical ? 'text-red-600 dark:text-red-400' : chatWarning.warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}`}>
                        {chatWarning.warn && <AlertTriangle size={10} className={chatWarning.critical ? 'animate-pulse' : ''} />}
                        <MessageSquare size={12} className={chatWarning.critical ? 'text-red-500' : chatWarning.warn ? 'text-amber-500' : 'text-green-500'} />
                        <span>Chat Sessions</span>
                      </span>
                      <span className={`font-mono ${chatWarning.critical ? 'text-red-600 dark:text-red-400 font-bold' : chatWarning.warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200'}`}>{stats.chatSessions}/{LIMITS.chatSessions} {stats.chatSizeMB > 0 && <span className="text-green-500 text-[10px]">({stats.chatSizeMB} MB)</span>}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`flex items-center gap-1.5 ${vectorWarning.warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}`}>
                        {vectorWarning.warn && <AlertTriangle size={10} />}
                        <GitBranch size={12} className={vectorWarning.warn ? 'text-amber-500' : 'text-purple-500'} />
                        <span>Vector Store</span>
                      </span>
                      <span className={`font-mono ${vectorWarning.warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200'}`}>
                        {retrievalMode === 'hybrid' ? `${stats.vectors}/${LIMITS.vectors}` : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`flex items-center gap-1.5 ${historyWarning.critical ? 'text-red-600 dark:text-red-400' : historyWarning.warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}`}>
                        {historyWarning.warn && <AlertTriangle size={10} className={historyWarning.critical ? 'animate-pulse' : ''} />}
                        <History size={12} className={historyWarning.critical ? 'text-red-500' : historyWarning.warn ? 'text-amber-500' : 'text-orange-500'} />
                        <span>History</span>
                      </span>
                      <span className={`font-mono ${historyWarning.critical ? 'text-red-600 dark:text-red-400 font-bold' : historyWarning.warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200'}`}>{stats.historyEntries}/{LIMITS.historyEntries} {stats.historySizeMB > 0 && <span className="text-orange-500 text-[10px]">({stats.historySizeMB} MB)</span>}</span>
                    </div>
                    {/* Disk usage in hybrid mode */}
                    {storageMode === 'hybrid' && stats.diskSizeMB > 0 && (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                            <HardDrive size={12} className="text-cyan-500" />
                            <span>Disk (Hybrid)</span>
                          </span>
                          <span className="font-mono text-slate-800 dark:text-slate-200">
                            {stats.diskFiles} files <span className="text-cyan-500 text-[10px]">({stats.diskSizeMB} MB)</span>
                          </span>
                        </div>
                        {stats.diskCacheTimestamp && (
                          <div className="flex items-center justify-end text-[10px] text-slate-400">
                            <Clock size={10} className="mr-1" />
                            Cache: {formatCacheTime(stats.diskCacheTimestamp)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between text-[10px] mb-2">
                      <span className="text-slate-400">Limits: 500 KB · 50 sessions · 10K vectors</span>
                      <span className="font-semibold text-primary-600 dark:text-primary-400">Total: {stats.totalSizeMB} MB</span>
                    </div>
                    {/* Export and Clear Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const json = exportMemoryStats();
                          const blob = new Blob([json], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `wrytica-memory-${new Date().toISOString().split('T')[0]}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                      >
                        <Download size={12} />
                        Export
                      </button>
                      <button
                        onClick={() => setShowClearConfirm(true)}
                        disabled={isClearing}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                        Clear All
                      </button>
                    </div>
                    {/* Individual clear options */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      <button onClick={async () => { await clearMemory('knowledge'); getMemoryStats().then(setMemStats); }} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700">Clear KB</button>
                      <button onClick={async () => { await clearMemory('chat'); getMemoryStats().then(setMemStats); }} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700">Clear Chat</button>
                      <button onClick={async () => { await clearMemory('history'); getMemoryStats().then(setMemStats); }} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700">Clear History</button>
                      {retrievalMode === 'hybrid' && (
                        <button onClick={async () => { await clearMemory('vectors'); getMemoryStats().then(setMemStats); }} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700">Clear Vectors</button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Clear Confirmation Dialog */}
            {showClearConfirm && (
              <>
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setShowClearConfirm(false)} />
                <div className="absolute bottom-12 right-6 bg-white dark:bg-dark-surface border border-red-200 dark:border-red-800 rounded-lg shadow-xl p-4 min-w-[280px] z-50 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                      <AlertCircle size={20} className="text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Clear All Memory?</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        This will delete {stats.kbDocs} KB docs, {stats.chatSessions} chat sessions, and {stats.historyEntries} history entries.
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded mb-3">
                    ⚠️ This action cannot be undone.
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="flex-1 px-3 py-2 text-xs font-medium rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        setShowClearConfirm(false);
                        setIsMemMonitorOpen(false);
                        setIsClearing(true);
                        await clearMemory('all');
                        setIsClearing(false);
                        stats.kbDocs = 0;
                        stats.kbChunks = 0;
                        stats.chatSessions = 1;
                        stats.historyEntries = 0;
                        stats.vectors = 0;
                      }}
                      disabled={isClearing}
                      className="flex-1 px-3 py-2 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                      {isClearing ? 'Clearing...' : 'Yes, Clear All'}
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center space-x-3">
              {isOverLimit && <AlertTriangle size={14} className="text-red-500 animate-pulse shrink-0" />}
              
              <span className={`whitespace-nowrap font-mono transition-colors ${isOverLimit ? 'text-red-600 font-bold' : ''}`}>
                {currentUsage} / {config.contextLimit} Tokens
              </span>
              
              <div className="w-24 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden shrink-0">
                 <div 
                   className={`h-full rounded-full transition-all duration-500 ${isOverLimit ? 'bg-red-500' : 'bg-primary-500'}`} 
                   style={{ width: `${usagePercentage}%` }}
                 />
              </div>
              
              {isOverLimit ? (
                 <span className="text-red-500 font-medium ml-2 animate-pulse hidden md:inline">
                   Suggestion: Shorten text or <Link to="/settings" className="underline hover:text-red-600">increase limit</Link>
                 </span>
              ) : (
                 <span className="text-slate-400 hidden md:inline">Est. Usage</span>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};


