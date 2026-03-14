import { detectGPUAvailable } from '../utils';

export type HardwareProfile = 'cpu' | 'gpu-lite' | 'gpu-pro';

export interface HardwareInfo {
  hasGPU: boolean;
  profile: HardwareProfile;
  deviceMemoryGB?: number;
  gpuRenderer?: string;
}

export interface HardwareRecommendation {
  textModel: string;
  visionModel?: string;
  contextLimit: number;
  maxVisionImages: number;
  notes: string;
}

const getWebGLRenderer = (): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
  if (!gl) return undefined;
  const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
  if (debugInfo) {
    return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
  }
  return undefined;
};

export const detectHardwareProfile = (): HardwareInfo => {
  const hasGPU = detectGPUAvailable();
  const deviceMemoryGB = typeof navigator !== 'undefined' && (navigator as any).deviceMemory ? (navigator as any).deviceMemory : undefined;
  const renderer = hasGPU ? getWebGLRenderer() : undefined;

  let profile: HardwareProfile = 'cpu';
  if (hasGPU) {
    if (deviceMemoryGB && deviceMemoryGB >= 20) profile = 'gpu-pro';
    else if (deviceMemoryGB && deviceMemoryGB >= 12) profile = 'gpu-lite';
    else profile = 'gpu-lite';
  }

  return { hasGPU, profile, deviceMemoryGB, gpuRenderer: renderer };
};

export const getRecommendations = (profile: HardwareProfile): HardwareRecommendation => {
  switch (profile) {
    case 'gpu-pro':
      return {
        textModel: 'qwen2.5-14b-instruct-q4_0',
        visionModel: 'qwen2.5-vl-14b',
        contextLimit: 32000,
        maxVisionImages: 10,
        notes: 'Use larger quantized models; best-of-3 sampling is feasible; keep temperature low.'
      };
    case 'gpu-lite':
      return {
        textModel: 'llama3-8b-instruct-q4_0',
        visionModel: 'qwen2.5-vl-7b' as any,
        contextLimit: 12000,
        maxVisionImages: 6,
        notes: '8B quantized models fit; use best-of-2 if latency acceptable.'
      };
    default:
      return {
        textModel: 'phi-3-mini-4k-instruct',
        visionModel: undefined,
        contextLimit: 6000,
        maxVisionImages: 4,
        notes: 'Stay with small quantized models; avoid best-of-N; vision via remote (Gemini) recommended.'
      };
  }
};
