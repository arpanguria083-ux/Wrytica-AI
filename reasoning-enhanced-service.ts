// Enhanced service layer with reasoning model optimization

import { detectModelCapabilities, shouldUseReasoningPrompts } from './model-capabilities-detector';

class ReasoningEnhancedGeminiService {
  
  private getEnhancedParaphrasePrompt(mode: string, synonyms: number, language: string): string {
    return `You are an expert paraphrasing assistant with advanced reasoning capabilities.

REASONING PROCESS - Think through these steps:
1. Analyze the original text's meaning, tone, and structure
2. Understand the target style: "${mode}"
3. Consider creativity level: ${synonyms}% (${this.getCreativityDescription(synonyms)})
4. Plan your paraphrasing approach
5. Generate the paraphrased version
6. Evaluate result for accuracy and style compliance

STYLE REQUIREMENTS for "${mode}":
${this.getStyleDescription(mode)}

CREATIVITY LEVEL (${synonyms}%):
${this.getCreativityDescription(synonyms)}

CRITICAL CONSTRAINTS:
- Output language: ${language}
- Preserve formatting (bullet points, lists, structure)
- Maintain original meaning while applying style changes

After your reasoning, provide ONLY this JSON:
{"paraphrasedText": "result", "tone": "detected_tone", "confidence": 0.9}`;
  }

  private getEnhancedGrammarPrompt(language: string): string {
    return `You are an expert grammar and style checker with advanced analytical capabilities.

SYSTEMATIC ANALYSIS PROCESS:
1. Read for overall comprehension and context
2. Identify grammar, spelling, and style issues
3. Evaluate severity and contextual appropriateness  
4. Consider writer's intent and audience
5. Provide corrections with clear reasoning
6. Analyze patterns for future improvement predictions

ANALYSIS FRAMEWORK:
- Grammar: Structure, agreement, tense consistency
- Spelling: Accuracy, commonly confused words
- Style: Clarity, conciseness, tone appropriateness
- Context: Formality level, audience suitability

PATTERN RECOGNITION:
Look for recurring issues to provide predictive guidance.

Explanations should be in ${language}.

After analysis, provide ONLY this JSON:
{
  "errors": [{"id": "1", "original": "text", "suggestion": "fix", "reason": "explanation", "type": "grammar|spelling|style", "context": "sentence"}],
  "forecast": ["Pattern insight 1", "Improvement tip 2"]
}`;
  }

  private getEnhancedChatPrompt(language: string): string {
    return `You are Wrytica Assistant, an intelligent writing partner with advanced reasoning capabilities.

THOUGHTFUL RESPONSE PROCESS:
Before responding, consider:
1. What is the user's underlying need or goal?
2. What context would be most helpful?
3. How can I provide maximum value and actionability?
4. What follow-up questions might clarify or extend the discussion?
5. How can I encourage productive thinking and writing?

CORE CAPABILITIES:
- Creative brainstorming and ideation
- Writing assistance and editing guidance
- Research direction and methodology
- Problem-solving and critical thinking
- Technical and academic writing support

RESPONSE PRINCIPLES:
- Be insightful and thought-provoking
- Provide specific, actionable guidance
- Ask clarifying questions when beneficial
- Foster collaborative exploration
- Maintain supportive, encouraging tone

Communicate exclusively in ${language}.`;
  }

  private getStyleDescription(mode: string): string {
    const descriptions = {
      'Standard': 'Balanced rewording maintaining original meaning and tone',
      'Fluency': 'Improve flow, rhythm, and grammatical smoothness',
      'Humanize': 'Natural, emotional, conversational tone with personality',
      'Formal': 'Sophisticated vocabulary, professional tone, avoid contractions',
      'Academic': 'Scholarly precision, objective voice, technical terminology',
      'Simple': 'Plain language, short sentences, accessible to broad audience',
      'Creative': 'Evocative language, varied structure, expressive and artistic',
      'Expand': 'Add relevant details, context, and depth without redundancy',
      'Shorten': 'Concise expression maintaining all essential meaning'
    };
    return descriptions[mode] || 'Apply appropriate stylistic modifications';
  }

  private getCreativityDescription(synonyms: number): string {
    if (synonyms <= 25) return 'Minimal changes, stay very close to original phrasing';
    if (synonyms <= 50) return 'Moderate word substitutions and some restructuring';
    if (synonyms <= 75) return 'Creative word choices and varied sentence structures';
    return 'Highly creative language with extensive vocabulary variation';
  }

  async paraphrase(apiKey: string, text: string, mode: string, synonyms: number, language: string) {
    const modelName = 'gemini-2.5-flash'; // This would come from config
    const capabilities = detectModelCapabilities(modelName);
    
    let systemInstruction: string;
    
    if (capabilities.supportsReasoning || capabilities.supportsChainOfThought) {
      systemInstruction = this.getEnhancedParaphrasePrompt(mode, synonyms, language);
    } else {
      // Fallback to standard prompt
      systemInstruction = `You are an expert paraphrasing assistant...`; // Current prompt
    }

    // Rest of implementation...
  }

  async checkGrammar(apiKey: string, text: string, history: string, language: string) {
    const modelName = 'gemini-2.5-flash';
    const capabilities = detectModelCapabilities(modelName);
    
    let systemInstruction: string;
    
    if (capabilities.supportsReasoning || capabilities.supportsChainOfThought) {
      systemInstruction = this.getEnhancedGrammarPrompt(language);
    } else {
      // Fallback to standard prompt
      systemInstruction = `You are a grammar and style checker...`; // Current prompt
    }

    // Rest of implementation...
  }

  createChatSession(apiKey: string, language: string) {
    const modelName = 'gemini-2.5-flash';
    const capabilities = detectModelCapabilities(modelName);
    
    let systemInstruction: string;
    
    if (capabilities.supportsReasoning || capabilities.supportsChainOfThought) {
      systemInstruction = this.getEnhancedChatPrompt(language);
    } else {
      // Fallback to standard prompt
      systemInstruction = `You are Wrytica Assistant...`; // Current prompt
    }

    // Rest of implementation...
  }
}

export { ReasoningEnhancedGeminiService };