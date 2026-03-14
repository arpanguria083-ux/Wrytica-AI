import { LucideIcon } from 'lucide-react';

// --- Types ---

export type ParaphraseMode = 'Standard' | 'Fluency' | 'Formal' | 'Simple' | 'Creative' | 'Academic' | 'Humanize' | 'Expand' | 'Shorten' | 'Custom';

export type ParaphraseOption = 'phraseFlip' | 'sentenceRestructure' | 'fluency' | 'sentenceCompression' | 'wordLevel';

export interface ParaphraseResponse {
  paraphrasedText: string;
  tone: string;
  confidence: number;
}

// --- Paraphraser Middleware Types ---

export interface ParaphraseCandidate {
  paraphrasedText: string;
  highlightedDiff: string;
  actualChangePct: number;
  confidence: number;
  tone?: string;
}

export interface ParaphraseRequest {
  originalText: string;
  mode: ParaphraseMode;
  modeIntensity: number;        // 0-100, default 50
  globalSynonymIntensity: number; // 0-100, default 50
  extras: {
    phraseFlip: boolean;
    restructure: boolean;
    fluencyBoost: boolean;
    compress: boolean;
    wordLevel: boolean;
  };
  customInstruction?: string;
  numCandidates: number;        // 1-8, default 1
}

// Intensity adverb mapping
export const INTENSITY_ADVERBS: Record<number, string> = {
  0: "very lightly - minimal application of this style",
  20: "lightly",
  40: "moderately",
  60: "noticeably",
  80: "very strongly",
  100: "aggressively"
};

export const getIntensityAdverb = (intensity: number): string => {
  if (intensity <= 20) return INTENSITY_ADVERBS[0];
  if (intensity <= 40) return INTENSITY_ADVERBS[20];
  if (intensity <= 60) return INTENSITY_ADVERBS[40];
  if (intensity <= 80) return INTENSITY_ADVERBS[60];
  return INTENSITY_ADVERBS[80];
};

// Synonym adverb mapping (global, affects all modes)
export const SYNONYM_ADVERBS: Record<number, string> = {
  0: "almost no synonym replacement",
  15: "minimal synonym replacement",
  30: "moderate synonym replacement",
  50: "significant synonym replacement",
  70: "heavy synonym replacement",
  85: "extremely heavy synonym replacement (change most replaceable words)",
  100: "maximum synonym replacement (transform nearly every replaceable word)"
};

export const getSynonymAdverb = (synonymIntensity: number): string => {
  if (synonymIntensity <= 15) return SYNONYM_ADVERBS[0];
  if (synonymIntensity <= 30) return SYNONYM_ADVERBS[15];
  if (synonymIntensity <= 50) return SYNONYM_ADVERBS[30];
  if (synonymIntensity <= 70) return SYNONYM_ADVERBS[50];
  if (synonymIntensity <= 85) return SYNONYM_ADVERBS[70];
  if (synonymIntensity <= 100) return SYNONYM_ADVERBS[85];
  return SYNONYM_ADVERBS[100];
};

// Damerau-Levenshtein distance (word-level)
export const damerauLevenshteinWords = (a: string, b: string): number => {
  const wordsA = a.toLowerCase().split(/\s+/);
  const wordsB = b.toLowerCase().split(/\s+/);
  const m = wordsA.length;
  const n = wordsB.length;
  
  if (m === 0) return n;
  if (n === 0) return m;
  
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = wordsA[i - 1] === wordsB[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,        // deletion
        dp[i][j - 1] + 1,        // insertion
        dp[i - 1][j - 1] + cost  // substitution
      );
      // Transposition (adjacent words)
      if (i > 1 && j > 1 && wordsA[i - 1] === wordsB[j - 2] && wordsA[i - 2] === wordsB[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost);
      }
    }
  }
  
  return dp[m][n];
};

// Calculate actual change percentage
export const calculateChangePercentage = (original: string, paraphrased: string): number => {
  const origWords = original.split(/\s+/).filter(Boolean);
  const paraWords = paraphrased.split(/\s+/).filter(Boolean);
  const maxLen = Math.max(origWords.length, paraWords.length);
  if (maxLen === 0) return 0;
  
  const dist = damerauLevenshteinWords(original, paraphrased);
  const ratio = dist / maxLen;
  const changePct = Math.round(ratio * 125); // ×1.25 heuristic for user intuition
  return Math.max(0, Math.min(99, changePct));
};

