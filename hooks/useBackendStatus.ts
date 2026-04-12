import { useState, useEffect } from 'react';
import { documentProcessorAPI, HealthStatus } from '../services/backendApi';

export interface BackendStatus {
  available: boolean;
  health: HealthStatus | null;
  checking: boolean;
  refresh: () => Promise<void>;
}

export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<Omit<BackendStatus, 'refresh'>>({
    available: false,
    health: null,
    checking: true
  });

  useEffect(() => {
    let mounted = true;

    const checkStatus = async () => {
      if (!mounted) return;
      
      setStatus(prev => ({ ...prev, checking: true }));
      
      try {
        const [available, health] = await Promise.all([
          documentProcessorAPI.isBackendAvailable(),
          documentProcessorAPI.getHealthStatus()
        ]);
        
        if (mounted) {
          setStatus({
            available,
            health,
            checking: false
          });
        }
      } catch {
        if (mounted) {
          setStatus({
            available: false,
            health: null,
            checking: false
          });
        }
      }
    };

    checkStatus();
    const intervalId = window.setInterval(checkStatus, 15000);

    const unsubscribe = documentProcessorAPI.onHealthChange((available) => {
      if (mounted) {
        setStatus(prev => ({ ...prev, available }));
      }
    });

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, []);

  return {
    ...status,
    refresh: async () => {
      const [available, health] = await Promise.all([
        documentProcessorAPI.isBackendAvailable(),
        documentProcessorAPI.getHealthStatus()
      ]);
      setStatus({
        available,
        health,
        checking: false
      });
    }
  };
}

export default useBackendStatus;
