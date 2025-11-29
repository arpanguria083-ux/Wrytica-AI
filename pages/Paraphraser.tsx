import React, { useState, useEffect } from 'react';
import { Copy, RefreshCw, ArrowRight, Gauge, Check, AlertCircle } from 'lucide-react';
import { AIService } from '../services/aiService';
import { PARAPHRASE_MODES_LIST, ParaphraseMode, copyToClipboard } from '../utils';
import { useAppContext } from '../contexts/AppContext';

export const Paraphraser: React.FC = () => {
  // Use global state for persistence, but handle error locally for this session
  const { paraphraserState, setParaphraserState, config, updateUsage, isOverLimit, language } = useAppContext();
  
  // Local UI state
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputText = paraphraserState.input;
  const outputText = paraphraserState.output;
  const mode = paraphraserState.mode;
  const synonyms = paraphraserState.synonyms;
  const toneAnalysis = paraphraserState.toneAnalysis;

  // Update token count on input change
  useEffect(() => {
    updateUsage(inputText);
  }, [inputText, updateUsage]);

  const setInputText = (val: string) => setParaphraserState(prev => ({ ...prev, input: val }));
  const setMode = (m: ParaphraseMode) => setParaphraserState(prev => ({ ...prev, mode: m }));
  const setSynonyms = (val: number) => setParaphraserState(prev => ({ ...prev, synonyms: val }));

  const handleParaphrase = async () => {
    if (!inputText.trim() || isOverLimit) return;
    
    setLoading(true);
    setError(null);
    setParaphraserState(prev => ({ ...prev, toneAnalysis: null }));
    
    try {
      const result = await AIService.paraphrase(config, inputText, mode, synonyms, language);
      setParaphraserState(prev => ({
        ...prev,
        output: result.paraphrasedText,
        toneAnalysis: { tone: result.tone, confidence: result.confidence }
      }));
    } catch (err: any) {
      console.error(err);
      let errorMessage = "An unexpected error occurred.";
      if (err instanceof Error) errorMessage = err.message;
      else if (typeof err === 'string') errorMessage = err;

      // Map common errors to user friendly messages
      if (errorMessage.includes("Failed to fetch")) {
        errorMessage = "Connection failed. Please check your internet connection or local server status.";
      } else if (errorMessage.includes("401") || errorMessage.includes("API_KEY")) {
        errorMessage = "Unauthorized. Please check your API Key in Settings.";
      } else if (errorMessage.includes("429")) {
        errorMessage = "Rate limit exceeded. Please wait a moment and try again.";
      } else if (errorMessage.includes("503")) {
        errorMessage = "Service unavailable. The AI provider is currently down.";
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!outputText) return;
    copyToClipboard(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex flex-col space-y-4 shrink-0">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Paraphraser</h2>
        
        {/* Controls Toolbar */}
        <div className="bg-white dark:bg-dark-surface p-2 rounded-xl shadow-sm border border-slate-200 dark:border-dark-border flex flex-wrap items-center justify-between gap-4">
          
          {/* Modes */}
          <div className="flex space-x-1 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
            {PARAPHRASE_MODES_LIST.map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap
                  ${mode === m 
                    ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Synonyms Slider */}
          <div className="flex items-center space-x-3 px-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Synonyms</span>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={synonyms} 
              onChange={(e) => setSynonyms(parseInt(e.target.value))}
              className="w-32 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Main Input/Output Area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        
        {/* Input Card */}
        <div className={`flex-1 bg-white dark:bg-dark-surface rounded-xl shadow-sm border flex flex-col overflow-hidden focus-within:ring-2 focus-within:ring-primary-500/50 transition-shadow ${isOverLimit ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200 dark:border-dark-border'}`}>
          <div className="p-3 border-b border-slate-100 dark:border-dark-border flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
            <span className="text-xs font-bold text-slate-500 uppercase">Input Text</span>
            {isOverLimit && <span className="text-xs font-bold text-red-500">CONTEXT LIMIT EXCEEDED</span>}
          </div>
          <textarea
            className="flex-1 w-full p-6 resize-none outline-none bg-transparent text-slate-700 dark:text-slate-200 placeholder-slate-400 text-lg leading-relaxed font-normal"
            placeholder="Paste text to rephrase..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <div className="p-4 border-t border-slate-100 dark:border-dark-border flex justify-end">
             <button
                onClick={handleParaphrase}
                disabled={loading || !inputText || isOverLimit}
                className={`px-6 py-2.5 rounded-lg font-semibold text-white transition-all flex items-center space-x-2
                  ${loading || !inputText || isOverLimit ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed' : 'bg-primary-600 hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-500/30'}
                `}
             >
                {loading ? <RefreshCw className="animate-spin" size={18} /> : <span className="flex items-center">Paraphrase <ArrowRight size={16} className="ml-2"/></span>}
             </button>
          </div>
        </div>

        {/* Output Card */}
        <div className="flex-1 bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-slate-200 dark:border-dark-border flex flex-col overflow-hidden relative group">
          <div className="p-3 border-b border-slate-100 dark:border-dark-border flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
             <div className="flex items-center space-x-3">
               <span className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase">Paraphrased Output</span>
             </div>
             {(outputText && !error) && (
               <button 
                 onClick={handleCopy} 
                 className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200
                   ${copied 
                     ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                     : 'text-slate-500 hover:text-primary-600 hover:bg-slate-100 dark:hover:bg-slate-700'
                   }`}
                 title="Copy to clipboard"
               >
                 {copied ? <Check size={14} /> : <Copy size={14} />}
                 <span>{copied ? 'Copied' : 'Copy'}</span>
               </button>
             )}
          </div>
          <div className="flex-1 p-6 overflow-auto">
            {error ? (
              <div className="h-full flex flex-col items-center justify-center text-center animate-in fade-in duration-300">
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-full mb-4">
                  <AlertCircle size={32} className="text-red-500 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">Something went wrong</h3>
                <p className="text-slate-500 dark:text-slate-400 max-w-xs">{error}</p>
                <button 
                  onClick={handleParaphrase}
                  className="mt-6 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            ) : outputText ? (
               <p className="text-lg leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-100 animate-in fade-in duration-500">
                 {outputText}
               </p>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-600">
                 <RefreshCw size={48} className="mb-4 opacity-50" />
                 <p>Output will appear here</p>
              </div>
            )}
          </div>

          {/* Tone Analysis Footer */}
          <div className="p-4 border-t border-slate-100 dark:border-dark-border bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
                <Gauge size={16} />
                <span className="text-xs font-bold uppercase tracking-wide">Tone Analysis</span>
              </div>
              
              {toneAnalysis && !error ? (
                 <div className="flex items-center space-x-6 animate-in slide-in-from-bottom-2 duration-300">
                    <div className="text-right">
                       <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{toneAnalysis.tone}</div>
                       <div className="text-[10px] text-slate-400 uppercase font-medium">Detected Tone</div>
                    </div>
                    <div className="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                    <div className="text-right">
                       <div className="text-sm font-semibold text-primary-600 dark:text-primary-400">{Math.round(toneAnalysis.confidence * 100)}%</div>
                       <div className="text-[10px] text-slate-400 uppercase font-medium">Confidence</div>
                    </div>
                 </div>
              ) : (
                 <span className="text-xs text-slate-400 italic">Paraphrase text to see analysis</span>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};