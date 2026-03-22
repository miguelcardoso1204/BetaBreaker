/**
 * Admin Maintenance Screen Tests (Step 15.5)
 *
 * Tests the ticket queue screen that displays:
 *   - Loading / error / empty states
 *   - Ticket list with route name, reporter, status badge, description
 *   - Status filter tabs (All / Open / In Progress / Resolved)
 *   - Action buttons: "Start Work" (open→in_progress), "Resolve" (in_progress→resolved)
 *   - Delete button for ticket removal
 *
 * Mock strategy (matching calendar.test.tsx):
 *   - useMaintenanceTickets: mutable __mockData pattern
 *   - useUpdateTicketStatus / useDeleteTicket: jest.fn() mutateAsync
 *   - useAuth: stable admin user with adminGymId
 *   - lucide-react-native: Text stubs
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mock useAuth ────────────────────────────────────────────────────
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "admin-1" },
    adminGymId: "gym-1",
    role: "gym_admin",
  }),
}));

// ── Mock useMaintenanceTickets hooks ─────────────────────────────────
// Mutable __mockData objects let each test control what the hook returns
// without re-mocking the module. The screen reads from these objects
// directly via the mocked hook functions.
const mockUpdateMutateAsync = jest.fn().mockResolvedValue(undefined);
const mockDeleteMutateAsync = jest.fn().mockResolvedValue(undefined);

jest.mock("@/hooks/useMaintenanceTickets", () => {
  const mockTicketsData = {
    tickets: [] as any[],
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useMaintenanceTickets: () => mockTicketsData,
    useUpdateTicketStatus: () => ({
      mutateAsync: mockUpdateMutateAsync,
      isPending: false,
    }),
    useDeleteTicket: () => ({
      mutateAsync: mockDeleteMutateAsync,
      isPending: false,
    }),
    __mockTicketsData: mockTicketsData,
  };
});

// ── Mock lucide icons ────────────────────────────────────────────────
// Replace Lucide icons with simple Text nodes so we can render without
// native SVG dependencies. Each icon renders its name as text content.
jest.mock("lucide-react-native", () => ({
  Trash2: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>Trash</Text>;
  },
  Wrench: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>Wrench</Text>;
  },
  CheckCircle: (props: any) => {
    const { Text } = require("react-native");
    return <Text {...props}>CheckCircle</Text>;
  },
}));

import MaintenanceScreen from "../maintenance";

// Pull mutable mock data reference after import so we can mutate per test
const { __mockTicketsData } = jest.requireMock<{
  __mockTicketsData: {
    tickets: any[];
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useMaintenanceTickets");

// ── Fixtures ────────────────────────────────────────────────────────

const mockTickets = [
  {
    id: "t1",
    description: "Hold is spinning on crux move",
    status: "open",
    created_at: "2026-02-15T10:00:00Z",
    route: { id: "r1", name: "Crimpy McSlab", color: "#EF4444", gym_id: "gym-1" },
    reporter: { id: "user-1", display_name: "Jane Climber" },
  },
  {
    id: "t2",
    description: "Foothold cracked near start",
    status: "in_progress",
    created_at: "2026-02-14T09:00:00Z",
    route: { id: "r2", name: "The Overhang", color: "#3B82F6", gym_id: "gym-1" },
    reporter: { id: "user-2", display_name: "Bob Boulderer" },
  },
  {
    id: "t3",
    description: "Volume was loose but fixed now",
    status: "resolved",
    created_at: "2026-02-13T08:00:00Z",
    route: { id: "r3", name: "Slab City", color: "#22C55E", gym_id: "gym-1" },
    reporter: { id: "user-3", display_name: "Alice Sender" },
  },
];

// ── Helper ──────────────────────────────────────────────────────────

function resetMockData() {
  __mockTicketsData.tickets = [];
  __mockTicketsData.isLoading = false;
  __mockTicketsData.error = null;
  mockUpdateMutateAsync.mockClear();
  mockDeleteMutateAsync.mockClear();
}

// ── Tests ───────────────────────────────────────────────────────────

describe("MaintenanceScreen", () => {
  beforeEach(resetMockData);

  it("renders loading state", () => {
    __mockTicketsData.isLoading = true;
    render(<MaintenanceScreen />);
    expect(screen.getByTestId("loading-indicator")).toBeTruthy();
  });

  it("renders error state", () => {
    __mockTicketsData.error = new Error("Permission denied");
    render(<MaintenanceScreen />);
    expect(screen.getByText(/Permission denied/)).toBeTruthy();
  });

  it("renders empty state when no tickets", () => {
    __mockTicketsData.tickets = [];
    render(<MaintenanceScreen />);
    expect(screen.getByText(/No maintenance tickets/i)).toBeTruthy();
  });

  it("renders ticket list with route name, reporter, status, and description", () => {
    __mockTicketsData.tickets = mockTickets;
    render(<MaintenanceScreen />);

    // First ticket details
    expect(screen.getByText("Crimpy McSlab")).toBeTruthy();
    expect(screen.getByText("Jane Climber")).toBeTruthy();
    expect(screen.getByText("Hold is spinning on crux move")).toBeTruthy();

    // Second ticket
    expect(screen.getByText("The Overhang")).toBeTruthy();
    expect(screen.getByText("Bob Boulderer")).toBeTruthy();

    // Third ticket
    expect(screen.getByText("Slab City")).toBeTruthy();
    expect(screen.getByText("Alice Sender")).toBeTruthy();
  });

  // ── Status filter tabs ──────────────────────────────────────────

  it("filters tickets by status when tabs are pressed", () => {
    __mockTicketsData.tickets = mockTickets;
    render(<MaintenanceScreen />);

    // "All" tab is active by default — all 3 tickets visible
    expect(screen.getByText("Crimpy McSlab")).toBeTruthy();
    expect(screen.getByText("The Overhang")).toBeTruthy();
    expect(screen.getByText("Slab City")).toBeTruthy();

    // Tap "Open" tab — only open ticket visible
    fireEvent.press(screen.getByText("Open"));
    expect(screen.getByText("Crimpy McSlab")).toBeTruthy();
    expect(screen.queryByText("The Overhang")).toBeNull();
    expect(screen.queryByText("Slab City")).toBeNull();

    // Tap "In Progress" tab
    fireEvent.press(screen.getByText("In Progress"));
    expect(screen.queryByText("Crimpy McSlab")).toBeNull();
    expect(screen.getByText("The Overhang")).toBeTruthy();
    expect(screen.queryByText("Slab City")).toBeNull();

    // Tap "Resolved" tab
    fireEvent.press(screen.getByText("Resolved"));
    expect(screen.queryByText("Crimpy McSlab")).toBeNull();
    expect(screen.queryByText("The Overhang")).toBeNull();
    expect(screen.getByText("Slab City")).toBeTruthy();
  });

  // ── Action buttons ──────────────────────────────────────────────

  it("shows 'Start Work' button on open tickets and calls updateTicketStatus", () => {
    __mockTicketsData.tickets = [mockTickets[0]]; // open ticket
    render(<MaintenanceScreen />);

    const startButton = screen.getByText("Start Work");
    expect(startButton).toBeTruthy();

    fireEvent.press(startButton);

    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      ticketId: "t1",
      status: "in_progress",
    });
  });

  it("shows 'Resolve' button on in_progress tickets and calls updateTicketStatus", () => {
    __mockTicketsData.tickets = [mockTickets[1]]; // in_progress ticket
    render(<MaintenanceScreen />);

    const resolveButton = screen.getByText("Resolve");
    expect(resolveButton).toBeTruthy();

    fireEvent.press(resolveButton);

    expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
      ticketId: "t2",
      status: "resolved",
      resolvedBy: "admin-1",
    });
  });

  it("shows no action buttons on resolved tickets", () => {
    __mockTicketsData.tickets = [mockTickets[2]]; // resolved ticket
    render(<MaintenanceScreen />);

    expect(screen.queryByText("Start Work")).toBeNull();
    expect(screen.queryByText("Resolve")).toBeNull();
  });

  it("calls deleteTicket when delete button is pressed", () => {
    __mockTicketsData.tickets = [mockTickets[0]]; // open ticket
    render(<MaintenanceScreen />);

    // Find the delete button by testID
    const deleteButton = screen.getByTestId("delete-ticket-t1");
    fireEvent.press(deleteButton);

    expect(mockDeleteMutateAsync).toHaveBeenCalledWith({ ticketId: "t1" });
  });

  it("renders the screen header", () => {
    render(<MaintenanceScreen />);
    expect(screen.getByText("Maintenance Tickets")).toBeTruthy();
  });
});
