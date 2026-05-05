'use client';

import { useEffect, useState } from 'react';
import {
  type AuthOrchestratorState,
  getSessionOrchestrator,
} from '@/lib/auth/session-orchestrator';

/** React adapter: subscribe to the orchestrator, kick bootstrap exactly once per tab. */
export function useAuthOrchestrator(): AuthOrchestratorState {
  const [state, setState] = useState<AuthOrchestratorState>(() =>
    getSessionOrchestrator().getState()
  );

  useEffect(() => {
    const orchestrator = getSessionOrchestrator();
    const unsubscribe = orchestrator.subscribe(setState);
    void orchestrator.bootstrap();
    return unsubscribe;
  }, []);

  return state;
}
