import { LLMConfig, extractJson, ParaphraseResponse, GrammarError, SummaryLength, SummaryFormat, CitationResponse, CitationStyle, ChatMessage, GrammarCheckResult, ContextEnhancement, PageIndexPromptNode, PageIndexSelection, CITATION_STYLES_LIST } from '../utils';
import { shouldUseReasoningPromptsForContext } from '../utils/modelCapabilities';

// --- Prompts (Simplified for generic Llama-3/Mistral instruction following) ---

const PARAPHRASE_SYS_PROMPT = `You are a JSON-only paraphrasing assistant.

CRITICAL: Never include any thinking, reasoning, or chain-of-thought in your output.
Never use \<|thinking|> or similar tokens.
Never write "Thinking Process:" or explain your reasoning.

GUIDELINES:
1. Output must be a single JSON object only
2. No added explanations, no markdown, no additional content
3. Follow this exact pattern: {"paraphrasedText": "text", "tone": "tone", "confidence": 0.9}
4. Start your response directly with the JSON - no preamble

Sample:
User: "Paraphrase: Hello world"
You: {"paraphrasedText": "Greetings, world", "tone": "formal", "confidence": 0.9}

IMPORTANT: Start your response with { and end with }. No thinking or explanations.`;

const ENHANCED_PARAPHRASE_SYS_PROMPT = `You are a JSON-only paraphrasing assistant.

CRITICAL: Never include any thinking, reasoning, or chain-of-thought in your output.
Never write "Thinking Process:" or explain your reasoning.
Do NOT use <|thinking|> or similar tokens.

GUIDELINES:
1. Output MUST be a single JSON object only.
2. Start your response IMMEDIATELY with { - never include any preamble.
3. End your response IMMEDIATELY with } - never include any trailing text.
4. Follow this pattern exactly: {"paraphrasedText": "text", "tone": "tone", "confidence": 0.9}

IMPORTANT: Provide ONLY the JSON object. Failure to do so will break the system.`;

const GRAMMAR_SYS_PROMPT = `You are a grammar and style checker. 
CRITICAL: You MUST respond with ONLY valid JSON.
Never include thinking traces, preamble, or markdown.
Start your response with { and end with }.

JSON FORMAT:
{
  "errors": [{"id": "1", "original": "error text", "suggestion": "corrected text", "reason": "explanation", "type": "grammar", "context": "surrounding sentence"}],
  "forecast": ["Future writing tip 1", "Future writing tip 2"]
}

If no errors found, use "errors": [].`;

const ENHANCED_GRAMMAR_SYS_PROMPT = `You are a grammar and style checker with advanced analytical capabilities.

CRITICAL: You MUST respond with ONLY valid JSON.
Never include "Thinking Process", "Analyze the Request", or any other preamble.
Never use markdown code blocks unless the JSON is inside them.
Never use <think> or similar tokens.

SYSTEMATIC ANALYSIS (INTERNAL ONLY):
1. Read the text for comprehension and context
2. Identify grammar, spelling, and style issues systematically
3. Evaluate severity and contextual appropriateness
4. Consider writer's intent and audience
5. Analyze patterns for future improvement predictions

JSON FORMAT:
{
  "errors": [{"id": "1", "original": "error text", "suggestion": "corrected text", "reason": "explanation", "type": "grammar", "context": "surrounding sentence"}],
  "forecast": ["Pattern-based tip 1", "Improvement suggestion 2"]
}

IMPORTANT: Start your response directly with { and end with }. No other text.`;

const CITATION_STYLES_TEXT = CITATION_STYLES_LIST.join(', ');

const CITATION_SYS_PROMPT = `You are a citation generator.
CRITICAL: You MUST respond with ONLY valid JSON.
Never include thinking traces or preamble.
Start your response with { and end with }.

JSON FORMAT:
{"formatted_citation": "complete citation", "bibtex": "bibtex entry", "components": {"author": "author name", "date": "publication date", "title": "title", "source": "journal/publisher", "doi_or_url": "doi or url"}}

Supported styles: ${CITATION_STYLES_TEXT}`;

