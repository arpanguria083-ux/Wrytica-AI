import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Layers, CloudUpload, FilePlus, Loader2, Save, Clipboard,
  AlertTriangle, CheckCircle, XCircle, Pause, Play, X
} from 'lucide-react';
import { OCRService, OcrResult, OcrProgress } from '../services/ocrService';
import { useAppContext } from '../contexts/AppContext';
import { KnowledgeBaseService } from '../services/knowledgeBaseService';
import { generateId } from '../utils';
import { isVisionCapable } from '../utils/modelCapabilities';
import { documentProcessorAPI } from '../services/backendApi';
import { useBackendStatus } from '../hooks/useBackendStatus';
import { StabilityManager, JobStatus } from '../services/stabilityManager';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type DisplayResult = OcrResult & {
  jobId?: string;
  stage: 'pending' | 'queued' | 'processing' | 'done' | 'error' | 'saved' | 'cancelled';
  progress: number;
  error?: string;
  requestedEngine?: 'pdfplumber' | 'chandra' | 'mineru' | 'auto';
  actualEngine?: string;
  fallbackReason?: string;
  renderMode?: 'text' | 'markdown';
  processingMode?: string;
  processingTimeMs?: number;
  layoutSummary?: string;
  estimatedRemainingSec?: number;
};

