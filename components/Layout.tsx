import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Moon, Sun, Wifi, WifiOff, Cpu, AlertTriangle, Languages, ChevronDown } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { Link } from 'react-router-dom';
import { SUPPORTED_LANGUAGES } from '../utils';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isDark, setIsDark] = useState(false);
  const { config, updateConfig, currentUsage, usagePercentage, isOverLimit, language, setLanguage } = useAppContext();
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);

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

             <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>

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

          <div className="flex items-center space-x-3 w-1/3 max-w-lg justify-end">
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
      </main>
    </div>
  );
};