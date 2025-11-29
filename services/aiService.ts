import { GeminiService } from './geminiService';
import { LocalLlmService } from './localLlmService';
import { LLMConfig, ParaphraseMode, ParaphraseResponse, GrammarError, SummaryLength, SummaryFormat, CitationStyle, CitationResponse, ChatMessage, GrammarCheckResult } from '../utils';

// Abstract Chat Interface
export interface AISession {
  sendMessage(text: string): Promise<string>;
}

class LocalChatSession implements AISession {
  private history: ChatMessage[] = [];
  
  constructor(private service: LocalLlmService, private language: string) {}

  async sendMessage(text: string): Promise<string> {
    const response = await this.service.chat(this.history, text, this.language);
    this.history.push({ role: 'user', content: text, timestamp: Date.now() });
    this.history.push({ role: 'model', content: response, timestamp: Date.now() });
    return response;
  }
}

class GeminiChatSessionWrapper implements AISession {
  constructor(private chat: any) {}
  async sendMessage(text: string): Promise<string> {
    const result = await this.chat.sendMessage({ message: text });
    return result.text;
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

  async paraphrase(config: LLMConfig, text: string, mode: ParaphraseMode, synonyms: number, language: string): Promise<ParaphraseResponse> {
    // Check for common configuration issues
    if (config.provider === 'gemini') {
      if (!config.apiKey || config.apiKey.trim() === '') {
        throw new Error('Gemini API key is required. Please enter your API key in Settings or switch to a local provider.');
      }
      return GeminiService.paraphrase(config.apiKey, text, mode, synonyms, language);
    } else {
      return new LocalLlmService(config).paraphrase(text, mode, language, synonyms);
    }
  },

  async checkGrammar(config: LLMConfig, text: string, patternsHistory: string, language: string): Promise<GrammarCheckResult> {
    if (config.provider === 'gemini') {
      if (!config.apiKey || config.apiKey.trim() === '') {
        throw new Error('Gemini API key is required. Please enter your API key in Settings.');
      }
      return GeminiService.checkGrammar(config.apiKey, text, patternsHistory, language);
    } else {
      return new LocalLlmService(config).checkGrammar(text, patternsHistory, language);
    }
  },

  async summarize(config: LLMConfig, text: string, length: SummaryLength, format: SummaryFormat, language: string): Promise<string> {
    if (config.provider === 'gemini') {
      if (!config.apiKey || config.apiKey.trim() === '') {
        throw new Error('Gemini API key is required. Please enter your API key in Settings.');
      }
      return GeminiService.summarize(config.apiKey, text, length, format, language);
    } else {
      return new LocalLlmService(config).summarize(text, length, format, language);
    }
  },

  async generateCitation(config: LLMConfig, source: string, style: CitationStyle, language: string): Promise<CitationResponse> {
    if (config.provider === 'gemini') {
      if (!config.apiKey || config.apiKey.trim() === '') {
        throw new Error('Gemini API key is required. Please enter your API key in Settings.');
      }
      return GeminiService.generateCitation(config.apiKey, source, style, language);
    } else {
      return new LocalLlmService(config).generateCitation(source, style, language);
    }
  },

  createChatSession(config: LLMConfig, language: string): AISession {
    if (config.provider === 'gemini') {
      if (!config.apiKey || config.apiKey.trim() === '') {
        throw new Error('Gemini API key is required. Please enter your API key in Settings.');
      }
      const session = GeminiService.createChatSession(config.apiKey, language);
      return new GeminiChatSessionWrapper(session);
    } else {
      return new LocalChatSession(new LocalLlmService(config), language);
    }
  }
};
