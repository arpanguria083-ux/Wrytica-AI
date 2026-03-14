import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5180,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // No longer using environment variables for API keys
      // Users provide their own API keys through the UI
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 1100,
        rollupOptions: {
          output: {
            manualChunks: {
              // Large dependencies that should be lazy-loaded
              'pdfjs': ['pdfjs-dist'],
              'tesseract': ['tesseract.js'],
              // React and router
              'vendor-react': ['react', 'react-dom', 'react-router-dom'],
              // Google AI SDK
              'vendor-gemini': ['@google/genai'],
            }
          }
        }
      }
    };
});
