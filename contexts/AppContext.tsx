import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  LLMConfig, DEFAULT_CONFIGS, LLMProvider, estimateTokens,
  ParaphraserState, GrammarState, SummarizerState, CitationState, ChatState
} from '../utils';

interface AppContextType {
  config: LLMConfig;
  updateConfig: (newConfig: Partial<LLMConfig>) => void;
  resetConfig: () => void;
  
  // Context Calculator State
  currentUsage: number;
  updateUsage: (text: string) => void;
  usagePercentage: number;
  isOverLimit: boolean;

  // Language State
  language: string;
  setLanguage: (lang: string) => void;

  // Global Tool States
  paraphraserState: ParaphraserState;
  setParaphraserState: React.Dispatch<React.SetStateAction<ParaphraserState>>;
  grammarState: GrammarState;
  setGrammarState: React.Dispatch<React.SetStateAction<GrammarState>>;
  summarizerState: SummarizerState;
  setSummarizerState: React.Dispatch<React.SetStateAction<SummarizerState>>;
  citationState: CitationState;
  setCitationState: React.Dispatch<React.SetStateAction<CitationState>>;
  chatState: ChatState;
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load config from localStorage or default
  const [config, setConfig] = useState<LLMConfig>(() => {
    const saved = localStorage.getItem('wrytica_config');
    return saved ? JSON.parse(saved) : DEFAULT_CONFIGS.gemini;
  });

  const [language, setLanguage] = useState<string>('English');
  const [currentUsage, setCurrentUsage] = useState(0);

  // --- Tool States ---
  
  const [paraphraserState, setParaphraserState] = useState<ParaphraserState>({
    input: '',
    output: '',
    mode: 'Standard',
    synonyms: 50,
    toneAnalysis: null
  });

  const [grammarState, setGrammarState] = useState<GrammarState>({
    text: '',
    historyText: '',
    errors: [],
    forecast: []
  });

  const [summarizerState, setSummarizerState] = useState<SummarizerState>({
    text: '',
    summary: '',
    length: 'Medium',
    format: 'Paragraph'
  });

  const [citationState, setCitationState] = useState<CitationState>({
    sourceInput: '',
    result: null,
    style: 'APA 7'
  });

  const [chatState, setChatState] = useState<ChatState>({
    messages: [{ 
      role: 'model', 
      content: "Hello! I'm your AI writing assistant. How can I help you draft or edit today?", 
      timestamp: Date.now() 
    }]
  });

  useEffect(() => {
    localStorage.setItem('wrytica_config', JSON.stringify(config));
  }, [config]);

  const updateConfig = (newConfig: Partial<LLMConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  };

  const resetConfig = () => {
    setConfig(DEFAULT_CONFIGS.gemini);
  };

  const updateUsage = (text: string) => {
    const tokens = estimateTokens(text);
    setCurrentUsage(tokens);
  };

  const usagePercentage = Math.min((currentUsage / config.contextLimit) * 100, 100);
  const isOverLimit = currentUsage > config.contextLimit;

  return (
    <AppContext.Provider value={{ 
      config, 
      updateConfig, 
      resetConfig,
      currentUsage,
      updateUsage,
      usagePercentage,
      isOverLimit,
      language,
      setLanguage,
      // Tool States
      paraphraserState, setParaphraserState,
      grammarState, setGrammarState,
      summarizerState, setSummarizerState,
      citationState, setCitationState,
      chatState, setChatState
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};