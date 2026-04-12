import React, { useState, useEffect } from 'react';
import { RichEditor } from '../components/RichEditor';
import { AlignLeft, List, FileText, ArrowRight, ThumbsUp, ThumbsDown, Clipboard } from 'lucide-react';
import { AIService } from '../services/aiService';
import { FallbackService } from '../services/fallbackService';
import { SummaryLength, SummaryFormat, generateId, buildContextEnhancement, plainTextToHtml, htmlToPlainText, copyToClipboard } from '../utils';
import { useAppContext } from '../contexts/AppContext';

export const Summarizer: React.FC = () => {
  const { summarizerState, setSummarizerState, config, updateUsage, isOverLimit, language, guardrails, selectedGuardrailId, recordToolHistory, recordFeedback, getFeedbackHints, saveInputText, getSavedInput } = useAppContext();
  const guardrail = guardrails.find(g => g.id === selectedGuardrailId) || undefined;
  const [lastHistoryEntryId, setLastHistoryEntryId] = useState<string | null>(null);
  const [feedbackAnimation, setFeedbackAnimation] = useState<'up' | 'down' | null>(null);

  // Initialize input from saved state
  const [localText, setLocalText] = useState(() => {
    if (summarizerState.text) return summarizerState.text;
    return getSavedInput('summarizer');
  });
  // Destructure for easier access
  const { summary, summaryHtml, length, format } = summarizerState;

  useEffect(() => { updateUsage(localText); }, [localText, updateUsage]);

  const setText = (val: string) => {
    setLocalText(val);
    saveInputText('summarizer', val);
    setSummarizerState(prev => ({ ...prev, text: val }));
  };
  const setLength = (val: SummaryLength) => setSummarizerState(prev => ({ ...prev, length: val }));
  const setFormat = (val: SummaryFormat) => setSummarizerState(prev => ({ ...prev, format: val }));
  const setSummaryResult = (val: string) => setSummarizerState(prev => ({ ...prev, summary: val, summaryHtml: plainTextToHtml(val) }));

  const handleSummarize = async () => {
    if (!localText.trim() || isOverLimit) return;
    setSummarizerState(prev => ({ ...prev, isLoading: true }));
    try {
      const feedbackHints = getFeedbackHints('summarizer');
      const enhancement = buildContextEnhancement(guardrail, feedbackHints);
      
      let result;
      try {
        result = await AIService.summarize(config, localText, length, format, language, enhancement);
        if (!result || result.trim().length < 10) throw new Error('AI returned insufficient content');
      } catch (aiError) {
        console.warn('AI Summarization failed, falling back to local extractive analysis:', aiError);
        result = FallbackService.summarize(localText, length, format);
      }

      const htmlOutput = plainTextToHtml(result);
      setSummarizerState(prev => ({ 
        ...prev, 
        summary: result, 
        summaryHtml: htmlOutput,
        isLoading: false 
      }));
      const entryId = generateId();
      recordToolHistory({
        id: entryId,
        tool: 'summarizer',
        input: localText,
        output: result,
        timestamp: Date.now(),
        guardrailId: guardrail?.id,
        metadata: { length, format, html: htmlOutput }
      });
      setLastHistoryEntryId(entryId);
    } catch (err) {
      console.error(err);
      setSummarizerState(prev => ({ ...prev, summary: "Error generating summary. Ensure your local model is running or check API settings.", summaryHtml: plainTextToHtml("Error generating summary. Ensure your local model is running or check API settings."), isLoading: false }));
    } finally {
      setSummarizerState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleFeedback = (rating: number) => {
    if (!lastHistoryEntryId) return;
    const note = rating > 0 ? 'Summary was helpful' : 'Summary needs refinement';
    recordFeedback('summarizer', rating, note, lastHistoryEntryId);
    // Trigger animation
    setFeedbackAnimation(rating > 0 ? 'up' : 'down');
    setTimeout(() => setFeedbackAnimation(null), 800); // Reset after animation
  };

  const handleSummaryHtmlChange = (value: string) => {
    const plain = htmlToPlainText(value);
    setSummarizerState(prev => ({ ...prev, summaryHtml: value, summary: plain }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
         <h2 className="text-3xl font-bold text-slate-800 dark:text-white">Summarizer</h2>
         <p className="text-slate-500 dark:text-slate-400">Condense long articles or documents instantly.</p>
      </div>

      <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border">
         <textarea
            value={localText}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your text here to summarize..."
            className="w-full h-48 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none mb-6 transition-all"
         />

         <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex flex-wrap gap-6">
               <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Length</label>
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    {['Short', 'Medium', 'Long'].map((l) => (
                      <button
                        key={l}
                        onClick={() => setLength(l as SummaryLength)}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${length === l ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
               </div>

               <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Format</label>
                  <div className="flex gap-2">
                     <button 
                       onClick={() => setFormat('Paragraph')}
                       className={`flex items-center space-x-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${format === 'Paragraph' ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                     >
                       <AlignLeft size={16}/> <span>Paragraph</span>
                     </button>
                     <button 
                       onClick={() => setFormat('Bullet Points')}
                       className={`flex items-center space-x-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${format === 'Bullet Points' ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                     >
                       <List size={16}/> <span>Bullets</span>
                     </button>
                  </div>
               </div>
            </div>

            <button
               onClick={handleSummarize}
               disabled={summarizerState.isLoading || !localText || isOverLimit}
               className="w-full md:w-auto px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg shadow-slate-200 dark:shadow-none"
            >
               {summarizerState.isLoading ? <span>Processing...</span> : <><span>Summarize</span> <ArrowRight size={18} /></>}
            </button>
         </div>
      </div>

      {summary && (
        <div className="bg-white dark:bg-dark-surface p-8 rounded-2xl shadow-lg border border-slate-200 dark:border-dark-border animate-in slide-in-from-bottom-4 duration-500 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary-100 text-primary-600 p-2 rounded-lg"><FileText size={24} /></div>
              <div>
                <h3 className="text-xl font-bold">Summary</h3>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">{format} format</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <button
                onClick={() => copyToClipboard(summaryHtml || summary)}
                className="flex items-center gap-1 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
              >
                <Clipboard size={12} />
                Copy
              </button>
              <span>Rate this summary:</span>
              <button
                onClick={() => handleFeedback(1)}
                className={`flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all duration-300 ${
                  feedbackAnimation === 'up' 
                    ? 'bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400 scale-110' 
                    : ''
                }`}
              >
                <ThumbsUp size={12} className={feedbackAnimation === 'up' ? 'animate-pulse' : ''} />
                Helpful
              </button>
              <button
                onClick={() => handleFeedback(-1)}
                className={`flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all duration-300 ${
                  feedbackAnimation === 'down' 
                    ? 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400 scale-110' 
                    : ''
                }`}
              >
                <ThumbsDown size={12} className={feedbackAnimation === 'down' ? 'animate-pulse' : ''} />
                Needs fix
              </button>
            </div>
          </div>
          <div className="border border-slate-200 dark:border-dark-border rounded-2xl overflow-hidden">
            <RichEditor
              value={summaryHtml}
              onChange={handleSummaryHtmlChange}
              placeholder="Summary will appear here with Word-style formatting..."
              className="min-h-[260px] bg-white dark:bg-dark-surface"
            />
          </div>
        </div>
      )}
    </div>
  );
};
