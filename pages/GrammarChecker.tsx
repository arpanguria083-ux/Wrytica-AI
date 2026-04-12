import React, { useState, useEffect } from 'react';
import { Check, X, Wand2, History, Sparkles, ChevronDown, ChevronRight, Lightbulb, ThumbsUp, ThumbsDown, MessageSquare, AlertCircle } from 'lucide-react';
import { AIService } from '../services/aiService';
import { FallbackService } from '../services/fallbackService';
import { GrammarError, generateId, buildContextEnhancement } from '../utils';
import { useAppContext } from '../contexts/AppContext';

export const GrammarChecker: React.FC = () => {
  const { grammarState, setGrammarState, config, updateUsage, isOverLimit, language, guardrails, selectedGuardrailId, recordToolHistory, recordFeedback, getFeedbackHints, selfImproveEnabled, feedbackLog, addChatHistoryEntry, saveInputText, getSavedInput } = useAppContext();
  const guardrail = guardrails.find(g => g.id === selectedGuardrailId) || undefined;
  const [lastHistoryEntryId, setLastHistoryEntryId] = useState<string | null>(null);
  const [feedbackAnimation, setFeedbackAnimation] = useState<'up' | 'down' | null>(null);
  
  // Local UI state
  // Initialize text from saved state
  const [localText, setLocalText] = useState(() => {
    if (grammarState.text) return grammarState.text;
    return getSavedInput('grammar');
  });
  const [showHistoryInput, setShowHistoryInput] = useState(false);
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [fixesAppliedCount, setFixesAppliedCount] = useState<number>(0);
  useEffect(() => { 
    const totalText = grammarState.text + (showHistoryInput ? grammarState.historyText : '');
    updateUsage(totalText);
  }, [grammarState.text, grammarState.historyText, showHistoryInput, updateUsage]);

  const runCheck = async () => {
    if (!grammarState.text.trim() || isOverLimit) return;
    setGrammarState(prev => ({ ...prev, isLoading: true, errors: [], forecast: [] }));
    
    try {
      const enhancement = buildContextEnhancement(guardrail, getFeedbackHints('grammar'));
      let result;
      try {
        result = await AIService.checkGrammar(config, grammarState.text, grammarState.historyText, language, enhancement);
        if (!result || !result.errors) throw new Error('AI returned empty result');
      } catch (aiError) {
        console.warn('AI Grammar Check failed, falling back to local analysis:', aiError);
        result = FallbackService.checkGrammar(grammarState.text);
      }

      setGrammarState(prev => ({ 
        ...prev, 
        errors: result.errors,
        forecast: result.forecast
      }));
      
      // Track self-improve for grammar if enabled
      let selfImproveApplied = false;
      if (selfImproveEnabled && result.errors.length > 0) {
        const { RewardService } = await import('../services/rewardService');
        // Create dummy chunks from errors for reranking based on feedback
        const errorChunks = result.errors.map(err => ({
          id: err.id,
          docId: 'grammar-check',
          text: err.original + ' ' + err.suggestion,
          order: 0,
          sourceTitle: 'Grammar Errors',
          tags: [err.type]
        }));
        const originalIds = errorChunks.map(c => c.id);
        const rerankedErrors = RewardService.rerankReferences(errorChunks, feedbackLog, 'grammar');
        const newIds = rerankedErrors.map(c => c.id);
        if (JSON.stringify(originalIds) !== JSON.stringify(newIds)) {
          selfImproveApplied = true;
        }
      }

      // Capture current fixes count and reset for next scan
      const currentFixes = fixesAppliedCount;
      setFixesAppliedCount(0);

      const entryId = generateId();
      const errorTypes = [...new Set(result.errors.map(e => e.type))];
      recordToolHistory({
        id: entryId,
        tool: 'grammar',
        input: grammarState.text,
        output: `Found ${result.errors.length} suggestions`,
        timestamp: Date.now(),
        guardrailId: guardrail?.id,
        modelName: config.modelName,
        metadata: {
          errors: result.errors,
          forecast: result.forecast,
          errorsCount: result.errors.length,
          fixesApplied: currentFixes,
          errorTypes
        },
        selfImproveData: selfImproveApplied ? {
          applied: true,
          rerankedChunkIds: result.errors.map(e => e.id),
          feedbackSignalsUsed: feedbackLog.filter(f => f.tool === 'grammar').length
        } : undefined
      });
      addChatHistoryEntry({
        id: entryId,
        tool: 'grammar',
        input: grammarState.text,
        output: `Found ${result.errors.length} suggestions`,
        timestamp: Date.now(),
        guardrailId: guardrail?.id,
        modelName: config.modelName,
        metadata: {
          errors: result.errors,
          forecast: result.forecast,
          errorsCount: result.errors.length,
          fixesApplied: currentFixes,
          errorTypes
        },
        selfImproveData: selfImproveApplied ? {
          applied: true,
          rerankedChunkIds: result.errors.map(e => e.id),
          feedbackSignalsUsed: feedbackLog.filter(f => f.tool === 'grammar').length
        } : undefined
      });
      setLastHistoryEntryId(entryId);
    } catch (error: any) {
      console.error(error);
      setErrorMessage(error?.message || 'Failed to check grammar. Please try again.');
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setGrammarState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleFeedback = (rating: number) => {
    if (!lastHistoryEntryId) return;
    // Use custom comment if provided, otherwise fall back to default
    const note = feedbackComment.trim() || (rating > 0 ? 'Grammar scan was helpful' : 'Needs more contextual accuracy');
    recordFeedback('grammar', rating, note, lastHistoryEntryId);
    // Trigger animation
    setFeedbackAnimation(rating > 0 ? 'up' : 'down');
    setTimeout(() => setFeedbackAnimation(null), 800); // Reset after animation
    // Reset feedback input
    setFeedbackComment('');
    setShowFeedbackInput(false);
  };

  const applyFix = (errorId: string) => {
    const error = grammarState.errors.find(e => e.id === errorId);
    if (!error) return;
    
    // Smooth transition effect
    const newText = grammarState.text.replace(error.original, error.suggestion);
    const newErrors = grammarState.errors.filter(e => e.id !== errorId);
    
    setGrammarState(prev => ({ ...prev, text: newText, errors: newErrors }));
    setFixesAppliedCount(prev => prev + 1);

    // Provide a small visual toast or indicator that fix was applied
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-10 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg z-50 animate-in fade-in slide-in-from-bottom-4 duration-300';
    toast.innerText = 'Fix Applied! ✨';
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('animate-out', 'fade-out', 'slide-out-to-bottom-4');
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 1500);
  };

  const ignoreFix = (errorId: string) => {
    const newErrors = grammarState.errors.filter(e => e.id !== errorId);
    setGrammarState(prev => ({ ...prev, errors: newErrors }));
  };

  // Fix: Handle multiple occurrences of the same error
  const fixAll = () => {
    let newText = grammarState.text;
    // Use a map to handle each unique error only once per unique original-suggestion pair
    const processedErrors = new Map<string, string>();
    grammarState.errors.forEach(err => {
      if (!processedErrors.has(err.original)) {
        processedErrors.set(err.original, err.suggestion);
      }
    });
    
    processedErrors.forEach((suggestion, original) => {
      // Replace all occurrences using regex with global flag
      const regex = new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      newText = newText.replace(regex, suggestion);
    });
    
    setGrammarState(prev => ({ ...prev, text: newText, errors: [] }));
    setFixesAppliedCount(prev => prev + grammarState.errors.length);
  };

  // Function to render text with highlights for the overlay
  const renderHighlightedText = () => {
    if (!grammarState.text) return null;
    if (grammarState.errors.length === 0) return grammarState.text;

    // Sort errors by length (longest first) to avoid partial matches
    // This is a naive approach since we don't have offsets, but better than nothing
    const sortedErrors = [...grammarState.errors].sort((a, b) => b.original.length - a.original.length);
    
    let result: (string | React.ReactElement)[] = [grammarState.text];

    sortedErrors.forEach(error => {
      const newResult: (string | React.ReactElement)[] = [];
      result.forEach(part => {
        if (typeof part !== 'string') {
          newResult.push(part);
          return;
        }

        const pieces = part.split(error.original);
        pieces.forEach((piece, i) => {
          newResult.push(piece);
          if (i < pieces.length - 1) {
            newResult.push(
              <span 
                key={`${error.id}-${i}`}
                className={`
                  cursor-pointer transition-all duration-300
                  ${error.type === 'grammar' ? 'border-b-2 border-red-400 bg-red-50/30' : 
                    error.type === 'spelling' ? 'border-b-2 border-orange-400 bg-orange-50/30' : 
                    'border-b-2 border-blue-400 bg-blue-50/30'}
                  hover:bg-opacity-50
                `}
                onClick={() => {
                  // Optional: scroll the suggestion into view or highlight it
                  const element = document.getElementById(`error-card-${error.id}`);
                  if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                {error.original}
              </span>
            );
          }
        });
      });
      result = newResult;
    });

    return result;
  };

  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col">
      <div className="flex flex-col space-y-4 mb-6 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Grammar & Style Checker</h2>
          <div className="flex space-x-3">
                <button
                  onClick={runCheck}
                  disabled={grammarState.isLoading || !grammarState.text.trim() || isOverLimit}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-xl font-bold transition-all shadow-lg
                    ${grammarState.isLoading || !grammarState.text.trim() || isOverLimit
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-500/20 hover:shadow-violet-500/40 transform hover:-translate-y-0.5 active:translate-y-0'
                    }`}
                >
                  {grammarState.isLoading ? (
                    <>
                      <Wand2 className="animate-spin" size={18} />
                      <span>Checking...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      <span>Check Grammar</span>
                    </>
                  )}
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

          {/* Error Message Display */}
          {errorMessage && (
            <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:text-red-300 animate-in slide-in-from-top-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
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
        {/* Editor Area with Highlighting Overlay */}
        <div className="flex-1 bg-white dark:bg-dark-surface rounded-xl shadow-sm border border-slate-200 dark:border-dark-border flex flex-col p-6 relative overflow-hidden">
          <div className="flex-1 relative min-h-0">
            {/* The Background Highlights (div) */}
            <div 
              className="absolute inset-0 w-full h-full p-0 m-0 pointer-events-none text-lg leading-relaxed text-transparent whitespace-pre-wrap break-words overflow-auto"
              style={{ 
                fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
                padding: '0',
                lineHeight: '1.625',
                zIndex: 0
              }}
            >
              {renderHighlightedText()}
            </div>

            {/* The Foreground Input (textarea) */}
            <textarea
              value={grammarState.text}
              onChange={(e) => { 
                const val = e.target.value; 
                setLocalText(val); 
                saveInputText('grammar', val); 
                setGrammarState(prev => ({ ...prev, text: val })); 
              }}
              onScroll={(e) => {
                const overlay = e.currentTarget.previousSibling as HTMLDivElement;
                if (overlay) overlay.scrollTop = e.currentTarget.scrollTop;
              }}
              placeholder="Type or paste text here to check grammar..."
              className="absolute inset-0 w-full h-full resize-none outline-none bg-transparent text-lg leading-relaxed text-slate-800 dark:text-slate-200 placeholder-slate-400 z-10 whitespace-pre-wrap break-words overflow-auto"
              style={{
                fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
                lineHeight: '1.625',
                padding: '0'
              }}
              spellCheck={false} 
            />

            {grammarState.isLoading && (
              <div className="absolute inset-0 bg-white/60 dark:bg-dark-surface/60 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center animate-in fade-in duration-300">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-violet-100 border-t-violet-600 rounded-full animate-spin"></div>
                  <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-violet-500 animate-pulse" size={20} />
                </div>
                <p className="mt-4 text-violet-700 dark:text-violet-400 font-medium animate-pulse">Analyzing text...</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Suggestions & Forecast */}
        <div className="w-80 shrink-0 flex flex-col gap-4">
          
          {/* Suggestions Panel */}
          <div className="flex-1 flex flex-col bg-slate-50 dark:bg-dark-surface/50 rounded-xl border border-slate-200 dark:border-dark-border overflow-hidden min-h-[50%]">
            <div className="p-4 border-b border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface sticky top-0 z-10">
              <h3 className="font-semibold text-slate-700 dark:text-slate-300">
                Suggestions {grammarState.errors.length > 0 && <span className="ml-1 bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">{grammarState.errors.length}</span>}
              </h3>
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                <span>Rate this scan:</span>
                <button
                  onClick={() => handleFeedback(1)}
                  disabled={!lastHistoryEntryId}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900 disabled:opacity-50 transition-all duration-300 ${
                    feedbackAnimation === 'up' 
                      ? 'bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400 scale-110' 
                      : ''
                  }`}
                >
                  <ThumbsUp size={12} className={feedbackAnimation === 'up' ? 'animate-pulse' : ''} /> Helpful
                </button>
                <button
                  onClick={() => handleFeedback(-1)}
                  disabled={!lastHistoryEntryId}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900 disabled:opacity-50 transition-all duration-300 ${
                    feedbackAnimation === 'down' 
                      ? 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400 scale-110' 
                      : ''
                  }`}
                >
                  <ThumbsDown size={12} className={feedbackAnimation === 'down' ? 'animate-pulse' : ''} /> Needs fix
                </button>
                <button
                  onClick={() => setShowFeedbackInput(!showFeedbackInput)}
                  disabled={!lastHistoryEntryId}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900 disabled:opacity-50 transition-all duration-300 ${showFeedbackInput ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : ''}`}
                >
                  <MessageSquare size={12} /> Add note
                </button>
              </div>
              {showFeedbackInput && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && feedbackComment.trim()) {
                        handleFeedback(1);
                      } else if (e.key === 'Escape') {
                        setShowFeedbackInput(false);
                        setFeedbackComment('');
                      }
                    }}
                    placeholder="Add a custom feedback note..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                  <button
                    onClick={() => handleFeedback(1)}
                    disabled={!feedbackComment.trim()}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    Positive
                  </button>
                  <button
                    onClick={() => handleFeedback(-1)}
                    disabled={!feedbackComment.trim()}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-dark-border text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 disabled:opacity-50"
                  >
                    Negative
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {grammarState.errors.length === 0 && !grammarState.isLoading && (
                <div className="text-center text-slate-500 mt-10">
                  <CheckCircleIcon />
                  <p className="mt-2 text-sm">No errors found.</p>
                </div>
              )}

              {grammarState.errors.map((err) => (
                <div 
                  key={err.id} 
                  id={`error-card-${err.id}`}
                  className="bg-white dark:bg-dark-surface p-4 rounded-lg shadow-sm border border-slate-200 dark:border-dark-border group hover:border-primary-300 transition-all duration-300 animate-in slide-in-from-right-2"
                >
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
                    className="w-full py-1.5 bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/20 dark:hover:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium rounded transition-all active:scale-95"
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
