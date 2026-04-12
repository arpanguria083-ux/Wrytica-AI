# Wrytica AI — Product Demo Script

> **Purpose:** Step-by-step narration guide for recording a product walkthrough video.
> Each section includes what to show on screen, what to say, and which actions to perform.

---

## Before You Hit Record

**Pre-flight checklist:**
- [ ] Backend running: `npm.cmd run backend:start` → confirm `http://localhost:8000/health` responds
- [ ] Frontend running: `npm.cmd run dev` → open `http://localhost:5180`
- [ ] Gemini API key entered in Settings (or Ollama running locally)
- [ ] Have a sample PDF ready (5–20 pages works great)
- [ ] Have a short paragraph of text ready to paste (3–5 sentences)
- [ ] Browser zoom at 100%, clean tab, dark mode optional
- [ ] Hide any personal API keys before sharing screen

---

## Scene 1 — Introduction (0:00–0:30)

**Screen:** App home / main navigation sidebar

**Say:**
> "This is Wrytica AI — a privacy-first writing assistant that runs entirely on your machine.
> Your documents and API keys never leave your computer.
> Today I'll walk you through every tool, from writing assistance to deep PDF extraction."

**Show:**
- Scroll through the left sidebar to reveal all tools:
  Paraphraser · Grammar Checker · Summarizer · Citation Generator · Chat · OCR · Knowledge Base · History · Settings

---

## Scene 2 — Paraphraser (0:30–2:00)

**Screen:** Navigate to **Paraphraser**

**Say:**
> "The Paraphraser gives you ten distinct writing modes — each one changes the output in a different way."

**Actions to perform:**
1. Paste sample text into the input box
2. Click through several modes and show the label change:
   - **Standard** — general rewrite
   - **Formal** — professional, elevated tone
   - **Simple** — plain language, easy reading
   - **Humanize** — removes AI-sounding patterns
   - **Creative** — imaginative rewording
   - **Academic** — scholarly phrasing
   - **Shorten** / **Expand** — length control
3. Adjust the **Synonyms** slider (left = conservative, right = adventurous)
4. Toggle one **Extras** button (e.g., Fluency or Sentence Restructure) and show the tooltip
5. Set **Variants** to 3 — click **Paraphrase** — show three candidate cards side by side
6. Click **Copy** on the best candidate

**Talking points:**
- Each mode has a different internal temperature and prompt strategy
- Variants mode lets the user compare results before committing
- The Extras toggles stack on top of the chosen mode

---

## Scene 3 — Grammar Checker (2:00–3:00)

**Screen:** Navigate to **Grammar Checker**

**Say:**
> "The Grammar Checker finds errors across five categories and gives you one-click corrections."

**Actions to perform:**
1. Paste the same sample text (with a few deliberate typos or style issues)
2. Click **Check Grammar**
3. Show the error list — each card shows: original word, suggested fix, reason, and error type badge
4. Click **Apply** on one suggestion — watch the inline correction animate
5. Click **Apply All** to accept everything at once
6. Show the rewritten text in the output panel

**Talking points:**
- Works with Gemini, Ollama, or LM Studio — no vendor lock-in
- Local fallback catches double spaces and capitalization errors even without an AI connection

---

## Scene 4 — Summarizer (3:00–4:00)

**Screen:** Navigate to **Summarizer**

**Say:**
> "The Summarizer condenses any document into a short, medium, or long summary — in paragraph or bullet format."

**Actions to perform:**
1. Paste a longer block of text (or upload a document)
2. Choose **Short** length and **Bullet Points** format
3. Click **Summarize** — show the result
4. Switch to **Long** + **Paragraph** and summarize again — contrast the outputs

**Talking points:**
- Great for quickly digesting meeting notes, research papers, or legal documents
- Language selector lets you summarize in any language

---

## Scene 5 — Citation Generator (4:00–5:00)

**Screen:** Navigate to **Citation Generator**

**Say:**
> "Need a properly formatted citation? Drop in a URL, DOI, book title, or manual details and get it in APA, MLA, Chicago, or Harvard."

