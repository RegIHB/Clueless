/**
 * Lightweight, opt-in auth + sync telemetry. Writes to console only when
 * `NEXT_PUBLIC_AUTH_HYDRATION_TELEMETRY=1` or in dev. No PII is logged.
 */
const ENABLED =
  typeof process !== 'undefined' &&
  (process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_AUTH_HYDRATION_TELEMETRY === '1');

export type AuthTelemetryEvent =
  | 'orchestrator_init'
  | 'orchestrator_bootstrap_start'
  | 'orchestrator_bootstrap_user_resolved'
  | 'orchestrator_bootstrap_no_user_pending_confirm'
  | 'orchestrator_bootstrap_signed_out_confirmed'
  | 'orchestrator_bootstrap_signed_out_suppressed'
  | 'orchestrator_signed_in_event'
  | 'orchestrator_signed_out_event'
  | 'orchestrator_signed_out_event_suppressed'
  | 'orchestrator_token_refreshed'
  | 'orchestrator_password_recovery'
  | 'sync_full_load_start'
  | 'sync_full_load_ok'
  | 'sync_full_load_fail'
  | 'sync_mutation_attempt'
  | 'sync_mutation_ok'
  | 'sync_mutation_replayed'
  | 'sync_mutation_fail'
  | 'sync_conflict';

type EventDetails = Record<string, string | number | boolean | null | undefined>;

const counters = new Map<AuthTelemetryEvent, number>();

export function authTelemetry(event: AuthTelemetryEvent, details: EventDetails = {}): void {
  counters.set(event, (counters.get(event) ?? 0) + 1);
  if (!ENABLED) return;
  try {
    console.info('[auth-telemetry]', event, details);
  } catch {
    /* ignore logging failures */
  }
}

export function getAuthTelemetryCounter(event: AuthTelemetryEvent): number {
  return counters.get(event) ?? 0;
}

export function resetAuthTelemetry(): void {
  counters.clear();
}
