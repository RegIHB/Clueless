import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => {
  type AuthCallback = (event: string, session: unknown) => void;
  const refreshSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const getUser = vi.fn();
  const callbacks = new Set<AuthCallback>();
  const onAuthStateChange = vi.fn((cb: AuthCallback) => {
    callbacks.add(cb);
    return { data: { subscription: { unsubscribe: () => callbacks.delete(cb) } } };
  });

  const client = {
    auth: { refreshSession, signOut, getUser, onAuthStateChange },
  };

  return {
    client,
    refreshSession,
    signOut,
    getUser,
    onAuthStateChange,
    callbacks,
    setUser(user: { id: string } | null) {
      getUser.mockResolvedValue({ data: { user }, error: null });
    },
    setUserError(message: string) {
      getUser.mockResolvedValue({ data: { user: null }, error: { message } });
    },
    /** Fail the first N getUser calls then succeed (simulates hard-reload race). */
    setUserSequence(values: Array<{ id: string } | null>) {
      let i = 0;
      getUser.mockImplementation(async () => {
        const next = values[Math.min(i, values.length - 1)];
        i += 1;
        return { data: { user: next }, error: null };
      });
    },
    emit(event: string, session: { user: { id: string } } | null) {
      for (const cb of callbacks) cb(event, session);
    },
    reset() {
      callbacks.clear();
      refreshSession.mockClear();
      signOut.mockClear();
      getUser.mockReset();
      onAuthStateChange.mockClear();
    },
  };
});

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: () => true,
  createBrowserSupabaseClient: () => supabaseMock.client,
}));

import {
  __setSessionOrchestrator,
  getSessionOrchestrator,
} from '@/lib/auth/session-orchestrator';

beforeEach(() => {
  supabaseMock.reset();
  __setSessionOrchestrator(null);
});

afterEach(() => {
  __setSessionOrchestrator(null);
});

describe('SessionOrchestrator bootstrap', () => {
  test('emits authenticated when user is present immediately', async () => {
    supabaseMock.setUser({ id: 'user-1' });

    const orchestrator = getSessionOrchestrator();
    const states: string[] = [];
    orchestrator.subscribe((s) => states.push(s.status));

    const result = await orchestrator.bootstrap();
    expect(result.status).toBe('authenticated');
    if (result.status === 'authenticated') {
      expect(result.user.id).toBe('user-1');
    }
    expect(states).toContain('bootstrapping');
    expect(states).toContain('authenticated');
  });

  test('confirm-signed-out gates against transient null reads (refresh race)', async () => {
    // First two getUser calls return null (race), third returns user.
    supabaseMock.setUserSequence([null, null, { id: 'user-2' }]);

    const orchestrator = getSessionOrchestrator();
    const result = await orchestrator.bootstrap();
    expect(result.status).toBe('authenticated');
    if (result.status === 'authenticated') {
      expect(result.user.id).toBe('user-2');
    }
  });

  test('reaches signed_out when no user after retries', async () => {
    supabaseMock.setUser(null);
    const orchestrator = getSessionOrchestrator();
    const result = await orchestrator.bootstrap();
    expect(result.status).toBe('signed_out');
  });

  test('SIGNED_OUT event is suppressed if user reappears', async () => {
    // Bootstrap signed in.
    supabaseMock.setUser({ id: 'user-3' });
    const orchestrator = getSessionOrchestrator();
    await orchestrator.bootstrap();
    expect(orchestrator.getState().status).toBe('authenticated');

    // Now SIGNED_OUT fires, but getUser still returns user (transient race).
    supabaseMock.setUser({ id: 'user-3' });
    supabaseMock.emit('SIGNED_OUT', null);
    // Wait for confirmSignedOut loop.
    await new Promise((r) => setTimeout(r, 1500));

    expect(orchestrator.getState().status).toBe('authenticated');
  });

  test('SIGNED_IN event transitions to authenticated immediately', async () => {
    supabaseMock.setUser(null);
    const orchestrator = getSessionOrchestrator();
    await orchestrator.bootstrap();
    expect(orchestrator.getState().status).toBe('signed_out');

    supabaseMock.emit('SIGNED_IN', { user: { id: 'user-4' } });
    expect(orchestrator.getState().status).toBe('authenticated');
  });

  test('signOut transitions to signed_out and calls supabase signOut', async () => {
    supabaseMock.setUser({ id: 'user-5' });
    const orchestrator = getSessionOrchestrator();
    await orchestrator.bootstrap();

    await orchestrator.signOut();
    expect(orchestrator.getState().status).toBe('signed_out');
    expect(supabaseMock.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  test('bootstrap is idempotent across concurrent callers', async () => {
    supabaseMock.setUser({ id: 'user-6' });
    const orchestrator = getSessionOrchestrator();
    const [a, b] = await Promise.all([orchestrator.bootstrap(), orchestrator.bootstrap()]);
    expect(a).toBe(b);
  });
});
