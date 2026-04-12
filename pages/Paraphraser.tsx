import React, { useState, useEffect, useRef } from 'react';
import { RichEditor } from '../components/RichEditor';
import { Copy, RefreshCw, ArrowRight, Gauge, Check, AlertCircle, ThumbsUp, ThumbsDown, Sparkles, FlipHorizontal, GitBranch, Waves, Minimize2, Type, Zap, Layers, Grid3X3, X } from 'lucide-react';
import { AIService } from '../services/aiService';
import { FallbackService } from '../services/fallbackService';
import { PARAPHRASE_MODES_LIST, ParaphraseMode, copyToClipboard, generateId, buildContextEnhancement, plainTextToHtml, htmlToPlainText, getEffectiveSynonyms, ParaphraseCandidate } from '../utils';
import { useAppContext } from '../contexts/AppContext';

// Mode descriptions for tooltips
const MODE_DESCRIPTIONS: Record<ParaphraseMode, string> = {
  'Standard': 'Balanced rewording, maintains original meaning',
  'Fluency': 'Improve flow, rhythm, and grammatical smoothness',
  'Humanize': 'Natural, emotional, conversational tone',
  'Formal': 'Sophisticated vocabulary, professional tone',
  'Academic': 'Scholarly precision, technical terminology',
  'Simple': 'Plain language, short sentences, accessible',
  'Creative': 'Evocative language, varied structure',
  'Expand': 'Add relevant details and depth without fluff',
  'Shorten': 'Concise expression in fewer words',
  'Custom': 'Your custom instructions'
};

// Mode curves moved to utils.ts - now using getEffectiveSynonyms from utils

// Get creativity level label based on effective value
const getCreativityLabel = (value: number): { label: string; color: string } => {
  if (value <= 20) return { label: 'Conservative', color: 'text-slate-500' };
  if (value <= 40) return { label: 'Subtle', color: 'text-blue-500' };
  if (value <= 60) return { label: 'Moderate', color: 'text-green-500' };
  if (value <= 80) return { label: 'Creative', color: 'text-orange-500' };
  return { label: 'Highly Creative', color: 'text-purple-500' };
};

// Get mode-specific synonyms effective value - now using utils.ts

