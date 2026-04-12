import React, { useMemo, useState } from 'react';
import { Shield, Clipboard, History, Activity, Sparkles, Download, FileJson, FileSpreadsheet, Trash2, Search } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { ToolName, TimelineEntry } from '../utils';
import { copyToClipboard, formatTimestamp } from '../utils';

const TOOL_LABELS: Record<ToolName, string> = {
  chat: 'Chat assistant',
  paraphraser: 'Paraphraser',
  grammar: 'Grammar checker',
  summarizer: 'Summarizer',
  citation: 'Citation generator',
  agent: 'Agent planner',
  ocr: 'OCR & scan',
  document: 'Document viewer'
};

const TOOL_BADGES: Record<ToolName, string> = {
  chat: 'bg-primary-100 text-primary-700',
  paraphraser: 'bg-blue-100 text-blue-700',
  grammar: 'bg-yellow-100 text-yellow-700',
  summarizer: 'bg-emerald-100 text-emerald-700',
  citation: 'bg-purple-100 text-purple-700',
  agent: 'bg-slate-100 text-slate-700',
  ocr: 'bg-amber-100 text-amber-700',
  document: 'bg-slate-100 text-slate-700'
};

export const HistoryDashboard: React.FC = () => {
  const {
    chatHistory,
    toolHistory,
    guardrails,
    feedbackLog,
    setSelectedGuardrailId,
    selectedGuardrailId,
    clearMemory
  } = useAppContext();

  const [selectedToolFilter, setSelectedToolFilter] = useState<ToolName | 'all'>('all');
  const [selectedGuardrailFilter, setSelectedGuardrailFilter] = useState<string | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<'all' | 'positive' | 'needs-fix'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  const mergedHistory = useMemo(() => {
    // Combine and sort
    const allEntries = [...toolHistory, ...chatHistory].sort((a, b) => b.timestamp - a.timestamp);
    
    // Deduplicate/Group identical entries that occur very close to each other (e.g., within 5 minutes)
    const uniqueEntries: TimelineEntry[] = [];
    const seenMap = new Map<string, number>();

    allEntries.forEach(entry => {
      const key = `${entry.tool}_${entry.input}_${entry.output}`;
      const lastTime = seenMap.get(key);
      if (lastTime && (lastTime - entry.timestamp < 300000)) return;
      uniqueEntries.push(entry);
      seenMap.set(key, entry.timestamp);
    });

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return uniqueEntries.filter(entry => {
      // Tool Filter
      if (selectedToolFilter !== 'all' && entry.tool !== selectedToolFilter) return false;
      
      // Guardrail Filter
      if (selectedGuardrailFilter !== 'all' && entry.guardrailId !== selectedGuardrailFilter) return false;
      
      // Search Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesInput = entry.input.toLowerCase().includes(query);
        const matchesOutput = entry.output.toLowerCase().includes(query);
        if (!matchesInput && !matchesOutput) return false;
      }

      // Date Filter
      if (dateFilter !== 'all') {
        const diff = now - entry.timestamp;
        if (dateFilter === 'today' && diff > dayMs) return false;
        if (dateFilter === 'week' && diff > dayMs * 7) return false;
        if (dateFilter === 'month' && diff > dayMs * 30) return false;
      }

      // Rating Filter (joined with feedbackLog)
      if (ratingFilter !== 'all') {
        const feedback = feedbackLog.find(f => f.relatedEntryId === entry.id);
        if (ratingFilter === 'positive' && (!feedback || feedback.rating <= 0)) return false;
        if (ratingFilter === 'needs-fix' && (!feedback || feedback.rating >= 0)) return false;
      }

      return true;
    });
  }, [toolHistory, chatHistory, selectedToolFilter, selectedGuardrailFilter, searchQuery, ratingFilter, dateFilter, feedbackLog]);

  const feedbackSummary = useMemo(() => {
    if (!feedbackLog.length) return null;
    const positive = feedbackLog.filter(f => f.rating > 0).length;
    const negative = feedbackLog.filter(f => f.rating < 0).length;
    const byTool = feedbackLog.reduce<Record<string, { total: number; rating: number }>>((acc, entry) => {
      const bucket = acc[entry.tool] || { total: 0, rating: 0 };
      acc[entry.tool] = { total: bucket.total + 1, rating: bucket.rating + entry.rating };
      return acc;
    }, {});
    return { positive, negative, byTool };
  }, [feedbackLog]);

  const activeGuardrail = guardrails.find(g => g.id === selectedGuardrailId) || null;

  const guardrailOptions = useMemo(() => guardrails.slice(0, 3), [guardrails]);

  const handleCopyOutput = (text: string) => {
    copyToClipboard(text);
  };

  const guardrailModeDescription = activeGuardrail
    ? `${activeGuardrail.description} (${activeGuardrail.tone || 'Professional tone'})`
    : 'No guardrail selected. Pick a mode to enforce company tone, formatting, and prohibited terms.';

  const exportTrainingData = (format: 'jsonl' | 'csv') => {
    // Export exactly what's visible in the UI based on current filters
    const filteredEntries = mergedHistory;
    
    const trainingData = filteredEntries.map(entry => {
      // Add grammar-specific fields
      const grammarFields = entry.tool === 'grammar' ? {
        errors_found: entry.metadata?.errorsCount || 0,
        errors_fixed: entry.metadata?.fixesApplied || 0,
        error_types: entry.metadata?.errorTypes?.join('; ') || '',
      } : {};
      
      const guardrail = guardrails.find(g => g.id === entry.guardrailId);
      const feedback = feedbackLog.find(f => f.relatedEntryId === entry.id);

      return {
        input: entry.input,
        output: entry.output,
        tool: entry.tool,
        guardrail: guardrail?.name || 'none',
        guardrail_tone: guardrail?.tone || '',
        user_rating: feedback ? (feedback.rating > 0 ? 'positive' : 'needs-fix') : 'none',
        user_comment: feedback?.comment || '',
        model: entry.modelName || 'gemini',
        references_count: entry.references?.length || 0,
        references_titles: entry.references?.map(r => r.sourceTitle || 'Knowledge Base').join('; ') || '',
        timestamp: new Date(entry.timestamp).toISOString(),
        ...grammarFields
      };
    });

    if (format === 'jsonl') {
      const jsonlContent = trainingData.map(row => JSON.stringify(row)).join('\n');
      const blob = new Blob([jsonlContent], { type: 'application/jsonl' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wrytica_training_data_${new Date().toISOString().split('T')[0]}.jsonl`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // Add grammar-specific headers if any grammar entries exist
      const hasGrammar = trainingData.some((r: any) => r.tool === 'grammar');
      const grammarHeaders = hasGrammar 
        ? ['errors_found', 'errors_fixed', 'error_types'] 
        : [];
      const headers = ['input', 'output', 'tool', 'guardrail', 'guardrail_tone', 'user_rating', 'user_comment', 'model', 'references_count', 'references_titles', 'timestamp', ...grammarHeaders];
      const csvRows = [headers.join(',')];
      trainingData.forEach(row => {
        const escaped = (val: string) => `"${(val || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        csvRows.push(headers.map(h => escaped(String(row[h as keyof typeof row]))).join(','));
      });
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wrytica_training_data_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Memory & History</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Every chat, document view, and tool run is tracked here. Adjust guardrail modes, revisit references, and export context when needed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportTrainingData('jsonl')}
              disabled={mergedHistory.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-full border border-slate-200 dark:border-dark-border text-slate-600 dark:text-slate-300 hover:border-primary-500 hover:text-primary-600 bg-white dark:bg-dark-surface shadow-sm disabled:opacity-50"
              title="Export visible data as JSONL"
            >
              <FileJson size={16} />
              JSONL
            </button>
            <button
              onClick={() => exportTrainingData('csv')}
              disabled={mergedHistory.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-full border border-slate-200 dark:border-dark-border text-slate-600 dark:text-slate-300 hover:border-primary-500 hover:text-primary-600 bg-white dark:bg-dark-surface shadow-sm disabled:opacity-50"
              title="Export visible data as CSV"
            >
              <FileSpreadsheet size={16} />
              CSV
            </button>
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to clear all history? This cannot be undone.')) {
                  clearMemory('history');
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 bg-white dark:bg-dark-surface shadow-sm"
            >
              <Trash2 size={16} />
              Clear History
            </button>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 dark:border-dark-border text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-dark-surface shadow-sm"
            >
              <History size={16} />
              Scroll to top
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-5">
          {/* Active Guardrail Selection */}
          <div className="md:col-span-2 p-4 rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
              <Shield size={14} />
              Active Guardrail
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {activeGuardrail ? activeGuardrail.name : 'No active guardrail'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">{guardrailModeDescription}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                onClick={() => setSelectedGuardrailId(null)}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-all ${!selectedGuardrailId ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20' : 'border-slate-100 dark:border-slate-800 text-slate-500 hover:border-slate-200'}`}
              >
                Off
              </button>
              {guardrailOptions.map(g => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGuardrailId(g.id)}
                  className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-all ${selectedGuardrailId === g.id ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20' : 'border-slate-100 dark:border-slate-800 text-slate-500 hover:border-slate-200'}`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>

          {/* Search Filter */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400">
              <span>Search</span>
              <Search size={14} />
            </div>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find in history..."
                className="w-full rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-[11px] pl-8 focus:ring-1 focus:ring-primary-500 outline-none"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
            </div>
          </div>

          {/* Tools & Time Filter */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400">
              <span>Quick Filters</span>
              <Activity size={14} />
            </div>
            <div className="grid gap-1.5">
              <select
                value={selectedToolFilter}
                onChange={(e) => setSelectedToolFilter(e.target.value as ToolName | 'all')}
                className="w-full rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-900/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
              >
                <option value="all">All Tools</option>
                {Object.entries(TOOL_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
                className="w-full rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-900/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
              >
                <option value="all">Any Time</option>
                <option value="today">Today</option>
                <option value="week">Last 7 Days</option>
                <option value="month">Last 30 Days</option>
              </select>
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400">
              <span>Insight</span>
              <Sparkles size={14} />
            </div>
            {feedbackSummary ? (
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {feedbackSummary.positive + feedbackSummary.negative} ratings
                </p>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                    <div className="bg-emerald-500 h-full" style={{ width: `${(feedbackSummary.positive / (feedbackSummary.positive + feedbackSummary.negative)) * 100}%` }}></div>
                    <div className="bg-red-500 h-full" style={{ width: `${(feedbackSummary.negative / (feedbackSummary.positive + feedbackSummary.negative)) * 100}%` }}></div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">{(feedbackSummary.positive / (feedbackSummary.positive + feedbackSummary.negative) * 100).toFixed(0)}%</span>
                </div>
                <select
                  value={ratingFilter}
                  onChange={(e) => setRatingFilter(e.target.value as any)}
                  className="w-full mt-1 rounded-lg border border-transparent bg-slate-50 dark:bg-slate-900/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500"
                >
                  <option value="all">All Ratings</option>
                  <option value="positive">Helpful Only</option>
                  <option value="needs-fix">Needs Fix Only</option>
                </select>
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">No feedback data available.</p>
            )}
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Recent activity</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Timeline is ordered by most recent entries first.</p>
          </div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Showing {mergedHistory.length} records
          </span>
        </div>

        <div className="grid gap-4">
          {mergedHistory.length === 0 ? (
            <div className="p-6 rounded-2xl border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-dark-surface text-slate-500 dark:text-slate-400 text-sm">
              No activity tracked yet. Start interacting with the AI tools or view documents to populate history.
            </div>
          ) : (
            mergedHistory.map(entry => {
              const guardrail = guardrails.find(g => g.id === entry.guardrailId);
              return (
                <div key={entry.id} className="p-4 rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm hover:shadow-md transition-shadow space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${TOOL_BADGES[entry.tool]}`}>
                        {TOOL_LABELS[entry.tool]}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">{formatTimestamp(entry.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {guardrail && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800 text-slate-500 font-medium">
                          {guardrail.name}
                        </span>
                      )}
                      <button
                        onClick={() => handleCopyOutput(entry.output)}
                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary-600 hover:text-primary-700 transition-colors"
                      >
                        <Clipboard size={12} /> Copy Result
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Input</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 hover:line-clamp-none transition-all duration-300">{entry.input}</p>
                    </div>
                    <div className="flex-[2] space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Output</p>
                      <div className="text-sm text-slate-900 dark:text-slate-100 bg-slate-50/50 dark:bg-slate-900/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/50">
                        <p className="whitespace-pre-line break-words line-clamp-3 hover:line-clamp-none transition-all duration-300">{entry.output}</p>
                      </div>
                    </div>
                  </div>
                  {entry.references && entry.references.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/50">
                      <details className="group">
                        <summary className="text-[10px] font-bold uppercase tracking-widest text-slate-400 cursor-pointer flex items-center gap-2 hover:text-primary-500 transition-colors list-none">
                          <Sparkles size={12} className="text-primary-500" />
                          <span>View {entry.references.length} Referenced Sources</span>
                          <span className="group-open:rotate-180 transition-transform ml-auto">▼</span>
                        </summary>
                        <ul className="mt-3 space-y-2 pl-2 border-l-2 border-primary-500/20">
                          {entry.references.map(ref => (
                            <li key={ref.id} className="text-[11px] text-slate-600 dark:text-slate-400">
                              <span className="font-bold text-slate-800 dark:text-slate-200">{ref.sourceTitle || 'Knowledge base'}</span>
                              {ref.pageNumber ? ` (Pg ${ref.pageNumber})` : ''} — {ref.text.slice(0, 160)}...
                              {ref.reason && <span className="block mt-0.5 text-[10px] italic text-slate-400">Reason: {ref.reason}</span>}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};


