export type WryticaRuntimeConfig = {
  backendUrl?: string;
  desktop?: boolean;
  version?: string;
};

declare global {
  interface Window {
    __WRYTICA_RUNTIME__?: WryticaRuntimeConfig;
  }
}

export function getRuntimeConfig(): WryticaRuntimeConfig {
  if (typeof window === 'undefined') {
    return {};
  }

  return window.__WRYTICA_RUNTIME__ || {};
}

export function getBackendApiBaseUrl(): string {
  const runtimeConfig = getRuntimeConfig();
  const envBackendUrl = (import.meta as any)?.env?.VITE_BACKEND_URL as string | undefined;
  return runtimeConfig.backendUrl || envBackendUrl || 'http://localhost:8000';
}

export function isDesktopRuntime(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return Boolean(
    getRuntimeConfig().desktop ||
    navigator.userAgent.includes('Electron')
  );
}
