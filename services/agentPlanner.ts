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

    let plan = '';
    try {
      const planInstruction = `Summarize the context below into a 3-step memo outline with headings and focus areas.`;
      plan = await AIService.summarize(config, aggregatedInput, 'Short', 'Paragraph', language, {
        ...enhancement,
        additionalInstructions: `${enhancement.additionalInstructions}\n${planInstruction}`
      });
    } catch (e) {
      console.warn('Agent Planner: Plan step failed', e);
      plan = '1. Introduction\n2. Key Discussion\n3. Conclusion';
    }

    let memo = '';
    try {
      const draftInput = notes || topic || goal || 'Draft a memo on the provided topic.';
      const draftEnhancement: ContextEnhancement = {
        ...enhancement,
        additionalInstructions: `Summarize the context below into a 3-step memo outline with headings and focus areas.\nUse the plan: ${plan} and guardrails to produce a memo draft.`
      };
      const paraphraseResult = await AIService.paraphrase(config, draftInput, 'Formal', 50, language, draftEnhancement);
      memo = paraphraseResult.paraphrasedText;
    } catch (e) {
      console.warn('Agent Planner: Draft step failed', e);
      memo = `Draft for ${topic}: ${goal}\n\n(Drafting failed, please try again.)`;
    }

    let grammar: GrammarCheckResult = { errors: [], forecast: [] };
    try {
      grammar = await AIService.checkGrammar(config, memo, '', language, enhancement);
    } catch (e) {
      console.warn('Agent Planner: Grammar step failed', e);
    }

    let summary = '';
    try {
      summary = await AIService.summarize(config, memo, 'Medium', 'Paragraph', language, enhancement);
    } catch (e) {
      console.warn('Agent Planner: Summary step failed', e);
      summary = 'Summary unavailable.';
    }

    let citation: CitationResponse = { formatted_citation: '', bibtex: '', components: { author: '', date: '', title: '', source: '', doi_or_url: '' } };
    try {
      const citationInput = knowledgeRefs.length
        ? knowledgeRefs.map(ref => `${ref.sourceTitle || 'Knowledge base'}: ${ref.text}`).join('\n\n')
        : `${topic}\n${goal}`;
      citation = await AIService.generateCitation(config, citationInput, 'APA 7', language, enhancement);
    } catch (e) {
      console.warn('Agent Planner: Citation step failed', e);
    }

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
