/**
 * useMaintenanceTickets Hook Tests (Step 15.5)
 *
 * Tests the TanStack Query wrappers for maintenance ticket operations:
 *   Queries:
 *     - useMaintenanceTickets(gymId) — all tickets for a gym
 *     - useRouteTickets(routeId) — tickets for a single route
 *   Mutations:
 *     - useCreateTicket() — report a new issue
 *     - useUpdateTicketStatus() — change ticket status
 *     - useDeleteTicket() — remove a ticket
 *
 * Mock strategy (matching useSettingCalendar.test.tsx):
 *   - Mock maintenanceService (not Supabase) — hooks don't know about PostgREST
 *   - Wrap renderHook in QueryClientProvider with retry: false
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock maintenanceService ──────────────────────────────────────────
jest.mock("@/services/maintenance.service", () => ({
  maintenanceService: {
    getTicketsByGym: jest.fn(),
    getTicketsByRoute: jest.fn(),
    createTicket: jest.fn(),
    updateTicketStatus: jest.fn(),
    deleteTicket: jest.fn(),
  },
}));

import {
  useMaintenanceTickets,
  useRouteTickets,
  useCreateTicket,
  useUpdateTicketStatus,
  useDeleteTicket,
} from "../useMaintenanceTickets";

const { maintenanceService } = jest.requireMock<{
  maintenanceService: {
    getTicketsByGym: jest.Mock;
    getTicketsByRoute: jest.Mock;
    createTicket: jest.Mock;
    updateTicketStatus: jest.Mock;
    deleteTicket: jest.Mock;
  };
}>("@/services/maintenance.service");

// ── Test wrapper ──────────────────────────────────────────────────────
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

// ── useMaintenanceTickets tests ──────────────────────────────────────

describe("useMaintenanceTickets", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches tickets for a gym", async () => {
    const mockTickets = [
      { id: "t1", description: "Spinning hold", status: "open" },
      { id: "t2", description: "Broken foothold", status: "resolved" },
    ];
    maintenanceService.getTicketsByGym.mockResolvedValueOnce({
      data: mockTickets,
      error: null,
    });

    const { result } = renderHook(
      () => useMaintenanceTickets("gym-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.tickets).toEqual(mockTickets);
    expect(maintenanceService.getTicketsByGym).toHaveBeenCalledWith("gym-1");
  });

  it("throws on service error", async () => {
    maintenanceService.getTicketsByGym.mockResolvedValueOnce({
      data: null,
      error: new Error("Permission denied"),
    });

    const { result } = renderHook(
      () => useMaintenanceTickets("gym-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.tickets).toEqual([]);
  });

  it("is disabled when gymId is null", () => {
    const { result } = renderHook(
      () => useMaintenanceTickets(null),
      { wrapper: createWrapper() }
    );

    // Query should not fire — stays in idle state
    expect(maintenanceService.getTicketsByGym).not.toHaveBeenCalled();
    expect(result.current.tickets).toEqual([]);
  });
});

// ── useRouteTickets tests ────────────────────────────────────────────

describe("useRouteTickets", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fetches tickets for a route", async () => {
    const mockTickets = [
      { id: "t1", description: "Hold is loose", status: "open" },
    ];
    maintenanceService.getTicketsByRoute.mockResolvedValueOnce({
      data: mockTickets,
      error: null,
    });

    const { result } = renderHook(
      () => useRouteTickets("route-1"),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.tickets).toEqual(mockTickets);
    expect(maintenanceService.getTicketsByRoute).toHaveBeenCalledWith("route-1");
  });

  it("is disabled when routeId is null", () => {
    const { result } = renderHook(
      () => useRouteTickets(null),
      { wrapper: createWrapper() }
    );

    expect(maintenanceService.getTicketsByRoute).not.toHaveBeenCalled();
    expect(result.current.tickets).toEqual([]);
  });
});

// ── useCreateTicket tests ────────────────────────────────────────────

describe("useCreateTicket", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls createTicket and succeeds", async () => {
    maintenanceService.createTicket.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useCreateTicket(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        route_id: "route-1",
        reporter_id: "user-1",
        description: "Hold spinning on crux",
      });
    });

    expect(maintenanceService.createTicket).toHaveBeenCalledWith({
      route_id: "route-1",
      reporter_id: "user-1",
      description: "Hold spinning on crux",
    });
  });

  it("throws on service error", async () => {
    maintenanceService.createTicket.mockResolvedValueOnce({
      data: null,
      error: new Error("Insert failed"),
    });

    const { result } = renderHook(() => useCreateTicket(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          route_id: "route-1",
          reporter_id: "user-1",
          description: "Issue",
        });
      })
    ).rejects.toThrow("Insert failed");
  });
});

// ── useUpdateTicketStatus tests ──────────────────────────────────────

describe("useUpdateTicketStatus", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls updateTicketStatus with id and status", async () => {
    maintenanceService.updateTicketStatus.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useUpdateTicketStatus(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        ticketId: "ticket-1",
        status: "in_progress",
      });
    });

    expect(maintenanceService.updateTicketStatus).toHaveBeenCalledWith(
      "ticket-1",
      "in_progress",
      undefined
    );
  });

  it("passes resolvedBy when resolving", async () => {
    maintenanceService.updateTicketStatus.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useUpdateTicketStatus(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        ticketId: "ticket-1",
        status: "resolved",
        resolvedBy: "admin-1",
      });
    });

    expect(maintenanceService.updateTicketStatus).toHaveBeenCalledWith(
      "ticket-1",
      "resolved",
      "admin-1"
    );
  });
});

// ── useDeleteTicket tests ────────────────────────────────────────────

describe("useDeleteTicket", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls deleteTicket with id", async () => {
    maintenanceService.deleteTicket.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { result } = renderHook(() => useDeleteTicket(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ ticketId: "ticket-1" });
    });

    expect(maintenanceService.deleteTicket).toHaveBeenCalledWith("ticket-1");
  });
});
