import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Layers, FileText, ImagePlus, Eye, ArrowRight, Clipboard, Loader2 } from 'lucide-react';
import { generateId } from '../utils';

type FilePreview = {
  url?: string;
  text?: string;
  name?: string;
  type?: 'pdf' | 'image' | 'docx' | 'other';
};

const readingStyles: Record<'day' | 'night' | 'sepia', string> = {
  day: 'bg-white text-slate-900',
  night: 'bg-slate-900 text-white',
  sepia: 'bg-[#fdf4dc] text-slate-900'
};

export const DocumentViewer: React.FC = () => {
  const {
    knowledgeBase,
    recordToolHistory,
    readingMode,
    setReadingMode
  } = useAppContext();
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreview>({});
  const [loadingFile, setLoadingFile] = useState(false);
  const [status, setStatus] = useState('');

  const activeDoc = knowledgeBase.find(doc => doc.id === activeDocId) || null;

  const logDocumentHistory = (title: string, summary: string, sourceType: string) => {
    recordToolHistory({
      id: generateId(),
      tool: 'document',
      input: title,
      output: summary.slice(0, 400),
      timestamp: Date.now(),
      metadata: { sourceType }
    });
  };

  const handleSelectDoc = (docId: string) => {
    const doc = knowledgeBase.find(item => item.id === docId);
    if (!doc) return;
    setActiveDocId(docId);
    setFilePreview({});
    logDocumentHistory(doc.title, doc.content, 'knowledge-base');
    setStatus(`Viewing ${doc.title}`);
  };

  useEffect(() => {
    return () => {
      if (filePreview.url) {
        URL.revokeObjectURL(filePreview.url);
      }
    };
  }, [filePreview]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoadingFile(true);
    setStatus(`Loading ${file.name}...`);
    try {
      const mimeType = file.type;
      const result: FilePreview = { name: file.name, type: 'other' };
      if (mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const blobUrl = URL.createObjectURL(file);
        result.url = blobUrl;
        result.type = 'pdf';
        result.text = '';
      } else if (mimeType.startsWith('image/')) {
        const blobUrl = URL.createObjectURL(file);
        result.url = blobUrl;
        result.type = 'image';
        result.text = '';
      } else if (file.name.toLowerCase().endsWith('.docx')) {
        const text = await file.text().catch(() => '');
        result.type = 'docx';
        result.text = text || 'Docx text preview is limited; open the downloaded document for full fidelity.';
      } else {
        const text = await file.text();
        result.type = 'other';
        result.text = text;
      }
      setFilePreview(result);
      logDocumentHistory(file.name, result.text || 'Loaded document preview', 'uploaded-file');
      setStatus(`Previewing ${file.name}`);
    } finally {
      setLoadingFile(false);
    }
  };

  const handleModeChange = (mode: 'day' | 'night' | 'sepia') => {
    setReadingMode(mode);
    setStatus(`Reading mode: ${mode}`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Document Viewer</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Browse knowledge documents, open uploads, and adjust reading mode for comfortable day/night reading.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['day', 'night', 'sepia'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => handleModeChange(mode)}
              className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide border ${readingMode === mode ? 'border-primary-500 bg-primary-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-surface p-4 space-y-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400">
            <span>Knowledge Base</span>
            <Layers size={14} />
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {knowledgeBase.length === 0 && (
              <p className="text-xs text-slate-400">No documents yet. Save OCR results or uploads to populate this list.</p>
            )}
            {knowledgeBase.map(doc => (
              <button
                key={doc.id}
                onClick={() => handleSelectDoc(doc.id)}
                className={`w-full text-left px-3 py-2 rounded-2xl border ${activeDocId === doc.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700' : 'border-transparent hover:border-slate-200 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'}`}
              >
                <span className="text-sm font-semibold block">{doc.title}</span>
                <span className="text-[11px] text-slate-400">{new Date(doc.createdAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-surface p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <FileText size={18} />
                <span>Document preview</span>
              </div>
              <label className="flex items-center gap-2 text-xs uppercase tracking-wide">
                <ImagePlus size={14} />
                <span>Upload file</span>
                <input type="file" accept=".pdf,.docx,image/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
            {loadingFile && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="animate-spin" size={14} />
                <span>Processing your upload...</span>
              </div>
            )}
            {status && (
              <p className="text-[11px] text-slate-400">{status}</p>
            )}
            <div className={`min-h-[320px] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 overflow-auto ${readingStyles[readingMode]}`}>
              {filePreview.url && filePreview.type === 'pdf' && (
                <object data={filePreview.url} type="application/pdf" width="100%" height="480">
                  <p className="text-xs text-slate-700 dark:text-slate-200">PDF preview not supported. Please download to view.</p>
                </object>
              )}
              {filePreview.url && filePreview.type === 'image' && (
                <img src={filePreview.url} alt={filePreview.name} className="max-w-full h-auto mx-auto" />
              )}
              {!filePreview.url && !activeDoc && (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic flex items-center gap-2">
                  <Eye size={16} /> Select a knowledge document or upload a file to view its contents.
                </p>
              )}
              {activeDoc && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{activeDoc.title}</p>
                  <p className="text-sm leading-relaxed whitespace-pre-line text-slate-800 dark:text-slate-100">{activeDoc.content}</p>
                </div>
              )}
              {filePreview.text && (
                <div className="text-sm leading-relaxed whitespace-pre-line text-slate-900 dark:text-slate-100">
                  {filePreview.text}
                </div>
              )}
            </div>
            {(filePreview.url || filePreview.text) && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (!filePreview.text && filePreview.url) return;
                    const contentToCopy = filePreview.text || 'Document preview';
                    navigator.clipboard.writeText(contentToCopy);
                    setStatus('Copied preview text to clipboard.');
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wide border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Clipboard size={12} />
                  Copy preview
                </button>
                <a
                  href={filePreview.url}
                  download={filePreview.name}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wide border border-slate-200 dark:border-slate-700 bg-primary-50 text-primary-700 hover:bg-primary-100"
                >
                  <ArrowRight size={12} />
                  Download file
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