// Generate HTML diff with highlighting
export const generateHtmlDiff = (original: string, paraphrased: string): string => {
  const origWords = original.split(/(\s+)/);
  const paraWords = paraphrased.split(/(\s+)/);
  
  // Simple word-level diff using longest common subsequence concept
  // For simplicity, we'll mark changed words with strikethrough and highlighting
  let result = '';
  let origIndex = 0;
  let paraIndex = 0;
  
  // Simple greedy matching for demo - can be enhanced with proper diff algorithm
  const origSet = new Set(origWords.filter(w => w.trim()));
  const paraSet = new Set(paraWords.filter(w => w.trim()));
  
  paraWords.forEach(word => {
    if (!word.trim()) {
      result += word;
      return;
    }
    
    if (origSet.has(word.toLowerCase())) {
      result += word;
    } else if (paraSet.has(word.toLowerCase())) {
      // Word exists in original but different case/form - just show
      result += word;
    } else {
      // New word - highlight as added
      result += `<span style='background:#d4f4dd'>${word}</span>`;
    }
    paraIndex++;
  });
  
  // Mark deleted words from original
  let highlightedResult = result;
  const paraLowerSet = new Set(paraWords.map(w => w.toLowerCase()));
  origWords.forEach(word => {
    if (word.trim() && !paraLowerSet.has(word.toLowerCase())) {
      highlightedResult = highlightedResult.replace(
        new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'g'),
        "<span style='text-decoration:line-through;color:#999'>$1</span>"
      );
    }
  });
  
  return highlightedResult || paraphrased;
};

// Mode-specific length penalty factors for ranking
export const MODE_LENGTH_PENALTY: Record<ParaphraseMode, number> = {
  'Standard': 0.3,
  'Fluency': 0.3,
  'Formal': 0.3,
  'Simple': 0.3,
  'Creative': 0.3,
  'Academic': 0.3,
  'Humanize': 0.3,
  'Expand': 0.6,   // Favor longer
  'Shorten': 0.8,  // Favor shorter
  'Custom': 0.3
};

// Rank candidates based on penalty score
export const rankCandidates = (
  candidates: ParaphraseCandidate[],
  original: string,
  targetSynonymIntensity: number,
  mode: ParaphraseMode
): ParaphraseCandidate[] => {
  const lengthPenaltyFactor = MODE_LENGTH_PENALTY[mode];
  const origLength = original.split(/\s+/).length;
  
  const scored = candidates.map(candidate => {
    const penalty = Math.abs(candidate.actualChangePct - targetSynonymIntensity)
      + (100 - (candidate.confidence || 0.9) * 100) * 0.3
      + Math.abs(((candidate.paraphrasedText.split(/\s+/).length - origLength) / origLength) * 100) * lengthPenaltyFactor;
    
    return { ...candidate, _penalty: penalty };
  });
  
  return scored
    .sort((a, b) => a._penalty - b._penalty)
    .map(({ _penalty, ...rest }) => rest as ParaphraseCandidate);
};

// Mathematical mode curves for synonyms transformation (moved from Paraphraser.tsx)
// Each mode transforms the slider value (0-100) into effective creativity level
const modeCurvesInternal: Record<ParaphraseMode, (slider: number) => number> = {
  'Standard': (s) => s,
  'Fluency': (s) => Math.floor(20 + (s / 100) * 60 + Math.pow(s / 100, 2) * 20),
  'Humanize': (s) => Math.floor(10 + 80 / (1 + Math.exp(-0.08 * (s - 50)))),
  'Formal': (s) => Math.floor(5 + Math.pow(s / 100, 0.5) * 35),
  'Academic': (s) => Math.floor(15 + (s / 100) * 45),
  'Simple': (s) => s,
  'Creative': (s) => Math.floor(10 + Math.pow(s / 100, 1.5) * 90),
  'Expand': (s) => Math.floor(30 + Math.log10(1 + s * 9) * 25),
  'Shorten': (s) => Math.floor(100 - Math.pow((100 - s) / 100, 0.7) * 70),
  'Custom': (s) => s
};

