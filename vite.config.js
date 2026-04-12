import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    port: 5180,
    host: '0.0.0.0',
    hmr: {
      overlay: true,
    },
    // Pre-transform the most-hit files before the browser asks for them.
    // This eliminates the cold-compile stall on first page load.
    warmup: {
      clientFiles: [
        // Shell (always needed immediately)
        './index.tsx',
        './App.tsx',
        './utils.ts',
        './contexts/AppContext.tsx',
        './components/Layout.tsx',
        './components/Sidebar.tsx',
        './components/TermsGate.tsx',
        './components/RichEditor.tsx',
        // All pages (lazy-loaded, but pre-warm so first navigation is instant)
        './pages/Paraphraser.tsx',
        './pages/GrammarChecker.tsx',
        './pages/Summarizer.tsx',
        './pages/CitationGenerator.tsx',
        './pages/ChatAssistant.tsx',
        './pages/Settings.tsx',
        './pages/KnowledgeBase.tsx',
        './pages/AgentPlanner.tsx',
        './pages/OCRTool.tsx',
        './pages/DocumentViewer.tsx',
        './pages/HistoryDashboard.tsx',
        './pages/Developer.tsx',
        // All services
        './services/aiService.ts',
        './services/geminiService.ts',
        './services/localLlmService.ts',
        './services/storageService.ts',
        './services/knowledgeBaseService.ts',
        './services/vectorStoreService.ts',
        './services/workspaceService.ts',
        './services/citationService.ts',
        './services/visionService.ts',
        './services/ocrService.ts',
        './services/pageIndexService.ts',
        './services/agentPlanner.ts',
        './services/fallbackService.ts',
        './services/backendApi.ts',
        './services/stabilityManager.ts',
        './utils/modelCapabilities.ts',
        './utils/ingestionConfig.ts',
      ],
    },
  },
  esbuild: {
    logLevel: 'warning',
    // Target modern browsers in dev — skips unnecessary downleveling transforms.
    target: 'esnext',
  },
  plugins: [react()],
  // Pre-bundle ALL heavy dependencies at server startup so the browser never
  // triggers an on-demand re-bundle (which reloads the page mid-load).
  optimizeDeps: {
    include: [
      // PDF extraction (v4 ESM — needs explicit path)
      'pdfjs-dist/build/pdf.mjs',
      // TipTap + ProseMirror (29 sub-packages; without this every import
      // creates individual HTTP requests and triggers a re-bundle stall)
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/extension-link',
      '@tiptap/extension-underline',
      '@tiptap/extension-placeholder',
      // Google Gemini SDK
      '@google/genai',
      // IndexedDB wrapper
      'idb',
      // Icons (large; barrel-imported everywhere)
      'lucide-react',
      // Markdown rendering
      'react-markdown',
      'remark-gfm',
      // Virtualised list
      'react-window',
      // Core framework (explicit avoids re-discovery on cold start)
      'react',
      'react-dom',
      'react-router-dom',
    ],
    // tesseract.js loads WebAssembly on demand — exclude it from pre-bundling
    // so esbuild doesn't try to inline the binary.
    exclude: ['tesseract.js'],
  },
  // No longer using environment variables for API keys
  // Users provide their own API keys through the UI
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@': rootDir,
    },
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: {
          // PDF (lazy — only loaded when a PDF is opened)
          pdfjs: ['pdfjs-dist/build/pdf.mjs'],
          // Tesseract OCR (lazy — large WASM binary)
          tesseract: ['tesseract.js'],
          // Core React + router
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Google Gemini SDK
          'vendor-gemini': ['@google/genai'],
          // TipTap rich-text editor (ProseMirror-based)
          'vendor-tiptap': [
            '@tiptap/react',
            '@tiptap/starter-kit',
            '@tiptap/extension-link',
            '@tiptap/extension-underline',
            '@tiptap/extension-placeholder',
          ],
        },
      },
    },
  },
});
