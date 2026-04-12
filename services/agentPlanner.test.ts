import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentPlannerService, AgentPlanOptions } from './agentPlanner';
import { AIService } from './aiService';

// Mock AIService
vi.mock('./aiService', () => ({
  AIService: {
    summarize: vi.fn(),
    paraphrase: vi.fn(),
    checkGrammar: vi.fn(),
    generateCitation: vi.fn(),
  },
}));

describe('AgentPlannerService', () => {
  const mockOptions: AgentPlanOptions = {
    config: {
      provider: 'gemini',
      apiKey: 'test-key',
      modelName: 'gemini-1.5-pro',
      contextLimit: 8000,
      baseUrl: '',
      maxCompletionTokens: 2048,
    },
    language: 'English',
    topic: 'Testing Protocol',
    goal: 'Create a comprehensive test suite',
    notes: 'Include functional, performance, and integration tests.',
    knowledgeRefs: [
      {
        id: 'ref1',
        docId: 'doc1',
        text: 'Existing testing frameworks include Vitest and Jest.',
        order: 0,
        sourceTitle: 'Testing Guide',
        tags: ['testing'],
      }
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run the full memo workflow correctly', async () => {
    // Setup mocks
    (AIService.summarize as any)
      .mockResolvedValueOnce('Step 1: Plan\nStep 2: Execute\nStep 3: Verify') // For plan
      .mockResolvedValueOnce('This is a summary of the memo.'); // For executive summary

    (AIService.paraphrase as any).mockResolvedValue({
      paraphrasedText: 'This is the draft memo based on the plan.',
      confidence: 0.9,
    });

    (AIService.checkGrammar as any).mockResolvedValue({
      original: 'This is the draft memo based on the plan.',
      corrected: 'This is the draft memo based on the plan.',
      errors: [],
    });

    (AIService.generateCitation as any).mockResolvedValue({
      formatted_citation: '[1] Testing Guide, 2024',
      bibtex: '@misc{testing2024}',
    });

    const result = await AgentPlannerService.runMemoWorkflow(mockOptions);

    // Verify calls
    expect(AIService.summarize).toHaveBeenCalledTimes(2);
    expect(AIService.paraphrase).toHaveBeenCalledTimes(1);
    expect(AIService.checkGrammar).toHaveBeenCalledTimes(1);
    expect(AIService.generateCitation).toHaveBeenCalledTimes(1);

    // Verify result structure
    expect(result).toHaveProperty('plan');
    expect(result).toHaveProperty('memo');
    expect(result).toHaveProperty('grammar');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('citation');
    expect(result).toHaveProperty('knowledgeRefs');

    expect(result.plan).toBe('Step 1: Plan\nStep 2: Execute\nStep 3: Verify');
    expect(result.memo).toBe('This is the draft memo based on the plan.');
    expect(result.knowledgeRefs).toHaveLength(1);
  });

  it('should handle feedback hints in the workflow', async () => {
    const optionsWithHints = {
      ...mockOptions,
      feedbackHints: 'Focus on performance metrics.'
    };

    (AIService.summarize as any).mockResolvedValue('Plan with focus on performance.');
    (AIService.paraphrase as any).mockResolvedValue({ paraphrasedText: 'Memo with performance metrics.' });
    (AIService.checkGrammar as any).mockResolvedValue({ errors: [] });
    (AIService.generateCitation as any).mockResolvedValue({});

    await AgentPlannerService.runMemoWorkflow(optionsWithHints);

    // Verify that summarize was called with enhancement containing feedback hints
    const summarizeCall = (AIService.summarize as any).mock.calls[0];
    const enhancement = summarizeCall[5];
    expect(enhancement.additionalInstructions).toContain('Focus on performance metrics.');
  });

  it('should handle missing notes by using topic or goal', async () => {
    const optionsNoNotes = {
      ...mockOptions,
      notes: ''
    };

    (AIService.summarize as any).mockResolvedValue('Plan');
    (AIService.paraphrase as any).mockResolvedValue({ paraphrasedText: 'Memo' });
    (AIService.checkGrammar as any).mockResolvedValue({ errors: [] });
    (AIService.generateCitation as any).mockResolvedValue({});

    await AgentPlannerService.runMemoWorkflow(optionsNoNotes);

    // Verify paraphrase was called with topic/goal as fallback
    const paraphraseCall = (AIService.paraphrase as any).mock.calls[0];
    expect(paraphraseCall[1]).toBe(mockOptions.topic);
  });
});
