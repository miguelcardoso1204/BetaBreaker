/**
 * useAuditLog Hook Tests (Step 15.7)
 *
 * Tests the TanStack Query wrapper for the read-only audit log:
 *   - useAuditLog(gymId) — fetches audit entries, disabled when gymId is null
 *
 * No mutations — the audit_log is append-only via DB triggers.
 *
 * Mock strategy (matching useSeasons.test.tsx):
 *   - Mock auditService (not Supabase) — hooks don't know about PostgREST
 *   - Wrap renderHook in QueryClientProvider with retry: false
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mock auditService ───────────────────────────────────────────────
jest.mock('@/services/audit.service', () => ({
  auditService: {
    getAuditLog: jest.fn(),
  },
}));

import { useAuditLog } from '../useAuditLog';

const { auditService } = jest.requireMock<{
  auditService: { getAuditLog: jest.Mock };
}>('@/services/audit.service');

// ── Test wrapper ─────────────────────────────────────────────────────
// Fresh QueryClient per test prevents cache leakage between tests.

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('useAuditLog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches audit entries for a gym', async () => {
    // When gymId is provided, the hook should call the service and
    // return the entries once loading completes.
    const mockEntries = [
      { id: 'a1', action: 'grade_change', actor: { display_name: 'Jane' } },
      { id: 'a2', action: 'status_change', actor: null },
    ];
    auditService.getAuditLog.mockResolvedValueOnce({
      data: mockEntries,
      error: null,
    });

    const { result } = renderHook(
      () => useAuditLog('gym-1'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.entries).toEqual(mockEntries);
    expect(auditService.getAuditLog).toHaveBeenCalledWith('gym-1');
  });

  it('throws on service error', async () => {
    // When the service returns an error (e.g., RLS permission denied),
    // the hook should surface it via the error property.
    auditService.getAuditLog.mockResolvedValueOnce({
      data: null,
      error: new Error('Permission denied'),
    });

    const { result } = renderHook(
      () => useAuditLog('gym-1'),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.entries).toEqual([]);
  });

  it('is disabled when gymId is null', () => {
    // When the user's profile hasn't loaded yet (no adminGymId),
    // the query should not fire — stays idle, no service call.
    const { result } = renderHook(
      () => useAuditLog(null),
      { wrapper: createWrapper() }
    );

    expect(auditService.getAuditLog).not.toHaveBeenCalled();
    expect(result.current.entries).toEqual([]);
  });
});
