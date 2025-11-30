import { LLMConfig, extractJson, ParaphraseResponse, GrammarError, SummaryLength, SummaryFormat, CitationResponse, CitationStyle, ChatMessage, GrammarCheckResult } from '../utils';
import { detectModelCapabilities, shouldUseReasoningPrompts } from '../utils/modelCapabilities';

// --- Prompts (Simplified for generic Llama-3/Mistral instruction following) ---

const PARAPHRASE_SYS_PROMPT = `You are a JSON-only paraphrasing assistant.

GUIDELINES:
1. Output must be a single JSON object only
2. No added explanations, no markdown, no additional content
3. Follow this exact pattern: {"paraphrasedText": "text", "tone": "tone", "confidence": 0.9}

Sample:
User: "Paraphrase: Hello world"
You: {"paraphrasedText": "Greetings, world", "tone": "formal", "confidence": 0.9}

IMPORTANT: Ensure the whole reply is valid and directly parseable JSON.`;

const ENHANCED_PARAPHRASE_SYS_PROMPT = `You are a JSON-only paraphrasing assistant with reasoning capabilities.

REASONING PROCESS - Think through these steps first:
1. Analyze the original text's meaning, tone, and structure
2. Understand the target style and creativity requirements
3. Plan your paraphrasing approach
4. Generate the paraphrased version
5. Evaluate for accuracy and style compliance

GUIDELINES:
1. Output must be a single JSON object only
2. No added explanations, no markdown, no additional content
3. Follow this exact pattern: {"paraphrasedText": "text", "tone": "tone", "confidence": 0.9}

IMPORTANT: After your thinking process, provide ONLY the JSON object.`;

const GRAMMAR_SYS_PROMPT = `You are a grammar and style checker. 
CRITICAL: You MUST respond with ONLY valid JSON in this exact format:
{
  "errors": [{"id": "1", "original": "error text", "suggestion": "corrected text", "reason": "explanation", "type": "grammar", "context": "surrounding sentence"}],
  "forecast": ["Future writing tip 1", "Future writing tip 2"]
}

Do not include any other text, explanations, or markdown. Just the JSON object.
If no errors found, use "errors": [].`;

const ENHANCED_GRAMMAR_SYS_PROMPT = `You are a grammar and style checker with advanced analytical capabilities.

SYSTEMATIC ANALYSIS - Think through these steps:
1. Read the text for comprehension and context
2. Identify grammar, spelling, and style issues systematically
3. Evaluate severity and contextual appropriateness
4. Consider writer's intent and audience
5. Analyze patterns for future improvement predictions

CRITICAL: You MUST respond with ONLY valid JSON in this exact format:
{
  "errors": [{"id": "1", "original": "error text", "suggestion": "corrected text", "reason": "explanation", "type": "grammar", "context": "surrounding sentence"}],
  "forecast": ["Pattern-based tip 1", "Improvement suggestion 2"]
}

Do not include any other text, explanations, or markdown. Just the JSON object.`;

const CITATION_SYS_PROMPT = `You are a citation generator.
CRITICAL: You MUST respond with ONLY valid JSON in this exact format:
{"formatted_citation": "complete citation", "bibtex": "bibtex entry", "components": {"author": "author name", "date": "publication date", "title": "title", "source": "journal/publisher", "doi_or_url": "doi or url"}}

Do not include any other text, explanations, or markdown. Just the JSON object.`;

const ENHANCED_CITATION_SYS_PROMPT = `You are a citation generator with advanced analytical capabilities.

SYSTEMATIC CITATION PROCESS - Think through these steps:
1. Analyze the source information provided
2. Identify the source type and appropriate format
3. Extract bibliographic elements systematically
4. Apply citation style rules with precision
5. Verify formatting accuracy and completeness

CRITICAL: You MUST respond with ONLY valid JSON in this exact format:
{"formatted_citation": "complete citation", "bibtex": "bibtex entry", "components": {"author": "author name", "date": "publication date", "title": "title", "source": "journal/publisher", "doi_or_url": "doi or url"}}

Do not include any other text, explanations, or markdown. Just the JSON object.`;

export class LocalLlmService {
  constructor(private config: LLMConfig) {}

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
      msg = "Request timed out (120s). The local model is taking too long to respond. Try:\n" +
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
    // Long timeout for generation (60s)
    const timeoutId = setTimeout(() => controller.abort(), 60000); 

