import React, { useState, useEffect, useRef } from 'react';
import { Shield, FileText, Lock, ChevronDown, CheckCircle, ExternalLink } from 'lucide-react';

const STORAGE_KEY = 'wrytica_terms_accepted_v1';
const APP_VERSION = '1.2.2';
const ACCEPTANCE_DATE_KEY = 'wrytica_terms_accepted_date';

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const TERMS_SECTIONS: Section[] = [
  {
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    content: (
      <p>
        By clicking "I Agree and Continue" below, you acknowledge that you have read, understood, and agree
        to be bound by these Terms of Service, our Privacy Policy, and all applicable laws and regulations.
        If you do not agree with any part of these terms, you must not use Wrytica AI.
        These terms apply to all users worldwide, including but not limited to residents of the
        European Union, United States, United Kingdom, Canada, Australia, and India.
      </p>
    ),
  },
  {
    id: 'license',
    title: '2. Software License',
    content: (
      <>
        <p>Wrytica AI is provided under the <strong>MIT License</strong>.</p>
        <p className="mt-2">
          Copyright © 2024–2025 Arpan Guria. Permission is hereby granted, free of charge, to any person
          obtaining a copy of this software to use, copy, modify, merge, publish, distribute, sublicense,
          and/or sell copies, subject to the following condition: the above copyright notice and this
          permission notice shall be included in all copies or substantial portions of the Software.
        </p>
        <p className="mt-2 font-semibold">
          THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
          BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
          NONINFRINGEMENT.
        </p>
      </>
    ),
  },
  {
    id: 'privacy',
    title: '3. Privacy Policy & Data Handling',
    content: (
      <>
        <p><strong>Data We Collect:</strong></p>
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li>We do <strong>not</strong> collect, transmit, or store any personal data on our servers.</li>
          <li>All documents, knowledge base data, chat history, and tool outputs are stored exclusively in <strong>your browser's IndexedDB and localStorage</strong>.</li>
          <li>API keys (Gemini, etc.) are stored only in your browser's localStorage and are never transmitted to any Wrytica server.</li>
        </ul>
        <p className="mt-3"><strong>Third-Party Services:</strong></p>
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li>If you use the <strong>Gemini API</strong>, your text is sent to Google's servers per Google's Privacy Policy and Terms of Service.</li>
          <li>If you use <strong>Ollama or LM Studio</strong>, all processing occurs locally on your hardware. No data leaves your machine.</li>
        </ul>
        <p className="mt-3"><strong>GDPR (EU/EEA Residents):</strong> As Wrytica AI collects no personal data itself, it acts as a data controller for no data. Your rights under GDPR (access, rectification, erasure, portability, objection) apply to any data you voluntarily share with third-party AI providers you configure.</p>
        <p className="mt-3"><strong>CCPA (California Residents):</strong> Wrytica AI does not sell, share, or disclose personal information. We do not collect personal information as defined under CCPA.</p>
        <p className="mt-3"><strong>PIPEDA (Canada), UK GDPR, PDPA (India):</strong> Consistent with our local-first architecture, Wrytica AI processes no personal data on its systems. All obligations under these laws are delegated to the third-party AI providers you configure.</p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: '4. Acceptable Use Policy',
    content: (
      <>
        <p>You agree NOT to use Wrytica AI to:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Generate, distribute, or facilitate illegal content of any kind</li>
          <li>Create content that harasses, defames, or harms individuals or groups</li>
          <li>Produce academic fraud, plagiarism, or deceptive content intended to mislead</li>
          <li>Violate any applicable local, national, or international law or regulation</li>
          <li>Infringe upon intellectual property rights of any third party</li>
          <li>Generate content that violates the terms of service of your configured AI provider</li>
          <li>Circumvent any content guardrails or safety mechanisms intentionally</li>
        </ul>
        <p className="mt-3">You are solely responsible for the content you input and output using this application.</p>
      </>
    ),
  },
  {
    id: 'disclaimer',
    title: '5. Disclaimer of Warranties',
    content: (
      <p>
        Wrytica AI is provided "as is" and "as available" without any warranties of any kind, either express
        or implied. We do not warrant that the software will be uninterrupted, error-free, or free of
        viruses or other harmful components. We make no warranty regarding the accuracy, reliability,
        completeness, or timeliness of any AI-generated content. <strong>AI outputs should always be reviewed
        by a qualified human before use in professional, legal, medical, or academic contexts.</strong>
      </p>
    ),
  },
  {
    id: 'liability',
    title: '6. Limitation of Liability',
    content: (
      <p>
        To the maximum extent permitted by applicable law, Arpan Guria and contributors to Wrytica AI
        shall not be liable for any indirect, incidental, special, consequential, punitive, or exemplary
        damages, including but not limited to loss of profits, loss of data, or loss of goodwill, arising
        out of or related to your use of or inability to use the software, even if advised of the
        possibility of such damages. In no event shall total liability exceed zero (₹0 / $0 / €0), as this
        software is provided free of charge.
      </p>
    ),
  },
  {
    id: 'intellectual-property',
    title: '7. Intellectual Property',
    content: (
      <>
        <p>
          The Wrytica AI name, logo, and branding are the intellectual property of Arpan Guria.
          The underlying source code is licensed under the MIT License as described in Section 2.
        </p>
        <p className="mt-2">
          <strong>Your Content:</strong> You retain all intellectual property rights to documents and text
          you process through Wrytica AI. We claim no rights over your inputs or outputs.
        </p>
        <p className="mt-2">
          <strong>AI-Generated Content:</strong> The copyright status of AI-generated content varies by
          jurisdiction. You are responsible for understanding and complying with applicable copyright law
          in your country regarding AI-generated works.
        </p>
      </>
    ),
  },
  {
    id: 'governing-law',
    title: '8. Governing Law & Dispute Resolution',
    content: (
      <>
        <p>
          These Terms shall be governed by and construed in accordance with the laws of India,
          without regard to its conflict of law provisions.
        </p>
        <p className="mt-2">
          EU/EEA users: Nothing in these Terms affects your statutory rights under EU consumer protection
          law, including your right to bring disputes before the competent courts in your country of residence.
        </p>
        <p className="mt-2">
          US users: These Terms do not waive any rights you may have under applicable US federal or
          state consumer protection laws.
        </p>
        <p className="mt-2">
          Any disputes arising from these Terms shall first be attempted to be resolved through good-faith
          negotiation. Contact: <a href="https://www.arpan-guria.in/" target="_blank" rel="noopener noreferrer" className="text-primary-600 dark:text-primary-400 underline">www.arpan-guria.in</a>
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: '9. Changes to Terms',
    content: (
      <p>
        We reserve the right to update these Terms at any time. When we do, we will increment the
        version number, and you will be asked to re-accept the new terms on next launch.
        Continued use of Wrytica AI after changes constitutes acceptance of the new terms.
        Material changes will be clearly highlighted. Current version: <strong>{APP_VERSION}</strong>.
      </p>
    ),
  },
  {
    id: 'contact',
    title: '10. Contact',
    content: (
      <p>
        For questions about these Terms, the Privacy Policy, or the software, contact the developer at:{' '}
        <a
          href="https://www.arpan-guria.in/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 dark:text-primary-400 underline inline-flex items-center gap-1"
        >
          www.arpan-guria.in <ExternalLink size={12} />
        </a>
      </p>
    ),
  },
];

const TermsSection: React.FC<{ section: Section }> = ({ section }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <span>{section.title}</span>
        <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-2 border-t border-slate-100 dark:border-slate-700 pt-3">
          {section.content}
        </div>
      )}
    </div>
  );
};

