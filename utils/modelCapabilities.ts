// Model capabilities detection for reasoning features

export interface ModelCapabilities {
  supportsReasoning: boolean;
  supportsChainOfThought: boolean;
  supportsStructuredOutput: boolean;
  recommendedPromptStyle: 'standard' | 'reasoning' | 'enhanced';
}

const REASONING_MODELS: Record<string, ModelCapabilities> = {
  // Gemini models with reasoning capabilities
  'gemini-2.0-flash-thinking-exp': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: true,
    recommendedPromptStyle: 'reasoning'
  },
  'gemini-2.5-flash': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: true,
    recommendedPromptStyle: 'enhanced'
  },
  'gemini-2.5-pro': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: true,
    recommendedPromptStyle: 'enhanced'
  },
  
  // OpenAI models with reasoning
  'o1-preview': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: true,
    recommendedPromptStyle: 'reasoning'
  },
  'o1-mini': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: true,
    recommendedPromptStyle: 'reasoning'
  },
  'gpt-4o': {
    supportsReasoning: false,
    supportsChainOfThought: true,
    supportsStructuredOutput: true,
    recommendedPromptStyle: 'enhanced'
  },
  
  // Local models with reasoning capabilities
  'qwen2.5-32b-instruct': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: false,
    recommendedPromptStyle: 'enhanced'
  },
  'qwen2.5-7b-instruct': {
    supportsReasoning: false,
    supportsChainOfThought: true,
    supportsStructuredOutput: false,
    recommendedPromptStyle: 'enhanced'
  },
  'llama-3.1-70b-instruct': {
    supportsReasoning: false,
    supportsChainOfThought: true,
    supportsStructuredOutput: false,
    recommendedPromptStyle: 'enhanced'
  },
  'deepseek-r1': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: false,
    recommendedPromptStyle: 'reasoning'
  },
  'phi-4': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: false,
    recommendedPromptStyle: 'enhanced'
  },
  'qwen2.5-coder-32b-instruct': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: true,
    recommendedPromptStyle: 'enhanced'
  },
  'qwen2.5-9b-instruct': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: true,
    recommendedPromptStyle: 'enhanced'
  },
  'qwen3.5-9b-instruct': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: true,
    recommendedPromptStyle: 'enhanced'
  }
};

export function detectModelCapabilities(modelName: string): ModelCapabilities {
  // Normalize model name (remove version suffixes, etc.)
  const normalizedName = modelName.toLowerCase().trim();
  
  // Check exact matches first
  if (REASONING_MODELS[normalizedName]) {
    return REASONING_MODELS[normalizedName];
  }
  
  // Check partial matches for model families
  for (const [knownModel, capabilities] of Object.entries(REASONING_MODELS)) {
    const knownBase = knownModel.split('-')[0];
    const normalizedParts = normalizedName.split(/[\/-]/);
    
    if (normalizedName.includes(knownBase) && knownBase.length > 3) {
      // Make sure it's a substantive match like 'qwen' or 'llama'
      // If the model is a variant of a known reasoning model family
      if (knownModel.includes('reasoning') || knownModel.includes('thinking')) {
          return capabilities;
      }
      
      // Map base family capabilities if it closely matches
      if (normalizedName.includes('qwen') && knownBase === 'qwen2.5') {
         return capabilities;
      }
    }
  }
  
  // Default capabilities for unknown models
  return {
    supportsReasoning: false,
    supportsChainOfThought: false,
    supportsStructuredOutput: false,
    recommendedPromptStyle: 'standard'
  };
}

export function shouldUseReasoningPrompts(modelName: string): boolean {
  const capabilities = detectModelCapabilities(modelName);
  return capabilities.supportsReasoning || capabilities.supportsChainOfThought;
}

export function shouldUseReasoningPromptsForContext(modelName: string, contextLimit: number): boolean {
  if (contextLimit <= 8192) return false;
  return shouldUseReasoningPrompts(modelName);
}

export function getOptimalPromptStyle(modelName: string): 'standard' | 'reasoning' | 'enhanced' {
  const capabilities = detectModelCapabilities(modelName);
  return capabilities.recommendedPromptStyle;
}

// Helper function to check if model supports thinking tags
export function supportsThinkingTags(modelName: string): boolean {
  const reasoningModels = ['o1-preview', 'o1-mini', 'thinking', 'reasoning', 'deepseek-r1', 'phi-4', 'qwen2.5-32b', 'qwen3.5'];
  return reasoningModels.some(model => modelName.toLowerCase().includes(model));
}

// Helper function to check if a model has multimodal/vision capabilities
export function isVisionCapable(modelName?: string): boolean {
  if (!modelName) return false;
  const normalized = modelName.toLowerCase().trim();
  
  // Known vision models / patterns
  if (normalized.includes('vision') || 
      normalized.includes('vl') || // qwen-vl
      normalized.includes('llava') || 
      normalized.includes('moondream') || 
      normalized.includes('pixtral') ||
      normalized.includes('minicpm-v') ||
      normalized.includes('gpt-4o') || // standard gpt-4o has vision
      (normalized.includes('gemini') && !normalized.includes('gemini-1.0-pro'))) { // most gemini 1.5/2.0 have vision
    return true;
  }
  
  return false;
}