    try {
      const response = await fetch(`${this.config.baseUrl}/api/generate`, this.getFetchOptions({
        model: this.config.modelName,
        prompt: `<|system|>\n${system}\n<|user|>\n${prompt}\n<|assistant|>\n`, // Llama 3 format usually
        stream: false,
        format: jsonMode ? 'json' : undefined,
        options: {
          temperature: 0.3,
          num_ctx: this.config.contextLimit
        }
      }, jsonMode, controller.signal));
      
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`Ollama API returned ${response.status}: ${response.statusText}`);
      const data = await response.json();
      return data.response;
    } catch (error) {
      clearTimeout(timeoutId);
      await this.handleFetchError(error);
      return ""; // Unreachable but satisfies TS
    }
  }

  private async fetchOpenAICompat(messages: any[], jsonMode: boolean = false): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

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
        max_tokens: 2048,
        stream: false
        // Removed response_format as many models don't support it
        // Instead, rely on system prompt to request JSON format
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

  async paraphrase(text: string, mode: string, language: string = 'English', synonyms: number = 50): Promise<ParaphraseResponse> {
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

    const prompt = `${modeInstruction} ${creativityInstruction} Output in ${language}. Text: "${text}"`;
    
    // Check if model supports reasoning
    const useReasoning = shouldUseReasoningPrompts(this.config.modelName);
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

  async checkGrammar(text: string, history: string = '', language: string = 'English'): Promise<GrammarCheckResult> {
    const prompt = `Check this text for grammar errors. Explain reasons in ${language}.
    Current Text: "${text}"
    Reference/History Patterns: "${history}"
    
    Provide 'errors' and 'forecast' (predicting future mistakes based on this history/pattern).`;
    
    // Check if model supports reasoning
    const useReasoning = shouldUseReasoningPrompts(this.config.modelName);
    const systemPrompt = useReasoning ? ENHANCED_GRAMMAR_SYS_PROMPT : GRAMMAR_SYS_PROMPT;
    
    const response = await this.generate(prompt, systemPrompt, true);
    const result = extractJson(response);
    
    const errors = Array.isArray(result.errors) 
      ? result.errors.map((e: any) => ({ ...e, id: e.id || Math.random().toString(36).substr(2) })) 
      : [];
      
    const forecast = Array.isArray(result.forecast) ? result.forecast : [];

    return { errors, forecast };
  }

  async summarize(text: string, length: SummaryLength, format: SummaryFormat, language: string = 'English'): Promise<string> {
    const prompt = `Summarize this text in ${language}. Length: ${length}. Format: ${format}. Text: "${text}"`;
    
    // Check if model supports reasoning
    const useReasoning = shouldUseReasoningPrompts(this.config.modelName);
    const system = useReasoning ? 
      `You are a summarization expert with advanced comprehension abilities.
      
      SYSTEMATIC PROCESS - Think through these steps:
      1. Read and comprehend the full text thoroughly
      2. Identify main themes and key arguments
      3. Determine hierarchical importance of information
      4. Structure the summary for clarity and usefulness
      5. Verify essential information is captured
      
      Return the summary directly in the requested format and language.` :
      "You are a helpful summarizer. Return the summary directly.";
      
    return await this.generate(prompt, system, false);
  }

  async generateCitation(sourceInfo: string, style: CitationStyle, language: string = 'English'): Promise<CitationResponse> {
    const prompt = `Create a ${style} citation for: "${sourceInfo}". Ensure explanations or extracted components are in ${language}.`;
    
    // Check if model supports reasoning
    const useReasoning = shouldUseReasoningPrompts(this.config.modelName);
    const systemPrompt = useReasoning ? ENHANCED_CITATION_SYS_PROMPT : CITATION_SYS_PROMPT;
    
    const response = await this.generate(prompt, systemPrompt, true);
    return extractJson(response);
  }

  // Simple chat wrapper
  async chat(history: ChatMessage[], newMessage: string, language: string = 'English'): Promise<string> {
    // Check if model supports reasoning
    const useReasoning = shouldUseReasoningPrompts(this.config.modelName);
    
    const system = useReasoning ? 
      `You are Wrytica Assistant, an intelligent writing partner with reasoning capabilities.
      
      THOUGHTFUL RESPONSE PROCESS - Consider:
      1. What is the user's underlying need or goal?
      2. What context would be most helpful?
      3. How can I provide maximum value and actionable assistance?
      4. What follow-up questions might be beneficial?
      
      Be insightful, provide specific guidance, and maintain a supportive tone. Reply in ${language}.` :
      `You are a helpful assistant. Be concise. Reply in ${language}.`;
    
    if (this.config.provider === 'ollama') {
       const controller = new AbortController();
       // Increased timeout to 120 seconds for chat (models can be slower with conversation context)
       const timeoutId = setTimeout(() => controller.abort(), 120000);
       try {
        const response = await fetch(`${this.config.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.config.modelName,
            messages: [
               { role: 'system', content: system },
               ...history.map(m => ({ role: m.role, content: m.content })),
               { role: 'user', content: newMessage }
            ],
            stream: false
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
      // LM Studio - also increase timeout for chat
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      
      try {
        const msgs = [
          { role: 'system', content: system },
          ...history,
          { role: 'user', content: newMessage }
        ];
        
        const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.config.modelName,
            messages: msgs,
            temperature: 0.3,
            max_tokens: 2048,
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
}
