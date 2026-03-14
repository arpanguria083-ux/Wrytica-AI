import { FeedbackEntry, KnowledgeChunk, ToolName, STOP_WORDS } from '../utils';

// Embedding dimension - kept small for client-side performance
const DIM = 128;
const MIN_SIMILARITY_THRESHOLD = 0.12;

type RewardProfile = {
  positiveTokens: string[];
  negativeTokens: string[];
  positiveVector: Float32Array;
  negativeVector: Float32Array;
  hasFeedback: boolean;
};

const tokenize = (text: string): string[] =>
  text.toLowerCase().split(/\W+/).filter(t => t && !STOP_WORDS.has(t)).slice(0, 256);

// Create a hash-based embedding vector from text (bag-of-words with hashing)
const embed = (text: string): Float32Array => {
  const vec = new Float32Array(DIM);
  const tokens = tokenize(text);
  if (!tokens.length) return vec;
  
  tokens.forEach(token => {
    // FNV-1a inspired hash for better distribution
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const idx = Math.abs(hash) % DIM;
    vec[idx] += 1;
  });
  
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) vec[i] /= norm;
  return vec;
};

// Cosine similarity between two vectors
const cosineSimilarity = (a: Float32Array, b: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < DIM; i++) {
    sum += a[i] * b[i];
  }
  return sum;
};

const buildProfile = (feedback: FeedbackEntry[], tool: ToolName): RewardProfile => {
  const relevant = feedback.filter(f => f.tool === tool);
  const positives = relevant.filter(f => f.rating > 0).map(f => f.comment || '').filter(Boolean);
  const negatives = relevant.filter(f => f.rating < 0).map(f => f.comment || '').filter(Boolean);
  
  const positiveTokens = tokenize(positives.join(' '));
  const negativeTokens = tokenize(negatives.join(' '));
  
  // Build semantic vectors from feedback comments
  const positiveText = positives.join(' ');
  const negativeText = negatives.join(' ');
  
  return {
    positiveTokens,
    negativeTokens,
    positiveVector: embed(positiveText),
    negativeVector: embed(negativeText),
    hasFeedback: positives.length > 0 || negatives.length > 0
  };
};

// Token-based scoring (original simple approach)
const scoreByTokens = (text: string, profile: RewardProfile): number => {
  if (!text || (!profile.positiveTokens.length && !profile.negativeTokens.length)) return 0;
  
  const tokens = tokenize(text);
  if (!tokens.length) return 0;
  
  const posHits = tokens.filter(t => profile.positiveTokens.includes(t)).length;
  const negHits = tokens.filter(t => profile.negativeTokens.includes(t)).length;
  
  // Use log to prevent overwhelming scores from high token overlap
  return Math.log1p(posHits) - Math.log1p(negHits);
};

// Semantic similarity scoring using embeddings
const scoreBySemanticSimilarity = (text: string, profile: RewardProfile): number => {
  if (!text || !profile.hasFeedback) return 0;
  
  const textVector = embed(text);
  
  // Calculate similarity to positive and negative preference vectors
  const posSim = profile.positiveVector ? cosineSimilarity(textVector, profile.positiveVector) : 0;
  const negSim = profile.negativeVector ? cosineSimilarity(textVector, profile.negativeVector) : 0;
  
  // Weighted combination - positive similarity boosts score, negative reduces it
  // Only apply if similarity is above threshold to avoid noise
  const semanticScore = (posSim > MIN_SIMILARITY_THRESHOLD ? posSim * 2 : 0) 
                      - (negSim > MIN_SIMILARITY_THRESHOLD ? negSim * 2 : 0);
  
  return semanticScore;
};

// Combined scoring with weighted token and semantic components
const scoreText = (text: string, profile: RewardProfile): number => {
  if (!text || !profile.hasFeedback) return 0;
  
  const tokenScore = scoreByTokens(text, profile);
  const semanticScore = scoreBySemanticSimilarity(text, profile);
  
  // Weighted combination: 40% token matching, 60% semantic similarity
  // Semantic similarity captures more nuanced preferences
  return (tokenScore * 0.4) + (semanticScore * 0.6);
};

export const RewardService = {
  rerankReferences(chunks: KnowledgeChunk[], feedback: FeedbackEntry[], tool: ToolName): KnowledgeChunk[] {
    if (!chunks.length) return chunks;
    
    const profile = buildProfile(feedback, tool);
    if (!profile.hasFeedback) return chunks;
    
    // If only negative feedback exists, still apply to demote poor matches
    return [...chunks].sort((a, b) => {
      const contentA = [a.text, a.sourceTitle || '', (a.tags || []).join(' ')].join(' ');
      const contentB = [b.text, b.sourceTitle || '', (b.tags || []).join(' ')].join(' ');
      
      const scoreA = scoreText(contentA, profile);
      const scoreB = scoreText(contentB, profile);
      
      return scoreB - scoreA; // Higher score = more preferred
    });
  },
  
  // Get explanation of why chunks were reranked (useful for debugging)
  getRerankExplanation(chunks: KnowledgeChunk[], feedback: FeedbackEntry[], tool: ToolName): { chunkId: string; tokenScore: number; semanticScore: number; totalScore: number }[] {
    if (!chunks.length) return [];
    
    const profile = buildProfile(feedback, tool);
    if (!profile.hasFeedback) return [];
    
    return chunks.map(chunk => {
      const content = [chunk.text, chunk.sourceTitle || '', (chunk.tags || []).join(' ')].join(' ');
      const tokenScore = scoreByTokens(content, profile);
      const semanticScore = scoreBySemanticSimilarity(content, profile);
      
      return {
        chunkId: chunk.id,
        tokenScore: Math.round(tokenScore * 100) / 100,
        semanticScore: Math.round(semanticScore * 100) / 100,
        totalScore: Math.round((tokenScore * 0.4 + semanticScore * 0.6) * 100) / 100
      };
    });
  }
};