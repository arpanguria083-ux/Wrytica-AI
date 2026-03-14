import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  LLMConfig, DEFAULT_CONFIGS, LLMProvider, estimateTokens,
  ParaphraserState, GrammarState, SummarizerState, CitationState, ChatState, ChatSession, ChatMessage,
  Guardrail, KnowledgeDocument, KnowledgeChunk, TimelineEntry, FeedbackEntry,
  ContextEnhancement, STORAGE_KEYS, generateId, ToolName, detectGPUAvailable
} from '../utils';
import { KnowledgeBaseService } from '../services/knowledgeBaseService';
import { VectorStoreService } from '../services/vectorStoreService';
import { StorageService } from '../services/storageService';
import { WorkspaceService, WorkspaceHandle } from '../services/workspaceService';


const safeLoad = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

const safeSave = (key: string, value: any) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      console.warn('LocalStorage quota exceeded. Data may not be saved to legacy storage.');
    } else {
      console.error('SafeSave failed:', e);
    }
  }
};


const DEFAULT_GUARDRAILS: Guardrail[] = [
  {
    id: 'corporate-neutral',
    name: 'Corporate Neutral',
    description: 'Keep language professional, clear, and within corporate formal tone with no slang.',
    tone: 'Professional',
    formattingNotes: 'Use concise sentences, bullet points when summarizing, and avoid exclamation marks.',
    prohibitedPhrases: ['you guys', 'lol', 'just saying'],
  }
];

interface AppContextType {
  config: LLMConfig;
  updateConfig: (newConfig: Partial<LLMConfig>) => void;
  resetConfig: () => void;
  
  // Context Calculator State
  currentUsage: number;
  updateUsage: (text: string) => void;
  usagePercentage: number;
  isOverLimit: boolean;

  // Language State
  language: string;
  setLanguage: (lang: string) => void;
  readingMode: 'day' | 'night' | 'sepia';
  setReadingMode: (mode: 'day' | 'night' | 'sepia') => void;

  // Global Tool States
  paraphraserState: ParaphraserState;
  setParaphraserState: React.Dispatch<React.SetStateAction<ParaphraserState>>;
  grammarState: GrammarState;
  setGrammarState: React.Dispatch<React.SetStateAction<GrammarState>>;
  summarizerState: SummarizerState;
  setSummarizerState: React.Dispatch<React.SetStateAction<SummarizerState>>;
  citationState: CitationState;
  setCitationState: React.Dispatch<React.SetStateAction<CitationState>>;
  chatState: ChatState;
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>;
  chatSessions: ChatSession[];
  currentSessionId: string | null;
  createNewChatSession: (initialMessage?: string) => string;
  loadChatSession: (sessionId: string) => void;
  deleteChatSession: (sessionId: string) => void;
  updateChatSessionMessages: (sessionId: string, messages: ChatMessage[]) => void;
  syncChatSessionToMemory: (sessionId: string) => void;
  // In-progress input persistence

  saveInputText: (tool: string, text: string) => void;
  getSavedInput: (tool: string) => string;
  // UI preferences
  visionRagEnabled: boolean;
  setVisionRagEnabled: (val: boolean) => void;
  chatHistory: TimelineEntry[];
  addChatHistoryEntry: (entry: TimelineEntry) => void;
  toolHistory: TimelineEntry[];
  recordToolHistory: (entry: TimelineEntry) => void;
  feedbackLog: FeedbackEntry[];
  recordFeedback: (tool: FeedbackEntry['tool'], rating: number, comment?: string, relatedEntryId?: string) => void;
  getFeedbackHints: (tool: ToolName) => string;
  retrievalMode: 'pageindex' | 'hybrid';
  setRetrievalMode: (mode: 'pageindex' | 'hybrid') => void;
  hasGPU: boolean;
  selfImproveEnabled: boolean;
  setSelfImproveEnabled: (val: boolean) => void;
  knowledgeBase: KnowledgeDocument[];
  addKnowledgeDocument: (doc: KnowledgeDocument) => void;
  addKnowledgeDocumentsBatch: (docs: KnowledgeDocument[]) => Promise<void>;
  updateKnowledgeDocument: (doc: KnowledgeDocument) => void;
  removeKnowledgeDocument: (id: string) => void;

  guardrails: Guardrail[];
  addGuardrail: (guardrail: Guardrail) => void;
  updateGuardrail: (guardrail: Guardrail) => void;
  deleteGuardrail: (id: string) => void;
  selectedGuardrailId: string | null;
  setSelectedGuardrailId: (id: string | null) => void;
  lastKnowledgeReferences: KnowledgeChunk[];
  setKnowledgeReferences: React.Dispatch<React.SetStateAction<KnowledgeChunk[]>>;
  getCitationHistory: () => TimelineEntry[];
  
  // Storage & Workspace
  storageMode: 'standard' | 'native' | 'hybrid';
  setStorageMode: (mode: 'standard' | 'native' | 'hybrid') => void;
  workspaceHandle: WorkspaceHandle | null;
  connectWorkspace: () => Promise<void>;
  disconnectWorkspace: () => void;
  isStorageLoading: boolean;