export const OCRTool: React.FC = () => {
  const { knowledgeBase, addKnowledgeDocument, recordToolHistory, config, language } = useAppContext();
  const backendStatus = useBackendStatus();

  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<DisplayResult[]>([]);
  const [running, setRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [ocrMode, setOcrMode] = useState<'pdfplumber' | 'chandra' | 'mineru'>('pdfplumber');
  const [browserHealthWarning, setBrowserHealthWarning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const jobIdsRef = useRef<Map<string, string>>(new Map());  // Map filename -> jobId

  const backendFeatures = backendStatus.health?.features;
  const mineruAvailable = Boolean(backendFeatures?.deep_extract);
  const chandraAvailable = backendStatus.available && backendFeatures?.ocr_balanced !== false;
  const pdfplumberAvailable = backendStatus.available && backendFeatures?.ocr_fast !== false;

  const resolveRequestedEngine = useCallback((requested: 'pdfplumber' | 'chandra' | 'mineru') => {
    if (requested === 'mineru' && !mineruAvailable) {
      return chandraAvailable ? 'chandra' as const : 'pdfplumber' as const;
    }

    if (requested === 'chandra' && !chandraAvailable) {
      return 'pdfplumber' as const;
    }

    return requested;
  }, [mineruAvailable, chandraAvailable]);

  const summarizeLayout = (layout?: {
    text_blocks?: number;
    tables?: number;
    formulas?: number;
    images?: number;
    figures?: number;
  }) => {
    if (!layout) return undefined;
    const parts: string[] = [];
    if (layout.tables) parts.push(`${layout.tables} table${layout.tables === 1 ? '' : 's'}`);
    if (layout.formulas) parts.push(`${layout.formulas} formula${layout.formulas === 1 ? '' : 's'}`);
    if (layout.images) parts.push(`${layout.images} image${layout.images === 1 ? '' : 's'}`);
    if (layout.text_blocks) parts.push(`${layout.text_blocks} text block${layout.text_blocks === 1 ? '' : 's'}`);
    return parts.length ? parts.join(', ') : undefined;
  };

  const formatFallbackReason = (reason?: string) => {
    if (!reason) return undefined;
    return reason.replace(/_/g, ' ');
  };

  useEffect(() => {
    if (backendStatus.checking) return;

    if (!backendStatus.available) {
      console.warn('[OCRTool] Backend OCR queue unavailable');
      return;
    }

    console.info('[OCRTool] Backend OCR capabilities', {
      ocr: backendFeatures?.ocr,
      ocr_fast: backendFeatures?.ocr_fast,
      ocr_balanced: backendFeatures?.ocr_balanced,
      deep_extract: backendFeatures?.deep_extract,
      mineru_version: backendFeatures?.mineru_version,
      deep_extract_gpu: backendFeatures?.deep_extract_gpu,
      deep_extract_compute_reason: backendFeatures?.deep_extract_compute_reason,
    });
  }, [backendStatus.available, backendStatus.checking, backendFeatures]);

  useEffect(() => {
    if (backendStatus.checking || !backendStatus.available) return;

    const resolvedMode = resolveRequestedEngine(ocrMode);
    if (resolvedMode !== ocrMode) {
      console.warn('[OCRTool] Requested OCR engine unavailable, switching engine', {
        requested: ocrMode,
        resolved: resolvedMode,
      });
      setOcrMode(resolvedMode);
      setStatusMessage(`Selected OCR engine unavailable. Switched to ${resolvedMode}.`);
    }
  }, [backendStatus.available, backendStatus.checking, ocrMode, resolveRequestedEngine]);

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const list = event.target.files ? Array.from(event.target.files) : [];
    setFiles(list);
    setResults(list.map((file: File) => ({
      fileName: file.name,
      text: '',
      mimeType: file.type,
      stage: 'pending',
      progress: 0
    })));
  };

  const updateProgress = (progress: OcrProgress) => {
    setResults(prev => prev.map(item => {
      if (item.fileName !== progress.fileName) return item;
      return { ...item, stage: progress.stage === 'error' ? 'error' : 'processing', progress: progress.progress };
    }));
  };

  const isPdfFile = (file: File) =>
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  /**
   * Start OCR jobs via stable job queue
   */
  const handleRunOCR = async () => {
    if (!files.length) return;

    if (!backendStatus.available) {
      setStatusMessage('Python backend is offline. OCR job queue is unavailable until the backend is running.');
      return;
    }

    setRunning(true);
    setBrowserHealthWarning(false);
    setStatusMessage('Starting OCR jobs...');
    jobIdsRef.current.clear();

    // Initialize results for all files
    setResults(files.map(file => ({
      fileName: file.name,
      text: '',
      mimeType: file.type,
      stage: 'queued' as const,
      progress: 0,
      requestedEngine: ocrMode,
    })));

    // Start OCR job for each file
    for (const file of files) {
      try {
        const requestedEngine = ocrMode;
        const effectiveEngine = resolveRequestedEngine(requestedEngine);
        const localFallbackReason = effectiveEngine !== requestedEngine
          ? `${requestedEngine}_unavailable`
          : undefined;

        if (localFallbackReason) {
          console.warn('[OCRTool] Falling back before job submission', {
            fileName: file.name,
            requestedEngine,
            effectiveEngine,
            reason: localFallbackReason,
          });
        }

        const result = await StabilityManager.startOCRJob(file, effectiveEngine);
        jobIdsRef.current.set(file.name, result.job_id);

        setResults(prev => prev.map(item => item.fileName === file.name ? {
          ...item,
          requestedEngine,
          actualEngine: effectiveEngine,
          fallbackReason: localFallbackReason,
        } : item));

        console.info('[OCRTool] OCR job queued', {
          fileName: file.name,
          jobId: result.job_id,
          requestedEngine,
          effectiveEngine,
          fileSizeMB: result.file_size_mb,
          canStartImmediately: result.can_start_immediately,
        });

        setStatusMessage(`${file.name}: Job started (${result.file_size_mb}MB)`);

        // Poll this job in background (non-blocking)
        pollSingleJobSafely(file.name, result.job_id);
      } catch (error: any) {
        console.error(`Failed to start OCR for ${file.name}:`, error);
        setResults(prev => prev.map(r =>
          r.fileName === file.name
            ? { ...r, stage: 'error', error: error.message }
            : r
        ));
      }
    }

    setRunning(false);
  };

  /**
   * Poll a single job safely with browser health checks
   */
  const pollSingleJobSafely = useCallback(async (fileName: string, jobId: string) => {
    try {
      const finalStatus = await StabilityManager.pollJobSafely(
        jobId,
        (jobStatus: JobStatus) => {
          // Update result with job status
          setResults(prev => prev.map(r => {
            if (r.fileName !== fileName) return r;

            // Map backend status to display stage
            const stageMap: Record<string, DisplayResult['stage']> = {
              completed: 'done',
              failed: 'error',
              timeout: 'error',
              pending: 'pending',
              queued: 'queued',
              waiting_resources: 'queued',
              processing: 'processing',
              cancelled: 'cancelled',
            };
            return {
              ...r,
              jobId,
              progress: jobStatus.progress,
              stage: stageMap[jobStatus.status] ?? 'processing',
              requestedEngine: jobStatus.output?.requested_engine ?? r.requestedEngine,
              actualEngine: jobStatus.output?.engine ?? r.actualEngine,
              fallbackReason: jobStatus.output?.fallback_reason ?? r.fallbackReason,
              estimatedRemainingSec: jobStatus.estimated_remaining_sec,
              error: jobStatus.error,
              text: jobStatus.output?.markdown || '',
              processingMode: jobStatus.output?.processing_mode,
              layoutSummary: summarizeLayout(jobStatus.output?.layout_elements),
              processingTimeMs: jobStatus.output?.processing_time_ms,
              renderMode: jobStatus.output?.markdown ? 'markdown' : undefined,
            };
          }));
        },
        (isPausedByHealth) => {
          if (isPausedByHealth) {
            setBrowserHealthWarning(true);
          }
        }
      );

      console.info('[OCRTool] OCR job finished', {
        fileName,
        jobId,
        status: finalStatus.status,
        requestedEngine: finalStatus.output?.requested_engine,
        selectedEngine: finalStatus.output?.selected_engine,
        actualEngine: finalStatus.output?.engine,
        processingMode: finalStatus.output?.processing_mode,
        fallbackReason: finalStatus.output?.fallback_reason,
      });

      if (finalStatus.status === 'completed' && finalStatus.output?.fallback_reason) {
        setStatusMessage(
          `${fileName}: requested ${finalStatus.output.requested_engine}, ran ${finalStatus.output.engine} (${formatFallbackReason(finalStatus.output.fallback_reason)}).`
        );
      }
    } catch (error: any) {
      console.error(`Job polling failed for ${fileName}:`, error);
      setResults(prev => prev.map(r =>
        r.fileName === fileName ? { ...r, stage: 'error', error: error.message } : r
      ));
    }
  }, []);

  /**
   * Cancel an OCR job
   */
  const cancelOCRJob = useCallback(async (fileName: string) => {
    const jobId = jobIdsRef.current.get(fileName);
    if (!jobId) return;

    try {
      await StabilityManager.cancelJob(jobId);
      StabilityManager.clearJobState(jobId);

      setResults(prev => prev.map(r =>
        r.fileName === fileName ? { ...r, stage: 'cancelled' } : r
      ));
    } catch (error: any) {
      console.error(`Failed to cancel job for ${fileName}:`, error);
    }
  }, []);


  const handleSaveResult = async (result: DisplayResult) => {
    if (!result.text) return;
    const doc = KnowledgeBaseService.createDocument({
      title: `OCR: ${result.fileName}`,
      content: result.text,
      source: 'OCR import',
      tags: [
        'ocr',
        result.mimeType.includes('pdf') ? 'pdf' : 'image',
        ...(result.renderMode === 'markdown' ? ['deep-extract'] : [])
      ]
    });
    await addKnowledgeDocument(doc);
    console.info('[OCRTool] OCR result saved to knowledge base', {
      title: doc.title,
      fileName: result.fileName,
      chunkCount: doc.chunks?.length || 0,
      requestedEngine: result.requestedEngine,
      actualEngine: result.actualEngine,
    });
    recordToolHistory({
      id: generateId(),
      tool: 'ocr',
      input: result.fileName,
      output: `Saved as ${doc.title}`,
      timestamp: Date.now(),
      metadata: {
        pages: result.pages,
        mimeType: result.mimeType
      }
    });
    setStatusMessage(`Added ${result.fileName} to the knowledge base.`);
    setResults(prev => prev.map(r => r.fileName === result.fileName ? { ...r, stage: 'saved' as any } : r));
  };

  const handleSaveAll = async () => {
    let savedCount = 0;
    for (const result of results) {
      if (result.stage === 'done' && result.text) {
        const doc = KnowledgeBaseService.createDocument({
          title: `OCR: ${result.fileName}`,
          content: result.text,
          source: 'OCR import',
          tags: [
            'ocr',
            result.mimeType.includes('pdf') ? 'pdf' : 'image',
            ...(result.renderMode === 'markdown' ? ['deep-extract'] : [])
          ]
        });
        await addKnowledgeDocument(doc);
        console.info('[OCRTool] OCR result saved to knowledge base', {
          title: doc.title,
          fileName: result.fileName,
          chunkCount: doc.chunks?.length || 0,
          requestedEngine: result.requestedEngine,
          actualEngine: result.actualEngine,
        });
        recordToolHistory({
          id: generateId(),
          tool: 'ocr',
          input: result.fileName,
          output: `Saved as ${doc.title}`,
          timestamp: Date.now(),
          metadata: {
            pages: result.pages,
            mimeType: result.mimeType
          }
        });
        savedCount++;
      }
    }
    
    if (savedCount > 0) {
      setStatusMessage(`Successfully saved ${savedCount} document(s) to the Knowledge Base.`);
      
      // Mark as saved so the buttons disappear and we don't double-save
      setResults(prev => prev.map(r => r.stage === 'done' && r.text ? { ...r, stage: 'saved' as any } : r));
    } else {
      setStatusMessage('No completed documents to save.');
    }
  };

  const isRunDisabled = !files.length || running || backendStatus.checking || !backendStatus.available;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      {/* Browser Health Warning */}
      {browserHealthWarning && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-amber-900 dark:text-amber-100">Browser Performance Degraded</p>
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
              Your system is under heavy load. OCR processing has been temporarily paused to keep the browser responsive.
            </p>
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="mt-2 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 text-sm flex items-center gap-2"
            >
              {isPaused ? <Play size={14} /> : <Pause size={14} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">OCR & Document Extraction</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Upload PDFs or images. Processing happens safely in the background with real-time progress tracking.
          </p>
        </div>
        <button
          onClick={handleRunOCR}
          disabled={isRunDisabled}
          className="flex items-center gap-2 px-5 py-3 bg-primary-600 text-white rounded-2xl shadow hover:bg-primary-700 disabled:opacity-50"
        >
          {running ? <Loader2 className="animate-spin" size={16} /> : <CloudUpload size={16} />}
          <span>{running ? 'Starting Jobs...' : 'Start OCR'}</span>
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="uppercase tracking-wide text-[10px]">Engine:</span>
          <button
            onClick={() => setOcrMode('pdfplumber')}
            disabled={!pdfplumberAvailable}
            className={`px-3 py-1 rounded-full border text-[11px] font-semibold ${ocrMode === 'pdfplumber' ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:border-primary-400' : 'border-slate-200 bg-white text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
          >
            Fast (pdfplumber)
          </button>
          <button
            onClick={() => setOcrMode('chandra')}
            disabled={!chandraAvailable}
            className={`px-3 py-1 rounded-full border text-[11px] font-semibold ${ocrMode === 'chandra' ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:border-primary-400' : 'border-slate-200 bg-white text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
          >
            Balanced (Chandra)
          </button>
          <button
            onClick={() => setOcrMode('mineru')}
            disabled={!mineruAvailable}
            className={`px-3 py-1 rounded-full border text-[11px] font-semibold ${ocrMode === 'mineru' ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:border-primary-400' : 'border-slate-200 bg-white text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
          >
            Advanced (MinerU)
          </button>
          <span className="text-[11px] text-slate-400 italic ml-auto">
            {ocrMode === 'pdfplumber' && 'Fast, basic text extraction'}
            {ocrMode === 'chandra' && 'Balanced speed and quality with layout awareness'}
            {ocrMode === 'mineru' && 'Best for complex PDFs with tables and formulas'}
          </span>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>Backend: {backendStatus.checking ? 'Checking…' : backendStatus.available ? 'Connected' : 'Offline'}</span>
            <span>Fast OCR: {pdfplumberAvailable ? 'Ready' : 'Unavailable'}</span>
            <span>Balanced OCR: {chandraAvailable ? 'Ready' : 'Unavailable'}</span>
            <span>MinerU: {mineruAvailable ? 'Ready' : 'Unavailable'}</span>
          </div>
          {!backendStatus.available && (
            <div className="mt-2 text-amber-700 dark:text-amber-300">
              OCR jobs on this page require the Python backend to be running.
            </div>
          )}
          {backendStatus.available && !mineruAvailable && (
            <div className="mt-2 text-amber-700 dark:text-amber-300">
              MinerU is not installed or not healthy. Heavy OCR will fall back to Chandra/pdfplumber until deep extract is enabled.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-surface p-6 space-y-4">
        <label className="flex flex-col gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide text-xs">Upload files</span>
          <input
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={handleFiles}
            className="text-xs"
          />
        </label>
        <div className="text-xs text-slate-400">
          Choose scanned documents, receipts, slide decks, or photos. OCR supports PNG, JPG, and PDF. Extracted text is stored as Knowledge Base documents for RAG.
        </div>
      </div>

      {statusMessage && (
        <div className="text-sm text-slate-600 dark:text-slate-300">{statusMessage}</div>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          {results.map(result => (
            <div key={result.fileName} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-surface p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-800 dark:text-white">{result.fileName}</div>
                <div className="flex items-center gap-3">
                  <div className="text-[11px] uppercase tracking-wide font-medium flex items-center gap-2">
                    {result.stage === 'done' && <CheckCircle size={14} className="text-green-600" />}
                    {result.stage === 'processing' && <Loader2 size={14} className="text-blue-600 animate-spin" />}
                    {result.stage === 'error' && <XCircle size={14} className="text-red-600" />}
                    {result.stage === 'cancelled' && <X size={14} className="text-slate-600" />}
                    {result.stage === 'queued' && <Loader2 size={14} className="text-slate-500 animate-spin" />}
                    <span>{result.stage === 'done' ? 'Done' : result.stage}</span>
                  </div>
                  {(result.stage === 'processing' || result.stage === 'queued') && (
                    <button
                      onClick={() => cancelOCRJob(result.fileName)}
                      className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                      title="Cancel this job"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
              {result.stage === 'processing' && (
                <div className="space-y-2">
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-600 transition-all"
                      style={{ width: `${Math.round(result.progress)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{Math.round(result.progress)}%</span>
                    {result.estimatedRemainingSec && (
                      <span>{Math.ceil(result.estimatedRemainingSec)}s remaining</span>
                    )}
                  </div>
                </div>
              )}
              {result.stage !== 'processing' && result.progress > 0 && (
                <div className="h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${result.stage === 'done' ? 'bg-green-600' : result.stage === 'error' ? 'bg-red-600' : 'bg-primary-600'}`}
                    style={{ width: `100%` }}
                  />
                </div>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {result.mimeType} {result.processingMode ? `| Mode: ${result.processingMode}` : ''}
                {result.requestedEngine ? ` | Requested: ${result.requestedEngine}` : ''}
                {result.actualEngine ? ` | Actual: ${result.actualEngine}` : ''}
                {result.fallbackReason ? ` | Fallback: ${formatFallbackReason(result.fallbackReason)}` : ''}
                {result.processingTimeMs ? ` | ${(result.processingTimeMs / 1000).toFixed(1)}s` : ''}
                {result.layoutSummary ? ` | ${result.layoutSummary}` : ''}
              </p>
              {result.error && (
                <p className="text-xs text-red-500">{result.error}</p>
              )}
              {result.renderMode === 'markdown' ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4 max-h-96 overflow-auto">
                  <div className="markdown-content text-sm text-slate-700 dark:text-slate-200">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.text || '_No markdown extracted._'}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">
                  {result.text.slice(0, 500) || 'No text extracted yet.'}
                </p>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleSaveResult(result)}
                  disabled={!result.text || result.stage === 'saved'}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wide border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <FilePlus size={14} />
                  {result.stage === 'saved' ? 'Saved' : 'Save to KB'}
                </button>
                <button
                  onClick={() => {
                    if (!result.text) return;
                    navigator.clipboard.writeText(result.text);
                    setStatusMessage(`Copied ${result.fileName} text to clipboard.`);
                  }}
                  disabled={!result.text}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wide border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  <Clipboard size={14} />
                  Copy text
                </button>
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <button
              onClick={handleSaveAll}
              disabled={results.every(r => r.stage === 'saved' || !r.text)}
              className="flex items-center gap-2 px-5 py-3 bg-green-600 text-white rounded-2xl shadow hover:bg-green-700 disabled:opacity-50"
            >
              <Save size={16} />
              Save all to KB
            </button>
          </div>
        </div>
      )}

      {knowledgeBase.length > 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/40 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2 mb-2">
            <Layers size={16} />
            <span>Knowledge base documents ({knowledgeBase.length})</span>
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


