/**
 * Community Guidelines Screen Tests
 *
 * Tests the static informational screen that outlines community guidelines.
 * This screen is linked from the report flow and settings to help users
 * understand what behavior is acceptable on the platform.
 */

import React from "react";
import { render, screen } from "@testing-library/react-native";

// Mock expo-router — the guidelines screen uses router.back()
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

import GuidelinesScreen from "../guidelines";

describe("GuidelinesScreen", () => {
  it("renders community guidelines heading", () => {
    render(<GuidelinesScreen />);

    expect(screen.getByText("Community Guidelines")).toBeOnTheScreen();
  });

  it("renders key guideline sections", () => {
    // The guidelines screen should contain all major section headings
    // that cover the platform's behavioral expectations.
    render(<GuidelinesScreen />);

    expect(screen.getByText("Be Respectful")).toBeOnTheScreen();
    expect(screen.getByText("No Spam")).toBeOnTheScreen();
    expect(screen.getByText("Safety First")).toBeOnTheScreen();
    expect(screen.getByText("Report Violations")).toBeOnTheScreen();
  });
});
