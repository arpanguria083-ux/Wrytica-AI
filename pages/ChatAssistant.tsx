import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Sparkles, ThumbsUp, ThumbsDown, MessageSquare, X, Upload, FileText, Image, Trash2, CheckCircle, Eye, Plus, Download, FileDown, Search, ChevronUp, ChevronDown, Volume2, VolumeX } from 'lucide-react';
import { AIService, AISession } from '../services/aiService';
import { ChatMessage, generateId, buildGuardrailInstructions, TimelineEntry, KnowledgeChunk, mergeKnowledgeChunks, buildContextEnhancement } from '../utils';
import { useAppContext } from '../contexts/AppContext';
import { KnowledgeBaseService } from '../services/knowledgeBaseService';
import { PageIndexService } from '../services/pageIndexService';
import { VectorStoreService } from '../services/vectorStoreService';
import { VisionService } from '../services/visionService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const renderMessageContent = (content: string) => {
  if (!content) return null;
  
  // Regex to match <think>...</think> or <thought>...</thought> (case insensitive)
  const thinkRegex = /<(think|thought)>([\s\S]*?)<\/\1>/gi;
  const thinkingBlocks: string[] = [];
  let remainingContent = content;
  
  let match;
  while ((match = thinkRegex.exec(content)) !== null) {
    thinkingBlocks.push(match[2].trim());
    remainingContent = remainingContent.replace(match[0], '');
  }
  
  remainingContent = remainingContent.trim();
  
  // Handle unclosed thinking block (streaming case)
  let unclosedThinking = '';
  const unclosedThinkMatch = remainingContent.match(/<(think|thought)>([\s\S]*)$/i);
  if (unclosedThinkMatch && !unclosedThinkMatch[0].includes(`</${unclosedThinkMatch[1]}>`)) {
    unclosedThinking = unclosedThinkMatch[2].trim();
    remainingContent = remainingContent.replace(unclosedThinkMatch[0], '').trim();
  }

  if (thinkingBlocks.length === 0 && !unclosedThinking) {
    return (
      <div className="markdown-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {thinkingBlocks.map((block, idx) => (
        <details key={idx} className="text-sm bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg group">
          <summary className="font-semibold text-slate-500 cursor-pointer select-none p-3 group-open:border-b border-slate-200 dark:border-slate-800">
            Thinking Process {thinkingBlocks.length > 1 ? `#${idx + 1}` : ''}
          </summary>
          <div className="p-3 text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{block}</div>
        </details>
      ))}
      
      {unclosedThinking && (
        <details open className="text-sm bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg group">
          <summary className="font-semibold text-slate-500 cursor-pointer select-none p-3 border-b border-slate-200 dark:border-slate-800 animate-pulse">
            Thinking Process...
          </summary>
          <div className="p-3 text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{unclosedThinking}</div>
        </details>
      )}
      
      {remainingContent && (
        <div className="markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{remainingContent}</ReactMarkdown>
        </div>
      )}
    </div>
  );
};