  // Memory Stats
  getMemoryStats: () => Promise<{ kbDocs: number; kbChunks: number; chatSessions: number; vectors: number; historyEntries: number; kbSizeMB: number; chatSizeMB: number; historySizeMB: number; totalSizeMB: number; diskSizeMB: number; diskFiles: number; diskCacheTimestamp: number | null }>;
  setBulkIngestionInProgress: (value: boolean) => void;
  exportMemoryStats: () => string;
  clearMemory: (target: 'knowledge' | 'chat' | 'history' | 'vectors' | 'all') => Promise<void>;
}


const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load config from localStorage or default
  const [config, setConfig] = useState<LLMConfig>(() => safeLoad<LLMConfig>(STORAGE_KEYS.config, DEFAULT_CONFIGS.gemini));

  const [language, setLanguage] = useState<string>('English');
  const [currentUsage, setCurrentUsage] = useState(0);
  const [chatHistory, setChatHistory] = useState<TimelineEntry[]>([]);
  const [toolHistory, setToolHistory] = useState<TimelineEntry[]>([]);
  const [feedbackLog, setFeedbackLog] = useState<FeedbackEntry[]>(() => safeLoad(STORAGE_KEYS.feedback, []));
  const storedGuardrails = safeLoad<Guardrail[]>(STORAGE_KEYS.guardrails, []);
  const initialGuardrails = storedGuardrails.length ? storedGuardrails : DEFAULT_GUARDRAILS;
  const [guardrails, setGuardrails] = useState<Guardrail[]>(initialGuardrails);

  const [selectedGuardrailId, setSelectedGuardrailIdState] = useState<string | null>(() => {
    const stored = safeLoad<string | null>(STORAGE_KEYS.selectedGuardrail, null);
    return stored || initialGuardrails[0]?.id || null;
  });
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeDocument[]>([]);

  const [lastKnowledgeReferences, setKnowledgeReferences] = useState<KnowledgeChunk[]>([]);
  const [readingMode, setReadingModeState] = useState<'day' | 'night' | 'sepia'>(() => {
    return safeLoad<'day' | 'night' | 'sepia'>(STORAGE_KEYS.readingMode, 'day');
  });
  const [retrievalMode, setRetrievalModeState] = useState<'pageindex' | 'hybrid'>(() => {
    return safeLoad<'pageindex' | 'hybrid'>(STORAGE_KEYS.retrievalMode, 'pageindex');
  });
  const [hasGPU, setHasGPU] = useState<boolean>(false);
  const [selfImproveEnabled, setSelfImproveEnabledState] = useState<boolean>(() => safeLoad<boolean>(STORAGE_KEYS.selfImprove, false));

// --- Memory Limits ---
const MAX_KNOWLEDGE_DOCS = 500;
const MAX_CHAT_SESSIONS = 50;
const MAX_HISTORY_ENTRIES = 200;