**Actions to perform:**
1. Type a book title or article name in the input field
2. Select **APA** style from the dropdown
3. Click **Generate Citation** — show the formatted output
4. Switch to **MLA** and regenerate — show the format change
5. Click **Copy** on the citation

**Talking points:**
- Supports four major citation styles
- Auto-fills author, year, publisher details from the AI
- Useful for students, researchers, and content teams

---

## Scene 6 — Chat Assistant (5:00–6:30)

**Screen:** Navigate to **Chat Assistant**

**Say:**
> "The Chat Assistant is a full context-aware conversational AI — with one key difference:
> it can pull directly from your Knowledge Base."

**Actions to perform:**
1. Type a general question and show the response
2. Show the **Knowledge Base toggle** (or context panel) — explain that when enabled, answers are grounded in uploaded documents
3. Start a **new session** (show the session sidebar)
4. Ask a follow-up question in the same session — demonstrate memory across the conversation
5. Show the session history panel — previous sessions are preserved

**Talking points:**
- Sessions are stored locally — private and persistent
- Toggle Knowledge Base context on/off per session
- Works with Gemini, Ollama (Llama, Mistral, Phi), and LM Studio

---

## Scene 7 — OCR & Document Extraction (6:30–9:00)

**Screen:** Navigate to **OCR & Document Extraction**

**Say:**
> "This is where Wrytica really stands out. Most writing tools stop at plain text.
> We handle scanned PDFs, images, and complex layouts with three extraction engines."

### 7a — Engine Selection

**Show** the three engine buttons at the top:

| Engine | Button | Best for |
|--------|--------|----------|
| Fast | pdfplumber | Clean digital PDFs, speed priority |
| Balanced | Chandra | Scanned docs, layout-aware |
| Advanced | MinerU | Tables, formulas, research papers |

### 7b — Run a Job

**Actions to perform:**
1. Click **Fast (pdfplumber)** engine
2. Drag and drop (or browse) a sample PDF
3. Click **Start OCR**
4. Watch the progress bar animate in real-time — show the percentage and estimated time
5. When done, the card shows a green checkmark and **Done** status
6. Scroll down to see the extracted text (or markdown for Chandra/MinerU)

### 7c — Save to Knowledge Base

**Actions to perform:**
1. Click **Save to Knowledge Base** on the completed result card
2. Navigate to Knowledge Base — show the document appeared instantly

**Talking points:**
- All processing happens locally — files never leave the machine
- The backend runs as a lightweight Python service on port 8000
- MinerU engine handles complex layouts like academic papers and financial reports
- If MinerU is unavailable, the app automatically falls back to Chandra

---

## Scene 8 — Knowledge Base (9:00–11:00)

**Screen:** Navigate to **Knowledge Base**

**Say:**
> "The Knowledge Base is the memory layer for Wrytica.
> Every document you import becomes searchable context for the AI tools."

### 8a — Import a Document

**Actions to perform:**
1. Click **Upload Document** — select the same PDF used in Scene 7
2. Show the document card appear with title, tags, and chunk count
3. Click the document to expand it — show the text chunks and page index

### 8b — Folder Import

**Actions to perform:**
1. Click **Import Local Folder**
2. Select a folder with a few text or PDF files
3. Watch the batch ingestion progress bar
4. Show the multiple documents added at once

### 8c — Search

**Actions to perform:**
1. Type a keyword in the search bar
2. Show the ranked results highlighted with relevance scores
3. Click a result to jump to the source chunk

### 8d — PageIndex (if time permits)

**Say:**
> "For large documents, the PageIndex feature lets the AI reason about structure —
> understanding chapters, sections, and hierarchies rather than just raw text."

**Talking points:**
- Knowledge Base uses local vector search — no cloud required
- Supports TXT, PDF, DOCX, XLSX, PPTX
- Ingested documents are available immediately to Chat, Summarizer, and Paraphraser

---

