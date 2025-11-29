import { LucideIcon } from 'lucide-react';

// --- Types ---

export type ParaphraseMode = 'Standard' | 'Fluency' | 'Formal' | 'Simple' | 'Creative' | 'Academic' | 'Humanize' | 'Expand' | 'Shorten' | 'Custom';

export interface ParaphraseResponse {
  paraphrasedText: string;
  tone: string;
  confidence: number;
}

export interface GrammarError {
  id: string;
  original: string;
  suggestion: string;
  reason: string;
  context: string;
  type: 'grammar' | 'spelling' | 'style';
}

export interface GrammarCheckResult {
  errors: GrammarError[];
  forecast: string[];
}

export type SummaryLength = 'Short' | 'Medium' | 'Long';
export type SummaryFormat = 'Paragraph' | 'Bullet Points';

export type CitationStyle = 'APA 7' | 'MLA 9' | 'Chicago' | 'Harvard' | 'IEEE' | 'Vancouver';

export interface CitationResponse {
  formatted_citation: string;
  bibtex: string;
  components: {
    author: string;
    date: string;
    title: string;
    source: string;
    doi_or_url: string;
  };
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

// --- State Types for Context ---

export interface ParaphraserState {
  input: string;
  output: string;
  mode: ParaphraseMode;
  synonyms: number;
  toneAnalysis: { tone: string; confidence: number } | null;
}

export interface GrammarState {
  text: string;
  historyText: string; // Previous writing samples for pattern detection
  errors: GrammarError[];
  forecast: string[];
}

export interface SummarizerState {
  text: string;
  summary: string;
  length: SummaryLength;
  format: SummaryFormat;
}

export interface CitationState {
  sourceInput: string;
  result: CitationResponse | null;
  style: CitationStyle;
}

export interface ChatState {
  messages: ChatMessage[];
}

// --- LLM & Settings Types ---

export type LLMProvider = 'gemini' | 'ollama' | 'lmstudio';

export interface LLMConfig {
  provider: LLMProvider;
  modelName: string;
  baseUrl: string; // e.g., http://localhost:11434
  contextLimit: number; // e.g., 8192
  apiKey?: string; // For Gemini
}

export const DEFAULT_CONFIGS: Record<LLMProvider, LLMConfig> = {
  gemini: {
    provider: 'gemini',
    modelName: 'gemini-2.5-flash',
    baseUrl: '',
    contextLimit: 1000000,
    apiKey: '' // Users must provide their own API key
  },
  ollama: {
    provider: 'ollama',
    modelName: 'llama3',
    baseUrl: 'http://localhost:11434',
    contextLimit: 8192
  },
  lmstudio: {
    provider: 'lmstudio',
    modelName: 'microsoft/phi-4-mini-reasoning', // Use actual model name from LM Studio
    baseUrl: 'http://localhost:1234',
    contextLimit: 4096
  }
};

// --- Constants ---

export const PARAPHRASE_MODES_LIST: ParaphraseMode[] = [
  'Standard', 'Fluency', 'Humanize', 'Formal', 'Academic', 'Simple', 'Creative', 'Expand', 'Shorten', 'Custom'
];

export const CITATION_STYLES_LIST: CitationStyle[] = [
  'APA 7', 'MLA 9', 'Chicago', 'Harvard', 'IEEE', 'Vancouver'
];

export const SUPPORTED_LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Hindi', 'Chinese', 'Japanese', 'Russian', 'Arabic', 'Korean'
];

// --- Helpers ---

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
};

// Simple heuristic: 1 token ~= 4 characters for English text
export const estimateTokens = (text: string): number => {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
};

// Extracts JSON from a string that might contain markdown code blocks or preamble text
export const extractJson = (text: string): any => {
  if (!text || typeof text !== 'string') {
    throw new Error("No text provided for JSON extraction");
  }

  // Clean the text first
  const cleanText = text.trim();
  
  try {
    // 1. Try direct parse
    return JSON.parse(cleanText);
  } catch (e) {
    // 2. Try extracting from code blocks ```json ... ```
    const codeBlockMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try {
        const extracted = codeBlockMatch[1].trim();
        return JSON.parse(extracted);
      } catch (e2) { /* continue */ }
    }
    
    // 3. Try finding the first '{' and last '}'
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        const extracted = cleanText.substring(firstBrace, lastBrace + 1);
        return JSON.parse(extracted);
      } catch (e3) { /* continue */ }
    }
    
    // 4. Try finding array brackets '[' and ']'
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      try {
        const extracted = cleanText.substring(firstBracket, lastBracket + 1);
        return JSON.parse(extracted);
      } catch (e4) { /* continue */ }
    }

    // 5. Last resort: try to clean common issues
    try {
      // Remove any leading/trailing non-JSON text
      const lines = cleanText.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('{') || line.startsWith('[')) {
          const remainingText = lines.slice(i).join('\n');
          const lastBracePos = remainingText.lastIndexOf('}');
          const lastBracketPos = remainingText.lastIndexOf(']');
          const endPos = Math.max(lastBracePos, lastBracketPos);
          
          if (endPos !== -1) {
            const extracted = remainingText.substring(0, endPos + 1);
            return JSON.parse(extracted);
          }
        }
      }
    } catch (e5) { /* continue */ }

    throw new Error(`Could not extract valid JSON from response. Text received: ${cleanText.substring(0, 200)}...`);
  }
};
