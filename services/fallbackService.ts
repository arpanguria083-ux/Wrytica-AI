import { GrammarError, SummaryLength, SummaryFormat } from '../utils';

/**
 * Provides deterministic, AI-independent fallbacks for Wrytica tools
 * when the LLM is unavailable or returns malformed output.
 */
export const FallbackService = {
  /**
   * Simple regex-based grammar check
   */
  checkGrammar: (text: string): { errors: GrammarError[], forecast: string[] } => {
    const errors: GrammarError[] = [];
    
    // 1. Double spaces
    const doubleSpaceRegex = / {2,}/g;
    let match;
    while ((match = doubleSpaceRegex.exec(text)) !== null) {
      errors.push({
        id: `local-gs-${match.index}`,
        original: match[0],
        suggestion: ' ',
        reason: 'Multiple spaces detected.',
        type: 'style',
        context: text.substring(Math.max(0, match.index - 20), Math.min(text.length, match.index + 20))
      });
    }

    // 2. Common typos (simple list)
    const typos: Record<string, string> = {
      'teh': 'the',
      'recieve': 'receive',
      'adress': 'address',
      'occured': 'occurred',
      'definately': 'definitely',
      'seperate': 'separate'
    };

    Object.entries(typos).forEach(([typo, correction]) => {
      const regex = new RegExp(`\\b${typo}\\b`, 'gi');
      while ((match = regex.exec(text)) !== null) {
        errors.push({
          id: `local-typo-${match.index}`,
          original: match[0],
          suggestion: match[0][0] === match[0][0].toUpperCase() 
            ? correction[0].toUpperCase() + correction.slice(1) 
            : correction,
          reason: `Common spelling error: "${typo}"`,
          type: 'spelling',
          context: text.substring(Math.max(0, match.index - 20), Math.min(text.length, match.index + 20))
        });
      }
    });

    // 3. Capitalization after period
    const capRegex = /[.!?]\s+([a-z])/g;
    while ((match = capRegex.exec(text)) !== null) {
      errors.push({
        id: `local-cap-${match.index}`,
        original: match[1],
        suggestion: match[1].toUpperCase(),
        reason: 'Sentence should start with a capital letter.',
        type: 'grammar',
        context: text.substring(Math.max(0, match.index - 20), Math.min(text.length, match.index + 20))
      });
    }

    return {
      errors,
      forecast: [
        "Local analysis active: Check for common mechanical errors.",
        "Tip: Use a full LLM for stylistic and deep grammatical analysis."
      ]
    };
  },

  /**
   * Simple extractive summarizer
   */
  summarize: (text: string, length: SummaryLength, format: SummaryFormat): string => {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const sentences: string[] = [];

    paragraphs.forEach(p => {
      const pSentences = p.match(/[^.!?]+[.!?]+/g) || [p];
      if (pSentences.length > 0) {
        sentences.push(pSentences[0].trim()); // First sentence
        if (length !== 'Short' && pSentences.length > 1) {
          sentences.push(pSentences[pSentences.length - 1].trim()); // Last sentence
        }
      }
    });

    const finalSentences = length === 'Short' ? sentences.slice(0, 3) : sentences;

    if (format === 'Bullet Points') {
      return finalSentences.map(s => `* ${s}`).join('\n');
    }
    return finalSentences.join(' ');
  },

  /**
   * Simple synonym-based paraphraser fallback (very basic)
   */
  paraphrase: (text: string): string => {
    const simpleReplacements: Record<string, string> = {
      'very': 'extremely',
      'good': 'excellent',
      'bad': 'unfavorable',
      'help': 'assist',
      'use': 'utilize',
      'change': 'modify',
      'important': 'significant'
    };

    let paraphrased = text;
    Object.entries(simpleReplacements).forEach(([word, replacement]) => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      paraphrased = paraphrased.replace(regex, (match) => {
        return match[0] === match[0].toUpperCase() 
          ? replacement[0].toUpperCase() + replacement.slice(1) 
          : replacement;
      });
    });

    return paraphrased + "\n\n(Note: Basic local paraphrasing applied due to AI unavailability.)";
  }
};