## Scene 9 — Agent Planner (11:00–12:30)

**Screen:** Navigate to **Agent Planner**

**Say:**
> "The Agent Planner is a multi-step AI workflow that turns a topic and goal
> into a structured memo — automatically."

**Actions to perform:**
1. Enter a **Topic** (e.g., "Remote Work Policy")
2. Enter a **Goal** (e.g., "Draft a policy memo for a 50-person company")
3. Add optional **Notes** (bullet points, key requirements)
4. Click **Generate Plan** — watch the AI build a step-by-step plan
5. Click **Generate Memo** — show the full structured document appear
6. Show the export or copy option

**Talking points:**
- Uses the Knowledge Base for grounded, company-specific output
- Each step (plan → draft → grammar review → summary) runs sequentially
- Great for HR, legal, and strategy teams

---

## Scene 10 — History Dashboard (12:30–13:15)

**Screen:** Navigate to **History**

**Say:**
> "Every action you take is logged in the History Dashboard —
> so you can always come back to previous work."

**Actions to perform:**
1. Show the list of recent tool uses (Paraphrase, Grammar, OCR, etc.)
2. Click a history item — show the original input and output
3. Show the filter/search bar to find specific items

**Talking points:**
- History is stored locally in the browser's IndexedDB
- Never gets sent to any server
- Useful for audit trails and revisiting past documents

---

## Scene 11 — Settings & Configuration (13:15–14:30)

**Screen:** Navigate to **Settings**

**Say:**
> "Settings gives you full control over the AI provider, model, and backend configuration."

**Actions to perform:**
1. Show the **Provider** selector: Gemini · Ollama · LM Studio
2. Show the **API Key** field for Gemini (blur/hide the value)
3. Show the **Model Name** field — mention users can swap models freely
4. Scroll to **Backend Status** card:
   - Green: Backend connected
   - Show `ocr_fast`, `ocr_balanced`, `deep_extract` feature flags
5. Show the **Guardrails** section — explain content policy controls
6. Show **Language** setting — all tools respect this

**Talking points:**
- API keys are stored only in localStorage — never transmitted
- Backend connection is checked every 15 seconds with auto-recovery
- Switching providers keeps the current session — no page reload needed

---

## Scene 12 — Closing (14:30–15:00)

**Screen:** Return to main writing tool or landing view

**Say:**
> "That's Wrytica — ten writing tools, local OCR with three engines,
> a searchable Knowledge Base, and multi-provider AI support.
> Everything runs locally. Nothing gets sent to the cloud unless you explicitly connect an API.
>
> Setup is one command: `setup.ps1` on Windows.
> Backend starts with: `npm run backend:start`.
> Then open the browser and you're ready."

**Final shot:** Hold on the app for 3–5 seconds, then fade out.

---

## Quick Reference Card

| Tool | Key Feature | Shortcut to Impress |
|------|-------------|---------------------|
| Paraphraser | 10 modes + variants | Show 3 variants side by side |
| Grammar Checker | Error categories + apply all | Apply All in one click |
| Summarizer | Length + format combos | Short bullets vs long paragraph |
| Citation Generator | 4 styles | Switch APA → MLA live |
| Chat | KB-grounded sessions | Ask question about uploaded PDF |
| OCR | 3 engines + progress | Show real-time progress bar |
| Knowledge Base | Folder import + search | Batch import 5 files at once |
| Agent Planner | Multi-step memo workflow | Full memo from a single topic |
| History | Local audit log | Find a past paraphrase result |
| Settings | Provider switch | Swap Gemini to Ollama live |

---

## Troubleshooting During Recording

| Issue | Quick Fix |
|-------|-----------|
| Backend shows "Not connected" | Run `npm.cmd run backend:start` in a terminal |
| AI response is slow | Switch to `gemini-2.0-flash` in Settings |
| OCR stuck at 0% | Check backend terminal for errors |
| Knowledge Base empty | Upload a document via the Upload button first |
| Grammar check fails | Verify API key in Settings → Test Connection |
