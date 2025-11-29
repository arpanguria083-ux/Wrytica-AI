import React, { useState, useEffect } from 'react';
import { AlignLeft, List, FileText, ArrowRight } from 'lucide-react';
import { AIService } from '../services/aiService';
import { SummaryLength, SummaryFormat } from '../utils';
import { useAppContext } from '../contexts/AppContext';

export const Summarizer: React.FC = () => {
  const { summarizerState, setSummarizerState, config, updateUsage, isOverLimit, language } = useAppContext();
  const [loading, setLoading] = useState(false);

  // Destructure for easier access
  const { text, summary, length, format } = summarizerState;

  useEffect(() => { updateUsage(text); }, [text, updateUsage]);

  const setText = (val: string) => setSummarizerState(prev => ({ ...prev, text: val }));
  const setLength = (val: SummaryLength) => setSummarizerState(prev => ({ ...prev, length: val }));
  const setFormat = (val: SummaryFormat) => setSummarizerState(prev => ({ ...prev, format: val }));
  const setSummaryResult = (val: string) => setSummarizerState(prev => ({ ...prev, summary: val }));

  const handleSummarize = async () => {
    if (!text.trim() || isOverLimit) return;
    setLoading(true);
    try {
      const result = await AIService.summarize(config, text, length, format, language);
      setSummaryResult(result);
    } catch (err) {
      console.error(err);
      setSummaryResult("Error generating summary. Ensure your local model is running or check API settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
         <h2 className="text-3xl font-bold text-slate-800 dark:text-white">Summarizer</h2>
         <p className="text-slate-500 dark:text-slate-400">Condense long articles or documents instantly.</p>
      </div>

      <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border">
         <textarea
            value={text}
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
               disabled={loading || !text || isOverLimit}
               className="w-full md:w-auto px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg shadow-slate-200 dark:shadow-none"
            >
               {loading ? <span>Processing...</span> : <><span>Summarize</span> <ArrowRight size={18} /></>}
            </button>
         </div>
      </div>

      {summary && (
        <div className="bg-white dark:bg-dark-surface p-8 rounded-2xl shadow-lg border border-slate-200 dark:border-dark-border animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center space-x-3 mb-6">
             <div className="bg-primary-100 text-primary-600 p-2 rounded-lg"><FileText size={24} /></div>
             <h3 className="text-xl font-bold">Summary</h3>
          </div>
          <div className="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed">
             {format === 'Bullet Points' ? (
                <div className="markdown-body whitespace-pre-line">{summary}</div>
             ) : (
                <p>{summary}</p>
             )}
          </div>
        </div>
      )}
    </div>
  );
};