import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Paraphraser } from './pages/Paraphraser';
import { GrammarChecker } from './pages/GrammarChecker';
import { Summarizer } from './pages/Summarizer';
import { CitationGenerator } from './pages/CitationGenerator';
import { ChatAssistant } from './pages/ChatAssistant';
import { Settings } from './pages/Settings';

const App: React.FC = () => {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Paraphraser />} />
          <Route path="/grammar" element={<GrammarChecker />} />
          <Route path="/summarizer" element={<Summarizer />} />
          <Route path="/citation" element={<CitationGenerator />} />
          <Route path="/chat" element={<ChatAssistant />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
};

export default App;