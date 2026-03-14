import { GeminiService } from './geminiService';
import { LocalLlmService } from './localLlmService';
import { LLMConfig, ParaphraseMode, ParaphraseOption, ParaphraseResponse, ParaphraseCandidate, ParaphraseRequest, GrammarError, SummaryLength, SummaryFormat, CitationStyle, CitationResponse, ChatMessage, GrammarCheckResult, ContextEnhancement, PageIndexPromptNode, PageIndexSelection, estimateTokens, getIntensityAdverb, getSynonymAdverb, calculateChangePercentage, generateHtmlDiff, rankCandidates, getEffectiveSynonyms, buildContextEnhancement } from '../utils';

// Abstract Chat Interface
export interface AISession {
  sendMessage(text: string, contextInfo?: string, onToken?: (token: string) => void): Promise<string>;
}

class LocalChatSession implements AISession {
  constructor(
    private service: LocalLlmService,
    private config: LLMConfig,
    private language: string,
    private enhancement?: ContextEnhancement,
    private history: ChatMessage[] = []
  ) {}

  // Convert 'model' role to 'assistant' for API compatibility
  private convertRoleForApi(msg: ChatMessage): ChatMessage {
    if (msg.role === 'model') {
       return { ...msg, role: 'assistant' as any };
    }
    return msg;
  }

  private truncateHistory(): ChatMessage[] {
    const reserveTokens = Math.min(2048, Math.floor(this.config.contextLimit / 3));
    const maxHistoryTokens = this.config.contextLimit - reserveTokens;
    const truncated: ChatMessage[] = [];
    let totalTokens = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const msgTokens = estimateTokens(this.history[i].content);
      if (totalTokens + msgTokens > maxHistoryTokens) break;
      totalTokens += msgTokens;
      truncated.unshift(this.history[i]);
    }
    return truncated;
  }

  async sendMessage(text: string, contextInfo?: string, onToken?: (token: string) => void): Promise<string> {
    const messageText = contextInfo ? `${contextInfo}\n\n${text}` : text;
    const truncatedHistory = this.truncateHistory();
    // Convert history messages to use 'assistant' role instead of 'model'
    const apiHistory = truncatedHistory.map(this.convertRoleForApi);
    
    let response = '';
    if (onToken) {
      // Use streaming if callback provided
      response = await this.service.chatStream(apiHistory, messageText, onToken, this.language, this.enhancement);
    } else {
      response = await this.service.chat(apiHistory, messageText, this.language, this.enhancement);
    }
    
    this.history.push({ role: 'user', content: text, timestamp: Date.now() });
    // Store as 'model' internally for display, but API will convert when needed
    this.history.push({ role: 'model', content: response, timestamp: Date.now() });
    return response;
  }
}

class GeminiChatSessionWrapper implements AISession {
  constructor(private chat: any) {}
  async sendMessage(text: string, contextInfo?: string, onToken?: (token: string) => void): Promise<string> {
    const messageText = contextInfo ? `${contextInfo}\n\n${text}` : text;
    // Note: Gemini streaming is handled by the underlying chat object usually
    // If onToken is provided, we use the stream method
    if (onToken) {
        const result = await this.chat.sendMessageStream(messageText);
        let fullText = '';
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullText += chunkText;
            onToken(chunkText);
        }
        return fullText;
    } else {
        const result = await this.chat.sendMessage({ message: messageText });
        return result.text;
    }
  }
}

