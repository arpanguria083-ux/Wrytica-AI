import { describe, it, expect, beforeEach } from 'vitest';
import { RewardService } from './rewardService';
import { FeedbackEntry, KnowledgeChunk } from '../utils';

describe('RewardService', () => {
  // Test data
  const mockChunks: KnowledgeChunk[] = [
    {
      id: 'chunk-1',
      docId: 'doc-1',
      text: 'The quick brown fox jumps over the lazy dog',
      order: 0,
      sourceTitle: 'Test Document',
      tags: ['animal', 'testing'],
    },
    {
      id: 'chunk-2',
      docId: 'doc-1',
      text: 'Machine learning models use semantic embeddings for similarity matching',
      order: 1,
      sourceTitle: 'AI Paper',
      tags: ['ai', 'ml'],
    },
    {
      id: 'chunk-3',
      docId: 'doc-2',
      text: 'Python programming requires understanding of data structures and algorithms',
      order: 2,
      sourceTitle: 'Coding Guide',
      tags: ['programming', 'python'],
    },
  ];

  describe('rerankReferences', () => {
    it('should return original chunks when no feedback exists', () => {
      const feedback: FeedbackEntry[] = [];
      const result = RewardService.rerankReferences(mockChunks, feedback, 'chat');
      
      expect(result).toEqual(mockChunks);
    });

    it('should prioritize chunks matching positive feedback', () => {
      const feedback: FeedbackEntry[] = [
        {
          id: 'fb-1',
          tool: 'chat',
          rating: 1,
          comment: 'I like programming and python content',
          timestamp: Date.now(),
        },
      ];
      
      const result = RewardService.rerankReferences(mockChunks, feedback, 'chat');
      
      // Chunk about Python should be ranked higher
      const pythonChunk = result.find(c => c.id === 'chunk-3');
      expect(pythonChunk).toBeDefined();
      // Should be first or second due to positive feedback match
      expect(result.indexOf(pythonChunk!)).toBeLessThan(2);
    });

    it('should demote chunks matching negative feedback', () => {
      const feedback: FeedbackEntry[] = [
        {
          id: 'fb-1',
          tool: 'chat',
          rating: -1,
          comment: 'I dislike animal content and stories',
          timestamp: Date.now(),
        },
      ];
      
      const result = RewardService.rerankReferences(mockChunks, feedback, 'chat');
      
      // Chunk about animals should be ranked lower
      const animalChunk = result.find(c => c.id === 'chunk-1');
      expect(animalChunk).toBeDefined();
      // Should be last or second-to-last due to negative feedback
      expect(result.indexOf(animalChunk!)).toBeGreaterThanOrEqual(1);
    });

    it('should handle feedback for specific tool only', () => {
      const feedback: FeedbackEntry[] = [
        {
          id: 'fb-1',
          tool: 'paraphraser', // Different tool
          rating: 1,
          comment: 'Formal tone is preferred',
          timestamp: Date.now(),
        },
      ];
      
      const result = RewardService.rerankReferences(mockChunks, feedback, 'chat');
      
      // Should return original order since feedback is for different tool
      expect(result).toEqual(mockChunks);
    });

    it('should handle empty chunk array', () => {
      const feedback: FeedbackEntry[] = [
        {
          id: 'fb-1',
          tool: 'chat',
          rating: 1,
          comment: 'Good response',
          timestamp: Date.now(),
        },
      ];
      
      const result = RewardService.rerankReferences([], feedback, 'chat');
      
      expect(result).toEqual([]);
    });

    it('should handle multiple positive and negative feedback', () => {
      const feedback: FeedbackEntry[] = [
        {
          id: 'fb-1',
          tool: 'chat',
          rating: 1,
          comment: 'AI and machine learning content is great',
          timestamp: Date.now(),
        },
        {
          id: 'fb-2',
          tool: 'chat',
          rating: 1,
          comment: 'I love programming tutorials',
          timestamp: Date.now(),
        },
        {
          id: 'fb-3',
          tool: 'chat',
          rating: -1,
          comment: 'Animal stories are boring',
          timestamp: Date.now(),
        },
      ];
      
      const result = RewardService.rerankReferences(mockChunks, feedback, 'chat');
      
      // AI chunk should be high (positive for AI/ML)
      // Programming chunk should be high (positive for programming)
      // Animal chunk should be low (negative for animals)
      const aiChunk = result.find(c => c.id === 'chunk-2');
      const progChunk = result.find(c => c.id === 'chunk-3');
      const animalChunk = result.find(c => c.id === 'chunk-1');
      
      expect(result.indexOf(aiChunk!)).toBeLessThan(result.indexOf(animalChunk!));
      expect(result.indexOf(progChunk!)).toBeLessThan(result.indexOf(animalChunk!));
    });
  });

  describe('getRerankExplanation', () => {
    it('should return explanation for each chunk', () => {
      const feedback: FeedbackEntry[] = [
        {
          id: 'fb-1',
          tool: 'chat',
          rating: 1,
          comment: 'Good python content',
          timestamp: Date.now(),
        },
      ];
      
      const explanation = RewardService.getRerankExplanation(mockChunks, feedback, 'chat');
      
      expect(explanation).toHaveLength(3);
      explanation.forEach(exp => {
        expect(exp).toHaveProperty('chunkId');
        expect(exp).toHaveProperty('tokenScore');
        expect(exp).toHaveProperty('semanticScore');
        expect(exp).toHaveProperty('totalScore');
      });
    });

    it('should return empty array when no feedback', () => {
      const explanation = RewardService.getRerankExplanation(mockChunks, [], 'chat');
      
      expect(explanation).toEqual([]);
    });

    it('should return empty array for empty chunks', () => {
      const feedback: FeedbackEntry[] = [
        {
          id: 'fb-1',
          tool: 'chat',
          rating: 1,
          comment: 'Good',
          timestamp: Date.now(),
        },
      ];
      
      const explanation = RewardService.getRerankExplanation([], feedback, 'chat');
      
      expect(explanation).toEqual([]);
    });
  });

  describe('semantic similarity', () => {
    it('should match semantically similar content even without exact token match', () => {
      const feedback: FeedbackEntry[] = [
        {
          id: 'fb-1',
          tool: 'chat',
          rating: 1,
          comment: 'Neural networks and deep learning concepts',
          timestamp: Date.now(),
        },
      ];
      
      const chunksWithRelatedTerms: KnowledgeChunk[] = [
        {
          id: 'chunk-a',
          docId: 'doc-a',
          text: 'Transformers use attention mechanisms for deep learning',
          order: 0,
          sourceTitle: 'DL Paper',
          tags: ['deep-learning', 'transformers'],
        },
        {
          id: 'chunk-b',
          docId: 'doc-b',
          text: 'The weather is nice today',
          order: 1,
          sourceTitle: 'Weather',
          tags: ['weather'],
        },
      ];
      
      const result = RewardService.rerankReferences(chunksWithRelatedTerms, feedback, 'chat');
      
      // Deep learning chunk should be ranked higher (semantic similarity)
      const dlChunk = result.find(c => c.id === 'chunk-a');
      const weatherChunk = result.find(c => c.id === 'chunk-b');
      
      expect(result.indexOf(dlChunk!)).toBeLessThan(result.indexOf(weatherChunk!));
    });

    it('should not match unrelated content even with partial token overlap', () => {
      const feedback: FeedbackEntry[] = [
        {
          id: 'fb-1',
          tool: 'chat',
          rating: 1,
          comment: 'I like learning about data science',
          timestamp: Date.now(),
        },
      ];
      
      const chunksWithPartialMatch: KnowledgeChunk[] = [
        {
          id: 'chunk-x',
          docId: 'doc-x',
          text: 'The learning center is open for students',
          order: 0,
          sourceTitle: 'School',
          tags: ['education'],
        },
        {
          id: 'chunk-y',
          docId: 'doc-y',
          text: 'Data science involves statistics and machine learning',
          order: 1,
          sourceTitle: 'Data Science',
          tags: ['data', 'science'],
        },
      ];
      
      const result = RewardService.rerankReferences(chunksWithPartialMatch, feedback, 'chat');
      
      // Data science chunk should be ranked higher (semantic match)
      // Learning center has partial token "learning" but is semantically different
      const dataScienceChunk = result.find(c => c.id === 'chunk-y');
      const learningCenterChunk = result.find(c => c.id === 'chunk-x');
      
      expect(result.indexOf(dataScienceChunk!)).toBeLessThanOrEqual(result.indexOf(learningCenterChunk!));
    });
  });
});