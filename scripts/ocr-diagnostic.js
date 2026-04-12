#!/usr/bin/env node

/**
 * OCR and Vision Diagnostic Tool
 * Helps identify memory leaks and OCR issues in Wrytica
 */

import { createWorker } from 'tesseract.js';
import { performance } from 'perf_hooks';

const TEST_MEMORY_INTERVAL = 1000; // Check memory every 1 second
const MAX_TEST_TIME = 30000; // Run tests for 30 seconds

function getMemoryUsage() {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
    };
  } else if (typeof window !== 'undefined' && window.performance) {
    // Browser memory estimation
    return {
      estimated: 'Browser memory monitoring not available',
    };
  }
  return { message: 'Memory monitoring not available' };
}

async function testTesseractMemoryLeak() {
  console.log('🔍 Testing Tesseract.js for memory leaks...\n');
  
  const initialMemory = getMemoryUsage();
  console.log('Initial memory:', initialMemory);
  
  let workerCount = 0;
  const startTime = Date.now();
  
  try {
    while (Date.now() - startTime < MAX_TEST_TIME) {
      const worker = await createWorker();
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      
      // Simulate OCR work
      await worker.recognize('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
      
      // Terminate worker
      await worker.terminate();
      workerCount++;
      
      // Check memory every few iterations
      if (workerCount % 5 === 0) {
        const currentMemory = getMemoryUsage();
        console.log(`Worker ${workerCount}:`, currentMemory);
        
        // Detect potential memory leak
        if (typeof currentMemory.heapUsed === 'number' && typeof initialMemory.heapUsed === 'number') {
          const growth = currentMemory.heapUsed - initialMemory.heapUsed;
          if (growth > 100) { // More than 100MB growth
            console.warn(`⚠️  Potential memory leak detected: ${growth}MB growth`);
          }
        }
      }
      
      // Small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`\n✅ Test completed: ${workerCount} workers processed`);
    const finalMemory = getMemoryUsage();
    console.log('Final memory:', finalMemory);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

async function testVisionEndpoints() {
  console.log('\n🔍 Testing vision endpoint connectivity...\n');
  
  const endpoints = [
    'http://localhost:11434/api/vision', // Ollama
    'http://localhost:1234/v1/vision',  // LM Studio
    'http://localhost:1234/vision',
    'http://localhost:1234/api/vision',
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Testing ${endpoint}...`);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'test',
          instruction: 'test',
          image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        }),
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        console.log(`✅ ${endpoint} - Responsive`);
      } else {
        console.log(`❌ ${endpoint} - Status: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ ${endpoint} - Error: ${error.message}`);
    }
  }
}

async function testOllamaModels() {
  console.log('\n🔍 Testing Ollama model capabilities...\n');
  
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (response.ok) {
      const data = await response.json();
      console.log('Available models:');
      
      for (const model of data.models) {
        console.log(`- ${model.name}`);
        
        // Check vision capability
        try {
          const showResponse = await fetch('http://localhost:11434/api/show', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: model.name })
          });
          
          if (showResponse.ok) {
            const modelInfo = await showResponse.json();
            const hasVision = modelInfo.details?.support_vision === true || modelInfo.projector_info !== undefined;
            console.log(`  Vision: ${hasVision ? '✅' : '❌'}`);
          }
        } catch (error) {
          console.log(`  Vision: ❓ (Could not check)`);
        }
      }
    } else {
      console.log('❌ Could not connect to Ollama');
    }
  } catch (error) {
    console.log('❌ Ollama test failed:', error.message);
  }
}

async function main() {
  console.log('🚀 Wrytica OCR & Vision Diagnostic Tool\n');
  
  // Test 1: Memory leak detection
  await testTesseractMemoryLeak();
  
  // Test 2: Vision endpoint connectivity
  await testVisionEndpoints();
  
  // Test 3: Ollama model capabilities
  await testOllamaModels();
  
  console.log('\n🏁 Diagnostic complete!');
  console.log('\n💡 Recommendations:');
  console.log('1. Use vision-capable models like LLaVA for local OCR');
  console.log('2. Ensure LM Studio/Ollama are running before testing');
  console.log('3. Monitor memory usage during large document processing');
  console.log('4. Consider reducing image quality for large files');
}

if (require.main === module) {
  main().catch(console.error);
}

export { testTesseractMemoryLeak, testVisionEndpoints, testOllamaModels };