export const Paraphraser: React.FC = () => {
  const { paraphraserState, setParaphraserState, config, updateUsage, isOverLimit, language, guardrails, selectedGuardrailId, recordToolHistory, recordFeedback, getFeedbackHints, saveInputText, getSavedInput } = useAppContext();
  const guardrail = guardrails.find(g => g.id === selectedGuardrailId) || undefined;
  const [lastHistoryEntryId, setLastHistoryEntryId] = useState<string | null>(null);
  const [feedbackAnimation, setFeedbackAnimation] = useState<'up' | 'down' | null>(null);
  
  // Local UI state
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customInstructions, setCustomInstructions] = useState('');
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  
  // New middleware features
  const [modeIntensity, setModeIntensity] = useState(50);
  const [numCandidates, setNumCandidates] = useState(1);
  const [candidates, setCandidates] = useState<ParaphraseCandidate[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);
  const [showDiff, setShowDiff] = useState(false);
  const [showCompareAll, setShowCompareAll] = useState(false);
  const [shortCircuited, setShortCircuited] = useState(false);
  
  // QuillBot-style additional options
  const [phraseFlip, setPhraseFlip] = useState(false);
  const [sentenceRestructure, setSentenceRestructure] = useState(false);
  const [fluency, setFluency] = useState(false);
  const [sentenceCompression, setSentenceCompression] = useState(false);
  const [wordLevel, setWordLevel] = useState(false);

  // Initialize input from saved state if empty
  const [localInput, setLocalInput] = useState(() => {
    if (paraphraserState.input) return paraphraserState.input;
    return getSavedInput('paraphraser');
  });
  const inputText = localInput;
  const outputText = paraphraserState.output;
  const outputHtml = paraphraserState.outputHtml;
  const mode = paraphraserState.mode;
  const synonyms = paraphraserState.synonyms;
  const toneAnalysis = paraphraserState.toneAnalysis;

  // Rate limiting and production safeguards
  const lastRequestTimeRef = useRef<number>(0);
  const requestCountRef = useRef<number>(0);
  const requestTimestampsRef = useRef<number[]>([]);
  
  const checkRateLimit = (): { allowed: boolean; waitTime?: number } => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTimeRef.current;
    
    // Minimum time between requests (500ms)
    if (timeSinceLastRequest < 500) {
      return { allowed: false, waitTime: 500 - timeSinceLastRequest };
    }
    
    // Sliding window rate limiting: max 10 requests per minute
    const oneMinuteAgo = now - 60000;
    requestTimestampsRef.current = requestTimestampsRef.current.filter(
      timestamp => timestamp > oneMinuteAgo
    );
    
    if (requestTimestampsRef.current.length >= 10) {
      return { allowed: false, waitTime: 60000 };
    }
    
    return { allowed: true };
  };
  
  const recordRequest = () => {
    const now = Date.now();
    lastRequestTimeRef.current = now;
    requestCountRef.current++;
    requestTimestampsRef.current.push(now);
    
    // Keep only the last 20 timestamps for memory efficiency
    if (requestTimestampsRef.current.length > 20) {
      requestTimestampsRef.current = requestTimestampsRef.current.slice(-20);
    }
  };


  // Update token count on input change
  useEffect(() => {
    updateUsage(inputText);
  }, [inputText, updateUsage]);

  const setInputText = (val: string) => {
    setLocalInput(val);
    saveInputText('paraphraser', val);
    setParaphraserState(prev => ({ ...prev, input: val }));
  };
  const setMode = (m: ParaphraseMode) => {
    setParaphraserState(prev => ({ ...prev, mode: m }));
    if (m !== 'Custom') setCustomInstructions('');
  };
  const setSynonyms = (val: number) => setParaphraserState(prev => ({ ...prev, synonyms: val }));

  // Input validation functions
  const validateInputText = (text: string): { isValid: boolean; error?: string } => {
    const trimmed = text.trim();
    
    if (!trimmed) {
      return { isValid: false, error: 'Please enter text to paraphrase' };
    }
    
    if (trimmed.length < 3) {
      return { isValid: false, error: 'Text is too short (minimum 3 characters)' };
    }
    
    if (trimmed.length > 10000) {
      return { isValid: false, error: 'Text is too long (maximum 10,000 characters)' };
    }
    
    // Check for excessive repetition
    const words = trimmed.split(/\s+/);
    const uniqueWords = new Set(words);
    const repetitionRatio = uniqueWords.size / words.length;
    
    if (repetitionRatio < 0.2 && words.length > 10) {
      return { isValid: false, error: 'Text contains excessive repetition. Please provide more varied content.' };
    }
    
    // Check for gibberish or non-text content
    const letterRatio = trimmed.replace(/[^a-zA-Z]/g, '').length / trimmed.length;
    if (letterRatio < 0.3 && trimmed.length > 20) {
      return { isValid: false, error: 'Text appears to contain mostly non-letter characters' };
    }
    
    return { isValid: true };
  };

  const validateCustomInstructions = (instructions: string): { isValid: boolean; error?: string } => {
    if (mode === 'Custom' && instructions.trim()) {
      const trimmed = instructions.trim();
      
      if (trimmed.length > 500) {
        return { isValid: false, error: 'Custom instructions too long (maximum 500 characters)' };
      }
      
      // Check for potentially harmful instructions
      const harmfulPatterns = [
        /ignore.*guardrail/i,
        /bypass.*safety/i,
        /remove.*content/i,
        /generate.*inappropriate/i,
        /create.*offensive/i
      ];
      
      for (const pattern of harmfulPatterns) {
        if (pattern.test(trimmed)) {
          return { isValid: false, error: 'Custom instructions contain potentially unsafe content' };
        }
      }
    }
    
    return { isValid: true };
  };

  const handleParaphrase = async () => {
    // Comprehensive input validation
    const inputValidation = validateInputText(inputText);
    if (!inputValidation.isValid) {
      setError(inputValidation.error);
      return;
    }
    
    const instructionsValidation = validateCustomInstructions(customInstructions);
    if (!instructionsValidation.isValid) {
      setError(instructionsValidation.error);
      return;
    }
    
    if (isOverLimit) {
      setError('Usage limit exceeded. Please wait or upgrade your plan.');
      return;
    }
    
    // Rate limiting check
    const rateLimitCheck = checkRateLimit();
    if (!rateLimitCheck.allowed) {
      const waitSeconds = Math.ceil((rateLimitCheck.waitTime || 1000) / 1000);
      setError(`Please wait ${waitSeconds} second${waitSeconds > 1 ? 's' : ''} before making another request.`);
      return;
    }
    
    setParaphraserState(prev => ({ ...prev, isLoading: true, toneAnalysis: null }));
      setError(null);
      setCandidates([]);
      setShortCircuited(false);
      
      // Record the request for rate limiting
      recordRequest();
    
    try {
      const feedbackHints = getFeedbackHints('paraphraser');
      const customInstructionsText = mode === 'Custom' && customInstructions.trim() 
        ? customInstructions.trim() 
        : '';
      const combinedInstructions = [feedbackHints, customInstructionsText].filter(Boolean).join(' ');
      const enhancement = buildContextEnhancement(guardrail, combinedInstructions || undefined);
      
      // Use the new middleware with mode-specific effective synonyms
      const effectiveSynonyms = getEffectiveSynonyms(synonyms, mode);
      
      let result;
      try {
        result = await AIService.paraphraseWithMiddleware(config, {
          originalText: inputText,
          mode,
          modeIntensity,
          globalSynonymIntensity: effectiveSynonyms,
          extras: {
            phraseFlip,
            restructure: sentenceRestructure,
            fluencyBoost: fluency,
            compress: sentenceCompression,
            wordLevel
          },
          customInstruction: customInstructionsText,
          numCandidates
        }, language, enhancement);
        
        if (!result || !result.candidates || result.candidates.length === 0) throw new Error('AI returned no candidates');
      } catch (aiError) {
        console.warn('AI Paraphrasing failed, falling back to local analysis:', aiError);
        const fallbackText = FallbackService.paraphrase(inputText);
        result = {
          candidates: [{
            paraphrasedText: fallbackText,
            tone: 'Neutral',
            confidence: 0.5,
            actualChangePct: 10
          }],
          shortCircuited: true
        };
      }
      
      setCandidates(result.candidates);
      setShortCircuited(result.shortCircuited);
      setSelectedCandidateIndex(0);
      
      // Use the first (best) candidate
      const bestCandidate = result.candidates[0];
      if (bestCandidate) {
        const htmlOutputValue = plainTextToHtml(bestCandidate.paraphrasedText);
        setParaphraserState(prev => ({
          ...prev,
          output: bestCandidate.paraphrasedText,
          outputHtml: htmlOutputValue,
          toneAnalysis: { tone: bestCandidate.tone || 'Neutral', confidence: bestCandidate.confidence },
          isLoading: false
        }));
        
        const entryId = generateId();
        recordToolHistory({
          id: entryId,
          tool: 'paraphraser',
          input: inputText,
          output: bestCandidate.paraphrasedText,
          timestamp: Date.now(),
          guardrailId: guardrail?.id,
          metadata: {
            html: htmlOutputValue,
            changePct: bestCandidate.actualChangePct,
            candidatesCount: result.candidates.length
          }
        });
        setLastHistoryEntryId(entryId);
      }
    } catch (err: any) {
      console.error(err);
      let errorMessage = "An unexpected error occurred.";
      if (err instanceof Error) errorMessage = err.message;
      else if (typeof err === 'string') errorMessage = err;

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
      setParaphraserState(prev => ({ ...prev, isLoading: false }));
    }
  };

  // Handle selecting a different candidate
  const handleSelectCandidate = (index: number) => {
    setSelectedCandidateIndex(index);
    const candidate = candidates[index];
    if (candidate) {
      const htmlOutputValue = plainTextToHtml(candidate.paraphrasedText);
      setParaphraserState(prev => ({
        ...prev,
        output: candidate.paraphrasedText,
        outputHtml: htmlOutputValue,
        toneAnalysis: { tone: candidate.tone || 'Neutral', confidence: candidate.confidence }
      }));
    }
  };

  const handleFeedback = (rating: number) => {
    if (!lastHistoryEntryId) return;
    const note = rating > 0 ? 'Paraphrase was helpful' : 'Paraphrase needs refinement';
    
    // Check if the user wants to add a specific comment for "Needs fix"
    let comment = note;
    if (rating < 0) {
      const userComment = window.prompt("What could be improved? (e.g., 'more formal', 'too repetitive')", "");
      if (userComment !== null && userComment.trim() !== "") {
        comment = userComment;
      }
    }
    
    recordFeedback('paraphraser', rating, comment, lastHistoryEntryId);
    
    // Trigger animation
    setFeedbackAnimation(rating > 0 ? 'up' : 'down');
    setTimeout(() => setFeedbackAnimation(null), 800); // Reset after animation
  };

  const handleOutputChange = (value: string) => {
    const plain = htmlToPlainText(value);
    setParaphraserState(prev => ({ ...prev, outputHtml: value, output: plain }));
  };

  const handleCopy = () => {
    const valueToCopy = outputHtml || outputText;
    if (!valueToCopy) return;
    copyToClipboard(valueToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 h-full flex flex-col">
      <div className="flex flex-col space-y-4 shrink-0">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Paraphraser</h2>
        
        {/* Controls Toolbar */}
        <div className="bg-white dark:bg-dark-surface p-3 rounded-xl shadow-sm border border-slate-200 dark:border-dark-border flex flex-wrap items-center justify-between gap-4">
          
          {/* Modes with tooltips */}
          <div className="relative">
            <div className="flex space-x-1 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
              {PARAPHRASE_MODES_LIST.map((m) => (
                <div key={m} className="relative">
                  <button
                    onClick={() => setMode(m)}
                    onMouseEnter={() => setActiveTooltip(m)}
                    onMouseLeave={() => setActiveTooltip(null)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap
                      ${mode === m 
                        ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                  >
                    {m}
                  </button>
                  {activeTooltip === m && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50 animate-in fade-in zoom-in-95 duration-150">
                      {MODE_DESCRIPTIONS[m]}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {/* Custom Mode Input */}
            {mode === 'Custom' && (
              <div className="mt-2 animate-in slide-in-from-top-2 duration-200">
                <input
                  type="text"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Enter custom instructions (e.g., 'Rewrite as a poem')"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                />
              </div>
            )}
          </div>

          {/* Synonyms Slider with mode-specific effectiveness */}
          <div className="flex items-center space-x-3 px-2">
            <div className="flex items-center space-x-2">
              <Sparkles size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Synonyms</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={synonyms} 
              onChange={(e) => setSynonyms(parseInt(e.target.value))}
              className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
            />
            <div className="flex flex-col items-end min-w-[80px]">
              <span className={`text-xs font-bold ${getCreativityLabel(getEffectiveSynonyms(synonyms, mode)).color}`}>
                {getCreativityLabel(getEffectiveSynonyms(synonyms, mode)).label}
              </span>
            </div>
          </div>

          {/* Mode Intensity Slider */}
          <div className="flex items-center space-x-3 px-2">
            <div className="flex items-center space-x-2">
              <Zap size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Intensity</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={modeIntensity} 
              onChange={(e) => setModeIntensity(parseInt(e.target.value))}
              className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
            <span className="text-xs font-bold text-orange-500 min-w-[50px]">{modeIntensity}%</span>
          </div>

          {/* Num Candidates Selector */}
          <div className="flex items-center space-x-2 px-2">
            <div className="flex items-center space-x-2">
              <Layers size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Variants</span>
            </div>
            <select 
              value={numCandidates} 
              onChange={(e) => setNumCandidates(parseInt(e.target.value))}
              className="text-xs font-medium px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              {[1,2,3,4,5,6,7,8].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        {/* QuillBot-style Additional Options Toolbar */}
        <div className="bg-white dark:bg-dark-surface px-4 py-2 rounded-xl shadow-sm border border-slate-200 dark:border-dark-border flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-2">Extras:</span>
          
          <button
            onClick={() => setPhraseFlip(!phraseFlip)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              phraseFlip 
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-300 dark:border-violet-700' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent'
            }`}
            title="Phrase Flip: Flip parallel structures"
          >
            <FlipHorizontal size={14} />
            <span>Phrase Flip</span>
          </button>
          
          <button
            onClick={() => setSentenceRestructure(!sentenceRestructure)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              sentenceRestructure 
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-300 dark:border-violet-700' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent'
            }`}
            title="Sentence Restructure: Change word order"
          >
            <GitBranch size={14} />
            <span>Restructure</span>
          </button>
          
          <button
            onClick={() => setFluency(!fluency)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              fluency 
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-300 dark:border-violet-700' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent'
            }`}
            title="Fluency: Improve grammar and flow"
          >
            <Waves size={14} />
            <span>Fluency</span>
          </button>
          
          <button
            onClick={() => setSentenceCompression(!sentenceCompression)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              sentenceCompression 
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-300 dark:border-violet-700' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent'
            }`}
            title="Sentence Compression: Shorten sentences"
          >
            <Minimize2 size={14} />
            <span>Compress</span>
          </button>
          
          <button
            onClick={() => setWordLevel(!wordLevel)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              wordLevel 
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-300 dark:border-violet-700' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent'
            }`}
            title="Word Level: Word substitutions"
          >
            <Type size={14} />
            <span>Word Level</span>
          </button>
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
                disabled={paraphraserState.isLoading || !inputText || isOverLimit}
                className={`px-6 py-2.5 rounded-lg font-semibold text-white transition-all flex items-center space-x-2
                  ${paraphraserState.isLoading || !inputText || isOverLimit ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed' : 'bg-primary-600 hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-500/30'}
                `}
             >
                {paraphraserState.isLoading ? <RefreshCw className="animate-spin" size={18} /> : <span className="flex items-center">Paraphrase <ArrowRight size={16} className="ml-2"/></span>}
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
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Output Panel - now reading from paraphraserState.isLoading */}
            {paraphraserState.isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-4 bg-slate-50 dark:bg-dark-surface/50">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
                  <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary-500 animate-pulse" size={20} />
                </div>
                <div className="text-center">
                  <p className="text-slate-600 dark:text-slate-300 font-medium">Paraphrasing...</p>
                  <p className="text-xs text-slate-400 mt-1">Applying {mode} mode with {synonyms}% synonyms</p>
                </div>
              </div>
            ) : error ? (
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
            ) : (
              showDiff && candidates[selectedCandidateIndex]?.highlightedDiff ? (
                <div
                  className="flex-1 p-6 overflow-auto text-slate-700 dark:text-slate-200 text-lg leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: candidates[selectedCandidateIndex].highlightedDiff }}
                />
              ) : (
                <RichEditor
                  value={outputHtml}
                  onChange={handleOutputChange}
                  placeholder="Paraphrased text with formatting will appear here..."
                  className="flex-1 bg-white dark:bg-dark-surface"
                />
              )
            )}
          </div>

          {/* Change percentage indicator */}
          {candidates[selectedCandidateIndex] && (
            <div className="px-4 py-2 border-t border-slate-100 dark:border-dark-border bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
                <RefreshCw size={12} />
                <span className="text-xs">Change:</span>
                <span className="text-xs font-bold text-primary-600 dark:text-primary-400">
                  {candidates[selectedCandidateIndex].actualChangePct}%
                </span>
              </div>
              <div className="text-xs text-slate-400">
                {candidates.length} variant{candidates.length > 1 ? 's' : ''}
              </div>
            </div>
          )}

          {/* Tone Analysis Footer */}
          <div className="p-4 border-t border-slate-100 dark:border-dark-border bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
                <Gauge size={16} />
                <span className="text-xs font-bold uppercase tracking-wide">Tone Analysis</span>
              </div>
              
              {/* Candidate Selector */}
              {candidates.length > 1 && (
                <div className="flex items-center space-x-2 animate-in fade-in duration-300">
                  <span className="text-xs text-slate-500">Variant:</span>
                  <div className="flex space-x-1">
                    {candidates.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectCandidate(idx)}
                        className={`w-6 h-6 rounded text-xs font-bold transition-all ${
                          selectedCandidateIndex === idx 
                            ? 'bg-primary-500 text-white' 
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-primary-100'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowDiff(!showDiff)}
                    className={`text-xs px-2 py-1 rounded transition-all ${
                      showDiff 
                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' 
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {showDiff ? 'Hide Diff' : 'Show Diff'}
                  </button>
                  <button
                    onClick={() => setShowCompareAll(true)}
                    className="flex items-center space-x-1 text-xs px-2 py-1 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 hover:bg-violet-200 transition-all"
                    title="Compare all variants side by side"
                  >
                    <Grid3X3 size={14} />
                    <span>Compare All</span>
                  </button>
                </div>
              )}
              
              {/* Short-circuit indicator */}
              {shortCircuited && (
                <span className="text-xs font-medium text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                  Minimal change mode
                </span>
              )}
              
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
            <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
               <span>Rate this paraphrase:</span>
               <button
                 id="feedback-up"
                 onClick={() => handleFeedback(1)}
                 className={`flex items-center space-x-1 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all duration-300 ${
                   feedbackAnimation === 'up' 
                     ? 'bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400 scale-110' 
                     : ''
                 }`}
               >
                 <ThumbsUp size={14} className={feedbackAnimation === 'up' ? 'animate-pulse' : ''} />
                 <span>Helpful</span>
               </button>
               <button
                 id="feedback-down"
                 onClick={() => handleFeedback(-1)}
                 className={`flex items-center space-x-1 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900 transition-all duration-300 ${
                   feedbackAnimation === 'down' 
                     ? 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400 scale-110' 
                     : ''
                 }`}
               >
                 <ThumbsDown size={14} className={feedbackAnimation === 'down' ? 'animate-pulse' : ''} />
                 <span>Needs fix</span>
               </button>
            </div>
          </div>
        </div>

      </div>

      {/* Compare All Modal */}
      {showCompareAll && candidates.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl w-[95vw] max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Compare All Variants</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {candidates.length} variants • {mode} mode • {modeIntensity}% intensity • {getEffectiveSynonyms(synonyms, mode)}% synonyms
                </p>
              </div>
              <button
                onClick={() => setShowCompareAll(false)}
                className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <X size={20} className="text-slate-500" />
              </button>
            </div>
            
            {/* Modal Body - Grid of Candidates */}
            <div className="flex-1 overflow-auto p-6">
              <div className="grid gap-4" style={{ gridTemplateColumns: candidates.length <= 2 ? '1fr 1fr' : candidates.length <= 4 ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr' }}>
                {candidates.map((candidate, idx) => (
                  <div 
                    key={idx}
                    onClick={() => {
                      handleSelectCandidate(idx);
                      setShowCompareAll(false);
                    }}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-lg ${
                      selectedCandidateIndex === idx 
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-primary-500/20' 
                        : 'border-slate-200 dark:border-dark-border hover:border-violet-300 dark:hover:border-violet-700 bg-slate-50 dark:bg-slate-800/30'
                    }`}
                  >
                    {/* Variant Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          selectedCandidateIndex === idx
                            ? 'bg-primary-500 text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                          Variant {idx + 1}
                        </span>
                      </div>
                      {selectedCandidateIndex === idx && (
                        <span className="text-xs font-medium text-primary-500 bg-primary-100 dark:bg-primary-900/30 px-2 py-0.5 rounded">
                          Selected
                        </span>
                      )}
                    </div>
                    
                    {/* Candidate Content */}
                    <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-3 line-clamp-6">
                      {showDiff && candidate.highlightedDiff ? (
                        <div dangerouslySetInnerHTML={{ __html: candidate.highlightedDiff }} />
                      ) : (
                        candidate.paraphrasedText
                      )}
                    </div>
                    
                    {/* Metrics */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
                      <div className="flex items-center space-x-3">
                        <div className="text-center">
                          <div className="text-xs font-bold text-primary-600 dark:text-primary-400">{candidate.actualChangePct}%</div>
                          <div className="text-[10px] text-slate-400 uppercase">Change</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs font-bold text-green-600 dark:text-green-400">{Math.round((candidate.confidence || 0.9) * 100)}%</div>
                          <div className="text-[10px] text-slate-400 uppercase">Confidence</div>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {candidate.paraphrasedText.split(/\s+/).length} words
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={showDiff}
                    onChange={(e) => setShowDiff(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-primary-600 focus:ring-primary-500"
                  />
                  <span>Show diff highlighting</span>
                </label>
              </div>
              <button
                onClick={() => setShowCompareAll(false)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
