export type SyncErrorCode =
  | 'unauthorized'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'rate_limited'
  | 'unavailable'
  | 'unknown';

export class SyncError extends Error {
  readonly code: SyncErrorCode;
  readonly cause?: unknown;

  constructor(code: SyncErrorCode, message: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.name = 'SyncError';
  }
}

export type SyncResult<T> = { ok: true; value: T } | { ok: false; error: SyncError };

export const ok = <T>(value: T): SyncResult<T> => ({ ok: true, value });
export const fail = (error: SyncError): SyncResult<never> => ({ ok: false, error });

export function classifyPostgrestError(message: string | undefined, code?: string): SyncErrorCode {
  if (code === '23505' || message?.toLowerCase().includes('duplicate')) return 'conflict';
  if (code?.startsWith('42')) return 'validation';
  if (message?.toLowerCase().includes('not found')) return 'not_found';
  if (message?.toLowerCase().includes('rate')) return 'rate_limited';
  return 'unknown';
}
