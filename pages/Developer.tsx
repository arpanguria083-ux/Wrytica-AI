import React, { useState } from 'react';
import {
  Code2, Globe, Github, Mail, ExternalLink, Shield, Cpu, Database,
  BookOpen, Zap, Package, FileText, Heart, Star, GitBranch, Lock,
  CheckCircle, Info, ChevronDown, ChevronUp
} from 'lucide-react';

const APP_VERSION = '1.2.2';
const BUILD_YEAR = '2024–2025';

const TECH_STACK = [
  { category: 'Frontend', items: ['React 19', 'TypeScript', 'Vite 6', 'Tailwind CSS', 'React Router 7'] },
  { category: 'AI / LLM', items: ['Google Gemini API', 'Ollama (local)', 'LM Studio', '@google/genai 1.30'] },
  { category: 'Document Processing', items: ['pdfjs-dist', 'Tesseract.js (OCR)', 'react-quill-new'] },
  { category: 'Backend (Python)', items: ['FastAPI', 'Uvicorn', 'pypdfium2 (Chandra)', 'pdfplumber', 'MinerU (optional)', 'psutil'] },
  { category: 'Storage', items: ['IndexedDB (idb)', 'localStorage', 'Backend hybrid mode'] },
];

const LICENSE_TEXT = `MIT License

Copyright (c) ${BUILD_YEAR} Arpan Guria

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const CHANGELOG = [
  { version: '1.2.2', date: 'April 2025', notes: ['Production readiness pass — all TypeScript errors resolved', 'Health endpoint now correctly reports pdfplumber & Chandra availability', 'requirements.txt updated with psutil and pypdfium2', 'Setup script installs all OCR deps automatically'] },
  { version: '1.2.1', date: 'March 2025', notes: ['Chandra engine natively implemented with pypdfium2', 'MinerU availability cached at startup — no log spam', 'Stage status mapping fixed (completed → done) in OCR tool', 'Backend URL prefix fix for stabilityManager'] },
  { version: '1.2.0', date: 'February 2025', notes: ['Stability manager and browser health monitoring', 'Job queue with real-time progress polling', 'Resource monitor with hardware profiling', 'Three OCR engines with auto-fallback chain'] },
  { version: '1.1.0', date: 'January 2025', notes: ['Knowledge Base PageIndex with structural reasoning', 'Folder import with bulk ingestion pipeline', 'Hybrid storage mode (IndexedDB + disk cache)', 'Agent Planner multi-step memo workflow'] },
  { version: '1.0.0', date: 'December 2024', notes: ['Initial release', 'Paraphraser, Grammar Checker, Summarizer, Citation Generator', 'Chat with Knowledge Base grounding', 'Multi-provider AI support (Gemini / Ollama / LM Studio)'] },
];

const AccordionItem: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span>{title}</span>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {open && <div className="px-5 pb-5 pt-0">{children}</div>}
    </div>
  );
};

export const Developer: React.FC = () => {
  const [licenseOpen, setLicenseOpen] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-16">

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary-600 dark:text-primary-400">About</span>
        </div>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Developer &amp; Licensing</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
          Version {APP_VERSION} · Open source under the MIT License · © {BUILD_YEAR} Arpan Guria
        </p>
      </div>

      {/* Developer Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-surface overflow-hidden shadow-sm">
        <div className="h-2 bg-gradient-to-r from-primary-500 via-emerald-400 to-teal-400" />
        <div className="p-8 flex flex-col sm:flex-row gap-6 items-start">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-teal-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg shrink-0">
            AG
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Arpan Guria</h3>
              <p className="text-sm text-primary-600 dark:text-primary-400 font-medium">Full-Stack Developer · AI Tools &amp; Document Intelligence</p>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Building privacy-first AI tooling that runs entirely on the user's machine.
              Wrytica AI is designed for writers, researchers, and knowledge workers who want
              powerful AI assistance without sending their data to the cloud.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <a
                href="https://www.arpan-guria.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors shadow-sm"
              >
                <Globe size={15} />
                Portfolio
                <ExternalLink size={12} className="opacity-70" />
              </a>
              <a
                href="https://github.com/arpang12"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Github size={15} />
                GitHub
                <ExternalLink size={12} className="opacity-50" />
              </a>
              <a
                href="https://www.arpan-guria.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Mail size={15} />
                Contact
                <ExternalLink size={12} className="opacity-50" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* App Info Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Package, label: 'Version', value: APP_VERSION },
          { icon: Code2, label: 'License', value: 'MIT' },
          { icon: Zap, label: 'Build', value: 'Vite 6 + React 19' },
          { icon: Lock, label: 'Privacy', value: 'Local First' },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-dark-surface p-4 text-center">
            <Icon size={20} className="mx-auto mb-2 text-primary-500" />
            <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</div>
            <div className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      {/* Accordions */}
      <div className="space-y-3">

        {/* Tech Stack */}
        <AccordionItem title="Tech Stack" defaultOpen={true}>
          <div className="grid sm:grid-cols-2 gap-4 pt-2">
            {TECH_STACK.map(({ category, items }) => (
              <div key={category} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400 flex items-center gap-1.5">
                  <Cpu size={12} />
                  {category}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map(item => (
                    <span key={item} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </AccordionItem>

        {/* Changelog */}
        <AccordionItem title="Changelog">
          <div className="space-y-5 pt-2">
            {CHANGELOG.map(({ version, date, notes }, idx) => (
              <div key={version} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${idx === 0 ? 'bg-primary-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                  {idx < CHANGELOG.length - 1 && <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700 mt-1" />}
                </div>
                <div className="pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-bold ${idx === 0 ? 'text-primary-600 dark:text-primary-400' : 'text-slate-700 dark:text-slate-300'}`}>v{version}</span>
                    <span className="text-xs text-slate-400">{date}</span>
                    {idx === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-semibold uppercase tracking-wide">Latest</span>}
                  </div>
                  <ul className="space-y-0.5">
                    {notes.map(note => (
                      <li key={note} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <CheckCircle size={13} className="text-primary-400 mt-0.5 shrink-0" />
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </AccordionItem>

        {/* Privacy */}
        <AccordionItem title="Privacy &amp; Data Handling">
          <div className="pt-2 space-y-4 text-sm text-slate-600 dark:text-slate-300">
            {[
              { icon: Lock, title: 'API Keys', text: 'Your API keys (Gemini, etc.) are stored exclusively in your browser\'s localStorage. They are never transmitted to any Wrytica server because no Wrytica server exists.' },
              { icon: Database, title: 'Documents &amp; Knowledge Base', text: 'All documents, knowledge base entries, chat history, and tool outputs are stored in your browser\'s IndexedDB. Nothing is uploaded to any cloud service unless you explicitly connect a third-party LLM API.' },
              { icon: Cpu, title: 'Local AI Processing', text: 'When using Ollama or LM Studio, all AI inference runs on your own hardware. When using the Gemini API, text is sent to Google\'s servers per Google\'s Privacy Policy — the same policy that governs Google AI Studio.' },
              { icon: Shield, title: 'No Analytics or Tracking', text: 'Wrytica does not include any analytics, crash reporting, telemetry, or tracking code. There are no third-party SDKs that phone home.' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mb-0.5" dangerouslySetInnerHTML={{ __html: title }} />
                  <p dangerouslySetInnerHTML={{ __html: text }} />
                </div>
              </div>
            ))}
          </div>
        </AccordionItem>

        {/* Third-Party Licenses */}
        <AccordionItem title="Third-Party Licenses">
          <div className="pt-2 space-y-2">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Wrytica AI builds on the following open-source packages, each governed by their respective licenses:
            </p>
            {[
              { name: 'React', license: 'MIT', org: 'Meta Platforms' },
              { name: 'Vite', license: 'MIT', org: 'Evan You & contributors' },
              { name: 'TypeScript', license: 'Apache 2.0', org: 'Microsoft' },
              { name: 'Tailwind CSS', license: 'MIT', org: 'Tailwind Labs' },
              { name: 'pdfjs-dist', license: 'Apache 2.0', org: 'Mozilla' },
              { name: 'Tesseract.js', license: 'Apache 2.0', org: 'naptha' },
              { name: 'pypdfium2', license: 'Apache 2.0 / BSD', org: 'pypdfium2-team' },
              { name: 'pdfplumber', license: 'MIT', org: 'Jeremy Singer-Vine' },
              { name: 'FastAPI', license: 'MIT', org: 'Sebastián Ramírez' },
              { name: 'lucide-react', license: 'ISC', org: 'Lucide contributors' },
              { name: '@google/genai', license: 'Apache 2.0', org: 'Google' },
              { name: 'react-router-dom', license: 'MIT', org: 'Remix Software' },
              { name: 'idb', license: 'ISC', org: 'Jake Archibald' },
            ].map(({ name, license, org }) => (
              <div key={name} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{name}</span>
                  <span className="text-xs text-slate-400 ml-2">{org}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">{license}</span>
              </div>
            ))}
          </div>
        </AccordionItem>

        {/* MIT License */}
        <AccordionItem title="MIT License (Full Text)">
          <pre className="mt-2 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap leading-relaxed font-mono border border-slate-200 dark:border-slate-700">
            {LICENSE_TEXT}
          </pre>
        </AccordionItem>

      </div>

      {/* Footer Note */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/50 text-sm text-primary-800 dark:text-primary-300">
        <Heart size={16} className="text-primary-500 mt-0.5 shrink-0" />
        <p>
          Wrytica AI is built with care for privacy, reliability, and writer productivity.
          If you find it useful, share it with your team or{' '}
          <a
            href="https://www.arpan-guria.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 font-medium hover:text-primary-600 dark:hover:text-primary-200"
          >
            reach out to the developer
          </a>
          .
        </p>
      </div>

    </div>
  );
};
