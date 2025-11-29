import React, { useState, useEffect } from 'react';
import { Check, X, Wand2, History, Sparkles, ChevronDown, ChevronRight, Lightbulb } from 'lucide-react';
import { AIService } from '../services/aiService';
import { GrammarError } from '../utils';
import { useAppContext } from '../contexts/AppContext';

export const GrammarChecker: React.FC = () => {
  // Use global state
  const { grammarState, setGrammarState, config, updateUsage, isOverLimit, language } = useAppContext();
  
  const [loading, setLoading] = useState(false);
  const [showHistoryInput, setShowHistoryInput] = useState(false);

  useEffect(() => { 
    updateUsage(grammarState.text + (showHistoryInput ? grammarState.historyText : '')); 
  }, [grammarState.text, grammarState.historyText, showHistoryInput, updateUsage]);

  const runCheck = async () => {
    if (!grammarState.text.trim() || isOverLimit) return;
    setLoading(true);
    
    // Reset errors but keep text
    setGrammarState(prev => ({ ...prev, errors: [], forecast: [] }));
    
    try {
      const result = await AIService.checkGrammar(config, grammarState.text, grammarState.historyText, language);
      setGrammarState(prev => ({ 
        ...prev, 
        errors: result.errors,
        forecast: result.forecast
      }));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const applyFix = (errorId: string) => {
    const error = grammarState.errors.find(e => e.id === errorId);
    if (!error) return;
    
    const newText = grammarState.text.replace(error.original, error.suggestion);
    const newErrors = grammarState.errors.filter(e => e.id !== errorId);
    
    setGrammarState(prev => ({ ...prev, text: newText, errors: newErrors }));
  };

  const ignoreFix = (errorId: string) => {
    const newErrors = grammarState.errors.filter(e => e.id !== errorId);
    setGrammarState(prev => ({ ...prev, errors: newErrors }));
  };

  const fixAll = () => {
    let newText = grammarState.text;
    grammarState.errors.forEach(err => {
      newText = newText.replace(err.original, err.suggestion);
    });
    setGrammarState(prev => ({ ...prev, text: newText, errors: [] }));
  };

  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col">
      <div className="flex flex-col space-y-4 mb-6 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Grammar & Style Checker</h2>
          <div className="flex space-x-3">
            <button 
               onClick={runCheck}
               disabled={loading || !grammarState.text || isOverLimit}
               className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center shadow-sm"
            >
              {loading ? 'Scanning...' : 'Scan for Errors'}
            </button>
             {grammarState.errors.length > 0 && (
              <button 
                onClick={fixAll}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center space-x-2 shadow-sm"
              >
                <Wand2 size={16} />
                <span>Fix All ({grammarState.errors.length})</span>
              </button>
            )}
          </div>
        </div>
        
        {/* History / Reference Input Toggle */}
        <div className="bg-white dark:bg-dark-surface rounded-lg border border-slate-200 dark:border-dark-border overflow-hidden">
           <button 
             onClick={() => setShowHistoryInput(!showHistoryInput)}
             className="w-full flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-xs font-bold uppercase text-slate-500 tracking-wide"
           >
             <div className="flex items-center space-x-2">
               <History size={14} />
               <span>Patterns History & Context</span>
             </div>
             {showHistoryInput ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
           </button>
           
           {showHistoryInput && (
             <div className="p-4 border-t border-slate-200 dark:border-dark-border animate-in slide-in-from-top-2">
               <textarea 
                 value={grammarState.historyText}
                 onChange={(e) => setGrammarState(prev => ({ ...prev, historyText: e.target.value }))}
                 placeholder="Paste previous writing samples or notes here. The AI will use this to identify recurring patterns and forecast future mistakes."
                 className="w-full h-24 p-3 text-sm rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary-500 resize-none text-slate-700 dark:text-slate-300"
               />
               <p className="text-[10px] text-slate-400 mt-1">
                 Tip: Providing context helps the AI give personalized "Forecast Suggestions".
               </p>
             </div>
           )}
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Editor Area */}
        <div className="flex-1 bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-slate-200 dark:border-dark-border flex flex-col p-6 relative">
          <textarea
            value={grammarState.text}
            onChange={(e) => setGrammarState(prev => ({ ...prev, text: e.target.value }))}
            placeholder="Type or paste text here to check grammar..."
            className="w-full h-full resize-none outline-none bg-transparent text-lg leading-relaxed text-slate-800 dark:text-slate-200 placeholder-slate-400"
            spellCheck={false} 
          />
        </div>

        {/* Sidebar Suggestions & Forecast */}
        <div className="w-80 shrink-0 flex flex-col gap-4">
          
          {/* Suggestions Panel */}
          <div className="flex-1 flex flex-col bg-slate-50 dark:bg-dark-surface/50 rounded-xl border border-slate-200 dark:border-dark-border overflow-hidden min-h-[50%]">
            <div className="p-4 border-b border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface sticky top-0 z-10">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300">
                Suggestions {grammarState.errors.length > 0 && <span className="ml-1 bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">{grammarState.errors.length}</span>}
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {grammarState.errors.length === 0 && !loading && (
                <div className="text-center text-slate-500 mt-10">
                  <CheckCircleIcon />
                  <p className="mt-2 text-sm">No errors found.</p>
                </div>
              )}

              {grammarState.errors.map((err) => (
                <div key={err.id} className="bg-white dark:bg-dark-surface p-4 rounded-lg shadow-sm border border-slate-200 dark:border-dark-border group hover:border-primary-300 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                     <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide
                       ${err.type === 'grammar' ? 'bg-red-100 text-red-700' : 
                         err.type === 'spelling' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}
                     `}>
                       {err.type}
                     </span>
                     <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => ignoreFix(err.id)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400"><X size={14}/></button>
                     </div>
                  </div>
                  
                  <div className="mb-2">
                     <span className="line-through text-slate-400 mr-2 decoration-red-400 decoration-2">{err.original}</span>
                     <span className="font-semibold text-green-600 dark:text-green-400">{err.suggestion}</span>
                  </div>
                  
                  <p className="text-xs text-slate-500 mb-3">{err.reason}</p>

                  <button 
                    onClick={() => applyFix(err.id)}
                    className="w-full py-1.5 bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/20 dark:hover:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium rounded transition-colors"
                  >
                    Accept Fix
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Forecast Panel (New Feature) */}
          {grammarState.forecast.length > 0 && (
            <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-900/30 overflow-hidden shrink-0 max-h-64 flex flex-col animate-in slide-in-from-right-4">
               <div className="p-3 bg-indigo-100/50 dark:bg-indigo-900/30 border-b border-indigo-200 dark:border-indigo-800/50 flex items-center space-x-2">
                  <Sparkles size={16} className="text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 uppercase">Forecast Suggestions</h3>
               </div>
               <div className="p-4 overflow-y-auto">
                 <ul className="space-y-3">
                   {grammarState.forecast.map((tip, idx) => (
                     <li key={idx} className="flex items-start space-x-2 text-sm text-indigo-800 dark:text-indigo-200">
                        <Lightbulb size={16} className="shrink-0 mt-0.5 text-indigo-500" />
                        <span>{tip}</span>
                     </li>
                   ))}
                 </ul>
               </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

const CheckCircleIcon = () => (
  <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
    <Check size={24} />
  </div>
);
