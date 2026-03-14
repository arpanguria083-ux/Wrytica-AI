import React, { useState } from 'react';
import { FileText, ArrowRight, CheckCircle, Clipboard, BookOpen, Loader2 } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { KnowledgeBaseService } from '../services/knowledgeBaseService';
import { PageIndexService } from '../services/pageIndexService';
import { AgentPlannerService, AgentMemoResult } from '../services/agentPlanner';
import { VectorStoreService } from '../services/vectorStoreService';
import { copyToClipboard, generateId, mergeKnowledgeChunks, buildContextEnhancement } from '../utils';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface AgentStep {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  output?: string;
}

const INITIAL_STEPS: AgentStep[] = [
  { id: 'plan', label: 'Strategic Plan', description: 'Outline memo sections and key actions.', status: 'pending' },
  { id: 'draft', label: 'Draft Memo', description: 'Generate the memo body with guardrails and knowledge context.', status: 'pending' },
  { id: 'grammar', label: 'Polish Grammar', description: 'Highlight grammar fixes and forecasts.', status: 'pending' },
  { id: 'summary', label: 'Executive Highlights', description: 'Condense the memo into principal takeaways.', status: 'pending' },
  { id: 'citation', label: 'Citations', description: 'Generate attribution strings for referenced knowledge.', status: 'pending' }
];

export const AgentPlanner: React.FC = () => {
  const { config, language, guardrails, selectedGuardrailId, knowledgeBase, recordToolHistory, setKnowledgeReferences, getFeedbackHints, retrievalMode, selfImproveEnabled, feedbackLog } = useAppContext();
  const guardrail = guardrails.find(g => g.id === selectedGuardrailId);

  const [topic, setTopic] = useState('');
  const [goal, setGoal] = useState('');
  const [notes, setNotes] = useState('');
  const [steps, setSteps] = useState<AgentStep[]>(INITIAL_STEPS);
  const [agentResult, setAgentResult] = useState<AgentMemoResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const handleRunAgent = async () => {
    if (!topic.trim() || !goal.trim()) return;
    setRunning(true);
    setError('');
    setAgentResult(null);
    setSteps(INITIAL_STEPS.map(step => ({ ...step, status: 'running', output: '' })));

    const feedbackHints = getFeedbackHints('agent');
    const relevantChunks = KnowledgeBaseService.search(`${topic} ${goal}`, knowledgeBase);
    const vectorChunks = retrievalMode === 'hybrid' ? VectorStoreService.search(`${topic} ${goal}`, knowledgeBase, 4) : [];

    const pageIndexResult = await PageIndexService.queryPageIndex({
      config,
      language,
      query: `${topic} ${goal}`,
      documents: knowledgeBase,
      limit: 4,
      enhancement: buildContextEnhancement(guardrail, feedbackHints)
    });
    let combinedChunks = mergeKnowledgeChunks(relevantChunks, [...pageIndexResult.chunks, ...vectorChunks], 6);
    if (selfImproveEnabled) {
      const { RewardService } = await import('../services/rewardService');
      combinedChunks = RewardService.rerankReferences(combinedChunks, feedbackLog, 'agent');
    }
    setKnowledgeReferences(combinedChunks);

    try {
      const result = await AgentPlannerService.runMemoWorkflow({
        config,
        language,
        topic,
        goal,
        notes,
        guardrail,
        knowledgeRefs: combinedChunks,
        feedbackHints
      });
      setAgentResult(result);
      setSteps(prev => prev.map(step => {
        switch (step.id) {
          case 'plan':
            return { ...step, status: 'done', output: result.plan };
          case 'draft':
            return { ...step, status: 'done', output: result.memo };
          case 'grammar':
            return { ...step, status: 'done', output: `${result.grammar.errors.length} issues flagged` };
          case 'summary':
            return { ...step, status: 'done', output: result.summary };
          case 'citation':
            return { ...step, status: 'done', output: result.citation.formatted_citation || 'No citation available' };
          default:
            return step;
        }
      }));

      recordToolHistory({
        id: generateId(),
        tool: 'agent',
        input: `${topic} | ${goal}`,
        output: result.memo,
        timestamp: Date.now(),
        guardrailId: guardrail?.id,
        metadata: {
          plan: result.plan,
          summary: result.summary,
          citation: result.citation.formatted_citation
        },
        references: combinedChunks
      });
    } catch (err: any) {
      console.error('Agent planner failed', err);
      setError(err?.message || 'Agent failed to complete the workflow.');
      setSteps(prev => prev.map(step => ({ ...step, status: 'error' })));
    } finally {
      setRunning(false);
    }
  };

  const renderStep = (step: AgentStep) => (
    <div key={step.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-surface shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400">{step.label}</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{step.description}</p>
        </div>
        <div className={`text-[11px] px-2 py-0.5 rounded-full ${step.status === 'done' ? 'bg-green-100 text-green-700' : step.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
          {step.status}
        </div>
      </div>
      {step.output && (
        <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-line break-words">{step.output}</p>
      )}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Agent Planner</h2>
        <p className="text-slate-500 dark:text-slate-400">Let the AGNO-inspired agent stitch knowledge, guardrails, and multi-step actions into a memo.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Memo Topic" className="col-span-2 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-surface text-sm" />
        <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Goal or deliverable" className="px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-surface text-sm" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes, raw bullet points, or pasted doc" rows={4} className="lg:col-span-3 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm resize-none" />
      </div>

      <div className="flex items-center justify-end space-x-3">
        <button onClick={handleRunAgent} disabled={running || !topic || !goal} className="flex items-center space-x-2 px-6 py-3 bg-primary-600 text-white rounded-2xl shadow hover:bg-primary-700 disabled:opacity-50">
          {running ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
          <span>{running ? 'Running agent...' : 'Run agent workflow'}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {steps.map(renderStep)}
      </div>

      {agentResult && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-500">
                <FileText size={18} />
                <span className="text-sm uppercase tracking-wide">Final Memo</span>
              </div>
              <button onClick={() => copyToClipboard(agentResult.memo)} className="text-xs uppercase text-primary-600 flex items-center gap-1">
                <Clipboard size={12} /> Copy
              </button>
            </div>
            <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-line">{agentResult.memo}</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-3 text-slate-100">
              <div className="flex items-center gap-2 text-slate-300">
                <CheckCircle size={18} />
                <span className="text-xs uppercase tracking-wide">Highlights</span>
              </div>
              <p className="text-sm leading-relaxed">{agentResult.summary}</p>
            </div>
            <div className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 uppercase tracking-wide">
                <span>Citation</span>
                <button onClick={() => copyToClipboard(agentResult.citation.formatted_citation)} className="text-primary-600 hover:underline flex items-center gap-1">
                  <Clipboard size={12} /> Copy
                </button>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300">{agentResult.citation.formatted_citation}</p>
              <pre className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-xl p-3 overflow-x-auto">{agentResult.citation.bibtex}</pre>
            </div>
          </div>
        </div>
      )}

      {knowledgeBase.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={16} />
            <span>Knowledge base entries in play</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {knowledgeBase.map((doc) => (
              <span key={doc.id} className="px-3 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
                {doc.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