export const ChatAssistant: React.FC = () => {
  const { 
    chatState, config, language, updateUsage, isOverLimit, knowledgeBase, 
    guardrails, selectedGuardrailId, recordToolHistory, recordFeedback, 
    setKnowledgeReferences, addChatHistoryEntry, getFeedbackHints, 
    retrievalMode, selfImproveEnabled, feedbackLog, saveInputText, 
    getSavedInput, visionRagEnabled, setVisionRagEnabled,
    chatSessions, currentSessionId, createNewChatSession, loadChatSession, 
    deleteChatSession, updateChatSessionMessages, syncChatSessionToMemory
  } = useAppContext();
  
  const { messages } = chatState;
  const guardrail = guardrails.find(g => g.id === selectedGuardrailId) || undefined;

  // New Chat function - defined after guardrail for proper closure
  // New Chat function - now creates a real session in context
  const handleNewChat = () => {
    createNewChatSession();
    setInput('');
    saveInputText('chat', '');
    setKnowledgeSummary('');
    setReasoningTrace('');
    setTraceOpen(false);
    setUploadedDoc(null);
    setDocConfirmed(false);
    setLastHistoryEntryId(null);
  };
  const [lastHistoryEntryId, setLastHistoryEntryId] = useState<string | null>(null);
  const [knowledgeSummary, setKnowledgeSummary] = useState<string>('');
  const [input, setInput] = useState(() => getSavedInput('chat'));
  const [visionRag, setVisionRag] = useState<boolean>(visionRagEnabled);
  const [loading, setLoading] = useState(false);
  const [reasoningTrace, setReasoningTrace] = useState<string>('');
  const [traceOpen, setTraceOpen] = useState<boolean>(false);

  const [showFeedbackInput, setShowFeedbackInput] = useState<boolean>(false);
  const [feedbackComment, setFeedbackComment] = useState<string>('');
  const [feedbackAnimation, setFeedbackAnimation] = useState<'up' | 'down' | null>(null);
  const [uploadedDoc, setUploadedDoc] = useState<{ name: string; text: string; images: string[]; type: 'pdf' | 'image' } | null>(null);
  const [isProcessingDoc, setIsProcessingDoc] = useState<boolean>(false);
  const [showDocPreview, setShowDocPreview] = useState<boolean>(false);
  const [docConfirmed, setDocConfirmed] = useState<boolean>(false);
  
  // Search functionality
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState<number>(-1);
  const [showSearch, setShowSearch] = useState<boolean>(false);
  
  // Notification sound
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const playNotificationSound = () => {
    if (!soundEnabled) return;
    try {
      // Reuse existing audio context or create new one
      let audioContext = audioContextRef.current;
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;
      }
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      console.warn('Could not play notification sound:', e);
    }
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<AISession | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize/Update Session when config or current session changes
  useEffect(() => {
    // Clean up previous session before creating new one
    if (chatSessionRef.current) {
      chatSessionRef.current = null;
    }
    try {
      const enhancement = buildContextEnhancement(guardrail, getFeedbackHints('chat'));
      // Initialize with full history for context awareness
      chatSessionRef.current = AIService.createChatSession(config, language, enhancement, messages);
    } catch (error) {
      console.error('Failed to create chat session:', error);
    }
    // Cleanup on unmount
    return () => {
      if (chatSessionRef.current) {
        chatSessionRef.current = null;
      }
      // Close audio context if open
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [config.provider, config.modelName, config.baseUrl, config.apiKey, language, selectedGuardrailId, currentSessionId]);

  // Update Context Usage
  useEffect(() => {
    const historyContent = messages.map(m => m.content).join('\n');
    const totalContent = historyContent + '\n' + input;
    updateUsage(totalContent);
  }, [messages, input, updateUsage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-scroll to current search result
  useEffect(() => {
    if (currentSearchIndex >= 0 && searchResults[currentSearchIndex] !== undefined) {
      const msgElement = document.getElementById(`msg-${searchResults[currentSearchIndex]}`);
      msgElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentSearchIndex, searchResults]);

  const setMessages = (updateFn: (prev: ChatMessage[]) => ChatMessage[]) => {
    if (currentSessionId) {
      const nextMessages = updateFn(messages);
      updateChatSessionMessages(currentSessionId, nextMessages);
    }
  };

  const [streamingContent, setStreamingMessage] = useState<string | null>(null);
  const [streamingReferences, setStreamingReferences] = useState<KnowledgeChunk[]>([]);

  const handleSend = async () => {
    if (!input.trim() || loading || isOverLimit) return;
    
    // Check if there's an unconfirmed document
    if (uploadedDoc && !docConfirmed) {
      setShowDocPreview(true);
      return;
    }
    
    // Check if chat session is available
    if (!chatSessionRef.current) {
      const errorMsg: ChatMessage = { 
        role: 'model', 
        content: config.provider === 'gemini' 
          ? "Please add your Gemini API key in Settings to use the chat feature."
          : "Please check your local LLM server configuration in Settings.",
        timestamp: Date.now() 
      };
      setMessages(prev => [...prev, errorMsg]);
      return;
    }

    const userMsg: ChatMessage = { role: 'user', content: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setStreamingMessage(''); // Initialize streaming state

    try {
      // Build document context from uploaded file if present
      // ... (rest of the context building logic)
      let docContextChunks: KnowledgeChunk[] = [];
      let docContextText = '';
      let visionContext = '';
      
      if (uploadedDoc) {
        // Use the transcribed text from the uploaded document/image
        const docId = 'uploaded-' + Date.now();
        docContextChunks = uploadedDoc.text.split(/\n\n+/).filter(t => t.trim()).slice(0, 5).map((text, idx) => ({
          id: `${docId}-chunk-${idx}`,
          docId,
          text: text.trim(),
          order: idx,
          sourceTitle: uploadedDoc.name,
          tags: ['uploaded-document'],
          summary: text.trim().slice(0, 100)
        }));
        
        // Include transcribed text as context (limit to reasonable size)
        docContextText = uploadedDoc.text.slice(0, 8000);
        
        // If there are images, also run vision analysis
        if (uploadedDoc.images?.length && visionRag) {
          try {
            const visionAnswer = await VisionService.answerWithImages(config, userMsg.content, uploadedDoc.images.slice(0, 4), language);
            if (visionAnswer.trim()) {
              visionContext = `[Document Vision Analysis]: ${visionAnswer}`;
            }
          } catch (e) {
            console.warn('Vision RAG failed for uploaded doc', e);
          }
        }
      }

      const relevantChunks = KnowledgeBaseService.search(userMsg.content, knowledgeBase);
      const vectorChunks = retrievalMode === 'hybrid' ? VectorStoreService.search(userMsg.content, knowledgeBase, 4) : [];

      const pageIndexResult = await PageIndexService.queryPageIndex({
        config,
        language,
        query: userMsg.content,
        documents: knowledgeBase,
        limit: 4,
        enhancement: buildContextEnhancement(guardrail, getFeedbackHints('chat'))
      });
      const pageIndexChunks = pageIndexResult.chunks;
      // Priority: uploaded doc > knowledge base
      let combinedReferences = mergeKnowledgeChunks(docContextChunks, [...relevantChunks, ...pageIndexChunks, ...vectorChunks], 6);
      setStreamingReferences(combinedReferences);
      
      let selfImproveApplied = false;
      let rerankedChunkIds: string[] = [];
      if (selfImproveEnabled) {
        const { RewardService } = await import('../services/rewardService');
        const originalIds = combinedReferences.map(c => c.id);
        combinedReferences = RewardService.rerankReferences(combinedReferences, feedbackLog, 'chat');
        const newIds = combinedReferences.map(c => c.id);
        // Track if order changed
        if (JSON.stringify(originalIds) !== JSON.stringify(newIds)) {
          selfImproveApplied = true;
          rerankedChunkIds = newIds;
        }
      }
      const synthesizedThinking = pageIndexResult.thinking || combinedReferences.filter(r => r.reason).map(r => `Node ${r.nodeId || r.id}: ${r.reason}`).join('\n');
      setReasoningTrace(synthesizedThinking || '');
      setKnowledgeReferences(combinedReferences);
      const summaryLines = combinedReferences.map(chunk => {
        const pageSuffix = chunk.pageNumber ? ` (Page ${chunk.pageNumber})` : '';
        return `${chunk.sourceTitle || 'Knowledge Base'}${pageSuffix}: ${chunk.text.replace(/\\s+/g, ' ').slice(0, 160)}`;
      });
      setKnowledgeSummary(summaryLines.join(' | '));
      const guardrailText = guardrail ? buildGuardrailInstructions(guardrail, 'Chat') : '';
      // Add document context to references if uploaded doc exists
      const docContextInfo = uploadedDoc ? `Document context from "${uploadedDoc.name}": ${docContextText}${visionContext ? '\n\n' + visionContext : ''}` : '';
      const referencesText = combinedReferences.length 
        ? combinedReferences.map((chunk, index) => `Reference ${index + 1} (${chunk.sourceTitle || 'Knowledge Base'}): ${chunk.text}`).join('\n\n')
        : '';
      const contextInfo = [guardrailText, docContextInfo, referencesText].filter(Boolean).join('\n\n');

      // Check if we have images to send for multi-modal vision
      let imagesToSend: string[] = [];
      if (visionRag) {
        if (uploadedDoc?.images?.length) {
          imagesToSend = uploadedDoc.images.slice(0, 4); // Send first 4 images/pages
        } else {
          // Check knowledge base references for images
          const referencedDocIds = Array.from(new Set(combinedReferences.map(r => r.docId).filter(Boolean)));
          referencedDocIds.forEach(id => {
            const doc = knowledgeBase.find(d => d.id === id);
            if (doc?.pageImages && doc.pageImages.length) {
              imagesToSend.push(...doc.pageImages.slice(0, 2)); // Limit KB images to 2 per doc
            }
          });
          imagesToSend = imagesToSend.slice(0, 4); // Total limit 4
        }
      }

      // Streaming support with multi-modal vision
      let fullResponse = '';
      const responseText = await chatSessionRef.current.sendMessage(
        userMsg.content, 
        contextInfo,
        (token) => {
          fullResponse += token;
          setStreamingMessage(fullResponse); // Update local state ONLY
        },
        imagesToSend.length > 0 ? imagesToSend : undefined
      );

      // Final synchronization and vision RAG if needed
      let finalResponse = responseText || fullResponse;
      
      // Optional vision RAG for knowledge base referenced docs (only if no images were sent directly)
      if (visionRag && imagesToSend.length === 0 && !uploadedDoc?.images?.length) {
        const referencedDocIds = Array.from(new Set(combinedReferences.map(r => r.docId).filter(Boolean)));
        const images: string[] = [];
        referencedDocIds.forEach(id => {
          const doc = knowledgeBase.find(d => d.id === id);
          if (doc?.pageImages && doc.pageImages.length) {
            images.push(...doc.pageImages.slice(0, 4));
          }
        });
        if (images.length) {
          try {
            const visionAnswer = await VisionService.answerWithImages(config, userMsg.content, images.slice(0, 6), language);
            if (visionAnswer.trim()) {
              finalResponse = `${finalResponse}\n\n[Vision RAG]\n${visionAnswer}`;
            }
          } catch (e) {
            console.warn('Vision RAG failed, keeping text answer', e);
          }
        }
      }

      // Sync the final complete message to global context ONCE
      const modelMsg: ChatMessage = { 
        role: 'model', 
        content: finalResponse || "I'm sorry, I couldn't generate a response.", 
        timestamp: Date.now(),
        references: combinedReferences
      };
      setMessages(prev => [...prev, modelMsg]);
      setStreamingMessage(null); // Clear streaming state
      setStreamingReferences([]);
      
      // Play notification sound when AI responds
      playNotificationSound();
      const entryId = generateId();
      const chatEntry: TimelineEntry = {
        id: entryId,
        tool: 'chat',
        input: userMsg.content,
        output: modelMsg.content,
        timestamp: Date.now(),
        guardrailId: guardrail?.id,
        references: combinedReferences,
        modelName: config.modelName,
        selfImproveData: selfImproveApplied ? {
          applied: true,
          rerankedChunkIds,
          feedbackSignalsUsed: feedbackLog.filter(f => f.tool === 'chat').length
        } : undefined
      };
      recordToolHistory(chatEntry);
      addChatHistoryEntry(chatEntry);
      setLastHistoryEntryId(entryId);
      
      // Replicate to global memory (Knowledge Base)
      if (currentSessionId) {
        syncChatSessionToMemory(currentSessionId);
      }
      
      // Clear uploaded document after sending - free base64 memory
      setUploadedDoc(null);
    } catch (error) {
      console.error(error);
      setStreamingMessage(null); // Clear on error
      let errorMessage = "I encountered an error connecting to the service.";
      
      if (error instanceof Error) {
        if (error.message.includes('API key')) {
          errorMessage = "Please add your Gemini API key in Settings, or switch to a local LLM provider.";
        } else if (error.message.includes('Failed to fetch') || error.message.includes('Connection')) {
          errorMessage = "Connection failed. Please check your internet connection or local server status.";
        } else {
          errorMessage = error.message;
        }
      }
      
      const errorMsg: ChatMessage = { 
        role: 'model', 
        content: errorMessage, 
        timestamp: Date.now() 
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = (rating: number) => {
    if (!lastHistoryEntryId) return;
    // Use custom comment if provided, otherwise fall back to default
    const note = feedbackComment.trim() || (rating > 0 ? 'Chat response helpful' : 'Needs more accuracy');
    recordFeedback('chat', rating, note, lastHistoryEntryId);
    // Trigger animation
    setFeedbackAnimation(rating > 0 ? 'up' : 'down');
    setTimeout(() => setFeedbackAnimation(null), 800); // Reset after animation
    // Reset feedback input
    setFeedbackComment('');
    setShowFeedbackInput(false);
  };

  const handleSubmitCustomFeedback = (rating: number) => {
    if (!feedbackComment.trim() && !lastHistoryEntryId) return;
    handleFeedback(rating);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle document upload in chat
  const handleDocUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsProcessingDoc(true);
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        // Extract images from PDF
        const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
        const pdf = await pdfjs.getDocument(await file.arrayBuffer()).promise;
        const pageCount = Math.min(pdf.numPages, 8); // Limit to 8 pages
        const images: string[] = [];
        const textParts: string[] = [];
        
        for (let i = 1; i <= pageCount; i++) {
          const page = await pdf.getPage(i);
          // Extract text
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ').trim();
          if (pageText) textParts.push(pageText);
          
          // Capture image
          const viewport = page.getViewport({ scale: 1.0 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport }).promise;
            images.push(canvas.toDataURL('image/jpeg', 0.6));
            // Explicitly clean up canvas to free memory
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
        // Clean up the PDF document to free memory
        pdf.destroy();
        
        setUploadedDoc({
          name: file.name,
          text: textParts.join('\n\n'),
          images,
          type: 'pdf'
        });
      } else if (file.type.startsWith('image/')) {
        // Process single image
        const base64 = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
          r.readAsDataURL(file);
        });
        
        // Extract text from image using VisionService
        try {
          const extractedText = await VisionService.extractText(file, config, language);
          setUploadedDoc({
            name: file.name,
            text: extractedText,
            images: [base64],
            type: 'image'
          });
        } catch (e) {
          // If vision fails, just use the image
          setUploadedDoc({
            name: file.name,
            text: '[Image uploaded - enable vision to extract text]',
            images: [base64],
            type: 'image'
          });
        }
      }
    } catch (error) {
      console.error('Failed to process document:', error);
      alert('Failed to process document. Please try a different file.');
    } finally {
      setIsProcessingDoc(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeUploadedDoc = () => {
    setUploadedDoc(null);
    setDocConfirmed(false);
    setShowDocPreview(false);
  };

  const confirmDocUse = () => {
    setDocConfirmed(true);
    setShowDocPreview(false);
  };

  const handleDocClick = () => {
    if (uploadedDoc && !docConfirmed) {
      setShowDocPreview(true);
    }
  };

  // Word count calculation
  const wordCount = useMemo(() => {
    const text = input.trim();
    if (!text) return { words: 0, chars: 0 };
    const words = text.split(/\s+/).filter(w => w.length > 0).length;
    const chars = text.length;
    return { words, chars };
  }, [input]);

  // Search through messages
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      return;
    }
    
    const results: number[] = [];
    const lowerQuery = query.toLowerCase();
    messages.forEach((msg, idx) => {
      if (msg.content.toLowerCase().includes(lowerQuery)) {
        results.push(idx);
      }
    });
    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? 0 : -1);
  };

  const goToNextResult = () => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
  };

  const goToPrevResult = () => {
    if (searchResults.length === 0) return;
    const prevIndex = currentSearchIndex <= 0 ? searchResults.length - 1 : currentSearchIndex - 1;
    setCurrentSearchIndex(prevIndex);
  };

  const closeSearch = () => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    setCurrentSearchIndex(-1);
  };

  // Export chat as Markdown
  const exportChatMarkdown = () => {
    if (messages.length === 0) return;
    
    const title = `Chat Export - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    let markdown = `# ${title}\n\n`;
    
    messages.forEach((msg, idx) => {
      const role = msg.role === 'user' ? '**You**' : '**AI Assistant**';
      const time = new Date(msg.timestamp).toLocaleTimeString();
      markdown += `### ${role} (${time})\n\n`;
      // Remove thinking blocks from export
      const cleanContent = msg.content.replace(/<think>[\s\S]*?/g, '').trim();
      markdown += `${cleanContent}\n\n---\n\n`;
    });
    
    // Create and download file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wrytica-chat-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export chat as plain text
  const exportChatText = () => {
    if (messages.length === 0) return;
    
    let text = `Wrytica Chat Export\n${'='.repeat(40)}\nExported: ${new Date().toLocaleString()}\n\n`;
    
    messages.forEach((msg) => {
      const role = msg.role === 'user' ? 'YOU' : 'AI';
      const time = new Date(msg.timestamp).toLocaleTimeString();
      text += `[${role} @ ${time}]\n`;
      const cleanContent = msg.content.replace(/<think>[\s\S]*?/g, '').trim();
      text += `${cleanContent}\n\n${'─'.repeat(40)}\n\n`;
    });
    
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wrytica-chat-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* Session Sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-surface flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-semibold text-sm transition-all shadow-sm"
          >
            <Plus size={18} />
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chatSessions.map(session => (
            <div
              key={session.id}
              className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                currentSessionId === session.id
                  ? 'bg-primary-50 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 ring-1 ring-primary-200 dark:ring-primary-800'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
              onClick={() => loadChatSession(session.id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <MessageSquare size={16} className={currentSessionId === session.id ? 'text-primary-600' : 'text-slate-400'} />
                <span className="text-sm font-medium truncate">{session.title}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChatSession(session.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 text-center uppercase tracking-widest font-bold">
           Wrytica Memory v1.2
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-900 min-w-0">
        <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-dark-surface border-b border-slate-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center text-white shadow-lg shadow-primary-500/20">
              <MessageSquare size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">AI Chat Assistant</h2>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-slate-400">
                <span className="flex items-center gap-1"><Sparkles size={10} className="text-primary-500" /> Dynamic Context</span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span>{chatSessions.find(s => s.id === currentSessionId)?.title || 'No Session'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {showSearch ? (
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg px-2 py-1 border border-slate-200 dark:border-slate-700">
                <Search size={14} className="text-slate-400" />
                <input 
                  autoFocus
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') goToNextResult();
                    if (e.key === 'Escape') closeSearch();
                  }}
                  placeholder="Search messages..."
                  className="bg-transparent border-none outline-none text-xs px-2 w-48 text-slate-700 dark:text-slate-200"
                />
                <div className="flex items-center gap-1 ml-1 pl-1 border-l border-slate-300 dark:border-slate-600">
                  <span className="text-[10px] text-slate-500 min-w-[24px] text-center">
                    {searchResults.length > 0 ? `${currentSearchIndex + 1}/${searchResults.length}` : '0/0'}
                  </span>
                  <button onClick={goToPrevResult} className="p-1 hover:text-primary-600 text-slate-400"><ChevronUp size={14} /></button>
                  <button onClick={goToNextResult} className="p-1 hover:text-primary-600 text-slate-400"><ChevronDown size={14} /></button>
                  <button onClick={closeSearch} className="p-1 hover:text-red-500 text-slate-400 ml-1"><X size={14} /></button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowSearch(true)}
                className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Search chat"
              >
                <Search size={20} />
              </button>
            )}
            
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={soundEnabled ? "Disable sound" : "Enable sound"}
            >
              {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>

            {messages.length > 1 && (
              <div className="relative group">
                <button
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Download size={14} />
                  Export
                </button>
                <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-dark-surface border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                  <button
                    onClick={exportChatMarkdown}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-t-lg"
                  >
                    <FileDown size={14} />
                    Export as Markdown
                  </button>
                  <button
                    onClick={exportChatText}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-b-lg"
                  >
                    <FileText size={14} />
                    Export as Text
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {knowledgeSummary && (
            <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-700 dark:text-slate-100">Knowledge Base Context:</span>
              <p className="mt-2">{knowledgeSummary}</p>
            </div>
          )}
          {messages.map((msg, idx) => {
            const isSearchResult = searchResults.includes(idx);
            const isCurrentResult = searchResults[currentSearchIndex] === idx;
            return (
              <div 
                key={idx} 
                id={`msg-${idx}`}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} ${isCurrentResult ? 'ring-2 ring-primary-500 ring-offset-2 dark:ring-offset-slate-900' : ''}`}
                onClick={() => isSearchResult && setCurrentSearchIndex(searchResults.indexOf(idx))}
              >
                <div className={`
                  max-w-[80%] rounded-2xl px-5 py-3.5 leading-relaxed shadow-sm
                  ${msg.role === 'user' 
                    ? 'bg-primary-600 text-white rounded-br-none' 
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none'}
                  ${isSearchResult ? 'cursor-pointer hover:ring-1 hover:ring-primary-400' : ''}
                `}>
                  <div className="flex flex-col">
                    {msg.role === 'model' && (
                      <div className="flex items-center space-x-2 mb-2 text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                        <Sparkles size={12} /> <span>{config.provider === 'gemini' ? 'Wrytica AI' : `Local (${config.modelName})`}</span>
                      </div>
                    )}
                    {renderMessageContent(msg.content)}
                    {msg.references && msg.references.length > 0 && (
                      <div className="mt-3 text-[11px] text-slate-500">
                         <div className="font-semibold text-slate-600 dark:text-slate-300">Referenced Snippets (LLM tree reasoning)</div>
                         <ul className="list-disc pl-4 space-y-1 mt-1">
                           {msg.references.map(ref => (
                             <li key={ref.id}>
                               <span className="font-semibold text-slate-700 dark:text-slate-200">{ref.sourceTitle || 'Knowledge Base'}</span>
                               {ref.pageNumber ? ` (Pg ${ref.pageNumber})` : ''}: <span className="text-slate-500 dark:text-slate-400">{ref.text.slice(0, 120)}...</span>
                               {ref.reason && <div className="text-[11px] text-slate-400">Reason: {ref.reason}</div>}
                             </li>
                           ))}
                         </ul>
                      </div>
                    )}
                 </div>
               </div>
             </div>
            );
          })}
          {streamingContent !== null && (
            <div className="flex justify-start">
              <div className={`
                max-w-[85%] px-6 py-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800
                bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none
              `}>
                <div className="flex flex-col">
                  <div className="flex items-center space-x-2 mb-2 text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                    <Sparkles size={12} /> <span>{config.provider === 'gemini' ? 'Wrytica AI' : `Local (${config.modelName})`}</span>
                  </div>
                  {renderMessageContent(streamingContent)}
                  {streamingReferences.length > 0 && (
                    <div className="mt-3 text-[11px] text-slate-500 italic">
                      Searching knowledge base and building response...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {loading && streamingContent === null && (
            <div className="flex justify-start">
              <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl rounded-bl-none px-6 py-4 flex items-center space-x-2">
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                 <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white dark:bg-dark-surface border-t border-slate-200 dark:border-dark-border">
          {/* Uploaded Document Preview */}
          {uploadedDoc && (
            <div className="mb-3 flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800">
              {isProcessingDoc ? (
                <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  Processing document...
                </div>
              ) : (
                <>
                  {uploadedDoc.type === 'pdf' ? <FileText size={18} className="text-emerald-600" /> : <Image size={18} className="text-emerald-600" />}
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300 flex-1 truncate">{uploadedDoc.name}</span>
                  <span className="text-xs text-emerald-500 dark:text-emerald-400">{(uploadedDoc.text.length / 1000).toFixed(1)}k chars</span>
                  {!docConfirmed && (
                    <button
                      onClick={handleDocClick}
                      className="p-1.5 text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300"
                      title="Preview extracted text"
                    >
                      <Eye size={16} />
                    </button>
                  )}
                  {docConfirmed && (
                    <CheckCircle size={16} className="text-emerald-500" />
                  )}
                  <button
                    onClick={removeUploadedDoc}
                    className="p-1 text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-200"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          )}

          {/* Document Preview Modal */}
          {showDocPreview && uploadedDoc && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-slate-200 dark:border-dark-border">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    {uploadedDoc.type === 'pdf' ? <FileText size={20} className="text-emerald-600" /> : <Image size={20} className="text-emerald-600" />}
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                      Review: {uploadedDoc.name}
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowDocPreview(false)}
                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <div className="flex-1 overflow-auto p-6">
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
                    Extracted Text (will be used as RAG context)
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-64 overflow-auto border border-slate-200 dark:border-slate-700">
                    {uploadedDoc.text || 'No text extracted. The document may contain only images.'}
                  </div>
                  
                  {uploadedDoc.images && uploadedDoc.images.length > 0 && (
                    <div className="mt-4">
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
                        Document Images ({uploadedDoc.images.length} pages)
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {uploadedDoc.images.slice(0, 4).map((img, idx) => (
                          <div key={idx} className="flex-shrink-0 w-24 h-32 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                            <img src={img} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                        {uploadedDoc.images.length > 4 && (
                          <div className="flex-shrink-0 w-24 h-32 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs text-slate-500">
                            +{uploadedDoc.images.length - 4} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
                  <button
                    onClick={removeUploadedDoc}
                    className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    Remove Document
                  </button>
                  <button
                    onClick={() => setShowDocPreview(false)}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Close Preview
                  </button>
                  <button
                    onClick={confirmDocUse}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-2"
                  >
                    <CheckCircle size={16} />
                    Use as Context
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <div className={`relative flex items-end bg-slate-50 dark:bg-slate-900 border rounded-xl focus-within:ring-2 focus-within:ring-primary-500 transition-shadow ${isOverLimit ? 'border-red-300 focus-within:ring-red-500' : 'border-slate-300 dark:border-slate-700'}`}>
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); saveInputText('chat', e.target.value); }}
              onKeyDown={handleKeyDown}
              placeholder={isOverLimit ? "Context limit exceeded. Clear chat or increase limit." : "Ask me to draft an email, brainstorm ideas, or edit text..."}
              className="w-full max-h-32 p-4 bg-transparent outline-none resize-none text-slate-800 dark:text-slate-200 disabled:opacity-50"
              rows={1}
              style={{ minHeight: '60px' }}
              disabled={isOverLimit}
            />
            <button
               onClick={handleSend}
               disabled={!input.trim() || loading || isOverLimit}
               className="mb-2 mr-2 p-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:bg-slate-400 transition-colors"
            >
               <Send size={18} />
            </button>
          </div>
          {/* Document Upload Button */}
          <div className="mt-2 flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*"
              onChange={handleDocUpload}
              className="hidden"
              disabled={loading || isProcessingDoc}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || isProcessingDoc}
              className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 disabled:opacity-50"
            >
              <Upload size={14} />
              Attach document
            </button>
            <span className="text-[10px] text-slate-400">PDF or image - will be used as RAG context</span>
            {input.trim() && (
              <span className="ml-auto text-[10px] text-slate-400">
                {wordCount.words} words · {wordCount.chars} chars
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-col items-center gap-3 text-xs text-slate-500">
            <div className="flex items-center justify-center gap-3">
              <span>Rate the last reply:</span>
              <button
                onClick={() => handleFeedback(1)}
                disabled={!lastHistoryEntryId}
                className={`flex items-center gap-1 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900 disabled:opacity-50 transition-all duration-300 ${
                  feedbackAnimation === 'up' 
                    ? 'bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400 scale-110' 
                    : ''
                }`}
              >
                <ThumbsUp size={12} className={feedbackAnimation === 'up' ? 'animate-pulse' : ''} />
                Useful
              </button>
              <button
                onClick={() => handleFeedback(-1)}
                disabled={!lastHistoryEntryId}
                className={`flex items-center gap-1 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900 disabled:opacity-50 transition-all duration-300 ${
                  feedbackAnimation === 'down' 
                    ? 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400 scale-110' 
                    : ''
                }`}
              >
                <ThumbsDown size={12} className={feedbackAnimation === 'down' ? 'animate-pulse' : ''} />
                Needs work
              </button>
              <button
                onClick={() => setShowFeedbackInput(!showFeedbackInput)}
                disabled={!lastHistoryEntryId}
                className={`flex items-center gap-1 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900 disabled:opacity-50 transition-all duration-300 ${showFeedbackInput ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : ''}`}
              >
                <MessageSquare size={12} />
                Add note
              </button>
            </div>
            {showFeedbackInput && (
              <div className="flex items-center gap-2 w-full max-w-md mt-2">
                <input
                  type="text"
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && feedbackComment.trim()) {
                      handleSubmitCustomFeedback(1);
                    } else if (e.key === 'Escape') {
                      setShowFeedbackInput(false);
                      setFeedbackComment('');
                    }
                  }}
                  placeholder="Add a custom feedback note..."
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-primary-500 outline-none"
                />
                <button
                  onClick={() => handleSubmitCustomFeedback(1)}
                  disabled={!feedbackComment.trim()}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  Positive
                </button>
                <button
                  onClick={() => handleSubmitCustomFeedback(-1)}
                  disabled={!feedbackComment.trim()}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 disabled:opacity-50"
                >
                  Negative
                </button>
                <button
                  onClick={() => {
                    setShowFeedbackInput(false);
                    setFeedbackComment('');
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3 text-xs text-slate-500">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={visionRag} onChange={(e) => { setVisionRag(e.target.checked); setVisionRagEnabled(e.target.checked); }} />
              <span>Use vision RAG when page images are available</span>
            </label>
          </div>
          <p className="text-center text-xs text-slate-400 mt-2">
            {isOverLimit 
              ? <span className="text-red-500 font-bold">Context Limit Exceeded. Please reset chat or adjust settings.</span> 
              : "AI can make mistakes. Check important info."}
          </p>
          <div className="mt-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/50">
            <button
              onClick={() => setTraceOpen(!traceOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
            >
              <span>Reasoning trace (tree search)</span>
              <span>{traceOpen ? 'Hide' : 'Show'}</span>
            </button>
            {traceOpen && (
              <div className="px-3 pb-3">
                {reasoningTrace ? (
                  <pre className="text-[11px] whitespace-pre-wrap text-slate-600 dark:text-slate-300 max-h-40 overflow-auto">
                    {reasoningTrace}
                  </pre>
                ) : (
                  <div className="text-[11px] text-slate-500 italic py-2">
                    {knowledgeBase.length === 0 
                      ? "Knowledge base is currently empty. Add documents to enable tree search reasoning."
                      : !knowledgeBase.some(doc => doc.pageIndex && doc.pageIndex.length > 0)
                        ? "Documents in knowledge base lack PageIndex structure. Use 'Bridge PageIndex Folder' or 'Import Indexed Data' to enable tree reasoning."
                        : "No relevant structured nodes were found for this query in the knowledge base."
                    }
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
