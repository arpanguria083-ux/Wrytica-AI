import React, { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { TermsGate } from './components/TermsGate';

const Paraphraser      = lazy(() => import('./pages/Paraphraser').then(m => ({ default: m.Paraphraser })));
const GrammarChecker   = lazy(() => import('./pages/GrammarChecker').then(m => ({ default: m.GrammarChecker })));
const Summarizer       = lazy(() => import('./pages/Summarizer').then(m => ({ default: m.Summarizer })));
const CitationGenerator = lazy(() => import('./pages/CitationGenerator').then(m => ({ default: m.CitationGenerator })));
const ChatAssistant    = lazy(() => import('./pages/ChatAssistant').then(m => ({ default: m.ChatAssistant })));
const Settings         = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const KnowledgeBase    = lazy(() => import('./pages/KnowledgeBase').then(m => ({ default: m.KnowledgeBase })));
const AgentPlanner     = lazy(() => import('./pages/AgentPlanner').then(m => ({ default: m.AgentPlanner })));
const OCRTool          = lazy(() => import('./pages/OCRTool').then(m => ({ default: m.OCRTool })));
const DocumentViewer   = lazy(() => import('./pages/DocumentViewer').then(m => ({ default: m.DocumentViewer })));
const HistoryDashboard = lazy(() => import('./pages/HistoryDashboard').then(m => ({ default: m.HistoryDashboard })));
const Developer        = lazy(() => import('./pages/Developer').then(m => ({ default: m.Developer })));

const PageFallback = () => (
  <div className="flex items-center justify-center h-full w-full min-h-[300px]">
    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

const App: React.FC = () => {
  return (
    <HashRouter>
      <TermsGate>
        <Layout>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Paraphraser />} />
              <Route path="/grammar" element={<GrammarChecker />} />
              <Route path="/summarizer" element={<Summarizer />} />
              <Route path="/citation" element={<CitationGenerator />} />
              <Route path="/knowledge" element={<KnowledgeBase />} />
              <Route path="/ocr" element={<OCRTool />} />
              <Route path="/documents" element={<DocumentViewer />} />
              <Route path="/agent" element={<AgentPlanner />} />
              <Route path="/history" element={<HistoryDashboard />} />
              <Route path="/chat" element={<ChatAssistant />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/developer" element={<Developer />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Layout>
      </TermsGate>
    </HashRouter>
  );
};

export default App;
