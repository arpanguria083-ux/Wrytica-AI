import fs from 'fs';
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { createCanvas } from 'canvas';

// Node.js doesn't have a native DOM Canvas, so we simulate the browser environment for testing
async function testOcr() {
  console.log('Starting OCR test on test_ocr.pdf...');
  
  try {
    const data = fs.readFileSync('test_ocr.pdf');
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    console.log(`Loaded PDF with ${pdf.numPages} pages.`);
    
    const worker = await createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    console.log('Tesseract.js worker initialized.');

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');
      
      await page.render({ canvasContext: ctx, viewport }).promise;
      console.log(`Rendered page ${i} to canvas.`);
      
      // Node canvas to Buffer -> Tesseract
      const buffer = canvas.toBuffer('image/jpeg');
      const { data: { text } } = await worker.recognize(buffer);
      console.log(`\n--- Extracted Text Page ${i} ---\n${text.trim()}\n---------------------------\n`);
    }
    
    await worker.terminate();
    console.log('Test complete.');
  } catch (error) {
    console.error('Error during OCR test:', error);
  }
}

testOcr();
