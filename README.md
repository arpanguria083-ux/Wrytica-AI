<div align="center">
<img width="1200" height="475" alt="Wrytica AI - Advanced Writing Assistant" src="./assets/Sleek Wrytica AI Digital Logo Concept.png" />
</div>

# Wrytica AI - Advanced Writing Assistant

An intelligent AI writing assistant featuring paraphrasing, grammar checking, summarization, citation generation, and chat capabilities.

**Features:**
- 🔄 Advanced paraphrasing with multiple modes
- ✅ Grammar checking with error forecasting  
- 📝 Text summarization in various formats
- 📚 Academic citation generation
- 💬 AI chat assistant
- 🌐 Multi-language support
- 🔒 Privacy-focused (your API keys stay local)

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up API keys (optional):
   - For Gemini: Get your free API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
   - Enter your API key in the Settings page after starting the app
   - For local LLMs: Ensure Ollama/LM Studio is running (no API key needed)

3. Run the app:
   ```bash
   npm run dev
   ```

## Local LLM Setup

### Ollama
```bash
# Install Ollama, then:
ollama pull llama3
OLLAMA_ORIGINS='*' ollama serve
```

### LM Studio
1. Download and install LM Studio
2. Load a model and start the local server
3. Default endpoint: http://localhost:1234

## Production Deployment

✅ **Security**: Users provide their own API keys through the UI. API keys are stored locally in the browser and never sent to external servers.