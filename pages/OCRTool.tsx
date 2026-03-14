import React, { useState } from 'react';
import { Layers, CloudUpload, FilePlus, Loader2, Save, Clipboard } from 'lucide-react';
import { OCRService, OcrResult, OcrProgress } from '../services/ocrService';
import { useAppContext } from '../contexts/AppContext';
import { KnowledgeBaseService } from '../services/knowledgeBaseService';
import { generateId } from '../utils';
import { isVisionCapable } from '../utils/modelCapabilities';

type DisplayResult = OcrResult & {
  stage: 'pending' | 'processing' | 'done' | 'error' | 'saved';
  progress: number;
  error?: string;
};

export const OCRTool: React.FC = () => {
  const { knowledgeBase, addKnowledgeDocument, recordToolHistory, config, language } = useAppContext();

  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<DisplayResult[]>([]);
  const [running, setRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [ocrMode, setOcrMode] = useState<'local' | 'vision'>('local');

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

  const handleRunOCR = async () => {
    if (!files.length) return;
    setRunning(true);
    setStatusMessage('Running OCR on selected files...');
    try {
      const extractor = ocrMode === 'vision'
        ? OCRService.ocrWithVision(files, config, language, (progress) => updateProgress(progress))
        : OCRService.ocrFiles(files, (progress) => updateProgress(progress));
      const extracted = await extractor;
      
      let hasError = false;
      setResults(extracted.map(result => {
        if (!result.text) hasError = true;
        return {
          ...result,
          stage: result.text ? 'done' : 'error',
          progress: 1,
          error: result.text ? undefined : 'Failed to extract text. Check console or model logs.'
        };
      }));
      
      setStatusMessage(hasError 
        ? `OCR finished with errors. Some files could not be processed.` 
        : `${ocrMode === 'vision' ? 'Vision OCR' : 'On-device OCR'} completed. Save results to your knowledge base.`);
    } catch (error: any) {
      console.error('OCR failed', error);
      setStatusMessage(`OCR process failed completely: ${error.message || 'Unknown error'}`);
    } finally {
      setRunning(false);
    }
  };

  const handleSaveResult = (result: DisplayResult) => {
    if (!result.text) return;
    const doc = KnowledgeBaseService.createDocument({
      title: `OCR: ${result.fileName}`,
      content: result.text,
      source: 'OCR import',
      tags: ['ocr', result.mimeType.includes('pdf') ? 'pdf' : 'image']
    });
    addKnowledgeDocument(doc);
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

  const handleSaveAll = () => {
    let savedCount = 0;
    results.forEach(result => {
      if (result.stage === 'done' && result.text) {
        const doc = KnowledgeBaseService.createDocument({
          title: `OCR: ${result.fileName}`,
          content: result.text,
          source: 'OCR import',
          tags: ['ocr', result.mimeType.includes('pdf') ? 'pdf' : 'image']
        });
        addKnowledgeDocument(doc);
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
    });
    
    if (savedCount > 0) {
      setStatusMessage(`Successfully saved ${savedCount} document(s) to the Knowledge Base.`);
      
      // Mark as saved so the buttons disappear and we don't double-save
      setResults(prev => prev.map(r => r.stage === 'done' && r.text ? { ...r, stage: 'saved' as any } : r));
    } else {
      setStatusMessage('No completed documents to save.');
    }
  };

  const isVisionSupported = config.provider === 'gemini' || isVisionCapable((config as any).model);
  const isRunDisabled = !files.length || running || (ocrMode === 'vision' && !isVisionSupported);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Bulk OCR</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Upload images or scanned PDFs, extract text (via on-device OCR), and auto-index the results into your knowledge base.
          </p>
        </div>
        <button
          onClick={handleRunOCR}
          disabled={isRunDisabled}
          className="flex items-center gap-2 px-5 py-3 bg-primary-600 text-white rounded-2xl shadow hover:bg-primary-700 disabled:opacity-50"
        >
          {running ? <Loader2 className="animate-spin" size={16} /> : <CloudUpload size={16} />}
          <span>{running ? 'Processing...' : 'Run OCR'}</span>
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="uppercase tracking-wide text-[10px]">Mode:</span>
          <button
            onClick={() => setOcrMode('local')}
            className={`px-3 py-1 rounded-full border text-[11px] font-semibold ${ocrMode === 'local' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 bg-white text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
          >
            On-device OCR
          </button>
          <button
            onClick={() => setOcrMode('vision')}
            className={`px-3 py-1 rounded-full border text-[11px] font-semibold ${ocrMode === 'vision' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 bg-white text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
          >
            Vision LLM ({config.provider === 'gemini' ? 'Gemini' : 'Local'})
          </button>
          <span className="text-[11px] text-slate-400 italic">
            {ocrMode === 'vision' ? 'Uses Gemini Vision or a configured /v1/vision endpoint.' : 'Uses Tesseract/pdf.js locally in your browser.'}
          </span>
          <span className="text-[11px] text-slate-400 italic">
            Current model: {(config as any).model || config.provider}
          </span>
        </div>
        
        {!isVisionSupported && ocrMode === 'vision' && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
            <div className="font-semibold mb-1">Vision Not Supported</div>
            The currently selected model <strong>({(config as any).model || 'unknown'})</strong> is a text-only model. It cannot process images or PDFs. Please switch to "On-device OCR", or select a vision-capable multi-modal model (like LLaVA, Pixtral, Qwen-VL, Moondream, or Gemini).
          </div>
        )}
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
          Choose scanned documents, receipts, slide decks, or photos. OCR supports PNG/JPG and PDF; extracted text is stored as knowledge base documents for RAG.
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
            <div className="text-[11px] uppercase tracking-wide">
              {result.stage === 'saved' ? 'Saved to KB' : result.stage}
            </div>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-600 transition-all"
                  style={{ width: `${Math.round(result.progress * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {result.mimeType} | {result.pages ? `${result.pages} page(s)` : 'Image'} | {result.text.slice(0, 120) || 'No text extracted yet.'}
              </p>
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


