import { GoogleGenAI, Type, Schema, Chat } from "@google/genai";
import { ParaphraseMode, GrammarError, SummaryLength, SummaryFormat, ParaphraseResponse, CitationStyle, CitationResponse, GrammarCheckResult, ContextEnhancement, buildGuardrailInstructions, buildKnowledgeContext, PageIndexPromptNode, PageIndexSelection, LLMConfig, ChatMessage } from '../utils';
import { detectModelCapabilities, shouldUseReasoningPrompts } from '../utils/modelCapabilities';

// Note: API key will be provided dynamically by the user through the UI
// No longer using environment variables for API keys

const MODEL_FAST = 'gemini-2.5-flash';
const MODEL_REASONING = 'gemini-2.5-flash'; // Using flash for speed in interactive tools

const composeInstruction = (base: string, enhancement?: ContextEnhancement, toolName?: string) => {
  if (!enhancement) return base;
  const guardrailText = buildGuardrailInstructions(enhancement.guardrail, toolName);
  const knowledgeContext = buildKnowledgeContext(enhancement.knowledgeRefs);
  const extras = [guardrailText, enhancement.additionalInstructions, knowledgeContext].filter(Boolean).join('\n\n');
  return extras ? `${base}\n\n${extras}` : base;
};

export const GeminiService = {
  
  /**
   * Paraphrase with custom temperature (for middleware multiple candidates)
   */
  async paraphraseWithTemperature(
    config: LLMConfig,
    text: string,
    mode: ParaphraseMode,
    synonymsLevel: number,
    language: string,
    enhancement?: ContextEnhancement,
    options?: { phraseFlip?: boolean; sentenceRestructure?: boolean; fluency?: boolean; sentenceCompression?: boolean; wordLevel?: boolean },
    temperature: number = 0.5
  ): Promise<ParaphraseResponse> {
    const apiKey = config.apiKey!;
    const model = config.modelName || MODEL_FAST;
    if (!text.trim()) return { paraphrasedText: "", tone: "Neutral", confidence: 0 };

    const optionInstructions = this.getOptionInstructions(options);
    const useReasoning = shouldUseReasoningPrompts(model);
    const systemInstruction = useReasoning 
      ? this.getEnhancedParaphrasePrompt(mode, synonymsLevel, language, optionInstructions)
      : this.getStandardParaphrasePrompt(mode, language, optionInstructions);
    const finalInstruction = composeInstruction(systemInstruction, enhancement, 'Paraphraser');

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        paraphrasedText: { type: Type.STRING },
        tone: { type: Type.STRING },
        confidence: { type: Type.NUMBER },
      },
      required: ['paraphrasedText', 'tone', 'confidence'],
    };

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: model,
        contents: text,
          config: {
            systemInstruction: finalInstruction,
          temperature,
          maxOutputTokens: config.maxCompletionTokens || 2048,
          responseMimeType: 'application/json',
          responseSchema: schema,
        }
      });
      
      const result = JSON.parse(response.text || "{}");
      return {
        paraphrasedText: result.paraphrasedText || "",
        tone: result.tone || "Neutral",
        confidence: result.confidence || 0
      };
    } catch (error: any) {
      console.error("Paraphrase with temperature error:", error);
      throw new Error(error.message || "Failed to paraphrase text.");
    }
  },

  getOptionInstructions(options?: { phraseFlip?: boolean; sentenceRestructure?: boolean; fluency?: boolean; sentenceCompression?: boolean; wordLevel?: boolean }): string {
    if (!options) return '';
    const instructions: string[] = [];
    
    if (options.phraseFlip) {
      instructions.push('- Phrase Flip: Identify and flip parallel structures like "not only X but also Y" to "Y as well as X" or similar patterns.');
    }
    if (options.sentenceRestructure) {
      instructions.push('- Sentence Restructure: Change word order and sentence structure while preserving the original meaning.');
    }
    if (options.fluency) {
      instructions.push('- Fluency: Improve grammatical accuracy and natural flow of the text.');
    }
    if (options.sentenceCompression) {
      instructions.push('- Sentence Compression: Remove redundant words and condense sentences without losing meaning.');
    }
    if (options.wordLevel) {
      instructions.push('- Word Level: Focus on word-level substitutions, replacing words with appropriate synonyms while maintaining context.');
    }
    
    return instructions.length > 0 ? `\n\nQUILLBOT ADDITIONAL OPTIONS:\n${instructions.join('\n')}` : '';
  },

  getEnhancedParaphrasePrompt(mode: ParaphraseMode, synonymsLevel: number, language: string, optionInstructions = ''): string {
    const creativityDesc = synonymsLevel <= 25 ? 'minimal changes, stay close to original' :
                          synonymsLevel <= 50 ? 'moderate word substitutions and restructuring' :
                          synonymsLevel <= 75 ? 'creative word choices and varied structures' :
                          'highly creative language with extensive vocabulary variation';

    const styleDesc = {
      'Standard': 'Balanced rewording maintaining original meaning and tone',
      'Fluency': 'Improve flow, rhythm, and grammatical smoothness',
      'Humanize': 'Natural, emotional, conversational tone with personality',
      'Formal': 'Sophisticated vocabulary, professional tone, avoid contractions',
      'Academic': 'Scholarly precision, objective voice, technical terminology',
      'Simple': 'Plain language, short sentences, accessible to broad audience',
      'Creative': 'Evocative language, varied structure, expressive and artistic',
      'Expand': 'Add relevant details, context, and depth without redundancy',
      'Shorten': 'Concise expression maintaining all essential meaning'
    }[mode] || 'Apply appropriate stylistic modifications';

    return `You are an expert paraphrasing assistant with advanced reasoning capabilities.

REASONING PROCESS - Think through these steps:
1. Analyze the original text's meaning, tone, and structure
2. Understand the target style: "${mode}" - ${styleDesc}
3. Consider creativity level: ${synonymsLevel}% (${creativityDesc})
4. Plan your paraphrasing approach considering both style and creativity
5. Generate the paraphrased version
6. Evaluate the result for accuracy, style compliance, and tone

CRITICAL CONSTRAINTS:
- Output language: ${language}
- Preserve formatting (bullet points, lists, structure)
- Maintain original meaning while applying style changes
- Apply creativity level: ${creativityDesc}

FORMATTING REQUIREMENTS:
1. Preserve special characters (*, -, |, >, numbered lists)
2. Maintain structure (lists, line breaks, paragraphs)
3. Respect punctuation patterns that indicate formatting
${optionInstructions}

After your reasoning, analyze the tone of your paraphrased text and provide a JSON object matching the schema.`;
  },

  getStandardParaphrasePrompt(mode: ParaphraseMode, language: string, optionInstructions = ''): string {
    return `You are an expert writing assistant specialized in paraphrasing.
    Your task is to rewrite the input text in the '${mode}' style.
    
    CRITICAL: Output the result in ${language}. If the input text is not in ${language}, translate and paraphrase it into ${language}.
    
    Style Guidelines:
    - Standard: Balanced rewording, maintains original meaning reliable.
    - Fluency: Improve flow and fix grammatical awkwardness.
    - Humanize: Make the text sound more natural, emotional, and conversational.
    - Formal: Use sophisticated vocabulary, avoid contractions, professional tone.
    - Academic: Scholarly tone, precise terminology, objective voice.
    - Simple: Use plain language, shorter sentences, accessible to general audience.
    - Creative: Use evocative language, vary sentence structure, be expressive.
    - Expand: Increase length by adding relevant details and depth without fluff.
    - Shorten: Concisely convey the meaning in fewer words.
    - Custom: Follow the user's implicit intent or default to Standard if unspecified.
    ${optionInstructions}
    CRITICAL FORMATTING CONSTRAINTS:
    1. Special Characters: You MUST preserve special characters used for listing or pointing, such as bullet points (*, -, |), arrows (>), or numbered lists (1., a.). 
    2. Structure: If the input text is a list or uses specific line breaks, maintain that structure in the output. Do not flatten lists into a single paragraph.
    3. Punctuation: Respect specific comma structures if they denote a deliberate list format.

    Also, analyze the tone of the *paraphrased* text you generate.
    Identify the primary tone (e.g., Professional, Friendly, Assertive, Humorous, Empathetic, etc.) and a confidence score (0.0 to 1.0).
    
    Return a JSON object matching the schema.`;
  },

  getEnhancedGrammarPrompt(language: string): string {
    return `You are an expert grammar and style checker with advanced analytical capabilities.

SYSTEMATIC ANALYSIS PROCESS - Think through these steps:
1. Read the text thoroughly for overall comprehension and context
2. Identify potential grammar, spelling, and style issues systematically
3. Evaluate each issue's severity and contextual appropriateness
4. Consider the writer's intent, audience, and style preferences
5. Provide corrections with clear, educational explanations
6. Analyze patterns to predict future writing challenges and improvements

ANALYSIS FRAMEWORK:
- Grammar: Subject-verb agreement, tense consistency, sentence structure, syntax
- Spelling: Accuracy, commonly confused words, proper nouns, typos
- Style: Clarity, conciseness, tone consistency, word choice, flow
- Context: Formality level, audience appropriateness, purpose alignment

PATTERN RECOGNITION:
Look for recurring issues, writing habits, and areas for systematic improvement.
Consider both current errors and historical patterns to provide predictive guidance.

OUTPUT LANGUAGE: All explanations, reasons, and forecasts should be in ${language}.

After your systematic analysis, provide a JSON object with detailed errors and predictive insights.`;
  },

  getStandardGrammarPrompt(language: string): string {
    return `You are a strict grammar and style checker. 
    Analyze the provided text for grammatical errors, spelling mistakes, and stylistic issues.
    The output language for 'reason', 'suggestion', and 'forecast' should be ${language}.
    
    Inputs:
    1. Current Text: The text to be checked.
    2. Patterns History: Previous writing samples or context (if provided). Use this to identify recurring mistakes or style inconsistencies.

    Return a JSON object with:
    1. 'errors': An array of objects. Each having:
       - 'original': exact error segment.
       - 'suggestion': corrected text.
       - 'reason': brief explanation.
       - 'type': 'grammar', 'spelling', or 'style'.
       - 'context': surrounding sentence.
    
    2. 'forecast': An array of strings. Based on the current errors AND the provided 'Patterns History', predict 1-3 future writing pitfalls or give high-level advice to avoid recurring mistakes (e.g., "You tend to use passive voice often; try active verbs.").

    If there are no errors, return an empty 'errors' array, but still provide a 'forecast' if the style allows.`;
  },

  getEnhancedSummarizationPrompt(length: SummaryLength, format: SummaryFormat, language: string): string {
    const lengthInstruction = length === 'Short' ? 'very concise, 1-3 sentences' : 
                              length === 'Medium' ? 'one or two paragraphs, covering main points' : 
                              'comprehensive, covering details and nuances';
    
    const formatInstruction = format === 'Bullet Points' ? 'formatted as a markdown list of bullet points' : 'formatted as cohesive paragraphs';

    return `You are an expert text summarization specialist with advanced comprehension abilities.

SYSTEMATIC SUMMARIZATION PROCESS - Think through these steps:
1. Read and comprehend the full text thoroughly, identifying main themes
2. Determine the hierarchical importance of information and key arguments
3. Consider the target length (${lengthInstruction}) and format (${formatInstruction})
4. Structure the summary for maximum clarity and usefulness
5. Verify that all essential information is captured accurately
6. Ensure the summary flows logically and serves the reader's needs

ANALYSIS FRAMEWORK:
- Main Ideas: Core concepts, primary arguments, and central themes
- Supporting Details: Key evidence, important examples, and explanations
- Structure: Logical flow, organization, and relationship between ideas
- Context: Background information, implications, and significance

LENGTH REQUIREMENTS: ${lengthInstruction}
FORMAT REQUIREMENTS: ${formatInstruction}
OUTPUT LANGUAGE: ${language}

After your analysis, provide a well-structured summary that captures the essence while meeting the specified requirements.`;
  },

  getStandardSummarizationPrompt(length: SummaryLength, format: SummaryFormat, language: string): string {
    const lengthInstruction = length === 'Short' ? 'very concise, 1-3 sentences' : 
                              length === 'Medium' ? 'one or two paragraphs, covering main points' : 
                              'comprehensive, covering details and nuances';
    
    const formatInstruction = format === 'Bullet Points' ? 'formatted as a markdown list of bullet points' : 'formatted as cohesive paragraphs';

    return `You are a summarization expert. Summarize the provided text.
    Constraint 1: The summary should be ${lengthInstruction}.
    Constraint 2: The output should be ${formatInstruction}.
    Constraint 3: Capture the core message accurately without hallucinating external info.
    Constraint 4: The summary MUST be written in ${language}.`;
  },

  getEnhancedCitationPrompt(style: CitationStyle, language: string): string {
    return `You are an expert academic citation specialist with meticulous attention to detail.

SYSTEMATIC CITATION PROCESS - Think through these steps:
1. Analyze the source information provided (URL, DOI, title, or unstructured text)
2. Identify the source type (journal article, book, website, report, etc.)
3. Extract all available bibliographic elements systematically
4. Apply the specific ${style} citation style rules with precision
5. Verify formatting accuracy and completeness according to standards
6. Generate both the formatted citation and BibTeX entry

ANALYSIS FRAMEWORK:
- Source Type: Determine publication category and appropriate citation format
- Bibliographic Elements: Author names, publication dates, titles, publishers
- Identifiers: DOI, URL, ISBN, or other unique identifiers
- Missing Elements: Handle appropriately with standard placeholders

CITATION STYLE REQUIREMENTS for ${style}:
- Follow exact punctuation, capitalization, and formatting rules
- Apply proper italicization and emphasis where required
- Use correct date formats and author name conventions
- Include all required elements in proper sequence

OUTPUT LANGUAGE: Explanatory text in ${language}, but citation follows ${style} international standards.

After your analysis, provide a JSON object with the formatted citation, BibTeX entry, and extracted components.`;
  },

  getStandardCitationPrompt(style: CitationStyle, language: string): string {
    const allStyles = ['APA 7', 'MLA 9', 'Chicago', 'Harvard', 'IEEE', 'Vancouver', 'Turabian', 'ACS', 'AMA', 'ASA'];
    return `You are an expert scientific and academic citation generator. 
    Your task is to parse the input source information (URL, DOI, Title, or unstructured text) and generate a citation in ${style} style.
    
    Available citation styles: ${allStyles.join(', ')}
    
    Constraint: Ensure any explanatory text or 'unknown' placeholders in the components are in ${language}, but keep the citation formatted exactly according to the ${style} standard (which usually defaults to English for international standards, but adapt if the style permits).

    Return a JSON object with:
    1. 'formatted_citation': The final, perfectly formatted citation string (including italics/punctuation).
    2. 'bibtex': A standard BibTeX entry for the source.
    3. 'components': An object containing the extracted 'author', 'date', 'title', 'source' (publisher/journal), and 'doi_or_url'. Use "n.d." or "Unknown" if missing.

    Ensure accuracy. If it is a web source, follow the style guide strictly for retrieval dates/URLs.`;
  },

  /**
   * Tests the connection by making a minimal request.
   */
  async testConnection(apiKey: string): Promise<boolean> {
    try {
      // Validate API key
      if (!apiKey || apiKey.trim() === '') {
        throw new Error('Gemini API key is required. Please enter your API key in Settings.');
      }
      
      const ai = new GoogleGenAI({ apiKey });
      
      await ai.models.generateContent({
        model: MODEL_FAST,
        contents: 'Test',
        config: { maxOutputTokens: 1 }
      });
      return true;
    } catch (error) {
      console.error("Gemini connection test failed:", error);
      throw error;
    }
  },

  /**
   * Paraphrases text based on the selected mode and synonym intensity.
   * Returns an object containing the paraphrased text and tone analysis.
   */
  async paraphrase(
    config: LLMConfig,
    text: string,
    mode: ParaphraseMode,
    synonymsLevel: number = 50,
    language: string = 'English',
    enhancement?: ContextEnhancement,
    options?: { phraseFlip?: boolean; sentenceRestructure?: boolean; fluency?: boolean; sentenceCompression?: boolean; wordLevel?: boolean }
  ): Promise<ParaphraseResponse> {
    const apiKey = config.apiKey!;
    const model = config.modelName || MODEL_FAST;
    if (!text.trim()) return { paraphrasedText: "", tone: "Neutral", confidence: 0 };

    // Map synonyms level (0-100) to temperature (0.0 - 1.0) somewhat loose correlation
    // Higher synonyms = more creativity/randomness
    const temperature = 0.3 + (synonymsLevel / 200); 

    // Build QuillBot-style additional options instructions
    const optionInstructions = this.getOptionInstructions(options);

    // Check if model supports reasoning
    const useReasoning = shouldUseReasoningPrompts(model);

    const systemInstruction = useReasoning ? 
      this.getEnhancedParaphrasePrompt(mode, synonymsLevel, language, optionInstructions) :
      this.getStandardParaphrasePrompt(mode, language, optionInstructions);
    const finalInstruction = composeInstruction(systemInstruction, enhancement, 'Paraphraser');

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        paraphrasedText: { type: Type.STRING },
        tone: { type: Type.STRING },
        confidence: { type: Type.NUMBER },
      },
      required: ['paraphrasedText', 'tone', 'confidence'],
    };

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: model,
        contents: text,
          config: {
            systemInstruction: finalInstruction,
          temperature,
          maxOutputTokens: config.maxCompletionTokens || 2048,
          responseMimeType: 'application/json',
          responseSchema: schema,
        }
      });
      
      const result = JSON.parse(response.text || "{}");
      return {
        paraphrasedText: result.paraphrasedText || "",
        tone: result.tone || "Neutral",
        confidence: result.confidence || 0
      };
    } catch (error: any) {
      console.error("Paraphrase error:", error);
      // Propagate the specific error message to be handled by the UI
      throw new Error(error.message || "Failed to paraphrase text.");
    }
  },

  /**
   * Checks grammar, suggests fixes, and forecasts future patterns based on history.
   */
  async checkGrammar(config: LLMConfig, text: string, patternsHistory: string = '', language: string = 'English', enhancement?: ContextEnhancement): Promise<GrammarCheckResult> {
    const apiKey = config.apiKey!;
    const model = config.modelName || MODEL_FAST;
    if (!text.trim()) return { errors: [], forecast: [] };

    // Check if model supports reasoning
    const useReasoning = shouldUseReasoningPrompts(model);

    const systemInstruction = useReasoning ? 
      this.getEnhancedGrammarPrompt(language) :
      this.getStandardGrammarPrompt(language);
    const finalInstruction = composeInstruction(systemInstruction, enhancement, 'Grammar');

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        errors: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              original: { type: Type.STRING },
              suggestion: { type: Type.STRING },
              reason: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['grammar', 'spelling', 'style'] },
              context: { type: Type.STRING },
            },
            required: ['original', 'suggestion', 'reason', 'type', 'context'],
          }
        },
        forecast: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      },
      required: ['errors', 'forecast']
    };

    try {
      const ai = new GoogleGenAI({ apiKey });
      

      const response = await ai.models.generateContent({
        model: model,
        contents: `Current Text: "${text}"\n\nPatterns History: "${patternsHistory}"`,
          config: {
            systemInstruction: finalInstruction,
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.1,
          maxOutputTokens: config.maxCompletionTokens || 2048,
        }
      });

      const result = JSON.parse(response.text || '{"errors": [], "forecast": []}');

      // Add client-side IDs to errors
      const errorsWithIds = (result.errors || []).map((item: any) => ({
        ...item,
        id: Math.random().toString(36).substr(2, 9)
      }));

      return {
        errors: errorsWithIds,
        forecast: result.forecast || []
      };
    } catch (error) {
      console.error("Grammar check error:", error);
      return { errors: [], forecast: [] };
    }
  },

  /**
   * Summarizes text.
   */
  async summarize(config: LLMConfig, text: string, length: SummaryLength, format: SummaryFormat, language: string = 'English', enhancement?: ContextEnhancement): Promise<string> {
    const apiKey = config.apiKey!;
    const model = config.modelName || MODEL_FAST;
    if (!text.trim()) return "";

    // Check if model supports reasoning
    const useReasoning = shouldUseReasoningPrompts(model);

    const systemInstruction = useReasoning ?
      this.getEnhancedSummarizationPrompt(length, format, language) :
      this.getStandardSummarizationPrompt(length, format, language);
    const finalInstruction = composeInstruction(systemInstruction, enhancement, 'Summarizer');

    try {
      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model: model,
        contents: text,
          config: {
            systemInstruction: finalInstruction,
          temperature: 0.3,
          maxOutputTokens: config.maxCompletionTokens || 2048,
        }
      });
      return response.text || "";
    } catch (error) {
      console.error("Summarize error:", error);
      throw error;
    }
  },

  /**
   * Generates a scientific citation.
   */
  async generateCitation(config: LLMConfig, sourceInfo: string, style: CitationStyle, language: string = 'English', enhancement?: ContextEnhancement): Promise<CitationResponse> {
    const apiKey = config.apiKey!;
    const model = config.modelName || MODEL_FAST;
    if (!sourceInfo.trim()) return { formatted_citation: "", bibtex: "", components: { author: "", date: "", title: "", source: "", doi_or_url: "" } };

    // Check if model supports reasoning
    const useReasoning = shouldUseReasoningPrompts(model);

    const systemInstruction = useReasoning ?
      this.getEnhancedCitationPrompt(style, language) :
      this.getStandardCitationPrompt(style, language);
    const finalInstruction = composeInstruction(systemInstruction, enhancement, 'Citation');

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        formatted_citation: { type: Type.STRING },
        bibtex: { type: Type.STRING },
        components: {
          type: Type.OBJECT,
          properties: {
            author: { type: Type.STRING },
            date: { type: Type.STRING },
            title: { type: Type.STRING },
            source: { type: Type.STRING },
            doi_or_url: { type: Type.STRING },
          }
        }
      },
      required: ['formatted_citation', 'bibtex', 'components']
    };

    try {
      const ai = new GoogleGenAI({ apiKey });

      const response = await ai.models.generateContent({
        model: model,
        contents: sourceInfo,
          config: {
            systemInstruction: finalInstruction,
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.1, // High precision
          maxOutputTokens: config.maxCompletionTokens || 2048,
        }
      });

      const result = JSON.parse(response.text || "{}");
      return {
        formatted_citation: result.formatted_citation || "",
        bibtex: result.bibtex || "",
        components: result.components || { author: "", date: "", title: "", source: "", doi_or_url: "" }
      };
    } catch (error) {
      console.error("Citation error:", error);
      throw error;
    }
  },

  /**
   * Initializes a chat session with optional history.
   */
  createChatSession(config: LLMConfig, language: string = 'English', enhancement?: ContextEnhancement, history: ChatMessage[] = []): Chat {
    const apiKey = config.apiKey!;
    const model = config.modelName || MODEL_REASONING;
    const ai = new GoogleGenAI({ apiKey });

    // Check if model supports reasoning
    const useReasoning = shouldUseReasoningPrompts(model);
    const systemInstruction = useReasoning ?
      this.getEnhancedChatPrompt(language) :
      this.getStandardChatPrompt(language);
    const finalInstruction = composeInstruction(systemInstruction, enhancement, 'Chat');

    // Format history for Gemini SDK
    // Gemini expects 'user' and 'model' roles. 
    // We filter for these and map content to parts.
    const formattedHistory = history.map(msg => ({
      role: msg.role === 'model' || msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    return ai.chats.create({
      model: model,
      history: formattedHistory,
      config: {
        systemInstruction: finalInstruction,
        maxOutputTokens: config.maxCompletionTokens || 2048,
      }
    });
  },

  async reasonOverPageIndex(config: LLMConfig, query: string, nodes: PageIndexPromptNode[], language: string = 'English', enhancement?: ContextEnhancement, limit = 3): Promise<{ nodes: PageIndexSelection[]; thinking?: string }> {
    const apiKey = config.apiKey!;
    const model = config.modelName || MODEL_REASONING;
    if (!query.trim() || nodes.length === 0) return { nodes: [] };

    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = composeInstruction(getPageIndexReasoningPrompt(language), enhancement, 'PageIndex');
    const candidateBlock = buildPageIndexCandidateBlock(nodes);
    const prompt = `Query: ${query}\nLimit: ${limit} nodes\nCandidates:\n${candidateBlock}\nReturn JSON with 'nodes' array referencing nodeId, rank, and reason why it is relevant. Keep the JSON compact.`;

    const schema: Schema = {
      type: Type.OBJECT,
      properties: {
        thinking: { type: Type.STRING },
        nodes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              nodeId: { type: Type.STRING },
              reason: { type: Type.STRING },
              rank: { type: Type.NUMBER }
            },
            required: ['nodeId', 'reason']
          }
        }
      },
      required: ['nodes']
    };

    try {
      const response = await ai.models.generateContent({
        model: MODEL_REASONING,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: schema,
          maxOutputTokens: 1024,
          temperature: 0.2
        }
      });

      const payload = JSON.parse(response.text || '{}');
      const entries = Array.isArray(payload.nodes) ? payload.nodes : [];
      const nodes = entries.slice(0, limit).map((entry: any, index: number) => ({
        nodeId: entry.nodeId,
        reason: entry.reason || '',
        rank: typeof entry.rank === 'number' ? entry.rank : index + 1
      }));
      return { nodes, thinking: typeof payload.thinking === 'string' ? payload.thinking : undefined };
    } catch (error) {
      console.error("PageIndex reasoning error:", error);
      return { nodes: [] };
    }
  },

  getEnhancedChatPrompt(language: string): string {
    return `You are Wrytica Assistant, an intelligent writing partner with advanced reasoning capabilities.

THOUGHTFUL RESPONSE PROCESS - Before responding, consider:
1. What is the user's underlying need or goal behind their request?
2. What context, background, or additional information would be most helpful?
3. How can I provide maximum value and actionable assistance?
4. What follow-up questions might clarify or extend our discussion productively?
5. How can I encourage productive thinking, creativity, and effective writing?

CORE CAPABILITIES:
- Creative brainstorming and ideation support
- Writing assistance, editing guidance, and style improvement
- Research direction, methodology, and fact-checking
- Problem-solving and critical thinking facilitation
- Technical and academic writing support
- Content structuring and organization

RESPONSE PRINCIPLES:
- Be insightful, thought-provoking, and genuinely helpful
- Provide specific, actionable guidance rather than generic advice
- Ask clarifying questions when they would enhance our collaboration
- Foster collaborative exploration of ideas and solutions
- Maintain a supportive, encouraging, and professional tone
- Anticipate needs and offer proactive suggestions

COMMUNICATION: Respond exclusively in ${language} throughout our conversation.`;
  },

  async extractImageText(apiKey: string, base64: string, mimeType: string, language: string = 'English'): Promise<string> {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = getVisionPrompt(language);
    const contents = [
      {
        inlineData: {
          mimeType: mimeType || 'image/png',
          data: base64
        }
      },
      {
        text: prompt
      }
    ];

    const response = await ai.models.generateContent({
      model: MODEL_REASONING,
      contents,
      config: {
        systemInstruction: prompt,
        responseMimeType: 'text/plain',
        temperature: 0.1,
        maxOutputTokens: 4096
      }
    });

    return response.text?.trim() || '';
  },

  getStandardChatPrompt(language: string): string {
    return `You are Wrytica Assistant, a helpful, intelligent, and creative writing partner. Help the user with brainstorming, drafting, editing, and research. Be concise but helpful. You MUST converse in ${language}.`;
  }
};

const getVisionPrompt = (language: string) => {
  return `You are an OCR expert. Analyze the supplied image and list every readable character sequence you can find. Return only the plain text, nothing else. Respond in ${language}.`;
};

const buildPageIndexCandidateBlock = (nodes: PageIndexPromptNode[]) => {
  return nodes.map((node, index) => {
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
};

const getPageIndexReasoningPrompt = (language: string) => {
  return `You are Wrytica Reasoner. Analyze the query and the candidate nodes carefully.
1. Understand the user's need behind the query.
2. Evaluate each node's content, summary, title, and context for relevance.
3. Rank the nodes by how well they contain the answer, cite the page number, and explain why.
4. Return JSON with a 'nodes' array where each entry includes nodeId, rank, and reason.
Respond only in ${language}.`;
};


