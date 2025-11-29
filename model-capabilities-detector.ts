// Model capabilities detection for reasoning features

interface ModelCapabilities {
  supportsReasoning: boolean;
  supportsChainOfThought: boolean;
  supportsStructuredOutput: boolean;
  recommendedPromptStyle: 'standard' | 'reasoning' | 'enhanced';
}

const REASONING_MODELS = {
  // Gemini models with reasoning capabilities
  'gemini-2.0-flash-thinking-exp': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: true,
    recommendedPromptStyle: 'reasoning' as const
  },
  'gemini-2.5-flash': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: true,
    recommendedPromptStyle: 'enhanced' as const
  },
  
  // OpenAI models with reasoning
  'o1-preview': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: true,
    recommendedPromptStyle: 'reasoning' as const
  },
  'o1-mini': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: true,
    recommendedPromptStyle: 'reasoning' as const
  },
  'gpt-4o': {
    supportsReasoning: false,
    supportsChainOfThought: true,
    supportsStructuredOutput: true,
    recommendedPromptStyle: 'enhanced' as const
  },
  
  // Local models with reasoning capabilities
  'qwen2.5-32b-instruct': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: false,
    recommendedPromptStyle: 'enhanced' as const
  },
  'llama-3.1-70b-instruct': {
    supportsReasoning: false,
    supportsChainOfThought: true,
    supportsStructuredOutput: false,
    recommendedPromptStyle: 'enhanced' as const
  },
  'deepseek-r1': {
    supportsReasoning: true,
    supportsChainOfThought: true,
    supportsStructuredOutput: false,
    recommendedPromptStyle: 'reasoning' as const
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
    if (normalizedName.includes(knownModel.split('-')[0]) || 
        knownModel.includes(normalizedName.split('-')[0])) {
      return capabilities;
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

export function getOptimalPromptStyle(modelName: string): 'standard' | 'reasoning' | 'enhanced' {
  const capabilities = detectModelCapabilities(modelName);
  return capabilities.recommendedPromptStyle;
}

// Helper function to check if model supports thinking tags
export function supportsThinkingTags(modelName: string): boolean {
  const reasoningModels = ['o1-preview', 'o1-mini', 'gemini-2.0-flash-thinking', 'deepseek-r1'];
  return reasoningModels.some(model => modelName.toLowerCase().includes(model));
}

export { REASONING_MODELS, type ModelCapabilities };