export const AIService = {
  getService(config: LLMConfig) {
    if (config.provider === 'gemini') {
      return GeminiService;
    } else {
      return new LocalLlmService(config);
    }
  },

  async testConnection(config: LLMConfig): Promise<boolean> {
    if (config.provider === 'gemini') {
      if (!config.apiKey || config.apiKey.trim() === '') {
        throw new Error('Gemini API key is required. Please enter your API key in Settings.');
      }
      return GeminiService.testConnection(config.apiKey);
    } else {
      return new LocalLlmService(config).testConnection();
    }
  },

  /**
   * Middleware-style paraphrase with multiple candidates, retry logic, and ranking
   * Implements the Technical PRD specifications:
   * - Mode Intensity (separate from synonyms)
   * - Multiple Candidates (numCandidates 1-8)
   * - Post-processing (Damerau-Levenshtein, HTML diff)
   * - Retry Logic (3× with temperature variation)
   * - Candidate Ranking
   * - Short-circuit for minimal changes
   */
  async paraphraseWithMiddleware(
    config: LLMConfig,
    request: ParaphraseRequest,
    language: string,
    enhancement?: ContextEnhancement
  ): Promise<{ candidates: ParaphraseCandidate[]; shortCircuited: boolean }> {
    const { originalText, mode, modeIntensity, globalSynonymIntensity, extras, customInstruction, numCandidates } = request;
    
    // Short-circuit: If both intensity and synonyms are very low (<=8), return original with optional light polish
    if (modeIntensity <= 8 && globalSynonymIntensity <= 8) {
      return {
        candidates: [{
          paraphrasedText: originalText,
          highlightedDiff: originalText,
          actualChangePct: 0,
          confidence: 1.0,
          tone: 'Neutral'
        }],
        shortCircuited: true
      };
    }

    // Calculate effective synonyms using mode-specific curve
    const effectiveSynonyms = getEffectiveSynonyms(globalSynonymIntensity, mode);
    
    // Get adverb instructions
    const intensityAdverb = getIntensityAdverb(modeIntensity);
    const synonymAdverb = getSynonymAdverb(effectiveSynonyms);
    
    // Build options for API - map correctly to LocalLlmService format
    const apiOptions = {
      phraseFlip: extras.phraseFlip,
      sentenceRestructure: extras.restructure,
      fluency: extras.fluencyBoost,
      sentenceCompression: extras.compress,
      wordLevel: extras.wordLevel
    };
    
    // Custom instruction override
    const finalCustomInstruction = mode === 'Custom' && customInstruction ? customInstruction : undefined;
    
    // Collect candidates
    const candidates: ParaphraseCandidate[] = [];
    const targetNumCandidates = Math.min(Math.max(1, numCandidates), 8);
    
    // Retry configuration
    const maxRetries = 3;
    const temperatures = [0.2, 0.3, 0.4];
    
    for (let i = 0; i < targetNumCandidates; i++) {
      let lastError: Error | null = null;
      
      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          // Vary temperature for different candidates (for diversity)
          const candidateTemp = temperatures[retry % temperatures.length] + (i * 0.05);
          
          // Build intensity instructions
          const fullInstructions = [
            `Apply this style ${intensityAdverb}.`,
            `Use ${synonymAdverb}.`,
            finalCustomInstruction
          ].filter(Boolean).join(' ');
          
          const enhancedEnhancement = enhancement 
            ? { ...enhancement, additionalInstructions: [enhancement.additionalInstructions, fullInstructions].filter(Boolean).join(' ') }
            : buildContextEnhancement(undefined, fullInstructions);
          
          // Make API call with temperature override
          let result: ParaphraseResponse;
          if (config.provider === 'gemini') {
            result = await GeminiService.paraphraseWithTemperature(
              config, originalText, mode, effectiveSynonyms, language, enhancedEnhancement, apiOptions, candidateTemp
            );
          } else {
            const localLlm = new LocalLlmService(config);
            result = await localLlm.paraphraseWithTemperature(
              originalText, mode, language, effectiveSynonyms, enhancedEnhancement, apiOptions, candidateTemp
            );
          }
          
          // Sanitize output
          const sanitizedText = this.sanitizeOutput(result.paraphrasedText);
          const changePct = calculateChangePercentage(originalText, sanitizedText);
          const highlightedDiff = generateHtmlDiff(originalText, sanitizedText);
          
          candidates.push({
            paraphrasedText: sanitizedText,
            highlightedDiff,
            actualChangePct: changePct,
            confidence: result.confidence || 0.9,
            tone: result.tone
          });
          
          break; // Success, move to next candidate
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`Candidate ${i + 1} attempt ${retry + 1} failed:`, lastError.message);
        }
      }
      
      // If all retries failed for this candidate, try fallback to original
      if (candidates.length <= i) {
        if (lastError) {
          console.warn(`All retries failed for candidate ${i + 1}, using fallback`);
        }
        // Add original text as fallback candidate
        candidates.push({
          paraphrasedText: originalText,
          highlightedDiff: originalText,
          actualChangePct: 0,
          confidence: 0.5,
          tone: 'Neutral'
        });
      }
    }
    
    // Rank candidates by penalty score
    const rankedCandidates = rankCandidates(candidates, originalText, effectiveSynonyms, mode);
    
    return { candidates: rankedCandidates, shortCircuited: false };
  },

  /**
   * Sanitize output - remove thinking traces, CoT, markdown, gibberish
   */
  sanitizeOutput(output: string): string {
    if (!output) return '';
    
    let cleaned = output;
    
    // Remove thinking/process patterns
    const thinkPatterns = [
      /Thought(?:s|ing):?\s*/gi,
      /Process(?:ing)?:\s*/gi,
      /Let me (think|analyze|consider)/gi,
      /Step \d+:?\s*/gi,
      /Rationale:?\s*/gi,
      /Reasoning:?\s*/gi,
      /Thinking Process:?[\s\S]*?(?=\n\n|\n\s*\n|{)/gi,
      /Thought Process:?[\s\S]*?(?=\n\n|\n\s*\n|{)/gi,
      /<\|thinking\|>[\s\S]*?<\|end_thinking\|>/gi,
      /<think>[\s\S]*?<\/think>/gi,
      /<think>[\s\S]*?(?={)/gi
    ];
    
    thinkPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });
    
    // Remove markdown code blocks
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
    cleaned = cleaned.replace(/`[^`]+`/g, match => match.replace(/`/g, ''));
    
    // Remove JSON preamble text like "Here's the paraphrased text:"
    cleaned = cleaned.replace(/^(?:Here(?:'s| is)|The following|This is)\s+(?:the\s+)?(?:paraphrased\s+)?(?:text|result|output):\s*/i, '');
    
    // Remove any remaining explanations
    cleaned = cleaned.replace(/^Note:?\s*.*$/gim, '');
    cleaned = cleaned.replace(/^Explanation:?\s*.*$/gim, '');
    cleaned = cleaned.replace(/^Reason:?\s*.*$/gim, '');
    
    // Clean up excessive whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.trim();
    
    return cleaned;
  },

  /**
   * Legacy paraphrase method - backward compatible
   */
  async paraphrase(config: LLMConfig, text: string, mode: ParaphraseMode, synonyms: number, language: string, enhancement?: ContextEnhancement, options?: { phraseFlip?: boolean; sentenceRestructure?: boolean; fluency?: boolean; sentenceCompression?: boolean; wordLevel?: boolean }): Promise<ParaphraseResponse> {
    // Check for common configuration issues
    if (config.provider === 'gemini') {
      if (!config.apiKey || config.apiKey.trim() === '') {
        throw new Error('Gemini API key is required. Please enter your API key in Settings or switch to a local provider.');
      }
      return GeminiService.paraphrase(config, text, mode, synonyms, language, enhancement, options);
    } else {
      return new LocalLlmService(config).paraphrase(text, mode, language, synonyms, enhancement, options);
    }
  },

  async checkGrammar(config: LLMConfig, text: string, patternsHistory: string, language: string, enhancement?: ContextEnhancement): Promise<GrammarCheckResult> {
    if (config.provider === 'gemini') {
      if (!config.apiKey || config.apiKey.trim() === '') {
        throw new Error('Gemini API key is required. Please enter your API key in Settings.');
      }
      return GeminiService.checkGrammar(config, text, patternsHistory, language, enhancement);
    } else {
      return new LocalLlmService(config).checkGrammar(text, patternsHistory, language, enhancement);
    }
  },

  async summarize(config: LLMConfig, text: string, length: SummaryLength, format: SummaryFormat, language: string, enhancement?: ContextEnhancement): Promise<string> {
    if (config.provider === 'gemini') {
      if (!config.apiKey || config.apiKey.trim() === '') {
        throw new Error('Gemini API key is required. Please enter your API key in Settings.');
      }
      return GeminiService.summarize(config, text, length, format, language, enhancement);
    } else {
      return new LocalLlmService(config).summarize(text, length, format, language, enhancement);
    }
  },

  async generateCitation(config: LLMConfig, source: string, style: CitationStyle, language: string, enhancement?: ContextEnhancement): Promise<CitationResponse> {
    if (config.provider === 'gemini') {
      if (!config.apiKey || config.apiKey.trim() === '') {
        throw new Error('Gemini API key is required. Please enter your API key in Settings.');
      }
      return GeminiService.generateCitation(config, source, style, language, enhancement);
    } else {
      return new LocalLlmService(config).generateCitation(source, style, language, enhancement);
    }
  },
  async reasonOverPageIndex(config: LLMConfig, query: string, nodes: PageIndexPromptNode[], language: string, enhancement?: ContextEnhancement, limit = 3) {
    if (!query.trim() || nodes.length === 0) return { nodes: [] };

    if (config.provider === 'gemini') {
      if (!config.apiKey || config.apiKey.trim() === '') {
        throw new Error('Gemini API key is required. Please enter your API key in Settings.');
      }
      return GeminiService.reasonOverPageIndex(config, query, nodes, language, enhancement, limit);
    } else {
      return new LocalLlmService(config).reasonOverPageIndex(query, nodes, language, enhancement, limit);
    }
  },
  createChatSession(config: LLMConfig, language: string, enhancement?: ContextEnhancement, history: ChatMessage[] = []): AISession {
    if (config.provider === 'gemini') {
      if (!config.apiKey || config.apiKey.trim() === '') {
        throw new Error('Gemini API key is required. Please enter your API key in Settings.');
      }
      const session = GeminiService.createChatSession(config, language, enhancement, history);
      return new GeminiChatSessionWrapper(session);
    } else {
      return new LocalChatSession(new LocalLlmService(config), config, language, enhancement, history);
    }
  }
};
