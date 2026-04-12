import { GeminiService } from './geminiService';
import { LLMConfig } from '../utils';

const buildVisionPrompt = (language: string, fileName: string) => {
  return `You are a meticulous OCR assistant. A scanned document named "${fileName}" is provided as an image. Describe any and all readable text in ${language} only, no extra commentary.`;
};

const checkVisionCapability = async (config: LLMConfig): Promise<boolean> => {
  try {
    if (config.provider === 'ollama') {
      // Check if Ollama model supports vision
      const response = await fetch(`${config.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: config.modelName })
      });
      if (response.ok) {
        const modelInfo = await response.json();
        return modelInfo.details?.support_vision === true || (modelInfo as any).projector_info !== undefined;
      }
    } else {
      // For LM Studio, check if model has vision in name or try a test call
      return config.modelName.toLowerCase().includes('vision') || 
             config.modelName.toLowerCase().includes('llava') ||
             config.modelName.toLowerCase().includes('multimodal');
    }
  } catch (error) {
    console.warn('Could not verify vision capability:', error);
  }
  return false; // Assume no vision if we can't verify
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const [, base64] = reader.result.split(',', 2);
        resolve(base64);
      } else {
        reject(new Error('Unable to read file as data URL'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
};

const resizeImageIfNeeded = async (file: File): Promise<string> => {
  if (file.size > 5 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const maxSize = Math.sqrt(1920 * 1080);
        let { width, height } = img;

        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width *= ratio;
          height *= ratio;
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);

        const resizedBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        canvas.width = 0;
        canvas.height = 0;
        URL.revokeObjectURL(objectUrl);
        resolve(resizedBase64);
      };

      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      };

      img.src = objectUrl;
    });
  }

  return fileToBase64(file);
};

const tryLocalVisionEndpoint = async (config: LLMConfig, dataUrl: string, prompt: string): Promise<string> => {
  if (!config.baseUrl) {
    throw new Error('Local LLM base URL is required for vision OCR.');
  }
  const base = config.baseUrl.replace(/\/$/, '');
  const endpoints = ['/v1/vision', '/vision', '/api/vision'];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${base}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.modelName,
          instruction: prompt,
          image: dataUrl
        })
      });
      if (!response.ok) continue;
      const data = await response.json();
      if (typeof data.text === 'string' && data.text.trim()) return data.text.trim();
      if (typeof data.result === 'string' && data.result.trim()) return data.result.trim();
      if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
        return data.choices[0].message.content.trim();
      }
    } catch (error) {
      console.warn('Vision endpoint failed', endpoint, error);
    }
  }
  throw new Error('Vision extraction endpoints did not return text.');
};

const tryOllamaVision = async (config: LLMConfig, base64: string, prompt: string): Promise<string> => {
  const response = await fetch(`${config.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.modelName,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: prompt }
      ],
      images: [base64],
      stream: false
    })
  });
  if (!response.ok) throw new Error(`Ollama vision returned ${response.status}`);
  const data = await response.json();
  return data.message?.content?.trim() || '';
};

const tryOpenAiCompatVision = async (config: LLMConfig, dataUrl: string, prompt: string): Promise<string> => {
  const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.modelName,
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      max_tokens: 1024,
      temperature: 0.1,
      stream: false
    })
  });
  if (!response.ok) throw new Error(`Vision chat returned ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
};

export const VisionService = {
  async extractText(file: File, config: LLMConfig, language: string): Promise<string> {
    // Check if the model supports vision before attempting
    const hasVision = await checkVisionCapability(config);
    if (!hasVision && config.provider !== 'gemini') {
      throw new Error(`Model ${config.modelName} does not appear to support vision capabilities. Please use a vision-capable model like LLaVA or use Gemini.`);
    }

    const base64 = await resizeImageIfNeeded(file);
    const mimeType = file.type || 'image/png';
    if (config.provider === 'gemini') {
      if (!config.apiKey || !config.apiKey.trim()) {
        throw new Error('Gemini API key is required for Vision OCR.');
      }
      return GeminiService.extractImageText(config.apiKey, base64, mimeType, language);
    }

    const dataUrl = `data:${mimeType};base64,${base64}`;
    const prompt = buildVisionPrompt(language, file.name);
    try {
      return await tryLocalVisionEndpoint(config, dataUrl, prompt);
    } catch (error) {
      if (config.provider === 'ollama') {
        return tryOllamaVision(config, base64, prompt);
      }
      return tryOpenAiCompatVision(config, dataUrl, prompt);
    }
  },

  async answerWithImages(config: LLMConfig, question: string, images: string[], language: string): Promise<string> {
    if (!images.length) {
      throw new Error('No images provided for vision RAG.');
    }
    if (config.provider === 'gemini') {
      if (!config.apiKey || !config.apiKey.trim()) throw new Error('Gemini API key required for vision.');
      const ai = new (await import('@google/genai')).GoogleGenAI({ apiKey: config.apiKey });
      const contents = [
        {
          role: 'user',
          parts: [
            { text: `Answer the question using ONLY these page images. Respond in ${language}. Question: ${question}` },
            ...images.map(img => ({ inlineData: { mimeType: 'image/jpeg', data: img.split(',')[1] || img } }))
          ]
        }
      ];
      const resp = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents,
        config: { temperature: 0.2, maxOutputTokens: 1024 }
      });
      return resp.text?.trim() || '';
    }

    // Local / OpenAI compat
    const message = {
      role: 'user',
      content: [
        { type: 'text', text: `Answer the question using ONLY these page images. Respond in ${language}. Question: ${question}` },
        ...images.map(img => ({ type: 'image_url', image_url: { url: img } }))
      ]
    };

    if (config.provider === 'ollama') {
      const response = await fetch(`${config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.modelName,
          messages: [message],
          stream: false
        })
      });
      if (!response.ok) throw new Error(`Ollama vision returned ${response.status}`);
      const data = await response.json();
      return data.message?.content?.trim() || '';
    }

    // LM Studio / OpenAI compat
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.modelName,
        messages: [message],
        max_tokens: 1024,
        temperature: 0.2,
        stream: false
      })
    });
    if (!response.ok) throw new Error(`Vision chat returned ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }
};
