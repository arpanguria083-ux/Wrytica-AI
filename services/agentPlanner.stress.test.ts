import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentPlannerService, AgentPlanOptions } from './agentPlanner';
import { AIService } from './aiService';
import { performance } from 'perf_hooks';

// Mock AIService
vi.mock('./aiService', () => ({
  AIService: {
    summarize: vi.fn(),
    paraphrase: vi.fn(),
    checkGrammar: vi.fn(),
    generateCitation: vi.fn(),
  },
}));

describe('AgentPlannerService Stress & Performance', () => {
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
    topic: 'Performance Testing',
    goal: 'Test system under load',
    notes: 'A very long string of notes to simulate large context input. '.repeat(100), // ~5000 chars
    knowledgeRefs: Array.from({ length: 10 }, (_, i) => ({
      id: `ref${i}`,
      docId: `doc${i}`,
      text: `Knowledge chunk ${i} with some content to increase the prompt size.`,
      order: i,
      sourceTitle: `Source ${i}`,
      tags: ['stress-test'],
    })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default successful mocks
    (AIService.summarize as any).mockResolvedValue('Mocked summary');
    (AIService.paraphrase as any).mockResolvedValue({ paraphrasedText: 'Mocked memo', confidence: 0.9 });
    (AIService.checkGrammar as any).mockResolvedValue({ errors: [] });
    (AIService.generateCitation as any).mockResolvedValue({ formatted_citation: 'Mocked citation' });
  });

  it('should handle large context within reasonable time', async () => {
    const startTime = performance.now();
    
    await AgentPlannerService.runMemoWorkflow(mockOptions);
    
    const duration = performance.now() - startTime;
    console.log(`Workflow with large context took ${duration.toFixed(2)}ms`);
    
    // Even with mocks, the logic should be fast. If it's slow, there might be a bottleneck in data processing.
    expect(duration).toBeLessThan(500); // 500ms is generous for mocked calls
  });

  it('should handle concurrent requests', async () => {
    const concurrentRequests = 10;
    const startTime = performance.now();
    
    const promises = Array.from({ length: concurrentRequests }, () => 
      AgentPlannerService.runMemoWorkflow(mockOptions)
    );
    
    const results = await Promise.all(promises);
    
    const duration = performance.now() - startTime;
    console.log(`10 concurrent requests took ${duration.toFixed(2)}ms`);
    
    expect(results).toHaveLength(concurrentRequests);
    expect(duration).toBeLessThan(1000); // Should still be fast with mocks
  });

  it('should handle partial failures gracefully and return partial results', async () => {
    // Simulate citation service failure
    (AIService.generateCitation as any).mockRejectedValue(new Error('Citation service unavailable'));

    const result = await AgentPlannerService.runMemoWorkflow(mockOptions);
    
    // The workflow should NOT fail anymore
    expect(result.memo).toBe('Mocked memo');
    expect(result.citation.formatted_citation).toBe(''); // Empty fallback
  });

  it('should maintain memory efficiency with large inputs', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Run multiple times
    for (let i = 0; i < 20; i++) {
      await AgentPlannerService.runMemoWorkflow(mockOptions);
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (finalMemory - initialMemory) / (1024 * 1024);
    
    console.log(`Memory increase after 20 runs: ${memoryIncrease.toFixed(2)}MB`);
    
    // Memory increase should be minimal if no leaks
    expect(memoryIncrease).toBeLessThan(50); // 50MB limit for 20 runs of large context
  });
});
