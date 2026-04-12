import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentPlannerService } from './agentPlanner';
import { AIService } from './aiService';
import { KnowledgeBaseService } from './knowledgeBaseService';
import { PageIndexService } from './pageIndexService';
import { VectorStoreService } from './vectorStoreService';
import { buildContextEnhancement } from '../utils';

// Partial mock for AIService
vi.mock('./aiService', () => ({
  AIService: {
    summarize: vi.fn(),
    paraphrase: vi.fn(),
    checkGrammar: vi.fn(),
    generateCitation: vi.fn(),
  },
}));

describe('AgentPlanner Framework Integration', () => {
  const mockConfig = {
    provider: 'gemini',
    apiKey: 'test-key',
    model: 'gemini-1.5-pro',
    temperature: 0.7,
    contextLimit: 8000,
  };

  const mockKnowledgeBase = [
    KnowledgeBaseService.createDocument({
      title: 'Climate Change Report',
      content: 'Global temperatures are rising due to greenhouse gases. This is a critical issue for the planet. Climate change impacts everyone.',
      tags: ['environment', 'climate']
    }),
    KnowledgeBaseService.createDocument({
      title: 'Energy Solutions',
      content: 'Renewable energy is a key solution to climate change. Solar and wind power are leading the way. Solutions are available.',
      tags: ['energy', 'solutions']
    })
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (AIService.summarize as any).mockResolvedValue('Mocked summary');
    (AIService.paraphrase as any).mockResolvedValue({ paraphrasedText: 'Mocked memo', confidence: 0.9 });
    (AIService.checkGrammar as any).mockResolvedValue({ errors: [] });
    (AIService.generateCitation as any).mockResolvedValue({ formatted_citation: 'Mocked citation' });
  });

  it('should integrate with KnowledgeBaseService for context retrieval', async () => {
    const topic = 'Climate Change';
    const goal = 'Propose renewable solutions';
    
    // 1. Simulate UI behavior (from AgentPlanner.tsx)
    const relevantChunks = KnowledgeBaseService.search(`${topic} ${goal}`, mockKnowledgeBase as any);
    
    // Verify KnowledgeBaseService returned something
    expect(relevantChunks.length).toBeGreaterThan(0);
    const sourceTitles = relevantChunks.map(c => c.sourceTitle);
    expect(sourceTitles).toContain('Climate Change Report');
    expect(sourceTitles).toContain('Energy Solutions');

    // 2. Run the workflow with these chunks
    const result = await AgentPlannerService.runMemoWorkflow({
      config: mockConfig as any,
      language: 'English',
      topic,
      goal,
      notes: 'Focus on solar energy.',
      knowledgeRefs: relevantChunks,
    });

    // Verify AgentPlannerService used the chunks for citation input
    expect(AIService.generateCitation).toHaveBeenCalled();
    const citationInput = (AIService.generateCitation as any).mock.calls[0][1];
    expect(citationInput).toContain('Climate Change Report');
    expect(citationInput).toContain('Global temperatures are rising');
  });

  it('should apply context enhancements and guardrails correctly', async () => {
    const guardrail = { id: 'g1', name: 'Formal', instructions: 'Always be formal and concise.' };
    const feedbackHints = 'Avoid using jargon.';
    
    const enhancement = buildContextEnhancement(guardrail as any, feedbackHints);
    
    await AgentPlannerService.runMemoWorkflow({
      config: mockConfig as any,
      language: 'English',
      topic: 'Test',
      goal: 'Test',
      notes: '',
      guardrail: guardrail as any,
      feedbackHints
    });

    // Verify instructions were passed to AI service
    const summarizeCall = (AIService.summarize as any).mock.calls[0];
    const passedEnhancement = summarizeCall[5];
    
    expect(passedEnhancement.guardrail.instructions).toBe('Always be formal and concise.');
    expect(passedEnhancement.additionalInstructions).toContain('Avoid using jargon.');
  });
});
