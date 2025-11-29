import React, { useState } from 'react';
import { Quote, BookOpen, Copy, Check, ArrowRight, FileCode, Layers, ExternalLink } from 'lucide-react';
import { AIService } from '../services/aiService';
import { CitationStyle, CITATION_STYLES_LIST, copyToClipboard, CitationResponse } from '../utils';
import { useAppContext } from '../contexts/AppContext';

export const CitationGenerator: React.FC = () => {
  const { citationState, setCitationState, config, language } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [copiedCitation, setCopiedCitation] = useState(false);
  const [copiedBibtex, setCopiedBibtex] = useState(false);

  // Destructure
  const { sourceInput, result, style } = citationState;

  const setSourceInput = (val: string) => setCitationState(prev => ({ ...prev, sourceInput: val }));
  const setStyle = (val: CitationStyle) => setCitationState(prev => ({ ...prev, style: val }));
  const setResult = (val: CitationResponse | null) => setCitationState(prev => ({ ...prev, result: val }));

  const handleGenerate = async () => {
    if (!sourceInput.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await AIService.generateCitation(config, sourceInput, style, language);
      setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCitation = () => {
    if (!result?.formatted_citation) return;
    copyToClipboard(result.formatted_citation);
    setCopiedCitation(true);
    setTimeout(() => setCopiedCitation(false), 2000);
  };

  const handleCopyBibtex = () => {
    if (!result?.bibtex) return;
    copyToClipboard(result.bibtex);
    setCopiedBibtex(true);
    setTimeout(() => setCopiedBibtex(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-10">
      <div className="text-center space-y-2">
         <h2 className="text-3xl font-bold text-slate-800 dark:text-white">Scientific Citation Generator</h2>
         <p className="text-slate-500 dark:text-slate-400">Instantly generate verifiable citations and BibTeX from URLs, DOIs, or text.</p>
      </div>

      <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border">
         <div className="flex items-center space-x-2 mb-4">
            <BookOpen size={18} className="text-primary-500" />
            <span className="text-sm font-bold uppercase text-slate-500">Source Information</span>
         </div>
         
         <textarea
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            placeholder="Paste a URL (e.g., https://...), DOI (e.g., 10.1038/...), or title here..."
            className="w-full h-32 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none mb-6 transition-all font-mono text-sm text-slate-800 dark:text-slate-200"
         />

         <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="space-y-2 w-full md:w-auto">
               <label className="text-xs font-bold text-slate-500 uppercase">Citation Style</label>
               <div className="flex flex-wrap gap-2">
                 {CITATION_STYLES_LIST.map((s) => (
                   <button
                     key={s}
                     onClick={() => setStyle(s)}
                     className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all 
                       ${style === s 
                         ? 'bg-primary-50 border-primary-500 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300' 
                         : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 hover:border-primary-300'
                       }`}
                   >
                     {s}
                   </button>
                 ))}
               </div>
            </div>

            <button
               onClick={handleGenerate}
               disabled={loading || !sourceInput}
               className="w-full md:w-auto px-8 py-3 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg shadow-primary-500/20"
            >
               {loading ? <span>Generating...</span> : <><span>Generate Citation</span> <ArrowRight size={18} /></>}
            </button>
         </div>
      </div>

      {result && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Main Citation Result */}
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-lg border border-slate-200 dark:border-dark-border overflow-hidden">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
               <div className="flex items-center space-x-2">
                  <Quote size={18} className="text-primary-600" />
                  <span className="font-bold text-slate-700 dark:text-slate-300">{style} Result</span>
               </div>
               <button 
                 onClick={handleCopyCitation} 
                 className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200
                   ${copiedCitation 
                     ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                     : 'bg-white border border-slate-200 text-slate-600 hover:border-primary-500 hover:text-primary-600 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
                   }`}
               >
                 {copiedCitation ? <Check size={14} /> : <Copy size={14} />}
                 <span>{copiedCitation ? 'Copied' : 'Copy'}</span>
               </button>
            </div>
            <div className="p-8">
               <div className="p-6 bg-primary-50 dark:bg-primary-900/10 rounded-xl border border-primary-100 dark:border-primary-900/30 shadow-sm">
                 <p className="font-serif text-lg text-slate-800 dark:text-slate-100 leading-relaxed break-words select-all">
                   {result.formatted_citation}
                 </p>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Visual Verification */}
            <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border p-6">
               <div className="flex items-center space-x-2 mb-4 text-slate-500">
                  <Layers size={18} />
                  <span className="font-bold uppercase text-xs tracking-wider">Source Breakdown (Verify)</span>
               </div>
               <div className="space-y-3">
                  <ComponentRow label="Author" value={result.components.author} />
                  <ComponentRow label="Date" value={result.components.date} />
                  <ComponentRow label="Title" value={result.components.title} highlight />
                  <ComponentRow label="Source" value={result.components.source} />
                  <div className="flex justify-between items-start py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <span className="text-xs font-semibold text-slate-400 uppercase w-24 shrink-0 mt-1">DOI / URL</span>
                    <a href={result.components.doi_or_url.startsWith('http') ? result.components.doi_or_url : '#'} target="_blank" rel="noopener noreferrer" className="flex-1 text-right text-sm font-medium text-blue-600 hover:underline flex justify-end items-center gap-1">
                       <span className="truncate max-w-[200px]">{result.components.doi_or_url || 'N/A'}</span>
                       {result.components.doi_or_url && <ExternalLink size={12} />}
                    </a>
                  </div>
               </div>
            </div>

            {/* BibTeX Output */}
            <div className="bg-slate-900 rounded-2xl shadow-sm border border-slate-800 p-6 flex flex-col text-slate-200">
               <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center space-x-2 text-slate-400">
                      <FileCode size={18} />
                      <span className="font-bold uppercase text-xs tracking-wider">BibTeX Entry</span>
                  </div>
                  <button 
                   onClick={handleCopyBibtex} 
                   className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                  >
                   {copiedBibtex ? <Check size={12}/> : <Copy size={12}/>}
                   {copiedBibtex ? 'Copied' : 'Copy Code'}
                  </button>
               </div>
               <pre className="flex-1 font-mono text-xs leading-relaxed p-4 bg-black/30 rounded-lg overflow-x-auto border border-white/10 select-all">
                  {result.bibtex}
               </pre>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

const ComponentRow = ({ label, value, highlight = false }: { label: string, value: string, highlight?: boolean }) => (
  <div className="flex justify-between items-start py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
     <span className="text-xs font-semibold text-slate-400 uppercase w-24 shrink-0 mt-1">{label}</span>
     <span className={`flex-1 text-right text-sm font-medium ${highlight ? 'text-primary-700 dark:text-primary-400' : 'text-slate-700 dark:text-slate-300'}`}>
       {value || <span className="text-slate-400 italic">Unknown</span>}
     </span>
  </div>
);