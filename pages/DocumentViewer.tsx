import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { 
  Layers, 
  FileText, 
  ImagePlus, 
  Eye, 
  ArrowRight, 
  Clipboard, 
  Loader2, 
  Search, 
  Maximize2, 
  Minimize2, 
  Type, 
  ZoomIn, 
  ZoomOut,
  Trash2,
  Download,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { generateId, KnowledgeDocument } from '../utils';
import { extractPdfText } from '../services/ocrService';
import { KnowledgeBaseService } from '../services/knowledgeBaseService';

type FilePreview = {
  url?: string;
  text?: string;
  name?: string;
  type?: 'pdf' | 'image' | 'docx' | 'other';
};

const readingStyles: Record<'day' | 'night' | 'sepia', string> = {
  day: 'bg-white text-slate-900 border-slate-200',
  night: 'bg-slate-900 text-slate-100 border-slate-800',
  sepia: 'bg-[#fdf4dc] text-[#5b4636] border-[#eaddc0] font-serif'
};

export const DocumentViewer: React.FC = () => {
  const {
    knowledgeBase,
    addKnowledgeDocument,
    recordToolHistory,
    readingMode,
    setReadingMode
  } = useAppContext();
  
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreview>({});
  const [loadingFile, setLoadingFile] = useState(false);
  const [status, setStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [fontSize, setFontSize] = useState(16);
   const [isFullscreen, setIsFullscreen] = useState(false);
   const [showCopySuccess, setShowCopySuccess] = useState(false);
    const [viewPreference, setViewPreference] = useState<'original' | 'text' | 'compare'>('original');

  const activeDoc = knowledgeBase.find(doc => doc.id === activeDocId) || null;

  const filteredDocs = knowledgeBase.filter(doc => 
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    
    // Restore visual preview if available (Blob URL or PDF type)
    if (doc.type === 'pdf' && doc.previewUrl) {
      setFilePreview({
        url: doc.previewUrl,
        type: 'pdf',
        name: doc.title,
        text: doc.content
      });
    } else if (doc.type === 'image' && doc.previewUrl) {
      setFilePreview({
        url: doc.previewUrl,
        type: 'image',
        name: doc.title,
        text: doc.content
      });
    } else {
      setFilePreview({});
    }

    logDocumentHistory(doc.title, doc.content, 'knowledge-base');
    setStatus(`Viewing ${doc.title}`);
  };

  const handleClearSelection = () => {
    setActiveDocId(null);
    setFilePreview({});
    setStatus('');
  };

  const handleCopy = () => {
    const contentToCopy = activeDoc?.content || filePreview.text || '';
    if (!contentToCopy) return;
    
    navigator.clipboard.writeText(contentToCopy);
    setShowCopySuccess(true);
    setTimeout(() => setShowCopySuccess(false), 2000);
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
    setStatus(`Processing ${file.name}...`);
    try {
      const mimeType = file.type;
      const result: FilePreview = { name: file.name, type: 'other' };
      let extractedText = '';

      if (mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const blobUrl = URL.createObjectURL(file);
        result.url = blobUrl;
        result.type = 'pdf';
        try {
          const ocrResult = await extractPdfText(file, { maxPages: 100 });
          extractedText = ocrResult.text;
          result.text = extractedText;
        } catch (err) {
          console.error('PDF text extraction failed:', err);
          result.text = 'Could not extract text from PDF for knowledge base, but you can still view it.';
        }
      } else if (mimeType.startsWith('image/')) {
        const blobUrl = URL.createObjectURL(file);
        result.url = blobUrl;
        result.type = 'image';
        result.text = '';
      } else if (file.name.toLowerCase().endsWith('.docx')) {
        const text = await file.text().catch(() => '');
        result.type = 'docx';
        extractedText = text;
        result.text = text || 'Docx text preview is limited; open the downloaded document for full fidelity.';
      } else {
        const text = await file.text();
        result.type = 'other';
        extractedText = text;
        result.text = text;
      }

      setFilePreview(result);

      // Auto-save to Knowledge Base if we have content or it's a PDF/Image
      const newDoc = KnowledgeBaseService.createDocument({
        title: file.name,
        content: extractedText || `Uploaded ${result.type} file: ${file.name}`,
        source: 'User Upload',
        tags: ['upload'],
        previewUrl: result.url, // Store the Blob URL for visual viewing
        type: result.type === 'pdf' ? 'pdf' : (result.type === 'image' ? 'image' : 'text'),
      });

      addKnowledgeDocument(newDoc);
      setActiveDocId(newDoc.id);

      logDocumentHistory(file.name, result.text || 'Loaded document preview', 'uploaded-file');
      setStatus(`Saved ${file.name} to Knowledge Base`);
    } catch (error) {
      console.error('Upload failed:', error);
      setStatus('Failed to process upload');
    } finally {
      setLoadingFile(false);
    }
  };

  const handleModeChange = (mode: 'day' | 'night' | 'sepia') => {
    setReadingMode(mode);
    setStatus(`Reading mode: ${mode}`);
  };

  return (
    <div className={`max-w-7xl mx-auto space-y-6 pb-10 ${isFullscreen ? 'fixed inset-0 z-[100] bg-white dark:bg-slate-950 p-6 overflow-hidden' : ''}`}>
      {!isFullscreen && (
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Document Viewer</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-2xl">
              Professional reading environment for your academic papers and research documents. 
              Switch between themes and adjust typography for focus.
            </p>
          </div>
          <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl">
            {(['day', 'night', 'sepia'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                  readingMode === mode 
                    ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`grid gap-6 ${isFullscreen ? 'h-full' : 'lg:grid-cols-12'}`}>
        {!isFullscreen && (
          <div className="lg:col-span-4 flex flex-col gap-4">
            {/* Sidebar / Document List */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-surface shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Layers size={16} className="text-primary-500" />
                    Knowledge Base
                  </h3>
                  <label className="cursor-pointer group">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 text-[11px] font-bold uppercase tracking-wider group-hover:bg-primary-100 transition-colors">
                      <ImagePlus size={14} />
                      Upload
                    </div>
                    <input type="file" accept=".pdf,.docx,image/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[500px] p-2 space-y-1 custom-scrollbar">
                {filteredDocs.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                      <Search size={20} />
                    </div>
                    <p className="text-xs text-slate-400 px-4">
                      {searchQuery ? `No results for "${searchQuery}"` : "No documents available. Upload a file to get started."}
                    </p>
                  </div>
                ) : (
                  filteredDocs.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => handleSelectDoc(doc.id)}
                      className={`w-full text-left p-3 rounded-xl transition-all duration-200 group relative ${
                        activeDocId === doc.id 
                          ? 'bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30' 
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 p-2 rounded-lg ${activeDocId === doc.id ? 'bg-primary-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                          <FileText size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-bold block truncate ${activeDocId === doc.id ? 'text-primary-700 dark:text-primary-400' : 'text-slate-700 dark:text-slate-200'}`}>
                            {doc.title}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-slate-400 font-medium">{new Date(doc.createdAt).toLocaleDateString()}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                            <span className="text-[10px] text-slate-400 font-medium uppercase">{doc.type || 'text'}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className={`${isFullscreen ? 'h-full' : 'lg:col-span-8'} flex flex-col gap-4`}>
          <div className={`flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-dark-surface shadow-sm overflow-hidden ${isFullscreen ? 'h-full' : ''}`}>
            {/* Preview Header */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500">
                  <Eye size={16} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">
                    {activeDoc?.title || filePreview.name || 'Document Preview'}
                  </h3>
                  {status && <p className="text-[10px] text-primary-500 font-medium animate-pulse">{status}</p>}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* View Mode Toggle */}
                <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mr-2">
                  <button
                    onClick={() => setViewPreference('original')}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                      viewPreference === 'original'
                        ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    Original
                  </button>
                  <button
                    onClick={() => setViewPreference('text')}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                      viewPreference === 'text'
                        ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    Text
                  </button>
                  <button
                    onClick={() => setViewPreference('compare')}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                      viewPreference === 'compare'
                        ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    Compare
                  </button>
                </div>

                {/* Typography Controls */}
                <div className="flex items-center gap-0.5 px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mr-2">
                  <button onClick={() => setFontSize(Math.max(12, fontSize - 2))} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500" title="Smaller font">
                    <ZoomOut size={14} />
                  </button>
                  <div className="w-[1px] h-3 bg-slate-200 dark:bg-slate-700 mx-1"></div>
                  <button onClick={() => setFontSize(Math.min(32, fontSize + 2))} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-500" title="Larger font">
                    <ZoomIn size={14} />
                  </button>
                </div>

                {/* Actions */}
                <button 
                  onClick={handleCopy}
                  className={`p-2 rounded-lg transition-colors ${showCopySuccess ? 'text-green-500 bg-green-50 dark:bg-green-900/20' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  title="Copy text"
                >
                  {showCopySuccess ? <CheckCircle2 size={18} /> : <Clipboard size={18} />}
                </button>
                
                <button 
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                  {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>

                {(activeDocId || filePreview.url) && (
                  <button 
                    onClick={handleClearSelection}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-1"
                    title="Close document"
                  >
                    <XCircle size={18} />
                  </button>
                )}
              </div>
            </div>

            {/* Preview Content */}
            <div className={`flex-1 overflow-hidden transition-colors duration-300 ${readingStyles[readingMode]} ${isFullscreen ? 'h-full' : 'min-h-[600px]'} flex flex-col`}>
              <div className={`flex-1 w-full ${viewPreference === 'text' ? 'max-w-3xl mx-auto p-6 overflow-y-auto' : 'p-0'} custom-scrollbar`}>
                {loadingFile ? (
                  <div className="flex flex-col items-center justify-center py-24 space-y-4">
                    <Loader2 className="animate-spin text-primary-500" size={32} />
                    <p className="text-sm font-medium animate-pulse">Analyzing document structure...</p>
                  </div>
                ) : viewPreference === 'original' && filePreview.url && filePreview.type === 'pdf' ? (
                  <div className="w-full h-full min-h-[700px] bg-slate-100 dark:bg-slate-900/50 flex flex-col">
                    <object 
                      data={filePreview.url} 
                      type="application/pdf" 
                      className="w-full flex-1"
                      style={{ height: isFullscreen ? "calc(100vh - 80px)" : "750px" }}
                    >
                      <div className="p-12 text-center bg-slate-50 dark:bg-slate-900 rounded-xl m-6">
                        <FileText size={48} className="mx-auto text-slate-300 mb-4" />
                        <p className="text-sm text-slate-600 dark:text-slate-400">PDF preview is not supported by your browser.</p>
                        <a href={filePreview.url} download={filePreview.name} className="inline-block mt-4 text-primary-600 font-bold hover:underline">Download to View</a>
                      </div>
                    </object>
                  </div>
                ) : viewPreference === 'original' && filePreview.url && filePreview.type === 'image' ? (
                  <div className="w-full h-full p-6 overflow-y-auto flex items-center justify-center">
                    <div className="max-w-full rounded-xl overflow-hidden shadow-lg border border-black/5 bg-white p-2">
                      <img src={filePreview.url} alt={filePreview.name} className="max-w-full h-auto mx-auto rounded-lg" />
                    </div>
                  </div>
                ) : viewPreference === 'text' && (activeDoc || filePreview.text) ? (
                  <article className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 py-6">
                    <header className="border-b border-black/5 pb-6">
                      <h1 className="text-2xl font-bold tracking-tight mb-2">{activeDoc?.title || filePreview.name}</h1>
                      <div className="flex items-center gap-3 text-xs opacity-60 font-medium">
                        <span className="flex items-center gap-1"><FileText size={12} /> {activeDoc?.type || filePreview.type || 'Document'}</span>
                        <span>•</span>
                        <span>{activeDoc ? new Date(activeDoc.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'Uploaded Session'}</span>
                      </div>
                    </header>
                    <div 
                      className="leading-relaxed whitespace-pre-line prose prose-slate dark:prose-invert max-w-none"
                      style={{ fontSize: `${fontSize}px` }}
                    >
                      {activeDoc?.content || filePreview.text}
                    </div>
                  </article>
                ) : viewPreference === 'compare' && (activeDoc || filePreview.text) ? (
                  <div className={`grid gap-0 h-full ${isFullscreen ? 'h-full' : 'lg:grid-cols-2'}`}>
                    {/* Left: Original */}
                    <div className="border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 flex flex-col">
                      <div className="px-4 py-2 bg-white/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Original Document</h4>
                      </div>
                      <div className="flex-1 min-h-[600px]">
                        {filePreview.url && filePreview.type === 'pdf' ? (
                          <object data={filePreview.url} type="application/pdf" className="w-full h-full">
                            <div className="p-8 text-center">PDF Unavailable</div>
                          </object>
                        ) : filePreview.url && filePreview.type === 'image' ? (
                          <div className="h-full overflow-y-auto p-4 flex items-center justify-center">
                            <img src={filePreview.url} alt="Compare" className="max-w-full h-auto rounded-lg shadow-sm" />
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-50">
                            <FileText size={32} className="mb-2" />
                            <p className="text-xs">Visual source unavailable.</p>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Right: Text */}
                    <div className="flex flex-col bg-white dark:bg-dark-surface overflow-hidden">
                      <div className="px-4 py-2 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Extracted Content</h4>
                      </div>
                      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        <div 
                          className="leading-relaxed whitespace-pre-line prose prose-slate dark:prose-invert max-w-none"
                          style={{ fontSize: `${Math.max(12, fontSize - 2)}px` }}
                        >
                          {activeDoc?.content || filePreview.text}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : activeDoc && activeDoc.type === 'pdf' && viewPreference === 'original' && !filePreview.url ? (
                   <div className="max-w-3xl mx-auto p-12 text-center bg-slate-50 dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 my-12">
                      <FileText size={48} className="mx-auto text-slate-300 mb-4" />
                      <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">{activeDoc.title}</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                        Visual preview is unavailable for this saved document. Switch to <strong>Text Mode</strong> to read the extracted content, or re-upload the file to see the original PDF.
                      </p>
                      <button 
                        onClick={() => setViewPreference('text')}
                        className="px-6 py-2 rounded-full bg-primary-600 text-white text-sm font-bold shadow-lg shadow-primary-500/20 hover:bg-primary-700 transition-all"
                      >
                        Switch to Text Mode
                      </button>
                   </div>
                ) : (
                  <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-24 space-y-6 text-center">
                    <div className="relative">
                      <div className="absolute -inset-4 bg-primary-500/5 rounded-full blur-2xl animate-pulse"></div>
                      <div className="relative w-20 h-20 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400">
                        <FileText size={40} strokeWidth={1.5} />
                      </div>
                    </div>
                    <div className="space-y-2 max-w-xs">
                      <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">No Document Selected</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Select a document from your knowledge base or upload a new file to start reading.
                      </p>
                    </div>
                    {!isFullscreen && (
                      <label className="cursor-pointer">
                        <div className="px-6 py-2.5 rounded-full bg-primary-600 text-white text-sm font-bold shadow-lg shadow-primary-500/20 hover:bg-primary-700 transition-all">
                          Upload Document
                        </div>
                        <input type="file" accept=".pdf,.docx,image/*" onChange={handleFileUpload} className="hidden" />
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer / Info bar */}
            {(activeDoc || filePreview.url || filePreview.text) && !isFullscreen && (
              <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5"><Type size={12} /> Font: {fontSize}px</span>
                  <span className="flex items-center gap-1.5 capitalize"><Eye size={12} /> Mode: {readingMode}</span>
                </div>
                {filePreview.url && (
                  <a
                    href={filePreview.url}
                    download={filePreview.name}
                    className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    <Download size={12} />
                    Download Original
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