// Get mode-specific synonyms effective value
export const getEffectiveSynonyms = (sliderValue: number, mode: ParaphraseMode): number => {
  return modeCurvesInternal[mode](sliderValue);
};

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

export type CitationStyle = 
  | 'APA 7' | 'MLA 9' | 'Chicago' | 'Harvard' | 'IEEE' 
  | 'Vancouver' | 'Turabian' | 'ACS' | 'AMA' | 'ASA'
  | 'Bluebook' | 'CSE' | 'ISO 690' | 'BibTeX'
  | 'AIP' | 'Nature' | 'Science' | 'IEEE Transactions' | 'American Chemical Society';

// Custom citation format template for user-defined styles
export interface CustomCitationFormat {
  id: string;
  name: string;
  template: string; // Template with placeholders like {author}, {title}, {date}, {source}, {doi}
  example?: string;
}

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
  role: 'user' | 'model' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  references?: KnowledgeChunk[];
  guardrailId?: string;
}

export type ToolName = 'chat' | 'paraphraser' | 'grammar' | 'summarizer' | 'citation' | 'agent' | 'ocr' | 'document';

export interface SelfImproveData {
  applied: boolean;
  rerankedChunkIds: string[];
  feedbackSignalsUsed: number;
}

export interface TimelineEntry {
  id: string;
  tool: ToolName;
  input: string;
  output: string;
  timestamp: number;
  metadata?: Record<string, any>;
  guardrailId?: string;
  references?: KnowledgeChunk[];
  modelName?: string;
  selfImproveData?: SelfImproveData;
}

export interface FeedbackEntry {
  id: string;
  tool: ToolName;
  rating: number;
  comment?: string;
  timestamp: number;
  relatedEntryId?: string;
}

export interface Guardrail {
  id: string;
  name: string;
  description: string;
  tone?: string;
  requiredPhrases?: string[];
  prohibitedPhrases?: string[];
  formattingNotes?: string;
  maxLength?: number;
}

export interface KnowledgeChunk {
  id: string;
  docId: string;
  text: string;
  order: number;
  sourceTitle: string;
  sourcePath?: string;
  tags: string[];
  nodeId?: string;
  pageNumber?: number;
  summary?: string;
  reason?: string;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  source?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  chunks: KnowledgeChunk[];
  drivePath?: string;
  pageIndex?: PageIndexNode[];
  pageImages?: string[]; // base64 data URLs for vision RAG (small set)
}

export interface PageIndexNode {
  id: string;
  title: string;
  summary?: string;
  content?: string;
  pageNumber?: number;
  parentId?: string;
  children?: PageIndexNode[];
  tags?: string[];
}

export interface PageIndexSelection {
  nodeId: string;
  reason: string;
  rank?: number;
}

export interface PageIndexPromptNode {
  nodeId: string;
  title: string;
  summary?: string;
  content?: string;
  docTitle: string;
  docId: string;
  pageNumber?: number;
  drivePath?: string;
}

export interface PageIndexReasoningResult {
  nodes: PageIndexSelection[];
  thinking?: string;
}

export interface ContextEnhancement {
  guardrail?: Guardrail;
  knowledgeRefs?: KnowledgeChunk[];
  additionalInstructions?: string;
}

// --- State Types for Context ---

export interface ParaphraserState {
  input: string;
  output: string;
  outputHtml: string;
  mode: ParaphraseMode;
  synonyms: number;
  toneAnalysis: { tone: string; confidence: number } | null;
  isLoading?: boolean;
  // QuillBot-style additional options
  options: {
    phraseFlip: boolean;
    sentenceRestructure: boolean;
    fluency: boolean;
    sentenceCompression: boolean;
    wordLevel: boolean;
  };
}

export interface GrammarState {
  text: string;
  historyText: string; // Previous writing samples for pattern detection
  errors: GrammarError[];
  forecast: string[];
  isLoading?: boolean;
}

export interface SummarizerState {
  text: string;
  summary: string;
  summaryHtml: string;
  length: SummaryLength;
  format: SummaryFormat;
  isLoading?: boolean;
}

