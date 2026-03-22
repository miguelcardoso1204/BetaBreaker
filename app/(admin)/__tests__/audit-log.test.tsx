/**
 * Admin Audit Log Screen Tests (Step 15.7)
 *
 * Tests the read-only audit log screen that displays:
 *   - Loading / error / empty states
 *   - List of audit entries with action badge, actor, values, timestamp
 *   - Filter tabs: All / Grade / Status / Tag
 *   - Null actor fallback ("System")
 *   - Old → New value display for each action type
 *
 * Mock strategy (matching maintenance.test.tsx):
 *   - useAuditLog: mutable __mockData pattern
 *   - useAuth: stable admin user with adminGymId
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// ── Mock useAuth ────────────────────────────────────────────────────
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'admin-1' },
    adminGymId: 'gym-1',
    role: 'gym_admin',
  }),
}));

// ── Mock useAuditLog ────────────────────────────────────────────────
// Mutable __mockData object lets each test control what the hook returns
// without re-mocking the module.
jest.mock('@/hooks/useAuditLog', () => {
  const mockData = {
    entries: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useAuditLog: () => mockData,
    __mockData: mockData,
  };
});

import AuditLogScreen from '../audit-log';

// Pull mutable mock data reference after import
const { __mockData } = jest.requireMock<{
  __mockData: {
    entries: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>('@/hooks/useAuditLog');

// ── Fixtures ────────────────────────────────────────────────────────
// Representative audit entries covering all action types + null actor

const mockEntries = [
  {
    id: 'a1',
    action: 'grade_change',
    target_type: 'route',
    target_id: 'route-abc-123',
    old_value: { canonical_grade: 12 },
    new_value: { canonical_grade: 14 },
    created_at: '2026-02-15T10:30:00Z',
    actor: { id: 'user-1', display_name: 'Jane Setter' },
  },
  {
    id: 'a2',
    action: 'status_change',
    target_type: 'route',
    target_id: 'route-def-456',
    old_value: { status: 'active' },
    new_value: { status: 'retiring_soon' },
    created_at: '2026-02-14T09:00:00Z',
    actor: { id: 'user-2', display_name: 'Bob Admin' },
  },
  {
    id: 'a3',
    action: 'tag_change',
    target_type: 'route',
    target_id: 'route-ghi-789',
    old_value: { color: '#EF4444' },
    new_value: { color: '#3B82F6' },
    created_at: '2026-02-13T08:00:00Z',
    // Null actor — system action (e.g., automated trigger)
    actor: null,
  },
];

// ── Helper ──────────────────────────────────────────────────────────

function resetMockData() {
  __mockData.entries = [];
  __mockData.isLoading = false;
  __mockData.error = null;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('AuditLogScreen', () => {
  beforeEach(resetMockData);

  it('renders loading state', () => {
    __mockData.isLoading = true;
    render(<AuditLogScreen />);
    expect(screen.getByTestId('loading-indicator')).toBeTruthy();
  });

  it('renders error state', () => {
    __mockData.error = new Error('Permission denied');
    render(<AuditLogScreen />);
    expect(screen.getByText(/Permission denied/)).toBeTruthy();
  });

  it('renders empty state when no entries', () => {
    __mockData.entries = [];
    render(<AuditLogScreen />);
    expect(screen.getByText(/No audit log entries/i)).toBeTruthy();
  });

  it('renders the screen header', () => {
    render(<AuditLogScreen />);
    expect(screen.getByText('Audit Log')).toBeTruthy();
  });

  it('renders entry list with actor names and timestamps', () => {
    __mockData.entries = mockEntries;
    render(<AuditLogScreen />);

    // Actor names should be visible
    expect(screen.getByText('Jane Setter')).toBeTruthy();
    expect(screen.getByText('Bob Admin')).toBeTruthy();
  });

  it('shows "System" fallback when actor is null', () => {
    // The third fixture has actor: null (system action).
    // The screen should display "System" instead of a name.
    __mockData.entries = [mockEntries[2]];
    render(<AuditLogScreen />);
    expect(screen.getByText('System')).toBeTruthy();
  });

  it('displays old → new values for each action type', () => {
    __mockData.entries = mockEntries;
    render(<AuditLogScreen />);

    // Grade change: formatted as "Grade: 12 → 14" from JSONB canonical_grade
    expect(screen.getByText('Grade: 12 → 14')).toBeTruthy();

    // Status change: formatted as "Status: active → retiring_soon"
    expect(screen.getByText('Status: active → retiring_soon')).toBeTruthy();
  });

  it('filters entries by action type when tabs are pressed', () => {
    __mockData.entries = mockEntries;
    render(<AuditLogScreen />);

    // "All" tab is active by default — all 3 entries visible
    expect(screen.getByText('Jane Setter')).toBeTruthy();
    expect(screen.getByText('Bob Admin')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();

    // Tap "Grade" tab — "Grade" appears in both the tab and the action
    // badge, so use getAllByText and pick the first (the tab comes first).
    fireEvent.press(screen.getAllByText('Grade')[0]);
    expect(screen.getByText('Jane Setter')).toBeTruthy();
    expect(screen.queryByText('Bob Admin')).toBeNull();
    expect(screen.queryByText('System')).toBeNull();

    // Tap "Status" tab — same pattern
    fireEvent.press(screen.getAllByText('Status')[0]);
    expect(screen.queryByText('Jane Setter')).toBeNull();
    expect(screen.getByText('Bob Admin')).toBeTruthy();
    expect(screen.queryByText('System')).toBeNull();

    // Tap "Tag" tab — same pattern
    fireEvent.press(screen.getAllByText('Tag')[0]);
    expect(screen.queryByText('Jane Setter')).toBeNull();
    expect(screen.queryByText('Bob Admin')).toBeNull();
    expect(screen.getByText('System')).toBeTruthy();
  });
});
