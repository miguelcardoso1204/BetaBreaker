/**
 * FeedItem Component Tests
 *
 * Tests the single activity feed item that shows a followed user's
 * recent ascent. Displays:
 *   - Date (day number + month abbreviation)
 *   - User avatar and display name
 *   - Ascent description (e.g., "sent Crimpy Arete (V4)")
 *
 * Presentational component — receives all data via props.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

// Mock lucide-react-native — not used by FeedItem but may be
// transitively imported
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    ArrowLeft: (props: any) => <View testID="icon-arrow-left" {...props} />,
  };
});

// Mock expo-image — Avatar uses it internally
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return {
    Image: (props: any) => <View testID="expo-image" {...props} />,
  };
});

// Mock grades utility to return controlled grade strings
jest.mock("@/utils/grades", () => ({
  canonicalToDisplay: jest.fn().mockReturnValue("V4"),
}));

import { FeedItem } from "../FeedItem";
import type { ActivityFeedItem } from "../FeedItem";

// ── Fixtures ──────────────────────────────────────────────────────

const mockItem: ActivityFeedItem = {
  id: "ascent-1",
  user_id: "user-2",
  status: "sent",
  attempts: 1,
  created_at: "2026-02-10T14:30:00Z",
  route: {
    name: "Crimpy Arete",
    canonical_grade: 10,
    color: "#EF4444",
  },
  profile: {
    display_name: "Alex Climber",
    avatar_url: null,
  },
};

// ── Tests ────────────────────────────────────────────────────────

describe("FeedItem", () => {
  it("renders user display name and route name", () => {
    render(<FeedItem item={mockItem} />);

    expect(screen.getByText(/Alex Climber/)).toBeOnTheScreen();
    expect(screen.getByText(/Crimpy Arete/)).toBeOnTheScreen();
  });

  it("renders formatted date (day + month)", () => {
    render(<FeedItem item={mockItem} />);

    // Feb 10
    expect(screen.getByText("10")).toBeOnTheScreen();
    expect(screen.getByText("Feb")).toBeOnTheScreen();
  });

  it("renders ascent status text", () => {
    render(<FeedItem item={mockItem} />);

    // "sent" status appears in the description
    expect(screen.getByText(/sent/)).toBeOnTheScreen();
    // Grade is displayed
    expect(screen.getByText(/V4/)).toBeOnTheScreen();
  });
});