export interface CitationState {
  sourceInput: string;
  result: CitationResponse | null;
  style: CitationStyle;
  isLoading?: boolean;
}

export interface ChatState {
  messages: ChatMessage[];
}
// --- LLM & Settings Types ---

export type LLMProvider = 'gemini' | 'ollama' | 'lmstudio';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  timestamp: number;
  modelName?: string;
}

export interface ChatState {
  sessions: ChatSession[];
  currentSessionId: string | null;
}

export interface LLMConfig {
  provider: LLMProvider;
  modelName: string;
  baseUrl: string; // e.g., http://localhost:11434
  contextLimit: number; // e.g., 8192
  maxCompletionTokens: number; // e.g., 4096
  apiKey?: string; // For Gemini
}

export const DEFAULT_CONFIGS: Record<LLMProvider, LLMConfig> = {
  gemini: {
    provider: 'gemini',
    modelName: 'gemini-2.5-flash',
    baseUrl: '',
    contextLimit: 1000000,
    maxCompletionTokens: 8192,
    apiKey: '' // Users must provide their own API key
  },
  ollama: {
    provider: 'ollama',
    modelName: 'llama3',
    baseUrl: 'http://localhost:11434',
    contextLimit: 8192,
    maxCompletionTokens: 4096
  },
  lmstudio: {
    provider: 'lmstudio',
    modelName: 'microsoft/phi-4-mini-reasoning', // Use actual model name from LM Studio
    baseUrl: 'http://localhost:1234',
    contextLimit: 4096,
    maxCompletionTokens: 2048
  }
};

// --- Constants ---

export const PARAPHRASE_MODES_LIST: ParaphraseMode[] = [
  'Standard', 'Fluency', 'Humanize', 'Formal', 'Academic', 'Simple', 'Creative', 'Expand', 'Shorten', 'Custom'
];

export const CITATION_STYLES_LIST: CitationStyle[] = [
  'APA 7', 'MLA 9', 'Chicago', 'Harvard', 'IEEE', 'Vancouver', 
  'Turabian', 'ACS', 'AMA', 'ASA', 'Bluebook', 'CSE', 'ISO 690', 'BibTeX',
  'AIP', 'Nature', 'Science', 'IEEE Transactions', 'American Chemical Society'
];

export const SUPPORTED_LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Hindi', 'Chinese', 'Japanese', 'Russian', 'Arabic', 'Korean'
];

// --- Constants ---

export const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in',
  'with', 'to', 'for', 'of', 'it', 'this', 'that', 'was', 'are', 'be',
  'has', 'had', 'have', 'not', 'from', 'by', 'as', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'been', 'being', 'am', 'were', 'he', 'she', 'they', 'we', 'you', 'i',
  'me', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'if', 'so',
  'no', 'yes', 'up', 'out', 'about', 'into', 'than', 'then', 'also',
  'just', 'more', 'some', 'any', 'each', 'very', 'all', 'own', 'such',
]);

// --- Helpers ---

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
};

