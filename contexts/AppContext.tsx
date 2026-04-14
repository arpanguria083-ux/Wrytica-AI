import React, { createContext, useContext, useState, useEffect, startTransition } from 'react';
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
import { ImageAssetStore } from '../services/imageAssetStore';


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

const tryParseJsonArray = <T,>(raw: string | null, label: string): T[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as T[];
    console.warn(`[AppContext] ${label} is not an array`);
    return [];
  } catch (error) {
    console.warn(`[AppContext] Failed parsing ${label}:`, error);
    return [];
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
  syncChatSessionToMemory: (sessionId: string) => Promise<void>;
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
  addKnowledgeDocument: (doc: KnowledgeDocument, rawPageImages?: string[]) => Promise<void>;
  addKnowledgeDocumentsBatch: (docs: KnowledgeDocument[]) => Promise<void>;
  updateKnowledgeDocument: (doc: KnowledgeDocument, rawPageImages?: string[]) => Promise<void>;
  removeKnowledgeDocument: (id: string) => Promise<void>;

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
  workspaceSyncError: string | null;

  // Memory Stats
  getMemoryStats: () => Promise<{ kbDocs: number; kbChunks: number; chatSessions: number; vectors: number; historyEntries: number; kbSizeMB: number; chatSizeMB: number; historySizeMB: number; imageAssetCount: number; imageAssetSizeMB: number; totalSizeMB: number; diskSizeMB: number; diskFiles: number; diskCacheTimestamp: number | null }>;
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
  const [workspaceSyncError, setWorkspaceSyncError] = useState<string | null>(null);

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

  const loadWorkspaceMirrorData = React.useCallback(async (handle: WorkspaceHandle): Promise<{ knowledgeBase: KnowledgeDocument[]; chatSessions: ChatSession[] }> => {
    const [knowledgeRaw, sessionsRaw] = await Promise.all([
      WorkspaceService.readFile(handle.directory, 'knowledge_base.json'),
      WorkspaceService.readFile(handle.directory, 'chat_sessions.json')
    ]);

    const knowledgeBase = tryParseJsonArray<KnowledgeDocument>(knowledgeRaw, 'knowledge_base.json');
    const chatSessions = tryParseJsonArray<ChatSession>(sessionsRaw, 'chat_sessions.json');

    console.info('[AppContext] Workspace mirror load result', {
      workspace: handle.name,
      isElectron: handle.isElectron === true || typeof handle.directory === 'string',
      directoryType: typeof handle.directory,
      hasKnowledgeFile: knowledgeRaw !== null,
      hasChatSessionsFile: sessionsRaw !== null,
      knowledgeDocs: knowledgeBase.length,
      chatSessions: chatSessions.length,
    });

    return { knowledgeBase, chatSessions };
  }, []);

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
    // Migration: If result contains placeholder values like '...', set to null
    if (saved.result && (saved.result.formatted_citation === '...' || saved.result.formatted_citation === '')) {
      saved.result = null;
    }
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

        if (kb.length) {
          setKnowledgeBase(kb);
        } else {
          // Fallback: Check if there's a pre-built knowledge base in public/local_knowledge.json
          const localKnowledgeCandidates = new Set<string>(['/local_knowledge.json', './local_knowledge.json']);
          const baseUrl = (import.meta as any)?.env?.BASE_URL as string | undefined;
          if (baseUrl) {
            const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
            localKnowledgeCandidates.add(`${normalizedBase}local_knowledge.json`);
          }
          if (typeof window !== 'undefined' && window.location?.href) {
            try {
              localKnowledgeCandidates.add(new URL('local_knowledge.json', window.location.href).toString());
            } catch {
              // ignore invalid URL construction
            }
          }

          for (const candidateUrl of localKnowledgeCandidates) {
            try {
              const response = await fetch(candidateUrl);
              if (!response.ok) {
                console.info('[AppContext] local_knowledge fetch miss', { candidateUrl, status: response.status });
                continue;
              }

              const localKB = await response.json();
              if (Array.isArray(localKB) && localKB.length > 0) {
                console.info('[AppContext] Loaded pre-built knowledge base fallback', {
                  candidateUrl,
                  count: localKB.length,
                });
                setKnowledgeBase(localKB);
                await StorageService.bulkPut('knowledgeBase', localKB);
                break;
              }
            } catch (e) {
              console.info('[AppContext] local_knowledge fetch failed', { candidateUrl, error: String(e) });
            }
          }
        }
        
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
              const isElectronHandle = handle.isElectron === true || typeof handle.directory === 'string';

              if (isElectronHandle) {
                console.info('[AppContext] Restoring Electron workspace handle', {
                  workspace: handle.name,
                  directoryType: typeof handle.directory,
                });
                setWorkspaceHandle(handle);
                const savedMode = localStorage.getItem('wrytica_storage_mode');
                if (savedMode === 'hybrid' || savedMode === 'native') {
                  setStorageModeState(savedMode as any);
                }

                const workspaceData = await loadWorkspaceMirrorData(handle);
                if (workspaceData.knowledgeBase.length > 0) {
                  knowledgeBaseRef.current = workspaceData.knowledgeBase;
                  startTransition(() => setKnowledgeBase(workspaceData.knowledgeBase));
                  await StorageService.clear('knowledgeBase');
                  await StorageService.bulkPutOptimized('knowledgeBase', workspaceData.knowledgeBase, { batchSize: 50, yieldInterval: 50 });
                }

                if (workspaceData.chatSessions.length > 0) {
                  setChatSessions(workspaceData.chatSessions);
                  await StorageService.clear('chatSessions');
                  await StorageService.bulkPutOptimized('chatSessions', workspaceData.chatSessions, { batchSize: 20, yieldInterval: 20 });
                }
              } else {
                const browserHandle = handle.directory as FileSystemDirectoryHandle;
                const queryPermission = (browserHandle as any).queryPermission;
                if (typeof queryPermission !== 'function') {
                  throw new Error('Invalid browser workspace handle: queryPermission() missing');
                }

                // @ts-ignore - queryPermission exists in browser API but not in TypeScript types
                const permission = await queryPermission.call(browserHandle, { mode: 'readwrite' });
                if (permission === 'granted') {
                  setWorkspaceHandle(handle);
                  const savedMode = localStorage.getItem('wrytica_storage_mode');
                  if (savedMode === 'hybrid' || savedMode === 'native') {
                    setStorageModeState(savedMode as any);
                  }
                } else {
                  setWorkspaceHandle(null);
                  setStorageModeState('standard');
                  safeSave('wrytica_storage_mode', 'standard');
                  StorageService.delete('settings', 'workspaceHandle');
                }
              }
            } catch (e) {
              console.error('Failed to verify workspace permission:', e);
              setWorkspaceHandle(null);
              setStorageModeState('standard');
              safeSave('wrytica_storage_mode', 'standard');
              StorageService.delete('settings', 'workspaceHandle');
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
  }, [loadWorkspaceMirrorData]);

  const connectWorkspace = async () => {
    const handle = await WorkspaceService.requestFolder();
    if (handle) {
      setWorkspaceHandle(handle);
      setStorageModeState('hybrid');
      safeSave('wrytica_storage_mode', 'hybrid');
      // Persist handle to IndexedDB (localStorage can't hold FileSystemHandle)
      StorageService.put('settings', { id: 'workspaceHandle', value: handle });
      setWorkspaceSyncError(null);
      
      // Load existing data from the workspace if it exists
      try {
        const workspaceData = await loadWorkspaceMirrorData(handle);

        if (workspaceData.knowledgeBase.length > 0) {
          console.info('[AppContext] Connected workspace knowledge base loaded', {
            workspace: handle.name,
            count: workspaceData.knowledgeBase.length,
          });
          knowledgeBaseRef.current = workspaceData.knowledgeBase;
          startTransition(() => setKnowledgeBase(workspaceData.knowledgeBase));
          await StorageService.clear('knowledgeBase');
          await StorageService.bulkPutOptimized('knowledgeBase', workspaceData.knowledgeBase, { batchSize: 50, yieldInterval: 50 });
        }

        if (workspaceData.chatSessions.length > 0) {
          setChatSessions(workspaceData.chatSessions);
          await StorageService.clear('chatSessions');
          await StorageService.bulkPutOptimized('chatSessions', workspaceData.chatSessions, { batchSize: 20, yieldInterval: 20 });
        }
      } catch (e) {
        console.warn('Failed to load existing data from workspace:', e);
      }
      
      // Mirror existing data to disk if disk was empty or had different content
      syncAllToDisk(handle).catch(() => undefined);
    }
  };

  const disconnectWorkspace = () => {
    setWorkspaceHandle(null);
    setStorageModeState('standard');
    safeSave('wrytica_storage_mode', 'standard');
    StorageService.delete('settings', 'workspaceHandle');
    setWorkspaceSyncError(null);
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
        syncAllToDisk(workspaceHandle).catch(() => undefined);
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
          syncAllToDisk(workspaceHandle).catch(() => undefined);
        }
        return updated;
      }
      return s;
    }));
  };


  const syncChatSessionToMemory = async (sessionId: string) => {
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

  const persistKnowledgeBaseState = async (docs: KnowledgeDocument[]) => {
    if (storageMode === 'hybrid' && workspaceHandle) {
      const ok = await WorkspaceService.writeFile(workspaceHandle.directory, 'knowledge_base.json', JSON.stringify(docs));
      if (!ok) {
        setWorkspaceHandle(null);
        setStorageModeState('standard');
        safeSave('wrytica_storage_mode', 'standard');
        StorageService.delete('settings', 'workspaceHandle');
        setCachedDiskUsage(null);
        setWorkspaceSyncError('Workspace sync failed. Reconnect the folder to allow saving.');
        return;
      }
      setWorkspaceSyncError(null);
      return;
    }
    debouncedSync();
  };

  const toLightweightKnowledgeDoc = (doc: KnowledgeDocument): KnowledgeDocument => ({
    ...doc,
    content: doc.content?.substring(0, 15000),
  });

  const addKnowledgeDocument = async (doc: KnowledgeDocument, rawPageImages?: string[]) => {
    let finalDoc = doc;
    if (rawPageImages?.length) {
      const refs = await ImageAssetStore.saveAssetsForDoc(doc.id, rawPageImages);
      finalDoc = { ...doc, pageImageRefs: refs };
    }

    const lightweightDoc = toLightweightKnowledgeDoc(finalDoc);
    let nextKnowledgeBase: KnowledgeDocument[] = [];
    const removedIds: string[] = [];

    setKnowledgeBase(prev => {
      const updated = [lightweightDoc, ...prev.filter(item => item.id !== lightweightDoc.id)];
      if (updated.length > MAX_KNOWLEDGE_DOCS) {
        removedIds.push(...updated.slice(MAX_KNOWLEDGE_DOCS).map(d => d.id));
        nextKnowledgeBase = updated.slice(0, MAX_KNOWLEDGE_DOCS);
        knowledgeBaseRef.current = nextKnowledgeBase;
        return nextKnowledgeBase;
      }
      nextKnowledgeBase = updated;
      knowledgeBaseRef.current = updated;
      return updated;
    });

    knowledgeBaseRef.current = nextKnowledgeBase;
    await StorageService.put('knowledgeBase', lightweightDoc);
    for (const removedId of removedIds) {
      await StorageService.delete('knowledgeBase', removedId);
      VectorStoreService.removeDocument(removedId);
      await ImageAssetStore.deleteAssetsForDoc(removedId);
    }

    if (retrievalMode === 'hybrid') {
      VectorStoreService.upsertDocument(lightweightDoc);
    }

    if (lightweightDoc.source === 'OCR import' || lightweightDoc.tags?.includes('ocr')) {
      console.info('[KnowledgeBase] OCR document persisted', {
        id: lightweightDoc.id,
        title: lightweightDoc.title,
        source: lightweightDoc.source,
        chunkCount: lightweightDoc.chunks?.length || 0,
        pageImageRefCount: lightweightDoc.pageImageRefs?.length || 0,
      });
    }

    await persistKnowledgeBaseState(nextKnowledgeBase);
  };

  // Ref to store latest knowledge base for vector rebuild (avoids stale closure)
  const knowledgeBaseRef = React.useRef(knowledgeBase);
  React.useEffect(() => {
    knowledgeBaseRef.current = knowledgeBase;
  }, [knowledgeBase]);

  // Flag to track bulk ingestion state
  const bulkIngestionInProgressRef = React.useRef(false);

  const addKnowledgeDocumentsBatch = async (docs: KnowledgeDocument[]) => {
    const lightweightDocs = docs.map(toLightweightKnowledgeDoc);

    // Small batches + frequent yields to avoid RESULT_CODE_HUNG (main thread must not block)
    const batchSize = 15;
    const wasBulk = bulkIngestionInProgressRef.current;

    for (let i = 0; i < lightweightDocs.length; i += batchSize) {
      const batch = lightweightDocs.slice(i, i + batchSize);

      if (wasBulk) {
        const currentDocs = knowledgeBaseRef.current || [];
        knowledgeBaseRef.current = [...currentDocs, ...batch];
      } else {
        startTransition(() => {
          setKnowledgeBase(prev => {
            const updated = [...prev, ...batch];
            if (updated.length > MAX_KNOWLEDGE_DOCS) {
              const toRemove = updated.slice(MAX_KNOWLEDGE_DOCS).map(d => d.id);
              toRemove.forEach(id => {
                void StorageService.delete('knowledgeBase', id);
                VectorStoreService.removeDocument(id);
                void ImageAssetStore.deleteAssetsForDoc(id);
              });
              return updated.slice(0, MAX_KNOWLEDGE_DOCS);
            }
            knowledgeBaseRef.current = updated;
            return updated;
          });
        });
      }

      await new Promise(r => setTimeout(r, 20));

      try {
        await Promise.race([
          StorageService.bulkPutOptimized('knowledgeBase', batch, {
            batchSize: 50,
            yieldInterval: 50,
            onProgress: (processed, total) => {
              if (processed % 50 === 0) {
                console.log(`Storage progress: ${processed}/${total}`);
              }
            }
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Storage timeout')), 15000)
          )
        ]);
      } catch (err) {
        console.warn('Storage operation failed or timed out:', err);
      }

      await new Promise(r => setTimeout(r, 0));
    }

    // Don't flush state here during bulk — the page will call setBulkIngestionInProgress(false)
    // and we'll flush then so we only do one big update when indexing is fully complete.

    if (retrievalMode === 'hybrid') {
      const docsForRebuild = wasBulk ? (knowledgeBaseRef.current || []) : knowledgeBaseRef.current;
      if (docsForRebuild?.length) {
        VectorStoreService.scheduleRebuild(docsForRebuild, wasBulk ? 15000 : 5000);
      }
    }

    debouncedSync();
  };

  const updateKnowledgeDocument = async (doc: KnowledgeDocument, rawPageImages?: string[]) => {
    // If raw images are provided, save them to the asset store
    if (rawPageImages && rawPageImages.length > 0) {
      // Delete old assets first (if any)
      await ImageAssetStore.deleteAssetsForDoc(doc.id);
      // Save new images
      const refs = await ImageAssetStore.saveAssetsForDoc(doc.id, rawPageImages);
      doc = { ...doc, pageImageRefs: refs };
    }
    const lightweightDoc = { ...doc, content: doc.content?.substring(0, 25000) };
    const nextKnowledgeBase = knowledgeBaseRef.current.map(item => item.id === doc.id ? lightweightDoc : item);
    knowledgeBaseRef.current = nextKnowledgeBase;
    setKnowledgeBase(prev => prev.map(item => item.id === doc.id ? lightweightDoc : item));
    await StorageService.put('knowledgeBase', lightweightDoc);
    if (storageMode === 'hybrid' && workspaceHandle) {
      await persistKnowledgeBaseState(nextKnowledgeBase);
    } else {
      debouncedSync();
    }
    if (retrievalMode === 'hybrid') {
      VectorStoreService.upsertDocument(lightweightDoc, true);
    }
  };

  const removeKnowledgeDocument = async (id: string) => {
    const nextKnowledgeBase = knowledgeBaseRef.current.filter(item => item.id !== id);
    knowledgeBaseRef.current = nextKnowledgeBase;
    setKnowledgeBase(prev => prev.filter(item => item.id !== id));
    await StorageService.delete('knowledgeBase', id);
    await ImageAssetStore.deleteAssetsForDoc(id);
    VectorStoreService.removeDocument(id);
    if (storageMode === 'hybrid' && workspaceHandle) {
      await persistKnowledgeBaseState(nextKnowledgeBase);
    } else {
      debouncedSync();
    }
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
  const syncAllToDisk = React.useCallback(async (handle: WorkspaceHandle): Promise<boolean> => {
    // Use compact JSON (no pretty-print) to reduce memory during serialization
    const [kbSaved, chatsSaved, historySaved] = await Promise.all([
      WorkspaceService.writeFile(handle.directory, 'knowledge_base.json', JSON.stringify(knowledgeBase)),
      WorkspaceService.writeFile(handle.directory, 'chat_sessions.json', JSON.stringify(chatSessions)),
      WorkspaceService.writeFile(handle.directory, 'tool_history.json', JSON.stringify(toolHistory))
    ]);
    const ok = kbSaved && chatsSaved && historySaved;
    if (!ok) {
      setWorkspaceHandle(null);
      setStorageModeState('standard');
      safeSave('wrytica_storage_mode', 'standard');
      StorageService.delete('settings', 'workspaceHandle');
      setCachedDiskUsage(null);
      setWorkspaceSyncError('Workspace sync failed. Reconnect the folder to allow saving.');
      return false;
    }
    setWorkspaceSyncError(null);
    // Update cache after successful sync
    await updateDiskCache(handle);
    return true;
  }, [knowledgeBase, chatSessions, toolHistory, updateDiskCache]);

  const debouncedSync = React.useCallback(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      if (workspaceHandle) {
        syncAllToDisk(workspaceHandle).catch(() => undefined);
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

    const imageAssetStats = await ImageAssetStore.getStats();

    const kbSizeMB = (kbSizeBytes / (1024 * 1024)).toFixed(1);
    const chatSizeMB = (chatSizeBytes / (1024 * 1024)).toFixed(1);
    const historySizeMB = (historySizeBytes / (1024 * 1024)).toFixed(1);
    const imageAssetSizeMB = (imageAssetStats.sizeBytes / (1024 * 1024)).toFixed(1);
    const totalSizeMB = (parseFloat(kbSizeMB) + parseFloat(chatSizeMB) + parseFloat(historySizeMB) + parseFloat(imageAssetSizeMB)).toFixed(1);

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
      imageAssetCount: imageAssetStats.count,
      imageAssetSizeMB: parseFloat(imageAssetSizeMB),
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
    // Also clear associated image assets
    await ImageAssetStore.clearAll();
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
        createdAt: doc.createdAt,
        pageImageRefs: doc.pageImageRefs?.length || 0
      })),
      imageAssets: {
        estimatedCount: knowledgeBase.reduce((acc, doc) => acc + (doc.pageImageRefs?.length || 0), 0)
      },
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
      workspaceSyncError,
      addKnowledgeDocumentsBatch,
      getMemoryStats,
      clearMemory,
      exportMemoryStats,
      setBulkIngestionInProgress: (value: boolean) => {
        bulkIngestionInProgressRef.current = value;
        if (!value && knowledgeBaseRef.current) {
          const final = knowledgeBaseRef.current.length > MAX_KNOWLEDGE_DOCS
            ? knowledgeBaseRef.current.slice(0, MAX_KNOWLEDGE_DOCS)
            : knowledgeBaseRef.current;
          // Flush in small chunks so main thread never blocks (avoids RESULT_CODE_HUNG)
          const FLUSH_CHUNK = 25;
          if (final.length <= FLUSH_CHUNK) {
            startTransition(() => setKnowledgeBase(final));
            return;
          }
          let end = FLUSH_CHUNK;
          const scheduleChunk = () => {
            if (end >= final.length) {
              startTransition(() => setKnowledgeBase(final));
              return;
            }
            startTransition(() => setKnowledgeBase(final.slice(0, end)));
            end += FLUSH_CHUNK;
            setTimeout(scheduleChunk, 0);
          };
          setTimeout(scheduleChunk, 0);
        }
      }
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