// --- Hybrid Storage & Workspace State ---
  const [storageMode, setStorageModeState] = useState<'standard' | 'native' | 'hybrid'>(() => 
    safeLoad(STORAGE_KEYS.storageMode || 'wrytica_storage_mode', 'standard')
  );
  const [workspaceHandle, setWorkspaceHandle] = useState<WorkspaceHandle | null>(null);
  const [isStorageLoading, setIsStorageLoading] = useState<boolean>(true);
  const syncTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [cachedDiskUsage, setCachedDiskUsage] = useState<{ sizeMB: number; files: number; timestamp: number } | null>(null);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };
  }, []);







  // --- Tool States (with in-progress input persistence) ---
  
  // Load saved input separately to persist unsaved work
  const savedInputText = safeLoad<string>(STORAGE_KEYS.paraphraserInputText, '');
  const [paraphraserState, setParaphraserState] = useState<ParaphraserState>(() => {
    const saved = safeLoad<ParaphraserState>(STORAGE_KEYS.paraphraserState, {
      input: '',
      output: '',
      outputHtml: '',
      mode: 'Standard',
      synonyms: 50,
      toneAnalysis: null,
      isLoading: false,
      options: {
        phraseFlip: false,
        sentenceRestructure: false,
        fluency: false,
        sentenceCompression: false,
        wordLevel: false
      }
    });
    // Restore unsaved input if not already in saved state
    if (savedInputText && !saved.input) {
      saved.input = savedInputText;
    }
    // Force loading to false on mount to avoid stuck states
    return { ...saved, isLoading: false };
  });
  useEffect(() => { safeSave(STORAGE_KEYS.paraphraserState, paraphraserState); }, [paraphraserState]);

  const [grammarState, setGrammarState] = useState<GrammarState>(() => {
    const saved = safeLoad<GrammarState>(STORAGE_KEYS.grammarState, {
      text: '',
      historyText: '',
      errors: [],
      forecast: [],
      isLoading: false
    });
    return { ...saved, isLoading: false };
  });
  useEffect(() => { safeSave(STORAGE_KEYS.grammarState, grammarState); }, [grammarState]);

  const [summarizerState, setSummarizerState] = useState<SummarizerState>(() => {
    const saved = safeLoad<SummarizerState>(STORAGE_KEYS.summarizerState, {
      text: '',
      summary: '',
      summaryHtml: '',
      length: 'Medium',
      format: 'Paragraph',
      isLoading: false
    });
    return { ...saved, isLoading: false };
  });
  useEffect(() => { safeSave(STORAGE_KEYS.summarizerState, summarizerState); }, [summarizerState]);

  const [citationState, setCitationState] = useState<CitationState>(() => {
    const saved = safeLoad<CitationState>(STORAGE_KEYS.citationState, {
      sourceInput: '',
      result: null,
      style: 'APA 7',
      isLoading: false
    });
    return { ...saved, isLoading: false };
  });
  useEffect(() => { safeSave(STORAGE_KEYS.citationState, citationState); }, [citationState]);

  // Chat input persistence
  const savedChatInput = safeLoad<string>(STORAGE_KEYS.chatInputText, '');
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);


  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => {
    const saved = safeLoad<string | null>(STORAGE_KEYS.currentSessionId, null);
    return saved || (chatSessions.length > 0 ? chatSessions[0].id : null);
  });

  const [chatState, setChatState] = useState<ChatState>(() => {
    const activeSession = chatSessions.find(s => s.id === currentSessionId) || chatSessions[0];
    return {
      sessions: chatSessions,
      currentSessionId: activeSession?.id || null,
      messages: activeSession?.messages || []
    } as any; // Using any for temporary backward compatibility if needed, but we'll fix usage
  });
  const [savedInputTexts, setSavedInputTexts] = useState<Record<string, string>>(() => ({
    paraphraser: safeLoad(STORAGE_KEYS.paraphraserInputText, ''),
    grammar: safeLoad(STORAGE_KEYS.grammarInputText, ''),
    summarizer: safeLoad(STORAGE_KEYS.summarizerInputText, ''),
    citation: safeLoad(STORAGE_KEYS.citationInputText, ''),
    chat: safeLoad(STORAGE_KEYS.chatInputText, ''),
  }));
  const [visionRagEnabled, setVisionRagEnabled] = useState<boolean>(() => 
    safeLoad<boolean>(STORAGE_KEYS.visionRagEnabled, false)
  );

  // Save input text on change (debounced for each tool)
  const saveInputText = (tool: string, text: string) => {
    setSavedInputTexts(prev => ({ ...prev, [tool]: text }));
    const keyMap: Record<string, string> = {
      paraphraser: STORAGE_KEYS.paraphraserInputText,
      grammar: STORAGE_KEYS.grammarInputText,
      summarizer: STORAGE_KEYS.summarizerInputText,
      citation: STORAGE_KEYS.citationInputText,
      chat: STORAGE_KEYS.chatInputText,
    };
    safeSave(keyMap[tool], text);
  };

  // Get saved input for a tool (call on mount to restore)
  const getSavedInput = (tool: string): string => {
    return savedInputTexts[tool] || '';
  };
  useEffect(() => {
    // Sync chatState when sessions or currentId changes
    const activeSession = chatSessions.find(s => s.id === currentSessionId);
    if (activeSession) {
      setChatState({
        sessions: chatSessions,
        currentSessionId: currentSessionId,
        messages: activeSession.messages
      } as any);
    }
  }, [chatSessions, currentSessionId]);


  useEffect(() => {
    safeSave(STORAGE_KEYS.currentSessionId, currentSessionId);
  }, [currentSessionId]);




  // --- Unified Storage & Migration Logic ---
  useEffect(() => {
    const initializeStorage = async () => {
      setIsStorageLoading(true);
      
      try {
        // 1. Migration from LocalStorage (one-time)
        const migrationMap: Record<string, string> = {
          knowledgeBase: STORAGE_KEYS.knowledgeBase,
          chatSessions: STORAGE_KEYS.chatSessions,
          toolHistory: STORAGE_KEYS.toolTimeline,
          chatHistory: STORAGE_KEYS.chatHistory
        };
        
        for (const [store, key] of Object.entries(migrationMap)) {
          const legacyData = localStorage.getItem(key);
          if (legacyData) {
            try {
              const parsed = JSON.parse(legacyData);
              if (Array.isArray(parsed) && parsed.length > 0) {
                console.log(`Migrating ${store} to IndexedDB...`);
                await StorageService.bulkPut(store, parsed);
              }
              localStorage.removeItem(key);
            } catch (e) {
              console.error(`Migration failed for ${store}:`, e);
            }
          }
        }


        // 2. Load from IndexedDB
        const [kb, sessions, toolHist, chatHist, savedWorkspace] = await Promise.all([
          StorageService.getAll<KnowledgeDocument>('knowledgeBase'),
          StorageService.getAll<ChatSession>('chatSessions'),
          StorageService.getAll<TimelineEntry>('toolHistory'),
          StorageService.getAll<TimelineEntry>('chatHistory'),
          StorageService.getAll<{id: string, value: any}>('settings')
        ]);

        if (kb.length) setKnowledgeBase(kb);
        
        const finalSessions = sessions.length > 0 ? sessions : [{
          id: generateId(),
          title: 'New Chat',
          messages: [{ 
            role: 'model' as const, 
            content: "Hello! I'm your AI writing assistant. How can I help you draft or edit today?", 
            timestamp: Date.now() 
          }],
          timestamp: Date.now()
        }];
        setChatSessions(finalSessions);
        
        if (!currentSessionId && finalSessions.length > 0) {
          setCurrentSessionId(finalSessions[0].id);
        }

        if (toolHist.length) setToolHistory(toolHist);
        if (chatHist.length) setChatHistory(chatHist);


        // Restore workspace handle
        const workspaceSetting = savedWorkspace.find(s => s.id === 'workspaceHandle');
        if (workspaceSetting?.value) {
          const handle = workspaceSetting.value as WorkspaceHandle;
          if (handle.directory) {
            try {
              // Check if we still have permission
              // @ts-ignore - queryPermission exists in browser API but not in TypeScript types
              const permission = await handle.directory.queryPermission({ mode: 'readwrite' });
              setWorkspaceHandle(handle);
              if (permission === 'granted') {
                const savedMode = localStorage.getItem('wrytica_storage_mode');
                if (savedMode === 'hybrid' || savedMode === 'native') {
                  setStorageModeState(savedMode as any);
                }
              } else {
                // If not granted (prompt or denied), still set handle so UI can show "Reconnect"
                console.log('Workspace permission is:', permission);
              }
            } catch (e) {
              console.error('Failed to verify workspace permission:', e);
            }
          }
        }




        // 3. Rebuild Vector Store
        if (retrievalMode === 'hybrid') {
          VectorStoreService.rebuild(kb);
        }
      } catch (err) {
        console.error('Storage initialization failed:', err);
      } finally {
        setIsStorageLoading(false);
      }
    };

    initializeStorage();
  }, []);

  const connectWorkspace = async () => {
    const handle = await WorkspaceService.requestFolder();
    if (handle) {
      setWorkspaceHandle(handle);
      setStorageModeState('hybrid');
      safeSave('wrytica_storage_mode', 'hybrid');
      // Persist handle to IndexedDB (localStorage can't hold FileSystemHandle)
      StorageService.put('settings', { id: 'workspaceHandle', value: handle });
      // Mirror existing data to disk immediately
      syncAllToDisk(handle);
    }
  };

  const disconnectWorkspace = () => {
    setWorkspaceHandle(null);
    setStorageModeState('standard');
    safeSave('wrytica_storage_mode', 'standard');
    StorageService.delete('settings', 'workspaceHandle');
  };




  const setStorageMode = (mode: 'standard' | 'native' | 'hybrid') => {
    setStorageModeState(mode);
    safeSave('wrytica_storage_mode', mode);
  };


  const addChatHistoryEntry = (entry: TimelineEntry) => {
    // Truncate large outputs to save memory
    const truncatedEntry = {
      ...entry,
      output: entry.output?.slice(0, 10000) || '', // Limit output size
      references: entry.references?.slice(0, 10) // Limit references
    };
    setChatHistory(prev => [truncatedEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
    StorageService.put('chatHistory', truncatedEntry);
    if (storageMode === 'hybrid' && workspaceHandle) {
      debouncedSync();
    }
  };

  const recordToolHistory = (entry: TimelineEntry) => {
    // Truncate large outputs to save memory
    const truncatedEntry = {
      ...entry,
      output: entry.output?.slice(0, 10000) || '',
      references: entry.references?.slice(0, 10)
    };
    setToolHistory(prev => [truncatedEntry, ...prev].slice(0, MAX_HISTORY_ENTRIES));
    StorageService.put('toolHistory', truncatedEntry);
    if (storageMode === 'hybrid' && workspaceHandle) {
      debouncedSync();
    }
  };



  const createNewChatSession = (initialMessage?: string) => {
    const newId = generateId();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Chat',
      messages: [{ 
        role: 'model' as const, 
        content: initialMessage || "Hello! I'm your AI writing assistant. How can I help you draft or edit today?", 
        timestamp: Date.now() 
      }],
      timestamp: Date.now()
    };
    setChatSessions(prev => {
      // Enforce session limit - remove oldest sessions
      const updated = [newSession, ...prev];
      if (updated.length > MAX_CHAT_SESSIONS) {
        // Remove oldest sessions from storage
        const toRemove = updated.slice(MAX_CHAT_SESSIONS).map(s => s.id);
        toRemove.forEach(id => StorageService.delete('chatSessions', id));
        return updated.slice(0, MAX_CHAT_SESSIONS);
      }
      return updated;
    });
    StorageService.put('chatSessions', newSession);
    if (storageMode === 'hybrid' && workspaceHandle) {
      debouncedSync();
    }
    setCurrentSessionId(newId);
    return newId;
  };



  const loadChatSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  const deleteChatSession = (sessionId: string) => {
    setChatSessions(prev => {
      const next = prev.filter(s => s.id !== sessionId);
      StorageService.delete('chatSessions', sessionId);
      if (storageMode === 'hybrid' && workspaceHandle) {
        syncAllToDisk(workspaceHandle);
      }
      if (next.length === 0) {
        const fallback: ChatSession = {
          id: generateId(),
          title: 'New Chat',
          messages: [{ role: 'model' as const, content: "Hello!", timestamp: Date.now() }],
          timestamp: Date.now()
        };
        StorageService.put('chatSessions', fallback);
        return [fallback];
      }
      return next;
    });
    if (currentSessionId === sessionId) {
      setCurrentSessionId(chatSessions.find(s => s.id !== sessionId)?.id || null);
    }
  };


  const updateChatSessionMessages = (sessionId: string, messages: ChatMessage[]) => {
    setChatSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        let title = s.title;
        if (title === 'New Chat') {
          const firstUserMsg = messages.find(m => m.role === 'user');
          if (firstUserMsg) {
            title = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '');
          }
        }
        const updated = { ...s, messages, title, timestamp: Date.now() };
        StorageService.put('chatSessions', updated);
        if (storageMode === 'hybrid' && workspaceHandle) {
          syncAllToDisk(workspaceHandle);
        }
        return updated;
      }
      return s;
    }));
  };


  const syncChatSessionToMemory = (sessionId: string) => {
    const session = chatSessions.find(s => s.id === sessionId);
    if (!session || session.messages.length < 2) return;

    const chatContent = session.messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
      .join('\n\n');

    const sourceId = `chat-session:${sessionId}`;
    const existingDoc = knowledgeBase.find(doc => doc.source === sourceId);

    if (existingDoc) {
      const updatedDoc = KnowledgeBaseService.addChunksToDocument(existingDoc, ''); // Trick to update content
      updatedDoc.content = chatContent; // Full update
      // Re-chunking is handled by the service if we use it correctly, but simple update is better here
      const newDoc = KnowledgeBaseService.createDocument({
        title: `Chat Memory: ${session.title}`,
        content: chatContent,
        source: sourceId,
        tags: ['chat', 'memory']
      });
      newDoc.id = existingDoc.id; // Preserve ID
      updateKnowledgeDocument(newDoc);
    } else {
      const newDoc = KnowledgeBaseService.createDocument({
        title: `Chat Memory: ${session.title}`,
        content: chatContent,
        source: sourceId,
        tags: ['chat', 'memory']
      });
      addKnowledgeDocument(newDoc);
    }
  };

  const recordFeedback = (tool: FeedbackEntry['tool'], rating: number, comment?: string, relatedEntryId?: string) => {
    const feedback: FeedbackEntry = {
      id: generateId(),
      tool,
      rating,
      comment,
      timestamp: Date.now(),
      relatedEntryId
    };
    setFeedbackLog(prev => {
      const next = [feedback, ...prev].slice(0, 200);
      safeSave(STORAGE_KEYS.feedback, next); // Feedback is small, keep in localStorage
      return next;
    });

  };

  const getFeedbackHints = (tool: ToolName) => {
    const relevant = feedbackLog.filter(entry => entry.tool === tool).slice(0, 6);
    if (!relevant.length) return '';
    const positives = relevant.filter(entry => entry.rating > 0).map(entry => entry.comment || 'Positive response');
    const negatives = relevant.filter(entry => entry.rating < 0).map(entry => entry.comment || 'Needs refinement');
    const hints: string[] = [];
    if (positives.length) {
      hints.push(`Positive: ${positives.join(' | ')}`);
    }
    if (negatives.length) {
      hints.push(`Improve: ${negatives.join(' | ')}`);
    }
    return hints.join(' ');
  };

  const addKnowledgeDocument = (doc: KnowledgeDocument) => {
    // Strip large page images before storing to save memory
    const lightweightDoc = {
      ...doc,
      pageImages: undefined // Don't store base64 images in memory
    };
    setKnowledgeBase(prev => {
      const updated = [lightweightDoc, ...prev];
      if (updated.length > MAX_KNOWLEDGE_DOCS) {
        // Remove oldest docs from storage
        const toRemove = updated.slice(MAX_KNOWLEDGE_DOCS).map(d => d.id);
        toRemove.forEach(id => {
          StorageService.delete('knowledgeBase', id);
          VectorStoreService.removeDocument(id);
        });
        return updated.slice(0, MAX_KNOWLEDGE_DOCS);
      }
      return updated;
    });
    StorageService.put('knowledgeBase', lightweightDoc);
    if (storageMode === 'hybrid' && workspaceHandle) {
      debouncedSync();
    }
    if (retrievalMode === 'hybrid') {
      VectorStoreService.upsertDocument(lightweightDoc);
    }
  };

  // Ref to store latest knowledgeBase for vector rebuild (avoids stale closure)
  const knowledgeBaseRef = React.useRef<KnowledgeDocument[]>([]);
  // Keep ref in sync with state
  useEffect(() => {
    knowledgeBaseRef.current = knowledgeBase;
  }, [knowledgeBase]);

  // Flag to track batch count for vector rebuild timing
  const batchCountRef = React.useRef(0);
  const pendingVectorRebuild = React.useRef(false);
  // Flag to completely disable vector indexing during bulk upload to prevent memory spikes
  const bulkIngestionInProgressRef = React.useRef(false);

  const addKnowledgeDocumentsBatch = async (docs: KnowledgeDocument[]) => {
    // Strip page images from all docs
    const lightweightDocs = docs.map(doc => ({
      ...doc,
      pageImages: undefined
    }));
    
    // Increment batch counter
    batchCountRef.current += 1;
    const currentBatchNum = batchCountRef.current;
    
    setKnowledgeBase(prev => {
      const updated = [...lightweightDocs, ...prev];
      if (updated.length > MAX_KNOWLEDGE_DOCS) {
        const toRemove = updated.slice(MAX_KNOWLEDGE_DOCS).map(d => d.id);
        toRemove.forEach(id => {
          StorageService.delete('knowledgeBase', id);
          VectorStoreService.removeDocument(id);
        });
        return updated.slice(0, MAX_KNOWLEDGE_DOCS);
      }
      return updated;
    });
    await StorageService.bulkPut('knowledgeBase', lightweightDocs);
    if (storageMode === 'hybrid' && workspaceHandle) {
      debouncedSync();
    }
    
    // FIX #4: Skip ALL vector operations during bulk upload to prevent memory spikes
    // Vector indexing will happen in ONE batch after ALL files are processed
    // This is critical for handling 68+ PDF files without crashing
    if (retrievalMode === 'hybrid') {
      // Explicitly set flag on first batch to track when bulk ingestion begins
      if (!bulkIngestionInProgressRef.current) {
        bulkIngestionInProgressRef.current = true;
        pendingVectorRebuild.current = true;
      }
      
      // Schedule single rebuild AFTER all batches complete (using batch counter)
      setTimeout(async () => {
        // Only rebuild if this was the last batch (no more batches in last 3 seconds)
        if (batchCountRef.current === currentBatchNum && pendingVectorRebuild.current) {
          // Use ref to get the latest knowledgeBase instead of stale closure
          await VectorStoreService.rebuild(knowledgeBaseRef.current);
          pendingVectorRebuild.current = false;
          bulkIngestionInProgressRef.current = false; // Reset flag after rebuild
        }
      }, 3000); // Wait 3s after last batch to ensure all are processed
    }
  };


  const updateKnowledgeDocument = (doc: KnowledgeDocument) => {
    // Strip page images to save memory
    const lightweightDoc = { ...doc, pageImages: undefined };
    setKnowledgeBase(prev => prev.map(item => item.id === doc.id ? lightweightDoc : item));
    StorageService.put('knowledgeBase', lightweightDoc);
    if (storageMode === 'hybrid' && workspaceHandle) {
      debouncedSync();
    }
    if (retrievalMode === 'hybrid') {
      VectorStoreService.upsertDocument(lightweightDoc, true);
    }
  };

  const removeKnowledgeDocument = (id: string) => {
    setKnowledgeBase(prev => prev.filter(item => item.id !== id));
    StorageService.delete('knowledgeBase', id);
    if (storageMode === 'hybrid' && workspaceHandle) {
      debouncedSync();
    }
    VectorStoreService.removeDocument(id);
  };



  const addGuardrail = (guardrail: Guardrail) => {
    setGuardrails(prev => {
      const next = [guardrail, ...prev];
      safeSave(STORAGE_KEYS.guardrails, next);
      return next;
    });
  };

  const updateGuardrail = (guardrail: Guardrail) => {
    setGuardrails(prev => {
      const next = prev.map(item => item.id === guardrail.id ? guardrail : item);
      safeSave(STORAGE_KEYS.guardrails, next);
      return next;
    });
  };

  const deleteGuardrail = (id: string) => {
    setGuardrails(prev => {
      const next = prev.filter(item => item.id !== id);
      safeSave(STORAGE_KEYS.guardrails, next);
      if (selectedGuardrailId === id) {
        const fallback = next[0]?.id || null;
        setSelectedGuardrailIdState(fallback);
        safeSave(STORAGE_KEYS.selectedGuardrail, fallback);
      }
      return next;
    });
  };

  const handleSetSelectedGuardrailId = (id: string | null) => {
    setSelectedGuardrailIdState(id);
    safeSave(STORAGE_KEYS.selectedGuardrail, id);
  };

  const setReadingMode = (mode: 'day' | 'night' | 'sepia') => {
    setReadingModeState(mode);
    safeSave(STORAGE_KEYS.readingMode, mode);
  };

  const setRetrievalMode = (mode: 'pageindex' | 'hybrid') => {
    setRetrievalModeState(mode);
    safeSave(STORAGE_KEYS.retrievalMode, mode);
    if (mode === 'hybrid') {
      VectorStoreService.rebuild(knowledgeBase);
    } else {
      VectorStoreService.clear();
    }
  };

  const setSelfImproveEnabled = (val: boolean) => {
    setSelfImproveEnabledState(val);
    safeSave(STORAGE_KEYS.selfImprove, val);
  };

  const getCitationHistory = () => {
    return toolHistory.filter(entry => entry.tool === 'citation');
  };

  // Removed redundant VectorStore rebuild useEffect here since CRUD verbs handle it directly


  useEffect(() => {
    setHasGPU(detectGPUAvailable());
  }, []);

  // Update disk cache after sync - calculate approximate size of synced files
  const updateDiskCache = React.useCallback(async (handle: WorkspaceHandle) => {
    if (!handle?.directory) return;
    try {
      const diskUsage = await WorkspaceService.getDiskUsage(handle.directory);
      const totalBytes = diskUsage.reduce((acc, f) => acc + f.sizeBytes, 0);
      setCachedDiskUsage({
        sizeMB: parseFloat((totalBytes / (1024 * 1024)).toFixed(1)),
        files: diskUsage.length,
        timestamp: Date.now()
      });
    } catch (e) {
      console.error('Failed to update disk cache:', e);
    }
  }, []);

  // FIX #5: Remove pretty-print from JSON.stringify to reduce memory spike during sync
  const syncAllToDisk = React.useCallback(async (handle: WorkspaceHandle) => {
    // Use compact JSON (no pretty-print) to reduce memory during serialization
    await WorkspaceService.writeFile(handle.directory, 'knowledge_base.json', JSON.stringify(knowledgeBase));
    await WorkspaceService.writeFile(handle.directory, 'chat_sessions.json', JSON.stringify(chatSessions));
    await WorkspaceService.writeFile(handle.directory, 'tool_history.json', JSON.stringify(toolHistory));
    // Update cache after successful sync
    updateDiskCache(handle);
  }, [knowledgeBase, chatSessions, toolHistory, updateDiskCache]);

  const debouncedSync = React.useCallback(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      if (workspaceHandle) {
        syncAllToDisk(workspaceHandle);
      }
    }, 2000); // 2 second debounce
  }, [workspaceHandle, syncAllToDisk]);

  const updateConfig = (newConfig: Partial<LLMConfig>) => {

    setConfig(prev => ({ ...prev, ...newConfig }));
  };

  const resetConfig = () => {
    setConfig(DEFAULT_CONFIGS.gemini);
  };

  const updateUsage = (text: string) => {
    const tokens = estimateTokens(text);
    setCurrentUsage(tokens);
  };

  const usagePercentage = Math.min((currentUsage / config.contextLimit) * 100, 100);
  const isOverLimit = currentUsage > config.contextLimit;

  // Memory stats calculation with size estimates
  const getMemoryStats = async () => {
    const kbDocs = knowledgeBase.length;
    const kbChunks = knowledgeBase.reduce((acc, doc) => acc + (doc.chunks?.length || 0), 0);
    const chatSess = chatSessions.length;
    const histEntries = chatHistory.length + toolHistory.length;
    // Vector count would need to come from VectorStoreService, but we can't easily access it
    // So we'll estimate based on chunks when in hybrid mode
    const vectors = retrievalMode === 'hybrid' ? kbChunks : 0;

    // Estimate memory sizes (approximate bytes -> MB)
    // KB content: ~2KB per chunk average, chat messages: ~500 bytes each, history: ~1KB per entry
    const kbSizeBytes = knowledgeBase.reduce((acc, doc) => {
      return acc + (doc.content?.length || 0) * 2 + (doc.chunks?.reduce((c, chunk) => c + (chunk.text?.length || 0), 0) || 0);
    }, 0);
    const chatSizeBytes = chatSessions.reduce((acc, session) => {
      return acc + session.messages.reduce((m, msg) => m + (msg.content?.length || 0), 0);
    }, 0);
    const historySizeBytes = [...chatHistory, ...toolHistory].reduce((acc, entry) => {
      return acc + (entry.input?.length || 0) + (entry.output?.length || 0);
    }, 0);

    const kbSizeMB = (kbSizeBytes / (1024 * 1024)).toFixed(1);
    const chatSizeMB = (chatSizeBytes / (1024 * 1024)).toFixed(1);
    const historySizeMB = (historySizeBytes / (1024 * 1024)).toFixed(1);
    const totalSizeMB = (parseFloat(kbSizeMB) + parseFloat(chatSizeMB) + parseFloat(historySizeMB)).toFixed(1);

    // Calculate disk usage in hybrid mode - use cache if available and fresh (< 5 min old)
    let diskSizeMB = 0;
    let diskFiles = 0;
    const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes
    if (storageMode === 'hybrid' && workspaceHandle) {
      if (cachedDiskUsage && (Date.now() - cachedDiskUsage.timestamp) < CACHE_MAX_AGE) {
        // Use cached value
        diskSizeMB = cachedDiskUsage.sizeMB;
        diskFiles = cachedDiskUsage.files;
      } else {
        // Cache missing or stale - recalculate
        try {
          const diskUsage = await WorkspaceService.getDiskUsage(workspaceHandle.directory);
          const totalBytes = diskUsage.reduce((acc, f) => acc + f.sizeBytes, 0);
          diskSizeMB = parseFloat((totalBytes / (1024 * 1024)).toFixed(1));
          diskFiles = diskUsage.length;
          // Update cache
          setCachedDiskUsage({ sizeMB: diskSizeMB, files: diskFiles, timestamp: Date.now() });
        } catch (e) {
          console.error('Failed to get disk usage:', e);
        }
      }
    }

    return {
      kbDocs,
      kbChunks,
      chatSessions: chatSess,
      vectors,
      historyEntries: histEntries,
      kbSizeMB: parseFloat(kbSizeMB),
      chatSizeMB: parseFloat(chatSizeMB),
      historySizeMB: parseFloat(historySizeMB),
      totalSizeMB: parseFloat(totalSizeMB),
      diskSizeMB,
      diskFiles,
      diskCacheTimestamp: cachedDiskUsage?.timestamp || null
    };
  };

  // Memory management functions
  const clearKnowledgeBase = async () => {
    setKnowledgeBase([]);
    await StorageService.clear('knowledgeBase');
    if (retrievalMode === 'hybrid') {
      await VectorStoreService.clear();
    }
  };

  const clearChatSessions = async () => {
    const defaultSession: ChatSession = {
      id: generateId(),
      title: 'New Chat',
      messages: [{ role: 'model' as const, content: "Hello! I'm your AI writing assistant. How can I help you draft or edit today?", timestamp: Date.now() }],
      timestamp: Date.now()
    };
    setChatSessions([defaultSession]);
    setCurrentSessionId(defaultSession.id);
    await StorageService.clear('chatSessions');
    await StorageService.put('chatSessions', defaultSession);
  };

  const clearHistory = async () => {
    setChatHistory([]);
    setToolHistory([]);
    await StorageService.clear('chatHistory');
    await StorageService.clear('toolHistory');
  };

  const clearVectorStore = async () => {
    await VectorStoreService.clear();
  };

  const exportMemoryStats = () => {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      knowledgeBase: knowledgeBase.map(doc => ({
        id: doc.id,
        title: doc.title,
        chunks: doc.chunks?.length || 0,
        tags: doc.tags,
        createdAt: doc.createdAt
      })),
      chatSessions: chatSessions.map(s => ({
        id: s.id,
        title: s.title,
        messages: s.messages.length,
        timestamp: s.timestamp
      })),
      history: {
        chatHistory: chatHistory.length,
        toolHistory: toolHistory.length
      },
      retrievalMode,
      limits: {
        maxKnowledgeDocs: MAX_KNOWLEDGE_DOCS,
        maxChatSessions: MAX_CHAT_SESSIONS,
        maxHistoryEntries: MAX_HISTORY_ENTRIES
      }
    }, null, 2);
  };

  // Unified clear memory function
  const clearMemory = async (target: 'knowledge' | 'chat' | 'history' | 'vectors' | 'all') => {
    switch (target) {
      case 'knowledge':
        await clearKnowledgeBase();
        break;
      case 'chat':
        await clearChatSessions();
        break;
      case 'history':
        await clearHistory();
        break;
      case 'vectors':
        await clearVectorStore();
        break;
      case 'all':
        await clearKnowledgeBase();
        await clearChatSessions();
        await clearHistory();
        await clearVectorStore();
        break;
    }
    // Invalidate disk cache after clearing so next stats call recalculates
    if (workspaceHandle) {
      updateDiskCache(workspaceHandle);
    }
  };

  return (
    <AppContext.Provider value={{ 
      config, 
      updateConfig, 
      resetConfig,
        currentUsage,
        updateUsage,
        usagePercentage,
        isOverLimit,
        language,
        setLanguage,
        readingMode,
        setReadingMode,
        // Tool States
      paraphraserState, setParaphraserState,
      grammarState, setGrammarState,
      summarizerState, setSummarizerState,
      citationState, setCitationState,
      chatState, setChatState,
      chatSessions,
      currentSessionId,
      createNewChatSession,
      loadChatSession,
      deleteChatSession,
      updateChatSessionMessages,
      syncChatSessionToMemory,
      saveInputText,

      getSavedInput,
      visionRagEnabled,
      setVisionRagEnabled,
      chatHistory,
      addChatHistoryEntry,
      toolHistory,
      recordToolHistory,
      feedbackLog,
      recordFeedback,
      getFeedbackHints,
      knowledgeBase,
      addKnowledgeDocument,
      updateKnowledgeDocument,
      removeKnowledgeDocument,
      retrievalMode,
      setRetrievalMode,
      hasGPU,
      selfImproveEnabled,
      setSelfImproveEnabled,
      guardrails,
      addGuardrail,
      updateGuardrail,
      deleteGuardrail,
      selectedGuardrailId,
      setSelectedGuardrailId: handleSetSelectedGuardrailId,
      lastKnowledgeReferences,
      setKnowledgeReferences,
      getCitationHistory,
      storageMode,
      setStorageMode,
      workspaceHandle,
      connectWorkspace,
      disconnectWorkspace,
      isStorageLoading,
      addKnowledgeDocumentsBatch,
      getMemoryStats,
      clearMemory,
      exportMemoryStats,
      setBulkIngestionInProgress: (value: boolean) => { bulkIngestionInProgressRef.current = value; }
    }}>


      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};


