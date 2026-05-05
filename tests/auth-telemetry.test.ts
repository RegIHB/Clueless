import { beforeEach, describe, expect, test } from 'vitest';
import { authTelemetry, getAuthTelemetryCounter, resetAuthTelemetry } from '@/lib/auth/telemetry';

beforeEach(() => {
  resetAuthTelemetry();
});

describe('auth telemetry counters', () => {
  test('increments per event', () => {
    authTelemetry('orchestrator_init', { configured: true });
    authTelemetry('orchestrator_init', { configured: true });
    authTelemetry('orchestrator_signed_in_event', { userId: 'u' });

    expect(getAuthTelemetryCounter('orchestrator_init')).toBe(2);
    expect(getAuthTelemetryCounter('orchestrator_signed_in_event')).toBe(1);
    expect(getAuthTelemetryCounter('orchestrator_signed_out_event')).toBe(0);
  });
});
