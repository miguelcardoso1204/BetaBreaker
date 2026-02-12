/**
 * Full Ascent Form Screen Tests
 *
 * Tests the rich ascent logging form accessed from Route Detail's "Add Ascent"
 * button. This form captures status, attempts, star rating, comments, style
 * tags, and a video upload placeholder — going beyond QuickLog's simple modal.
 *
 * Mock strategy:
 *   - expo-router: provides id/routeId via useLocalSearchParams + router.back()
 *   - @/hooks/useRoutes: controls route data for the header card
 *   - @/hooks/useSession: provides logAscent mutation mock
 *   - lucide-react-native: replaces SVG icons with simple Views
 *   - expo-haptics: prevents native module errors in test environment
 *   - @/utils/grades: returns controlled grade display strings
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────────

// Mock expo-router for URL params and navigation.
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "gym-1", routeId: "route-1" }),
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

// Mock useRouteDetail — control route data for the header card.
// Uses the __mockData pattern so tests can mutate state before rendering.
jest.mock("@/hooks/useRoutes", () => {
  const mockData = {
    data: null as any | null,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useRouteDetail: () => mockData,
    __mockData: mockData,
    useRoutes: jest.fn(),
  };
});

// Mock useSession — provides the logAscent mutation.
// We track mutate calls to verify the form submits correct data.
const mockMutate = jest.fn();
jest.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    logAscent: {
      mutate: mockMutate,
      isPending: false,
    },
  }),
}));

// Mock grades utility — return a controlled display string.
jest.mock("@/utils/grades", () => ({
  canonicalToDisplay: jest.fn().mockReturnValue("V4"),
}));

// Mock lucide-react-native — replace SVG icons with simple Views.
// The Star mock exposes color/fill via accessibilityHint so the star
// rating interaction test can verify which stars are gold vs gray.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Star: (props: any) => (
      <View
        testID="mock-star-icon"
        accessibilityHint={`color:${props.color},fill:${props.fill}`}
        {...props}
      />
    ),
    Minus: (props: any) => <View testID="icon-minus" {...props} />,
    Plus: (props: any) => <View testID="icon-plus" {...props} />,
    Video: (props: any) => <View testID="icon-video" {...props} />,
    Upload: (props: any) => <View testID="icon-upload" {...props} />,
    ShieldCheck: (props: any) => <View testID="icon-shield-check" {...props} />,
    Square: (props: any) => <View testID="icon-square" {...props} />,
    CheckSquare: (props: any) => <View testID="icon-check-square" {...props} />,
  };
});

// Mock expo-haptics — prevent native module errors in jest.
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success" },
}));

// Mock useAuth — VideoUploadButton needs a user ID.
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

// Mock useMedia — VideoUploadButton uses useUploadVideo internally.
jest.mock("@/hooks/useMedia", () => ({
  useUploadVideo: () => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

// Mock expo-image-picker — used by VideoUploadButton.
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  MediaTypeOptions: { Videos: "Videos" },
  UIImagePickerControllerQualityType: { Medium: 1 },
}));

// Mock expo-file-system — used by VideoUploadButton for file size.
jest.mock("expo-file-system", () => ({
  getInfoAsync: jest.fn(),
}));

import AscentFormScreen from "../ascent";

// Access the mutable mock data object so tests can configure route state.
const { __mockData } = jest.requireMock<{
  __mockData: {
    data: any | null;
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useRoutes");

// ── Fixtures ─────────────────────────────────────────────────────────

/** Route data matching the shape returned by routeService.getRouteById. */
const mockRoute = {
  id: "route-1",
  name: "Crimpy Arete",
  canonical_grade: 10,
  status: "active",
  color: "#EF4444",
  gym_id: "gym-1",
  wall_section: "North Wall",
  created_at: "2026-01-15T00:00:00Z",
  setter_id: "setter-1",
  setter: {
    display_name: "Sam Setter",
    avatar_url: null,
  },
};

// ── Helper ───────────────────────────────────────────────────────────