const ENHANCED_CITATION_SYS_PROMPT = `You are a citation generator with advanced analytical capabilities.

CRITICAL: You MUST respond with ONLY valid JSON.
Never include "Thinking Process", "Analyze the Request", or any other internal reasoning.
Never use <think> or similar tokens.
Start your response with { and end with }.

SYSTEMATIC CITATION PROCESS (INTERNAL ONLY):
1. Analyze the source information provided
2. Identify the source type and appropriate format
3. Extract bibliographic elements systematically
4. Apply citation style rules with precision
5. Verify formatting accuracy and completeness

JSON FORMAT:
{"formatted_citation": "complete citation", "bibtex": "bibtex entry", "components": {"author": "author name", "date": "publication date", "title": "title", "source": "journal/publisher", "doi_or_url": "doi or url"}}

Supported styles: ${CITATION_STYLES_TEXT}`;

export class LocalLlmService {
  constructor(private config: LLMConfig) {}

  /**
   * Paraphrase with temperature control (for middleware with multiple candidates)
   */
  async paraphraseWithTemperature(
    text: string,
    mode: string,
    language: string = 'English',
    synonyms: number = 50,
    enhancement?: ContextEnhancement,
    options?: { phraseFlip?: boolean; sentenceRestructure?: boolean; fluency?: boolean; sentenceCompression?: boolean; wordLevel?: boolean },
    temperature: number = 0.5
  ): Promise<ParaphraseResponse> {
    // Build mode-specific instructions with intensity awareness
    let modeInstruction = '';
    const modeLower = mode.toLowerCase();
    
    switch (modeLower) {
      case 'standard':
        modeInstruction = 'Rewrite this text with balanced rewording, maintaining the original meaning and tone.';
        break;
      case 'fluency':
        modeInstruction = 'Improve the flow, rhythm, and grammatical smoothness while rewording.';
        break;
      case 'humanize':
        modeInstruction = 'Make the text sound more natural, emotional, conversational, and human-like.';
        break;
      case 'formal':
        modeInstruction = 'Use sophisticated vocabulary, avoid contractions, and maintain a professional tone.';
        break;
      case 'academic':
        modeInstruction = 'Use scholarly tone, precise terminology, and objective voice appropriate for academic writing.';
        break;
      case 'simple':
        modeInstruction = 'Use plain language, shorter sentences, accessible vocabulary for general audience.';
        break;
      case 'creative':
        modeInstruction = 'Use evocative language, varied sentence structure, be expressive and creative.';
        break;
      case 'expand':
        modeInstruction = 'Add relevant details, context, and depth to expand on the original meaning without redundancy.';
        break;
      case 'shorten':
        modeInstruction = 'Condense the text to convey the same meaning in fewer words while preserving essential information.';
        break;
      case 'custom':
        modeInstruction = 'Follow the custom instructions provided.';
        break;
      default:
        modeInstruction = 'Rewrite this text appropriately.';
    }

    const optionInstructions = this.getOptionInstructions(options);
    
    // Map synonyms level to creativity instruction
    let creativityInstruction = '';
    if (synonyms <= 25) {
      creativityInstruction = 'Use minimal word changes, stay very close to original phrasing and structure.';
    } else if (synonyms <= 50) {
      creativityInstruction = 'Use moderate word substitutions and some sentence restructuring.';
    } else if (synonyms <= 75) {
      creativityInstruction = 'Use creative word choices, varied sentence structures, and expressive language.';
    } else {
      creativityInstruction = 'Use highly creative language, extensive vocabulary variation, and diverse sentence patterns. Be bold with changes.';
    }

    // Include any additional instructions from enhancement
    const additionalText = enhancement?.additionalInstructions || '';
    const prompt = `${modeInstruction} ${creativityInstruction}${optionInstructions}${additionalText ? ` ${additionalText}` : ''} Output in ${language}. Text: "${text}"`;
    
    const useReasoning = shouldUseReasoningPromptsForContext(this.config.modelName, this.config.contextLimit);
    const systemPrompt = useReasoning ? ENHANCED_PARAPHRASE_SYS_PROMPT : PARAPHRASE_SYS_PROMPT;

    try {
      // Call with temperature parameter for diversity in candidates
      const response = await this.generateWithTemp(prompt, systemPrompt, true, temperature);
      const cleanResponse = response.trim();
      const result = extractJson(cleanResponse);
      
      if (!result.paraphrasedText) {
        throw new Error('Response missing paraphrasedText field');
      }
      
      return {
        paraphrasedText: result.paraphrasedText,
        tone: result.tone || 'Neutral',
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.8
      };
    } catch (error) {
      console.error('Paraphrase with temperature error in LocalLlmService:', error);
      throw error;
    }
  }