interface TermsGateProps {
  children: React.ReactNode;
}

export const TermsGate: React.FC<TermsGateProps> = ({ children }) => {
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [checked, setChecked] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setAccepted(stored === 'true');
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 60;
    if (atBottom) setScrolledToBottom(true);
  };

  const handleAccept = () => {
    if (!checked) return;
    localStorage.setItem(STORAGE_KEY, 'true');
    localStorage.setItem(ACCEPTANCE_DATE_KEY, new Date().toISOString());
    setAccepted(true);
  };

  // Not yet determined (hydrating from localStorage)
  if (accepted === null) return null;

  // Already accepted — render the app
  if (accepted) return <>{children}</>;

  // Show Terms Gate
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="px-8 pt-8 pb-5 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center shadow-md">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">Wrytica AI</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Version {APP_VERSION} · Privacy-First Writing Assistant</p>
            </div>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Terms of Service &amp; Privacy Policy</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Please read and accept the following before using Wrytica AI.
            This agreement is governed by applicable law in your jurisdiction.
          </p>

          {/* Trust badges */}
          <div className="flex flex-wrap gap-2 mt-4">
            {[
              { icon: Lock, text: 'No data collected' },
              { icon: FileText, text: 'MIT Licensed' },
              { icon: Shield, text: 'GDPR & CCPA aligned' },
            ].map(({ icon: Icon, text }) => (
              <span key={text} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-medium">
                <Icon size={11} />
                {text}
              </span>
            ))}
          </div>
        </div>

        {/* Scrollable Terms Content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-8 py-5 space-y-2"
        >
          {/* Key summary */}
          <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/50 rounded-xl p-4 mb-4">
            <p className="text-sm font-semibold text-primary-800 dark:text-primary-200 mb-2">Summary (not a substitute for reading the full terms):</p>
            <ul className="space-y-1.5">
              {[
                'Wrytica AI is free, open-source software (MIT License)',
                'All your data stays on your machine — we collect nothing',
                'API keys are stored only in your browser, never on any server',
                'AI-generated content must be reviewed before professional use',
                'You are responsible for what you generate and how you use it',
                'Provided "as is" — no warranty of any kind',
              ].map(item => (
                <li key={item} className="flex items-start gap-2 text-sm text-primary-800 dark:text-primary-300">
                  <CheckCircle size={14} className="text-primary-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* All sections (collapsible) */}
          <div className="space-y-2">
            {TERMS_SECTIONS.map(section => (
              <TermsSection key={section.id} section={section} />
            ))}
          </div>

          {/* Copyright notice */}
          <div className="pt-4 pb-2 text-center text-xs text-slate-400 dark:text-slate-500">
            © 2024–2025 Arpan Guria · All rights reserved ·{' '}
            <a href="https://www.arpan-guria.in/" target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline">
              www.arpan-guria.in
            </a>
          </div>
        </div>

        {/* Footer / Acceptance */}
        <div className="px-8 py-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          {!scrolledToBottom && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-1.5">
              <ChevronDown size={13} className="animate-bounce" />
              Scroll through the terms above to enable acceptance
            </p>
          )}

          <label className="flex items-start gap-3 cursor-pointer group mb-4">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                checked={checked}
                onChange={e => setChecked(e.target.checked)}
                disabled={!scrolledToBottom}
                className="sr-only"
              />
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-150 ${
                  !scrolledToBottom
                    ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 cursor-not-allowed'
                    : checked
                    ? 'border-primary-500 bg-primary-500'
                    : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 group-hover:border-primary-400'
                }`}
              >
                {checked && <CheckCircle size={14} className="text-white" strokeWidth={3} />}
              </div>
            </div>
            <span className={`text-sm leading-relaxed ${!scrolledToBottom ? 'text-slate-400 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300'}`}>
              I have read and agree to the Terms of Service and Privacy Policy. I understand that
              AI-generated content should be reviewed before professional use, and I accept sole
              responsibility for my use of this software and its outputs.
            </span>
          </label>

          <button
            onClick={handleAccept}
            disabled={!checked || !scrolledToBottom}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2
              disabled:opacity-40 disabled:cursor-not-allowed
              enabled:bg-primary-600 enabled:text-white enabled:hover:bg-primary-700 enabled:shadow-md enabled:hover:shadow-lg enabled:active:scale-[0.98]"
          >
            <Shield size={16} />
            I Agree and Continue to Wrytica AI
          </button>

          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-3">
            Your acceptance is stored locally in your browser. Governed by applicable law.
            Acceptance logged: {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.
          </p>
        </div>

      </div>
    </div>
  );
};
