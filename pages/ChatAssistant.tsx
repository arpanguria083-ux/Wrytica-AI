import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { AIService, AISession } from '../services/aiService';
import { ChatMessage } from '../utils';
import { useAppContext } from '../contexts/AppContext';

export const ChatAssistant: React.FC = () => {
  const { chatState, setChatState, config, language, updateUsage, isOverLimit } = useAppContext();
  const { messages } = chatState;
  
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<AISession | null>(null);

  // Initialize Session
  useEffect(() => {
    try {
      chatSessionRef.current = AIService.createChatSession(config, language);
    } catch (error) {
      console.error('Failed to create chat session:', error);
      // Session will be null, handleSend will show error
    }
  }, [config.provider, config.modelName, config.baseUrl, config.apiKey, language]);

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

  const setMessages = (updateFn: (prev: ChatMessage[]) => ChatMessage[]) => {
    setChatState(prev => ({ ...prev, messages: updateFn(prev.messages) }));
  };

  const handleSend = async () => {
    if (!input.trim() || loading || isOverLimit) return;
    
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

    try {
      const responseText = await chatSessionRef.current.sendMessage(userMsg.content);
      const modelMsg: ChatMessage = { 
        role: 'model', 
        content: responseText || "I'm sorry, I couldn't generate a response.", 
        timestamp: Date.now() 
      };
      setMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      console.error(error);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col bg-white dark:bg-dark-surface rounded-2xl shadow-sm border border-slate-200 dark:border-dark-border overflow-hidden">
       {/* Chat History */}
       <div className="flex-1 overflow-y-auto p-6 space-y-6">
         {messages.map((msg, idx) => (
           <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
             <div className={`
               max-w-[80%] rounded-2xl px-5 py-3.5 leading-relaxed shadow-sm
               ${msg.role === 'user' 
                 ? 'bg-primary-600 text-white rounded-br-none' 
                 : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-none'}
             `}>
               {msg.role === 'model' && (
                 <div className="flex items-center space-x-2 mb-2 text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-wider">
                   <Sparkles size={12} /> <span>{config.provider === 'gemini' ? 'Wrytica AI' : `Local (${config.modelName})`}</span>
                 </div>
               )}
               <div className="whitespace-pre-wrap">{msg.content}</div>
             </div>
           </div>
         ))}
         {loading && (
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
         <div className={`relative flex items-end bg-slate-50 dark:bg-slate-900 border rounded-xl focus-within:ring-2 focus-within:ring-primary-500 transition-shadow ${isOverLimit ? 'border-red-300 focus-within:ring-red-500' : 'border-slate-300 dark:border-slate-700'}`}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
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
         <p className="text-center text-xs text-slate-400 mt-2">
           {isOverLimit 
             ? <span className="text-red-500 font-bold">Context Limit Exceeded. Please reset chat or adjust settings.</span> 
             : "AI can make mistakes. Check important info."}
         </p>
       </div>
    </div>
  );
};