export const formatTimestamp = (value: number) => {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
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
  let cleanText = text.trim();
  
  // Handle Qwen/R1 model's thinking/CoT output that appears before JSON
  // Patterns: `<|thinking|>`, `<think>`, `Think:`, etc.
  const thinkingPatterns = [
    /<\|thinking\|>[\s\S]*?<\|end_thinking\|>/gi,
    /<think>[\s\S]*?<\/think>/gi,
    /<think>[\s\S]*?(?={)/gi, // Unclosed think block before JSON
    /<\|reserved_\d+\|>[\s\S]*/gi,
    /Thought(?:s|ing)?\s*Process:?[\s\S]*?(?=\n\n|\n\s*\n|```|{)/gi,
    /^Thought(?:s|ing)?\s*Process:?.*$/gim,
    /^(?:Let me|I'll|I will|Certainly)[\s\S]*?(?=\n\n|\n\s*\n|{)/gim
  ];
  
  thinkingPatterns.forEach(pattern => {
    cleanText = cleanText.replace(pattern, '');
  });
  
  // Also remove any remaining thinking blocks before the first code block or JSON
  cleanText = cleanText.replace(/^\s*<think>[\s\S]*?(?={)/gi, '');
  cleanText = cleanText.replace(/^\s*<thinking>[\s\S]*?(?={)/gi, '');
  
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

export const STORAGE_KEYS = {
  config: 'wrytica_config',
  providerConfigs: 'wrytica_provider_configs',
  chatHistory: 'wrytica_chat_history',
  toolTimeline: 'wrytica_tool_timeline',
  knowledgeBase: 'wrytica_knowledge_base',
  guardrails: 'wrytica_guardrails',
  feedback: 'wrytica_feedback',
  selectedGuardrail: 'wrytica_selected_guardrail',
  readingMode: 'wrytica_reading_mode',
  retrievalMode: 'wrytica_retrieval_mode',
  selfImprove: 'wrytica_self_improve',
  storageMode: 'wrytica_storage_mode',
  // Tool States (complete)
  paraphraserState: 'wrytica_paraphraser_state',
  grammarState: 'wrytica_grammar_state',
  summarizerState: 'wrytica_summarizer_state',
  citationState: 'wrytica_citation_state',
  chatState: 'wrytica_chat_state',
  chatSessions: 'wrytica_chat_sessions',
  currentSessionId: 'wrytica_current_session_id',
  // In-progress input text (persists unsaved work when switching tabs)
  paraphraserInputText: 'wrytica_paraphraser_input',
  grammarInputText: 'wrytica_grammar_input',
  summarizerInputText: 'wrytica_summarizer_input',
  citationInputText: 'wrytica_citation_input',
  chatInputText: 'wrytica_chat_input',
  // UI preferences
  visionRagEnabled: 'wrytica_vision_rag',
};

export const chunkText = (text: string, chunkSize = 800, overlap = 200, meta: Partial<KnowledgeChunk> = {}): KnowledgeChunk[] => {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const chunks: KnowledgeChunk[] = [];
  let start = 0;
  let order = 0;
  while (start < clean.length) {
    let end = Math.min(start + chunkSize, clean.length);
    if (end < clean.length) {
      const searchStart = Math.max(end - 100, start);
      const segment = clean.slice(searchStart, end);
      const lastSentence = segment.lastIndexOf('. ');
      if (lastSentence > 0) {
        end = searchStart + lastSentence + 2;
      }
    }
    const slice = clean.slice(start, end).trim();
    if (slice) {
      chunks.push({
        id: generateId(),
        docId: meta.docId || '',
        text: slice,
        order,
        sourceTitle: meta.sourceTitle || '',
        sourcePath: meta.sourcePath,
        tags: meta.tags || [],
      });
      order += 1;
    }
    start = end - overlap;
    if (start < 0) start = 0;
    if (start >= clean.length) break;
  }
  return chunks;
};

export const rankChunksByQuery = (chunks: KnowledgeChunk[], query: string): KnowledgeChunk[] => {
  if (!query || chunks.length === 0) return [];

  const tokens = query.toLowerCase().split(/\W+/).filter(t => t && !STOP_WORDS.has(t));
  if (!tokens.length) return [];
  const scoreChunk = (chunk: KnowledgeChunk) => {
    const content = (chunk.text + ' ' + (chunk.sourceTitle || '') + ' ' + (chunk.tags || []).join(' ')).toLowerCase();
    return tokens.reduce((acc, token) => {
      const occurrences = (content.match(new RegExp(`\\b${token}\\b`, 'g')) || []).length;
      return acc + occurrences;
    }, 0);
  };

  return [...chunks]
    .map(chunk => ({ chunk, score: scoreChunk(chunk) }))
    .filter(({ score }) => score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ chunk }) => chunk);
};

export const buildKnowledgeContext = (chunks?: KnowledgeChunk[]): string => {
  if (!chunks || chunks.length === 0) return '';
  return chunks.map((chunk, index) => `Reference ${index + 1} (${chunk.sourceTitle}): ${chunk.text}`).join('\n\n');
};

export const flattenPageIndexNodes = (nodes?: PageIndexNode[], parentId?: string): PageIndexNode[] => {
  if (!nodes || nodes.length === 0) return [];
  return nodes.reduce<PageIndexNode[]>((acc, node) => {
    const normalized: PageIndexNode = {
      ...node,
      parentId
    };
    acc.push(normalized);
    if (node.children && node.children.length) {
      acc.push(...flattenPageIndexNodes(node.children, node.id));
    }
    return acc;
  }, []);
};

export const rankPageIndexNodesByQuery = (nodes: PageIndexNode[], query: string): PageIndexNode[] => {
  if (!query || !nodes.length) return [];
  const tokens = query.toLowerCase().split(/\W+/).filter(Boolean);
  return [...nodes]
    .map(node => ({ node, score: tokens.reduce((total, token) => {
      const content = `${node.title} ${node.summary || ''} ${node.content || ''}`.toLowerCase();
      const occurrences = (content.match(new RegExp(`\\b${token}\\b`, 'g')) || []).length;
      return total + occurrences;
    }, 0) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ node }) => node);
};

export const plainTextToHtml = (text: string): string => {
  if (!text) return '';
  const paragraphs = text.trim().split(/\n\s*\n/).filter(Boolean);
  return paragraphs.map(paragraph => `<p>${paragraph.trim().replace(/\n/g, '<br/>')}</p>`).join('');
};

export const htmlToPlainText = (html: string): string => {
  if (!html) return '';
  if (typeof document !== 'undefined') {
    const container = document.createElement('div');
    container.innerHTML = html;
    return container.textContent?.trim() || container.innerText?.trim() || '';
  }
  return html.replace(/<\/?[^>]+(>|$)/g, '').trim();
};

export const mergeKnowledgeChunks = (primary: KnowledgeChunk[], extras: KnowledgeChunk[], limit = 6): KnowledgeChunk[] => {
  const seen = new Map<string, KnowledgeChunk>();
  const addChunk = (chunk: KnowledgeChunk) => {
    const key = chunk.nodeId ? `${chunk.docId}-${chunk.nodeId}` : chunk.id;
    if (!seen.has(key)) {
      seen.set(key, chunk);
    }
  };
  primary.forEach(addChunk);
  extras.forEach(addChunk);
  return Array.from(seen.values()).slice(0, limit);
};

export const buildContextEnhancement = (guardrail?: Guardrail, additionalInstructions?: string, knowledgeRefs?: KnowledgeChunk[]): ContextEnhancement | undefined => {
  const trimmedInstructions = additionalInstructions?.trim();
  if (!guardrail && !trimmedInstructions && !(knowledgeRefs && knowledgeRefs.length)) return undefined;
  const enhancement: ContextEnhancement = {};
  if (guardrail) enhancement.guardrail = guardrail;
  if (trimmedInstructions) enhancement.additionalInstructions = trimmedInstructions;
  if (knowledgeRefs && knowledgeRefs.length) enhancement.knowledgeRefs = knowledgeRefs;
  return enhancement;
};

export const buildGuardrailInstructions = (guardrail?: Guardrail, toolName?: string): string => {
  if (!guardrail) return '';
  const lines = [`Company Guardrail: ${guardrail.name} - ${guardrail.description}`];
  if (guardrail.tone) lines.push(`Tone: ${guardrail.tone}`);
  if (guardrail.formattingNotes) lines.push(`Formatting guidance: ${guardrail.formattingNotes}`);
  if (guardrail.requiredPhrases && guardrail.requiredPhrases.length) {
    lines.push(`Required terms/phrases: ${guardrail.requiredPhrases.join(', ')}`);
  }
  if (guardrail.prohibitedPhrases && guardrail.prohibitedPhrases.length) {
    lines.push(`Avoid terms/phrases: ${guardrail.prohibitedPhrases.join(', ')}`);
  }
  if (guardrail.maxLength) {
    lines.push(`Keep response under ${guardrail.maxLength} tokens/characters`);
  }
  if (toolName) {
    lines.push(`Apply this guardrail while working in the ${toolName} workflow.`);
  }
  return lines.join(' ');
};

// Simple client-side GPU presence heuristic (WebGPU first, then WebGL)
export const detectGPUAvailable = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  // WebGPU
  // @ts-ignore
  if (navigator.gpu) return true;
  // WebGL
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  return Boolean(gl);
};