function resetMockData() {
  __mockData.data = null;
  __mockData.isLoading = false;
  __mockData.error = null;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("AscentFormScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
    // Set route data for most tests — individual tests override as needed.
    __mockData.data = mockRoute;
  });

  // ── 1. Route header card renders ────────────────────────────────

  it("renders the route header card with name and grade", () => {
    // The header card provides context — the user needs to see which
    // route they're logging an ascent for.
    render(<AscentFormScreen />);

    expect(screen.getByText("Crimpy Arete")).toBeOnTheScreen();
    expect(screen.getByText("V4")).toBeOnTheScreen();
    expect(screen.getByTestId("route-header")).toBeOnTheScreen();
  });

  // ── 2. Star rating renders ──────────────────────────────────────

  it("renders the star rating section with 5 stars", () => {
    render(<AscentFormScreen />);

    // The "How would you rate this route?" label should be visible.
    expect(screen.getByText("How would you rate this route?")).toBeOnTheScreen();

    // All 5 star buttons should be present.
    expect(screen.getByTestId("star-1")).toBeOnTheScreen();
    expect(screen.getByTestId("star-2")).toBeOnTheScreen();
    expect(screen.getByTestId("star-3")).toBeOnTheScreen();
    expect(screen.getByTestId("star-4")).toBeOnTheScreen();
    expect(screen.getByTestId("star-5")).toBeOnTheScreen();
  });

  // ── 3. Star rating interactive ──────────────────────────────────

  it("star rating changes when a star is tapped", () => {
    // Tapping a star should update the visual state. We verify by
    // checking the icon's fill color changes from gray to gold.
    render(<AscentFormScreen />);

    // Tap star 4
    fireEvent.press(screen.getByTestId("star-4"));

    // After tapping star 4, stars 1-4 should be gold (filled).
    // The mock icon exposes color via accessibilityHint.
    const icons = screen.getAllByTestId("mock-star-icon");
    expect(icons[0].props.accessibilityHint).toContain("color:#F59E0B");
    expect(icons[3].props.accessibilityHint).toContain("color:#F59E0B");
    // Star 5 should remain gray.
    expect(icons[4].props.accessibilityHint).toContain("color:#6B7280");
  });

  // ── 4. Video upload button renders ──────────────────────────────

  it("renders the VideoUploadButton component", () => {
    // VideoUploadButton replaced the Phase 12 placeholder.
    // It shows the same "Add Beta Video" text and testID.
    render(<AscentFormScreen />);

    expect(screen.getByText("Add Beta Video")).toBeOnTheScreen();
    expect(screen.getByTestId("video-upload-button")).toBeOnTheScreen();
  });

  // ── 5. Comment textarea renders ─────────────────────────────────

  it("renders the comment input with placeholder", () => {
    render(<AscentFormScreen />);

    expect(screen.getByText("Comments")).toBeOnTheScreen();
    expect(screen.getByTestId("comment-input")).toBeOnTheScreen();
    expect(
      screen.getByPlaceholderText("Share your beta, conditions, or thoughts...")
    ).toBeOnTheScreen();
  });

  // ── 6. Character counter updates ────────────────────────────────

  it("updates the character counter as text is typed", () => {
    render(<AscentFormScreen />);

    // Initially the counter should show "0/200".
    expect(screen.getByTestId("char-counter")).toHaveTextContent("0/200");

    // Type some text into the comment field.
    fireEvent.changeText(screen.getByTestId("comment-input"), "Great route!");

    // Counter should reflect the typed text length.
    expect(screen.getByTestId("char-counter")).toHaveTextContent("12/200");
  });

  // ── 7. Style tags render ────────────────────────────────────────

  it("renders all 6 style tag labels", () => {
    render(<AscentFormScreen />);

    expect(screen.getByText("Climbing Style")).toBeOnTheScreen();
    expect(screen.getByText("Power")).toBeOnTheScreen();
    expect(screen.getByText("Finger Strength")).toBeOnTheScreen();
    expect(screen.getByText("Footwork")).toBeOnTheScreen();
    expect(screen.getByText("Dynamic Movement")).toBeOnTheScreen();
    expect(screen.getByText("Core Strength")).toBeOnTheScreen();
    expect(screen.getByText("Technique")).toBeOnTheScreen();
  });

  // ── 8. Style tags multi-select ──────────────────────────────────

  it("toggles style tag selected state on press", () => {
    // Tapping a tag should select it (full opacity).
    // Tapping again should deselect it (dimmed opacity).
    render(<AscentFormScreen />);

    const powerTag = screen.getByTestId("tag-power");

    // Initially unselected — opacity should be 0.4 (dimmed)
    expect(powerTag.props.style).toEqual(
      expect.objectContaining({ opacity: 0.4 })
    );

    // Tap to select — opacity should become 1 (full)
    fireEvent.press(powerTag);
    expect(powerTag.props.style).toEqual(
      expect.objectContaining({ opacity: 1 })
    );

    // Tap again to deselect — back to dimmed
    fireEvent.press(powerTag);
    expect(powerTag.props.style).toEqual(
      expect.objectContaining({ opacity: 0.4 })
    );
  });

  // ── 9. Submit button renders ────────────────────────────────────

  it("renders the Add Ascent submit button", () => {
    render(<AscentFormScreen />);

    expect(screen.getByTestId("submit-ascent-button")).toBeOnTheScreen();
    expect(screen.getByText("Add Ascent")).toBeOnTheScreen();
  });

  // ── 10. Submit calls logAscent with correct args ────────────────

  it("calls logAscent.mutate with form data when submitted", () => {
    render(<AscentFormScreen />);

    // Select "send" status
    fireEvent.press(screen.getByTestId("status-send"));

    // Increase attempts to 3
    fireEvent.press(screen.getByTestId("attempts-increment"));
    fireEvent.press(screen.getByTestId("attempts-increment"));

    // Rate 4 stars
    fireEvent.press(screen.getByTestId("star-4"));

    // Type a comment
    fireEvent.changeText(screen.getByTestId("comment-input"), "Nice moves!");

    // Submit
    fireEvent.press(screen.getByTestId("submit-ascent-button"));

    expect(mockMutate).toHaveBeenCalledWith({
      routeId: "route-1",
      status: "send",
      attempts: 3,
      notes: "Nice moves!",
      perceivedGrade: 4,
    });
  });

  // ── 11. Submit navigates back ───────────────────────────────────

  it("navigates back to Route Detail after successful submit", () => {
    render(<AscentFormScreen />);

    // Select a status (required to enable submit)
    fireEvent.press(screen.getByTestId("status-flash"));

    // Submit
    fireEvent.press(screen.getByTestId("submit-ascent-button"));

    // Should call router.back() to return to Route Detail
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  // ── 12. Empty submit allowed with only status ───────────────────

  it("allows submit with only status set (all other fields optional)", () => {
    // Star rating, comment, and style tags are all optional.
    // The minimum required input is selecting a status.
    render(<AscentFormScreen />);

    // Select "attempt" status
    fireEvent.press(screen.getByTestId("status-attempt"));

    // Submit without filling any optional fields
    fireEvent.press(screen.getByTestId("submit-ascent-button"));

    // logAscent should be called with just status + defaults.
    // notes and perceivedGrade should be undefined (not sent to DB).
    expect(mockMutate).toHaveBeenCalledWith({
      routeId: "route-1",
      status: "attempt",
      attempts: 1,
      notes: undefined,
      perceivedGrade: undefined,
    });
  });
});