  // Internal method to generate with custom temperature
  private async generateWithTemp(prompt: string, system: string, jsonMode: boolean = false, temperature: number = 0.5): Promise<string> {
    if (this.config.provider === 'ollama') {
      return this.fetchOllamaWithTemp(prompt, system, jsonMode, temperature);
    } else {
      return this.fetchOpenAICompatWithTemp(prompt, system, jsonMode, temperature);
    }
  }

  private async fetchOllamaWithTemp(prompt: string, system: string, jsonMode: boolean = false, temperature: number = 0.5): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    try {
      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.modelName,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt }
          ],
          stream: false,
          format: jsonMode ? 'json' : undefined,
          options: {
            temperature: temperature,
            num_ctx: this.config.contextLimit,
            num_predict: this.config.maxCompletionTokens // Added max_tokens for Ollama
          }
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Ollama API returned ${response.status}: ${response.statusText}`);
      const data = await response.json();
      return data.message.content;
    } catch (error) {
      clearTimeout(timeoutId);
      await this.handleFetchError(error);
      return "";
    }
  }

  private async fetchOpenAICompatWithTemp(prompt: string, system: string, jsonMode: boolean = false, temperature: number = 0.5): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    try {
      let modelName = this.config.modelName;
      if (modelName === 'local-model') {
        try {
          const modelsResponse = await fetch(`${this.config.baseUrl}/v1/models`);
          if (modelsResponse.ok) {
            const modelsData = await modelsResponse.json();
            if (modelsData.data && modelsData.data.length > 0) {
              modelName = modelsData.data[0].id;
            }
          }
        } catch (e) {
          console.warn('Could not fetch available models, using configured model name');
        }
      }

      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt }
          ],
          temperature: temperature,
          max_tokens: this.config.maxCompletionTokens, // Replaced hardcoded value
          stream: false
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Local Server returned ${response.status}: ${response.statusText}. Response: ${errorText}`);
      }
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      clearTimeout(timeoutId);
      await this.handleFetchError(error);
      return "";
    }
  }

  /**
   * Paraphrase with options (for middleware)
   */
  async paraphraseWithOptions(
    text: string,
    mode: string,
    language: string = 'English',
    synonyms: number = 50,
    enhancement?: ContextEnhancement,
    options?: { phraseFlip?: boolean; sentenceRestructure?: boolean; fluency?: boolean; sentenceCompression?: boolean; wordLevel?: boolean }
  ): Promise<ParaphraseResponse> {
    // Build mode-specific instructions
    let modeInstruction = '';
    switch (mode) {
      case 'Standard':
        modeInstruction = 'Rewrite this text with balanced rewording, maintaining the original meaning.';
        break;
      case 'Fluency':
        modeInstruction = 'Improve the flow and fix any grammatical awkwardness while rewording.';
        break;
      case 'Humanize':
        modeInstruction = 'Make the text sound more natural, emotional, and conversational.';
        break;
      case 'Formal':
        modeInstruction = 'Use sophisticated vocabulary, avoid contractions, and maintain a professional tone.';
        break;
      case 'Academic':
        modeInstruction = 'Use scholarly tone, precise terminology, and objective voice.';
        break;
      case 'Simple':
        modeInstruction = 'Use plain language, shorter sentences, accessible to general audience.';
        break;
      case 'Creative':
        modeInstruction = 'Use evocative language, vary sentence structure, and be expressive.';
        break;
      case 'Expand':
        modeInstruction = 'Increase length by adding relevant details and depth without fluff.';
        break;
      case 'Shorten':
        modeInstruction = 'Concisely convey the meaning in fewer words.';
        break;
      default:
        modeInstruction = 'Rewrite this text with appropriate rewording.';
    }

    const optionInstructions = this.getOptionInstructions(options);
    
    let creativityInstruction = '';
    if (synonyms <= 25) {
      creativityInstruction = 'Use minimal word changes, stay very close to original phrasing.';
    } else if (synonyms <= 50) {
      creativityInstruction = 'Use moderate word substitutions and some sentence restructuring.';
    } else if (synonyms <= 75) {
      creativityInstruction = 'Use creative word choices and varied sentence structures.';
    } else {
      creativityInstruction = 'Use highly creative language, extensive vocabulary variation, and diverse sentence patterns.';
    }

    const prompt = `${modeInstruction} ${creativityInstruction}${optionInstructions} Output in ${language}. Text: "${text}"`;
    
    const useReasoning = shouldUseReasoningPromptsForContext(this.config.modelName, this.config.contextLimit);
    const systemPrompt = useReasoning ? ENHANCED_PARAPHRASE_SYS_PROMPT : PARAPHRASE_SYS_PROMPT;
    
    try {
      const response = await this.generate(prompt, systemPrompt, true);
      const cleanResponse = response.trim();
      const result = extractJson(cleanResponse);
      
      if (!result.paraphrasedText) {
        throw new Error('Response missing paraphrasedText field');
      }
      
      return {
        paraphrasedText: result.paraphrasedText,
        tone: result.tone || 'Neutral',
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.8
      };
    } catch (error) {
      console.error('Paraphrase with options error in LocalLlmService:', error);
      throw error;
    }
  }

  private getFetchOptions(body: any, jsonMode: boolean, signal?: AbortSignal) {
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    };
  }

  private async handleFetchError(error: any) {
    let msg = error.message;
    if (error.name === 'AbortError') {
      msg = "Request timed out (300s). The local model is taking too long to respond. Try:\n" +
            "• Use a smaller/faster model\n" +
            "• Reduce conversation history\n" +
            "• For LM Studio: Ensure model is loaded and GPU acceleration is enabled\n" +
            "• For Ollama: Check if model is running with 'ollama list'";
    } else if (msg === 'Failed to fetch') {
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      if (isHttps && this.config.baseUrl.includes('http://')) {
        msg = "Mixed Content Error: Cannot connect to local HTTP server from HTTPS. Please run this app locally (http://localhost:3000) or use a tunneling service (ngrok).";
      } else {
        msg = "Connection refused. Ensure the local server is running and CORS is enabled (Ollama: `OLLAMA_ORIGINS='*'`).";
      }
    } else if (msg.includes('400')) {
      msg = `Bad Request (400): Check model name and parameters. Current model: ${this.config.modelName}. Ensure this model is loaded in LM Studio.`;
    }
    console.error("Local LLM Error:", msg);
    throw new Error(msg);
  }

  private async fetchOllama(prompt: string, system: string, jsonMode: boolean = false): Promise<string> {
    const controller = new AbortController();
    // Long timeout for generation (300s)
    const timeoutId = setTimeout(() => controller.abort(), 300000); 

    try {
      const response = await fetch(`${this.config.baseUrl}/api/chat`, this.getFetchOptions({
        model: this.config.modelName,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ],
        stream: false,
        format: jsonMode ? 'json' : undefined,
        options: {
          temperature: 0.3,
          num_ctx: this.config.contextLimit,
          num_predict: this.config.maxCompletionTokens // Added max_tokens for Ollama
        }
      }, jsonMode, controller.signal));
      
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Ollama API returned ${response.status}: ${response.statusText}`);
      const data = await response.json();
      return data.message.content;
    } catch (error) {
      clearTimeout(timeoutId);
      await this.handleFetchError(error);
      return ""; // Unreachable but satisfies TS
    }
  }

  private async fetchOpenAICompat(messages: any[], jsonMode: boolean = false): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    try {
      // If using default 'local-model', try to get the first available model
      let modelName = this.config.modelName;
      if (modelName === 'local-model') {
        try {
          const modelsResponse = await fetch(`${this.config.baseUrl}/v1/models`);
          if (modelsResponse.ok) {
            const modelsData = await modelsResponse.json();
            if (modelsData.data && modelsData.data.length > 0) {
              modelName = modelsData.data[0].id;
              console.log(`Using first available model: ${modelName}`);
            }
          }
        } catch (e) {
          console.warn('Could not fetch available models, using configured model name');
        }
      }

      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, this.getFetchOptions({
        model: modelName,
        messages: messages,
        temperature: 0.3,
        max_tokens: this.config.maxCompletionTokens, // Replaced hardcoded value
        stream: false
      }, jsonMode, controller.signal));
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Local Server returned ${response.status}: ${response.statusText}. Response: ${errorText}`);
      }
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      clearTimeout(timeoutId);
      await this.handleFetchError(error);
      return "";
    }
  }

  private async generate(prompt: string, system: string, jsonMode: boolean = false): Promise<string> {
    if (this.config.provider === 'ollama') {
      return this.fetchOllama(prompt, system, jsonMode);
    } else {
      // LM Studio / OpenAI Compat
      return this.fetchOpenAICompat([
        { role: "system", content: system },
        { role: "user", content: prompt }
      ], jsonMode);
    }
  }

  async testConnection(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // Short timeout for ping

    try {
      let url = '';
      if (this.config.provider === 'ollama') {
        // Ollama tags endpoint to check if server is up
        url = `${this.config.baseUrl}/api/tags`; 
      } else {
        // LM Studio / OpenAI compat models endpoint
        url = `${this.config.baseUrl}/v1/models`;
      }
      
      const response = await fetch(url, { 
        method: 'GET',
        signal: controller.signal 
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error(`Server returned ${response.status} ${response.statusText}`);
      
      // We could check if the specific model exists in the list, but for now simple connectivity is enough
      return true;
    } catch (error) {
      clearTimeout(timeoutId);
      await this.handleFetchError(error);
      return false;
    }
  }

  // Get QuillBot-style option instructions for local LLMs
  private getOptionInstructions(options?: { phraseFlip?: boolean; sentenceRestructure?: boolean; fluency?: boolean; sentenceCompression?: boolean; wordLevel?: boolean }): string {
    if (!options) return '';
    const instructions: string[] = [];
    
    if (options.phraseFlip) {
      instructions.push('Also flip parallel structures like "not only X but also Y" to "Y as well as X".');
    }
    if (options.sentenceRestructure) {
      instructions.push('Also change word order and sentence structure while preserving meaning.');
    }
    if (options.fluency) {
      instructions.push('Also improve grammatical accuracy and natural flow.');
    }
    if (options.sentenceCompression) {
      instructions.push('Also remove redundant words and condense sentences.');
    }
    if (options.wordLevel) {
      instructions.push('Also focus on word-level substitutions with appropriate synonyms.');
    }
    
    return instructions.length > 0 ? ` ${instructions.join(' ')}` : '';
  }

  async paraphrase(text: string, mode: string, language: string = 'English', synonyms: number = 50, enhancement?: ContextEnhancement, options?: { phraseFlip?: boolean; sentenceRestructure?: boolean; fluency?: boolean; sentenceCompression?: boolean; wordLevel?: boolean }): Promise<ParaphraseResponse> {
    // Build mode-specific instructions
    let modeInstruction = '';
    switch (mode) {
      case 'Standard':
        modeInstruction = 'Rewrite this text with balanced rewording, maintaining the original meaning.';
        break;
      case 'Fluency':
        modeInstruction = 'Improve the flow and fix any grammatical awkwardness while rewording.';
        break;
      case 'Humanize':
        modeInstruction = 'Make the text sound more natural, emotional, and conversational.';
        break;
      case 'Formal':
        modeInstruction = 'Use sophisticated vocabulary, avoid contractions, and maintain a professional tone.';
        break;
      case 'Academic':
        modeInstruction = 'Use scholarly tone, precise terminology, and objective voice.';
        break;
      case 'Simple':
        modeInstruction = 'Use plain language, shorter sentences, accessible to general audience.';
        break;
      case 'Creative':
        modeInstruction = 'Use evocative language, vary sentence structure, and be expressive.';
        break;
      case 'Expand':
        modeInstruction = 'Increase length by adding relevant details and depth without fluff.';
        break;
      case 'Shorten':
        modeInstruction = 'Concisely convey the meaning in fewer words.';
        break;
      case 'Custom':
      default:
        modeInstruction = 'Rewrite this text with appropriate rewording.';
        break;
    }

    // Add QuillBot-style option instructions
    const optionInstructions = this.getOptionInstructions(options);

    // Map synonyms level (0-100) to creativity instruction
    let creativityInstruction = '';
    if (synonyms <= 25) {
      creativityInstruction = 'Use minimal word changes, stay very close to original phrasing.';
    } else if (synonyms <= 50) {
      creativityInstruction = 'Use moderate word substitutions and some sentence restructuring.';
    } else if (synonyms <= 75) {
      creativityInstruction = 'Use creative word choices and varied sentence structures.';
    } else {
      creativityInstruction = 'Use highly creative language, extensive vocabulary variation, and diverse sentence patterns.';
    }

    const prompt = `${modeInstruction} ${creativityInstruction}${optionInstructions} Output in ${language}. Text: "${text}"`;
    
    // Check if model supports reasoning
    const useReasoning = shouldUseReasoningPromptsForContext(this.config.modelName, this.config.contextLimit);
    const systemPrompt = useReasoning ? ENHANCED_PARAPHRASE_SYS_PROMPT : PARAPHRASE_SYS_PROMPT;
    
    try {
      const response = await this.generate(prompt, systemPrompt, true);
      
      // Clean the response (remove any extra whitespace)
      const cleanResponse = response.trim();
      
      const result = extractJson(cleanResponse);
      
      // Validate the result has required fields
      if (!result.paraphrasedText) {
        throw new Error('Response missing paraphrasedText field');
      }
      
      return {
        paraphrasedText: result.paraphrasedText,
        tone: result.tone || 'Neutral',
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.8
      };
    } catch (error) {
      console.error('Paraphrase error in LocalLlmService:', error);
      
      // If it's a JSON parsing error, try a simple fallback
      if (error instanceof Error && error.message.includes('JSON')) {
        // Try to create a simple paraphrase as fallback
        const fallbackText = text.replace(/\b\w+\b/g, (word) => {
          const synonyms: { [key: string]: string } = {
            'hello': 'greetings',
            'world': 'universe',
            'quick': 'fast',
            'brown': 'tan',
            'fox': 'animal',
            'jumps': 'leaps',
            'over': 'above',
            'lazy': 'idle',
            'dog': 'canine'
          };
          return synonyms[word.toLowerCase()] || word;
        });
        
        return {
          paraphrasedText: fallbackText,
          tone: "Neutral",
          confidence: 0.5
        };
      }
      
      // Return error response for other errors
      return {
        paraphrasedText: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        tone: "Error",
        confidence: 0
      };
    }
  }

  async checkGrammar(text: string, history: string = '', language: string = 'English', enhancement?: ContextEnhancement): Promise<GrammarCheckResult> {
    const prompt = `Check this text for grammar errors. Explain reasons in ${language}.
    Current Text: "${text}"
    Reference/History Patterns: "${history}"
    
    Provide 'errors' and 'forecast' (predicting future mistakes based on this history/pattern).`;
    
    const useReasoning = shouldUseReasoningPromptsForContext(this.config.modelName, this.config.contextLimit);
    const systemPrompt = useReasoning ? ENHANCED_GRAMMAR_SYS_PROMPT : GRAMMAR_SYS_PROMPT;
    
    const response = await this.generate(prompt, systemPrompt, true);
    const result = extractJson(response);
    
    const errors = Array.isArray(result.errors) 
      ? result.errors.map((e: any) => ({ ...e, id: e.id || Math.random().toString(36).substr(2) })) 
      : [];
      
    const forecast = Array.isArray(result.forecast) ? result.forecast : [];

    return { errors, forecast };
  }

  async summarize(text: string, length: SummaryLength, format: SummaryFormat, language: string = 'English', enhancement?: ContextEnhancement): Promise<string> {
    const prompt = `Summarize this text in ${language}. Length: ${length}. Format: ${format}. 
    
    TEXT TO SUMMARIZE:
    "${text}"`;
    
    const useReasoning = shouldUseReasoningPromptsForContext(this.config.modelName, this.config.contextLimit);
    const system = useReasoning ? 
      `You are a summarization expert. 
      
      CRITICAL: You MUST return ONLY the summary content.
      Never include "Thinking Process", "Analyze the Request", or any other internal reasoning steps.
      Never use <|thinking|> tokens.
      Do not include any chat preamble or meta-commentary.
      
      SYSTEMATIC PROCESS (INTERNAL ONLY):
      1. Read and comprehend the full text thoroughly
      2. Identify main themes and key arguments
      3. Determine hierarchical importance of information
      4. Structure the summary for clarity and usefulness
      
      OUTPUT FORMAT:
      Return the final summary directly in ${format} format using ${language}.` :
      "You are a helpful summarizer. Return the summary directly without any preamble or thinking traces.";
      
    return await this.generate(prompt, system, false);
  }

  async generateCitation(sourceInfo: string, style: CitationStyle, language: string = 'English', enhancement?: ContextEnhancement): Promise<CitationResponse> {
    const prompt = `Create a ${style} citation for: "${sourceInfo}". Ensure explanations or extracted components are in ${language}.`;
    
    const useReasoning = shouldUseReasoningPromptsForContext(this.config.modelName, this.config.contextLimit);
    const systemPrompt = useReasoning ? ENHANCED_CITATION_SYS_PROMPT : CITATION_SYS_PROMPT;
    
    const response = await this.generate(prompt, systemPrompt, true);
    return extractJson(response);
  }

  // Simple chat wrapper
  async chat(history: ChatMessage[], newMessage: string, language: string = 'English', enhancement?: ContextEnhancement, images?: string[]): Promise<string> {
    const useReasoning = shouldUseReasoningPromptsForContext(this.config.modelName, this.config.contextLimit);
    
    const system = useReasoning ? 
      `You are Wrytica Assistant, a world-class financial analysis and document drafting expert. 
      You are running Qwen 3.5 (9B) at a production level.
      
      PRODUCTION GUIDELINES:
      1. Provide authoritative, precise, and professional responses.
      2. If RAG context (references) is provided, you MUST use it to ground your answers.
      3. Use markdown for structure (tables, bolded terms, lists).
      4. Avoid fluff and preamble.
      5. If the user asks for a memo or report, follow formal business standards.
      
      REASONING PROCESS:
      Analyze the provided financial context, identify key risks/opportunities, and synthesize a coherent answer.
      
      Reply in ${language}.` :
      `You are a professional writing assistant. Be precise, concise, and helpful. Reply in ${language}.`;
    
    // Build multi-modal message if images are provided
    const userMessageContent: any = images && images.length > 0 
      ? [
          { type: 'text', text: newMessage },
          ...images.map(img => ({
            type: 'image_url',
            image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}` }
          }))
        ]
      : newMessage;

    if (this.config.provider === 'ollama') {
       const controller = new AbortController();
       const timeoutId = setTimeout(() => controller.abort(), 300000);
       try {
        const response = await fetch(`${this.config.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.config.modelName,
            messages: [
               { role: 'system', content: system },
               ...history.map(m => ({ role: m.role, content: m.content })),
               { role: 'user', content: newMessage, images: images } // Ollama uses top-level images array
            ],
            stream: false,
            options: {
              num_predict: this.config.maxCompletionTokens
            }
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Ollama returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.message.content;
      } catch (e) {
        clearTimeout(timeoutId);
        await this.handleFetchError(e);
        return "";
      }
    } else {
      // LM Studio - OpenAI compatibility
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);
      
      try {
        const msgs = [
          { role: 'system', content: system },
          ...history.map(m => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content })),
          { role: 'user', content: userMessageContent }
        ];
        
        const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.config.modelName,
            messages: msgs,
            temperature: 0.3,
            max_tokens: this.config.maxCompletionTokens,
            stream: false
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`LM Studio returned ${response.status}: ${response.statusText}. ${errorText}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
      } catch (error) {
        clearTimeout(timeoutId);
        await this.handleFetchError(error);
        return "";
      }
    }
  }

  // Streaming Chat implementation
  async chatStream(history: ChatMessage[], newMessage: string, onToken: (token: string) => void, language: string = 'English', enhancement?: ContextEnhancement, images?: string[]): Promise<string> {
    const useReasoning = shouldUseReasoningPromptsForContext(this.config.modelName, this.config.contextLimit);
    
    const system = useReasoning ? 
      `You are Wrytica Assistant, a world-class financial analysis and document drafting expert. 
      You are running Qwen 3.5 (9B) at a production level. 
      Analyze the provided financial context and synthesize a coherent answer. Reply in ${language}.` :
      `You are a professional writing assistant. Be precise, concise, and helpful. Reply in ${language}.`;
    
    const userMessageContent: any = images && images.length > 0 
      ? [
          { type: 'text', text: newMessage },
          ...images.map(img => ({
            type: 'image_url',
            image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}` }
          }))
        ]
      : newMessage;

    const messages = [
      { role: 'system', content: system },
      ...history.map(m => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content })),
      { role: 'user', content: userMessageContent }
    ];

    if (this.config.provider === 'ollama') {
      // Ollama streaming with images
      const ollamaMessages = [
        { role: 'system', content: system },
        ...history.map(m => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content })),
        { role: 'user', content: newMessage, images: images }
      ];
      return this.streamOllama(ollamaMessages, onToken);
    } else {
      return this.streamOpenAICompat(messages, onToken);
    }
  }

  private async streamOllama(messages: any[], onToken: (token: string) => void): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.modelName,
        messages,
        stream: true,
        options: { 
          num_ctx: this.config.contextLimit,
          num_predict: this.config.maxCompletionTokens
        }
      })
    });

    if (!response.ok) throw new Error(`Ollama Stream error: ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is null');

    let fullText = '';
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            const token = data.message.content;
            fullText += token;
            onToken(token);
          }
          if (data.done) break;
        } catch (e) {
          console.warn('Failed to parse Ollama chunk', e, line);
        }
      }
    }
    return fullText;
  }

  private async streamOpenAICompat(messages: any[], onToken: (token: string) => void): Promise<string> {
    const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.modelName,
        messages,
        stream: true,
        temperature: 0.3,
        max_tokens: this.config.maxCompletionTokens
      })
    });

    if (!response.ok) throw new Error(`Local Server Stream error: ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is null');

    let fullText = '';
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
        
        const dataStr = trimmedLine.replace('data: ', '').trim();
        if (dataStr === '[DONE]') break;
        
        try {
          const data = JSON.parse(dataStr);
          const token = data.choices[0]?.delta?.content || '';
          if (token) {
            fullText += token;
            onToken(token);
          }
        } catch (e) {
          // Silent catch for partial JSON chunks
        }
      }
    }
    return fullText;
  }

  async reasonOverPageIndex(query: string, nodes: PageIndexPromptNode[], language: string = 'English', enhancement?: ContextEnhancement, limit = 3): Promise<{ nodes: PageIndexSelection[]; thinking?: string }> {
    if (!query.trim() || nodes.length === 0) return { nodes: [] };

    const useReasoning = shouldUseReasoningPromptsForContext(this.config.modelName, this.config.contextLimit);
    const systemPrompt = useReasoning
      ? `You are a reasoning node scorer. Analyze the query and the candidate nodes carefully.
1. Understand the user's need behind the query.
2. Evaluate each node's content, summary, title, and context for relevance.
3. Rank the nodes by how well they contain the answer, cite the page number, and explain why.
4. Return JSON with a 'nodes' array where each entry includes nodeId, rank, and reason.
Respond only in ${language}.`
      : `You are a node scorer. Return JSON with a 'nodes' array containing nodeId, rank, and reason for the most relevant nodes. Respond in ${language}.`;

    const candidateBlock = nodes.map((node, index) => {
      const snippet = (node.summary || node.content || '').replace(/\s+/g, ' ').trim().slice(0, 400);
      return [
        `Node ${index + 1}`,
        `ID: ${node.nodeId}`,
        `Document: ${node.docTitle}`,
        `Page: ${node.pageNumber ?? 'n/a'}`,
        `Title: ${node.title}`,
        `Summary: ${node.summary || 'N/A'}`,
        `Content Extract: ${snippet || 'No extract provided'}`
      ].join('\n');
    }).join('\n\n');

    const prompt = `Query: ${query}\nLimit: ${limit} nodes\nCandidates:\n${candidateBlock}\nReturn JSON with 'nodes' array.`;

    try {
      const response = await this.generate(prompt, systemPrompt, true);
      const payload = extractJson(response);
      const entries = Array.isArray(payload.nodes) ? payload.nodes : [];
      const resultNodes = entries.slice(0, limit).map((entry: any, index: number) => ({
        nodeId: entry.nodeId,
        reason: entry.reason || '',
        rank: typeof entry.rank === 'number' ? entry.rank : index + 1
      }));
      return { nodes: resultNodes, thinking: typeof payload.thinking === 'string' ? payload.thinking : undefined };
    } catch (error) {
      console.error("Local PageIndex reasoning error:", error);
      return { nodes: [] };
    }
  }
}
