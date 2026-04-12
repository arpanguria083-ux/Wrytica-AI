import { IngestionConfig, DEFAULT_INGESTION_CONFIG, PDF_EXTRACTION_MODE_STORAGE_KEY } from '../utils';

export const INGESTION_CONFIG_KEY = 'wrytica_ingestion_config';

export const loadIngestionConfig = (): IngestionConfig => {
  try {
    const stored = localStorage.getItem(INGESTION_CONFIG_KEY);
    const pdfExtractionMode = localStorage.getItem(PDF_EXTRACTION_MODE_STORAGE_KEY);
    if (stored) {
      const parsed = { ...DEFAULT_INGESTION_CONFIG, ...JSON.parse(stored) };
      if (pdfExtractionMode === 'deep' || pdfExtractionMode === 'standard') {
        parsed.pdfExtractionMode = pdfExtractionMode;
      }
      return parsed;
    }
  } catch { /* use defaults */ }
  return { ...DEFAULT_INGESTION_CONFIG };
};

export const saveIngestionConfig = (config: IngestionConfig) => {
  localStorage.setItem(INGESTION_CONFIG_KEY, JSON.stringify(config));
  localStorage.setItem(PDF_EXTRACTION_MODE_STORAGE_KEY, config.pdfExtractionMode);
};
