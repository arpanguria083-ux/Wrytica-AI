import { AIService } from './aiService';
import { ContextEnhancement, Guardrail, KnowledgeChunk, LLMConfig, CitationResponse, GrammarCheckResult } from '../utils';

export interface AgentPlanOptions {
  config: LLMConfig;
  language: string;
  topic: string;
  goal: string;
  notes: string;
  guardrail?: Guardrail;
  knowledgeRefs?: KnowledgeChunk[];
  feedbackHints?: string;
}

export interface AgentMemoResult {
  plan: string;
  memo: string;
  grammar: GrammarCheckResult;
  summary: string;
  citation: CitationResponse;
  knowledgeRefs: KnowledgeChunk[];
}

export const AgentPlannerService = {
  async runMemoWorkflow(options: AgentPlanOptions): Promise<AgentMemoResult> {
    const { config, language, topic, goal, notes, guardrail, knowledgeRefs = [] } = options;
    const aggregatedInput = [topic, goal, notes].filter(Boolean).join('\n\n');
    const enhancement: ContextEnhancement = {
      guardrail,
      knowledgeRefs,
      additionalInstructions: `The memo should answer the goal above and reference the provided knowledge where relevant.`
    };

    if (options.feedbackHints) {
      const trimmedHints = options.feedbackHints.trim();
      if (trimmedHints) {
        enhancement.additionalInstructions = [
          enhancement.additionalInstructions,
          trimmedHints
        ].filter(Boolean).join('\n');
      }
    }

    const planInstruction = `Summarize the context below into a 3-step memo outline with headings and focus areas.`;
    const plan = await AIService.summarize(config, aggregatedInput, 'Short', 'Paragraph', language, {
      ...enhancement,
      additionalInstructions: `${enhancement.additionalInstructions}\n${planInstruction}`
    });

    const draftInput = notes || topic || goal || 'Draft a memo on the provided topic.';
    const draftEnhancement: ContextEnhancement = {
      ...enhancement,
      additionalInstructions: `${planInstruction}\nUse the plan: ${plan} and guardrails to produce a memo draft.`
    };
    const paraphraseResult = await AIService.paraphrase(config, draftInput, 'Formal', 50, language, draftEnhancement);
    const memo = paraphraseResult.paraphrasedText;

    const grammar = await AIService.checkGrammar(config, memo, '', language, enhancement);

    const summary = await AIService.summarize(config, memo, 'Medium', 'Paragraph', language, enhancement);

    const citationInput = knowledgeRefs.length
      ? knowledgeRefs.map(ref => `${ref.sourceTitle || 'Knowledge base'}: ${ref.text}`).join('\n\n')
      : `${topic}\n${goal}`;
    const citation = await AIService.generateCitation(config, citationInput, 'APA 7', language, enhancement);

    return {
      plan,
      memo,
      grammar,
      summary,
      citation,
      knowledgeRefs
    };
  }
};
