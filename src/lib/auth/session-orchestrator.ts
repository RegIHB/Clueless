'use client';

import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { createBrowserSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { authTelemetry } from '@/lib/auth/telemetry';

/**
 * Centralized auth orchestration.
 *
 * Responsibilities:
 *  - Single source of truth for "is the user signed in".
 *  - Bootstraps on app start with a `getUser()`-first strategy (auth-storage
 *    hydration races are guarded by a re-check loop before destructive clears).
 *  - Notifies subscribers of state transitions.
 *  - Exposes a stable `Promise<userId>` so callers can `await` the first
 *    bootstrap completion without polling.
 */

export type AuthOrchestratorState =
  | { status: 'idle' }
  | { status: 'bootstrapping' }
  | { status: 'authenticated'; user: User }
  | { status: 'signed_out' }
  | { status: 'unconfigured' };

type Listener = (state: AuthOrchestratorState) => void;

type OrchestratorOptions = {
  /** How many `getUser()` retries before treating signed-out as definitive. */
  signedOutConfirmAttempts?: number;
  /** Base delay (ms) between confirmation attempts; grows linearly. */
  signedOutConfirmBaseMs?: number;
};

const DEFAULT_OPTIONS: Required<OrchestratorOptions> = {
  signedOutConfirmAttempts: 6,
  signedOutConfirmBaseMs: 110,
};

class SessionOrchestrator {
  private state: AuthOrchestratorState = { status: 'idle' };
  private listeners = new Set<Listener>();
  private supabase: SupabaseClient | null = null;
  private bootstrapPromise: Promise<AuthOrchestratorState> | null = null;
  private subscriptionUnsub: (() => void) | null = null;
  private opts: Required<OrchestratorOptions>;
  private bootstrapped = false;

  constructor(options: OrchestratorOptions = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    authTelemetry('orchestrator_init', { configured: isSupabaseConfigured() });
  }

  getState(): AuthOrchestratorState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Return the resolved user id once bootstrap completes, or null if signed out. */
  async waitForUserId(): Promise<string | null> {
    const result = await this.bootstrap();
    return result.status === 'authenticated' ? result.user.id : null;
  }

  /** Idempotent: subsequent calls reuse the in-flight bootstrap promise. */
  bootstrap(): Promise<AuthOrchestratorState> {
    if (this.bootstrapPromise) return this.bootstrapPromise;
    this.bootstrapPromise = this.runBootstrap();
    return this.bootstrapPromise;
  }

  private async runBootstrap(): Promise<AuthOrchestratorState> {
    if (!isSupabaseConfigured()) {
      this.transition({ status: 'unconfigured' });
      return this.state;
    }

    this.transition({ status: 'bootstrapping' });
    authTelemetry('orchestrator_bootstrap_start');

    const supabase = this.getClient();
    this.attachAuthSubscription(supabase);

    // 1. Refresh tokens silently first so cookies/storage settle.
    await supabase.auth.refreshSession().catch(() => {});

    // 2. Authoritative read: getUser() over getSession().
    const userId = await this.resolveUser(supabase);
    if (userId) {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) {
        authTelemetry('orchestrator_bootstrap_user_resolved', { userId: data.user.id });
        this.transition({ status: 'authenticated', user: data.user });
        this.bootstrapped = true;
        return this.state;
      }
    }

    // 3. No user yet — confirm with retry loop to avoid hard-reload races.
    authTelemetry('orchestrator_bootstrap_no_user_pending_confirm');
    const confirmed = await this.confirmSignedOut(supabase);
    if (confirmed) {
      authTelemetry('orchestrator_bootstrap_signed_out_confirmed');
      this.transition({ status: 'signed_out' });
    } else {
      authTelemetry('orchestrator_bootstrap_signed_out_suppressed');
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        this.transition({ status: 'authenticated', user: data.user });
      } else {
        this.transition({ status: 'signed_out' });
      }
    }
    this.bootstrapped = true;
    return this.state;
  }

  private async resolveUser(supabase: SupabaseClient): Promise<string | null> {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  }

  private async confirmSignedOut(supabase: SupabaseClient): Promise<boolean> {
    const { signedOutConfirmAttempts, signedOutConfirmBaseMs } = this.opts;
    for (let attempt = 0; attempt < signedOutConfirmAttempts; attempt++) {
      const userId = await this.resolveUser(supabase);
      if (userId) return false;
      await new Promise((r) => setTimeout(r, signedOutConfirmBaseMs * (attempt + 1)));
    }
    const finalCheck = await this.resolveUser(supabase);
    return finalCheck === null;
  }

  private attachAuthSubscription(supabase: SupabaseClient): void {
    if (this.subscriptionUnsub) return;

    const { data } = supabase.auth.onAuthStateChange(async (event, session: Session | null) => {
      // INITIAL_SESSION fires before storage is fully readable on hard reload;
      // defer to bootstrap() which uses getUser() for authority.
      if (event === 'INITIAL_SESSION') return;

      if (event === 'TOKEN_REFRESHED') {
        authTelemetry('orchestrator_token_refreshed');
        if (session?.user) {
          this.transition({ status: 'authenticated', user: session.user });
        }
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        authTelemetry('orchestrator_password_recovery');
        return;
      }

      if (event === 'SIGNED_IN') {
        if (session?.user) {
          authTelemetry('orchestrator_signed_in_event', { userId: session.user.id });
          this.transition({ status: 'authenticated', user: session.user });
        }
        return;
      }

      if (event === 'SIGNED_OUT') {
        const confirmed = await this.confirmSignedOut(supabase);
        if (!confirmed) {
          authTelemetry('orchestrator_signed_out_event_suppressed', { event });
          const { data: userData } = await supabase.auth.getUser();
          if (userData.user) {
            this.transition({ status: 'authenticated', user: userData.user });
            return;
          }
        }
        authTelemetry('orchestrator_signed_out_event', { event });
        this.transition({ status: 'signed_out' });
      }
    });

    this.subscriptionUnsub = () => data.subscription.unsubscribe();
  }

  private transition(next: AuthOrchestratorState): void {
    if (
      next.status === this.state.status &&
      (next.status !== 'authenticated' ||
        (this.state.status === 'authenticated' && this.state.user.id === next.user.id))
    ) {
      return;
    }
    this.state = next;
    for (const listener of this.listeners) {
      try {
        listener(next);
      } catch (err) {
        console.error('[session-orchestrator] listener threw', err);
      }
    }
  }

  /** Used by sign-in dialog after a successful credential auth so UI updates fast. */
  async refreshAfterCredentialSignIn(): Promise<AuthOrchestratorState> {
    const supabase = this.getClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      this.transition({ status: 'authenticated', user: data.user });
    }
    return this.state;
  }

  async signOut(): Promise<void> {
    const supabase = this.getClient();
    // Optimistic local clear — confirm with the server but never block on it.
    this.transition({ status: 'signed_out' });
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      console.error('[session-orchestrator] signOut failed', err);
    }
  }

  private getClient(): SupabaseClient {
    if (!this.supabase) this.supabase = createBrowserSupabaseClient();
    return this.supabase;
  }

  /** For tests / hot-reload safety. */
  dispose(): void {
    this.subscriptionUnsub?.();
    this.subscriptionUnsub = null;
    this.listeners.clear();
    this.supabase = null;
    this.state = { status: 'idle' };
    this.bootstrapPromise = null;
    this.bootstrapped = false;
  }
}

// Module-level singleton: preserved across re-renders within a tab.
let singleton: SessionOrchestrator | null = null;

export function getSessionOrchestrator(): SessionOrchestrator {
  if (!singleton) singleton = new SessionOrchestrator();
  return singleton;
}

/** Test seam: replace the singleton (used by integration tests). */
export function __setSessionOrchestrator(custom: SessionOrchestrator | null): void {
  singleton?.dispose();
  singleton = custom;
}
