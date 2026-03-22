/**
 * FeedbackItem Component Tests
 *
 * Tests the individual beta tip card that displays:
 *   - Author avatar + display name + relative timestamp
 *   - Tip body text
 *   - Like button (right-aligned) with score display
 *   - Delete button (only visible for the tip's author)
 *
 * The component is a presentational (dumb) component — it receives
 * all data and callbacks via props. No hooks or service calls here.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// Mock lucide-react-native — replace SVG icons with testable Views
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Heart: (props: any) => <View testID="icon-heart" {...props} />,
    Trash2: (props: any) => <View testID="icon-trash" {...props} />,
    Flag: (props: any) => <View testID="icon-flag" {...props} />,
  };
});

// Mock expo-router — FeedbackItem now uses useRouter for profile navigation.
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock expo-image — native module unavailable in Jest
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return {
    Image: (props: any) => <View testID="expo-image" {...props} />,
  };
});

import { FeedbackItem, FeedbackItemProps } from "../FeedbackItem";

// ── Fixtures ──────────────────────────────────────────────────────

const baseFeedback = {
  id: "fb-1",
  route_id: "route-1",
  user_id: "user-2",
  body: "Start with left hand on the jug, right on the crimp",
  score: 5,
  created_at: "2026-02-10T12:00:00Z",
  profile: { display_name: "Alex Climber", avatar_url: null },
};

const defaultProps: FeedbackItemProps = {
  feedback: baseFeedback,
  userVote: null,
  currentUserId: "user-1",
  onVote: jest.fn(),
  onDelete: jest.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────

describe("FeedbackItem", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders display name and body text", () => {
    // The tip card should show who wrote it and what the tip says.
    render(<FeedbackItem {...defaultProps} />);

    expect(screen.getByText("Alex Climber")).toBeOnTheScreen();
    expect(
      screen.getByText("Start with left hand on the jug, right on the crimp")
    ).toBeOnTheScreen();
  });

  it("renders score next to like button when score > 0", () => {
    render(<FeedbackItem {...defaultProps} />);

    expect(screen.getByText("5")).toBeOnTheScreen();
  });

  it("hides score when score is 0", () => {
    render(
      <FeedbackItem
        {...defaultProps}
        feedback={{ ...baseFeedback, score: 0 }}
      />
    );

    expect(screen.queryByText("0")).toBeNull();
  });

  it("shows filled red heart when liked", () => {
    render(<FeedbackItem {...defaultProps} userVote="up" />);

    const icon = screen.getByTestId("icon-heart");
    expect(icon.props.color).toBe("#EF4444");
    expect(icon.props.fill).toBe("#EF4444");
  });

  it("shows outline gray heart when not liked", () => {
    render(<FeedbackItem {...defaultProps} userVote={null} />);

    const icon = screen.getByTestId("icon-heart");
    expect(icon.props.color).toBe("#9CA3AF");
    expect(icon.props.fill).toBe("none");
  });

  it("calls onVote('up') when heart pressed", () => {
    const onVote = jest.fn();
    render(<FeedbackItem {...defaultProps} onVote={onVote} />);

    fireEvent.press(screen.getByTestId("like-button"));

    expect(onVote).toHaveBeenCalledWith("fb-1", "up");
  });

  it("shows delete button only for own feedback", () => {
    // The trash icon should only appear when the current user is
    // the author of the tip (prevents confusion about deleting
    // other people's tips — RLS would block it anyway).
    const { rerender } = render(<FeedbackItem {...defaultProps} />);

    // Not the author — delete button should be absent
    expect(screen.queryByTestId("delete-button")).toBeNull();

    // Now render as the author (currentUserId matches feedback.user_id)
    rerender(
      <FeedbackItem {...defaultProps} currentUserId="user-2" />
    );

    expect(screen.getByTestId("delete-button")).toBeOnTheScreen();
  });

  it("calls onDelete when delete pressed", () => {
    // Tapping the trash button should call onDelete with the feedback ID.
    const onDelete = jest.fn();
    render(
      <FeedbackItem
        {...defaultProps}
        currentUserId="user-2"
        onDelete={onDelete}
      />
    );

    fireEvent.press(screen.getByTestId("delete-button"));

    expect(onDelete).toHaveBeenCalledWith("fb-1");
  });

  it("shows report button for non-author when onReport is provided", () => {
    // The report flag should appear for other users' tips (not your own).
    // It only renders when the onReport callback is provided.
    const onReport = jest.fn();
    render(
      <FeedbackItem {...defaultProps} onReport={onReport} />
    );

    // currentUserId is "user-1", feedback.user_id is "user-2" → not author
    const reportButton = screen.getByTestId("report-button");
    expect(reportButton).toBeOnTheScreen();

    fireEvent.press(reportButton);
    expect(onReport).toHaveBeenCalledWith("fb-1");
  });
});
