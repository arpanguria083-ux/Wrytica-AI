// Test script to verify Paraphraser modes work with local LLM
// Tests each mode and logs detailed debug info

const LM_STUDIO_BASE_URL = 'http://127.0.0.1:1234';
const MODEL_NAME = 'qwen3.5-9b';

// System prompts - updated to suppress thinking/CoT
const PARAPHRASE_SYS_PROMPT = `You are a JSON-only paraphrasing assistant.

CRITICAL: Never include any thinking, reasoning, or chain-of-thought in your output.
Never use <|thinking|> or similar tokens.
Never write "Thinking Process:" or explain your reasoning.

GUIDELINES:
1. Output must be a single JSON object only
2. Start directly with { - no preamble
3. End directly with } - no trailing content
4. Follow this exact pattern: {"paraphrasedText": "text", "tone": "tone", "confidence": 0.9}

IMPORTANT: Start your response with { and end with }. No thinking or explanations.`;

const MODES = [
  'Standard', 'Fluency', 'Humanize', 'Formal', 'Academic', 'Simple', 'Creative', 'Expand', 'Shorten', 'Custom'
];

const TEST_TEXT = "Artificial intelligence is changing how companies operate and make decisions every day.";

function extractJson(text) {
  if (!text || typeof text !== 'string') {
    throw new Error("No text provided");
  }

  let cleanText = text.trim();
  
  // Handle thinking/CoT content
  const thinkingPatterns = [
    /<\|thinking\|>[\s\S]*?<\|end_thinking\|>/gi,
    /<think>[\s\S]*?/gi,
    /Thought(?:s|ing)?\s*Process:?[\s\S]*?(?=\n\n|\n\s*\n|```)/gi,
    /^Thought(?:s|ing)?\s*Process:?.*$/gim
  ];
  
  thinkingPatterns.forEach(pattern => {
    cleanText = cleanText.replace(pattern, '');
  });

  // Try JSON code block first
  const jsonCodeBlockMatch = cleanText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonCodeBlockMatch) {
    try {
      return JSON.parse(jsonCodeBlockMatch[1].trim());
    } catch (e) { /* continue */ }
  }

  // Try any code block
  const codeBlockMatch = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) { /* continue */ }
  }

  // Try direct parse
  try {
    return JSON.parse(cleanText);
  } catch (e) { /* continue */ }

  // Try braces extraction
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    try {
      return JSON.parse(cleanText.substring(firstBrace, lastBrace + 1));
    } catch (e) { /* continue */ }
  }

  throw new Error("Could not extract valid JSON");
}

async function testMode(mode) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing mode: ${mode}`);
  console.log('='.repeat(60));
  
  let modeInstruction = '';
  const modeLower = mode.toLowerCase();
  
  switch (modeLower) {
    case 'standard':
      modeInstruction = 'Rewrite this text with balanced rewording, maintaining the original meaning and tone.';
      break;
    case 'fluency':
      modeInstruction = 'Improve the flow, rhythm, and grammatical smoothness while rewording.';
      break;
    case 'humanize':
      modeInstruction = 'Make the text sound more natural, emotional, conversational, and human-like.';
      break;
    case 'formal':
      modeInstruction = 'Use sophisticated vocabulary, avoid contractions, and maintain a professional tone.';
      break;
    case 'academic':
      modeInstruction = 'Use scholarly tone, precise terminology, and objective voice appropriate for academic writing.';
      break;
    case 'simple':
      modeInstruction = 'Use plain language, shorter sentences, accessible vocabulary for general audience.';
      break;
    case 'creative':
      modeInstruction = 'Use evocative language, varied sentence structure, be expressive and creative.';
      break;
    case 'expand':
      modeInstruction = 'Add relevant details, context, and depth to expand on the original meaning without redundancy.';
      break;
    case 'shorten':
      modeInstruction = 'Condense the text to convey the same meaning in fewer words while preserving essential information.';
      break;
    case 'custom':
      modeInstruction = 'Follow the custom instructions provided.';
      break;
    default:
      modeInstruction = 'Rewrite this text appropriately.';
  }

  const prompt = `${modeInstruction} Output in English. Text: "${TEST_TEXT}"`;

  try {
    console.log(`Prompt: ${prompt.substring(0, 80)}...`);
    
    const response = await fetch(`${LM_STUDIO_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: "system", content: PARAPHRASE_SYS_PROMPT },
          { role: "user", content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 1024,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ HTTP Error ${response.status}: ${errorText}`);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    console.log(`Raw response: ${content.substring(0, 150)}...`);
    
    const result = extractJson(content);
    console.log(`✅ Success! Paraphrased: "${result.paraphrasedText}"`);
    console.log(`   Tone: ${result.tone}, Confidence: ${result.confidence}`);
    return { success: true, result };
    
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testWithExtras() {
  console.log(`\n${'#'.repeat(60)}`);
  console.log('# Testing with QuillBot-style extras enabled');
  console.log('#'.repeat(60));
  
  const modeInstruction = 'Make the text sound more natural, emotional, conversational, and human-like.';
  const optionInstructions = ' Also flip parallel structures. Also improve grammatical accuracy and natural flow.';
  const prompt = `${modeInstruction}${optionInstructions} Output in English. Text: "${TEST_TEXT}"`;

  try {
    const response = await fetch(`${LM_STUDIO_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: "system", content: PARAPHRASE_SYS_PROMPT },
          { role: "user", content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 1024,
        stream: false
      })
    });

    if (!response.ok) {
      console.log(`❌ HTTP Error ${response.status}`);
      return;
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    console.log(`Raw response: ${content.substring(0, 150)}...`);
    
    const result = extractJson(content);
    console.log(`✅ Success! Paraphrased: "${result.paraphrasedText}"`);
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
  }
}

async function checkConnection() {
  console.log('='.repeat(60));
  console.log('Checking LM Studio connection...');
  console.log('='.repeat(60));
  
  try {
    const response = await fetch(`${LM_STUDIO_BASE_URL}/v1/models`);
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Connected! Available models:`);
      if (data.data && data.data.length > 0) {
        data.data.forEach(m => console.log(`   - ${m.id}`));
      }
    } else {
      console.log(`❌ Connection returned ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Connection failed: ${error.message}`);
  }
}

async function main() {
  await checkConnection();
  
  const results = [];
  for (const mode of MODES) {
    const result = await testMode(mode);
    results.push({ mode, ...result });
    await new Promise(r => setTimeout(r, 500));
  }
  
  await testWithExtras();
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  const successCount = results.filter(r => r.success).length;
  console.log(`Modes working: ${successCount}/${MODES.length}`);
  
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(`   ${status} ${r.mode}`);
  });
}

main().catch(console.error);