import React, { useMemo, useState } from 'react';
import { Shield, Clipboard, History, Activity, Sparkles, Download, FileJson, FileSpreadsheet } from 'lucide-react';
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
    selectedGuardrailId
  } = useAppContext();

  const [selectedToolFilter, setSelectedToolFilter] = useState<ToolName | 'all'>('all');
  const [selectedGuardrailFilter, setSelectedGuardrailFilter] = useState<string | 'all'>('all');
  const [exportFilter, setExportFilter] = useState<ToolName | 'all'>('all');

  const mergedHistory = useMemo(() => {
    // Use a Map to deduplicate by entry ID, keeping the first occurrence
    const entriesMap = new Map<string, TimelineEntry>();
    [...toolHistory, ...chatHistory].forEach(entry => {
      if (!entriesMap.has(entry.id)) {
        entriesMap.set(entry.id, entry);
      }
    });
    const entries = Array.from(entriesMap.values());
    const filtered = entries
      .filter(entry => selectedToolFilter === 'all' || entry.tool === selectedToolFilter)
      .filter(entry => selectedGuardrailFilter === 'all' || entry.guardrailId === selectedGuardrailFilter);
    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }, [toolHistory, chatHistory, selectedToolFilter, selectedGuardrailFilter]);

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

  const exportTrainingData = (format: 'jsonl' | 'csv', toolFilter?: ToolName | 'all') => {
    const allEntries = [...toolHistory, ...chatHistory];
    // Filter for export (defaults to UI filter but can be overridden)
    const filter = toolFilter ?? exportFilter;
    const filteredEntries = filter === 'all' 
      ? allEntries 
      : allEntries.filter(entry => entry.tool === filter);
    
    const trainingData = filteredEntries.map(entry => {
      // Add grammar-specific fields
      const grammarFields = entry.tool === 'grammar' ? {
        errors_found: entry.metadata?.errorsCount || 0,
        errors_fixed: entry.metadata?.fixesApplied || 0,
        error_types: entry.metadata?.errorTypes?.join('; ') || '',
      } : {};
      
      const guardrail = guardrails.find(g => g.id === entry.guardrailId);
      return {
        input: entry.input,
        output: entry.output,
        tool: entry.tool,
        guardrail: guardrail?.name || 'none',
        guardrail_tone: guardrail?.tone || '',
        model: entry.modelName || 'gemini',
        references_count: entry.references?.length || 0,
        references_titles: entry.references?.map(r => r.sourceTitle || 'Knowledge Base').join('; ') || '',
        self_improve_applied: entry.selfImproveData?.applied || false,
        self_improve_reranked: entry.selfImproveData?.rerankedChunkIds?.join('; ') || '',
        self_improve_signals: entry.selfImproveData?.feedbackSignalsUsed || 0,
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
      const headers = ['input', 'output', 'tool', 'guardrail', 'guardrail_tone', 'model', 'references_count', 'references_titles', 'self_improve_applied', 'self_improve_reranked', 'self_improve_signals', 'timestamp', ...grammarHeaders];
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
            <select
              value={exportFilter}
              onChange={(e) => setExportFilter(e.target.value as ToolName | 'all')}
              className="rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-900/50 px-2 py-1.5 text-xs"
              title="Filter export by tool"
            >
              <option value="all">All tools</option>
              {Object.entries(TOOL_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <button
              onClick={() => exportTrainingData('jsonl', exportFilter)}
              disabled={mergedHistory.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-full border border-slate-200 dark:border-dark-border text-slate-600 dark:text-slate-300 hover:border-primary-500 hover:text-primary-600 bg-white dark:bg-dark-surface shadow-sm disabled:opacity-50"
            >
              <FileJson size={16} />
              JSONL
            </button>
            <button
              onClick={() => exportTrainingData('csv', exportFilter)}
              disabled={mergedHistory.length === 0}
              className="flex items-center gap-2 px-3 py-2 rounded-full border border-slate-200 dark:border-dark-border text-slate-600 dark:text-slate-300 hover:border-primary-500 hover:text-primary-600 bg-white dark:bg-dark-surface shadow-sm disabled:opacity-50"
            >
              <FileSpreadsheet size={16} />
              CSV
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

        <div className="grid gap-4 md:grid-cols-3">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase">
              <Shield size={16} />
              Guardrail mode
            </div>
            <div className="space-y-2">
              <p className="text-base font-semibold text-slate-900 dark:text-white">
                {activeGuardrail ? activeGuardrail.name : 'No guardrail set'}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{guardrailModeDescription}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setSelectedGuardrailId(null);
                  setSelectedGuardrailFilter('all');
                }}
                className="px-3 py-1 text-xs font-semibold rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-500 hover:text-primary-600"
              >
                Clear mode
              </button>
              {guardrailOptions.map(guardrail => (
                <button
                  key={guardrail.id}
                  onClick={() => {
                    setSelectedGuardrailId(guardrail.id);
                    setSelectedGuardrailFilter(guardrail.id);
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-full border ${selectedGuardrailFilter === guardrail.id ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300'}`}
                >
                  {guardrail.name}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400">
              <span>Filters</span>
              <Activity size={16} />
            </div>
            <div className="grid gap-2">
              <select
                value={selectedToolFilter}
                onChange={(e) => setSelectedToolFilter(e.target.value as ToolName | 'all')}
                className="w-full rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-sm"
              >
                <option value="all">All tools</option>
                {Object.entries(TOOL_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <select
                value={selectedGuardrailFilter}
                onChange={(e) => setSelectedGuardrailFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-900/50 px-3 py-2 text-sm"
              >
                <option value="all">All guardrails</option>
                {guardrails.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400">
              <span>Feedback insight</span>
              <Sparkles size={16} />
            </div>
            {feedbackSummary ? (
              <div className="space-y-2 text-sm">
                <p className="text-base font-semibold text-slate-900 dark:text-white">
                  {feedbackSummary.positive + feedbackSummary.negative} ratings
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {feedbackSummary.positive} positive | {feedbackSummary.negative} needs work
                </p>
                <div className="space-y-1">
                  {Object.entries(feedbackSummary.byTool).map(([tool, data]) => {
                    const label = TOOL_LABELS[tool as ToolName] || tool;
                    return (
                      <div key={tool} className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>{label}</span>
                        <span>{(data.rating / data.total).toFixed(2)} avg over {data.total}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">No feedback yet. Rate tools whenever you're ready.</p>
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
                <div key={entry.id} className="p-5 rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${TOOL_BADGES[entry.tool]}`}>{TOOL_LABELS[entry.tool]}</span>
                      <span className="text-[11px] text-slate-400">{formatTimestamp(entry.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {guardrail && (
                        <span className="text-[11px] px-2 py-1 rounded-full border border-slate-200 dark:border-dark-border text-slate-500">
                          {guardrail.name}
                        </span>
                      )}
                      <button
                        onClick={() => handleCopyOutput(entry.output)}
                        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-primary-600 hover:underline"
                      >
                        <Clipboard size={12} /> Copy result
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">Input / prompt</p>
                      <p className="text-sm text-slate-700 dark:text-slate-100 whitespace-pre-line">{entry.input}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">Output</p>
                      <p className="text-sm text-slate-900 dark:text-slate-200 whitespace-pre-line break-words">{entry.output}</p>
                    </div>
                  </div>
                  {entry.references && entry.references.length > 0 && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-300 space-y-1">
                      <p className="uppercase tracking-wider">Referenced knowledge</p>
                      <ul className="list-disc pl-4 space-y-1 text-[12px] text-slate-600 dark:text-slate-400">
                        {entry.references.map(ref => (
                          <li key={ref.id}>
                            <span className="font-semibold text-slate-800 dark:text-white">{ref.sourceTitle || 'Knowledge base'}</span>
                            {ref.pageNumber ? ` (Pg ${ref.pageNumber})` : ''} — {ref.text.slice(0, 160)}...
                            {ref.reason && <span className="block text-[11px] text-slate-400">Reason: {ref.reason}</span>}
                          </li>
                        ))}
                      </ul>
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


