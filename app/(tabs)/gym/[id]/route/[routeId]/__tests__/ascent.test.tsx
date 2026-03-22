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
    ChevronLeft: (props: any) => <View testID="icon-chevron-left" {...props} />,
    Minus: (props: any) => <View testID="icon-minus" {...props} />,
    Plus: (props: any) => <View testID="icon-plus" {...props} />,
    Video: (props: any) => <View testID="icon-video" {...props} />,
    Upload: (props: any) => <View testID="icon-upload" {...props} />,
    ShieldCheck: (props: any) => <View testID="icon-shield-check" {...props} />,
    Square: (props: any) => <View testID="icon-square" {...props} />,
    CheckSquare: (props: any) => <View testID="icon-check-square" {...props} />,
  };
});

// Mock useFeedback — the ascent form posts comments as beta tips via
// useCreateFeedback. We track the mutate calls to verify it's called.
const mockCreateFeedback = jest.fn();
jest.mock("@/hooks/useFeedback", () => ({
  useCreateFeedback: () => ({
    mutate: mockCreateFeedback,
    isPending: false,
  }),
}));

// Mock GradeSlider — renders a simplified slider that exposes value and
// allows tests to simulate grade changes via onValueChange.
jest.mock("@/components/ui/GradeSlider", () => {
  const { View, Text, Pressable } = require("react-native");
  return {
    GradeSlider: (props: any) => (
      <View testID="grade-slider">
        <Text testID="grade-slider-value">{props.value}</Text>
        {/* Pressable that simulates changing to grade 12 (V4) */}
        <Pressable
          testID="grade-slider-change"
          onPress={() => props.onChange(12)}
        />
      </View>
    ),
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
jest.mock("expo-file-system/next", () => ({
  File: jest.fn().mockImplementation(() => ({ size: 10 * 1024 * 1024 })),
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

  // ── 2. Grade slider renders ────────────────────────────────────

  it("renders the grade slider section", () => {
    render(<AscentFormScreen />);

    expect(screen.getByText("What grade do you think this is?")).toBeOnTheScreen();
    expect(screen.getByTestId("grade-slider")).toBeOnTheScreen();
  });

  // ── 3. Grade slider defaults to route grade ──────────────────────

  it("grade slider defaults to the route's canonical grade", () => {
    render(<AscentFormScreen />);

    // The mock route has canonical_grade: 10. The slider value should
    // show 10 by default (since perceivedGrade state starts as null,
    // the component falls back to route.canonical_grade).
    expect(screen.getByTestId("grade-slider-value")).toHaveTextContent("10");
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

    expect(screen.getByText("Share")).toBeOnTheScreen();
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
  });

  // ── 10. Submit calls logAscent with correct args ────────────────

  it("calls logAscent.mutate with form data when submitted", () => {
    render(<AscentFormScreen />);

    // Select "send" status — attempts auto-set to 2
    fireEvent.press(screen.getByTestId("status-send"));

    // Increase attempts: 2 → 3 → 4
    fireEvent.press(screen.getByTestId("attempts-increment"));
    fireEvent.press(screen.getByTestId("attempts-increment"));

    // Adjust perceived grade via slider (mock fires onChange(12))
    fireEvent.press(screen.getByTestId("grade-slider-change"));

    // Type a comment
    fireEvent.changeText(screen.getByTestId("comment-input"), "Nice moves!");

    // Submit
    fireEvent.press(screen.getByTestId("submit-ascent-button"));

    expect(mockMutate).toHaveBeenCalledWith({
      routeId: "route-1",
      status: "send",
      attempts: 4,
      notes: "Nice moves!",
      perceivedGrade: 12,
      rating: undefined,
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
    // Rating, comment, and style tags are all optional.
    // The minimum required input is selecting a status.
    render(<AscentFormScreen />);

    // Select "send" status — attempts auto-set to 2 (minimum for send)
    fireEvent.press(screen.getByTestId("status-send"));

    // Submit without filling any optional fields
    fireEvent.press(screen.getByTestId("submit-ascent-button"));

    expect(mockMutate).toHaveBeenCalledWith({
      routeId: "route-1",
      status: "send",
      attempts: 2,
      notes: undefined,
      perceivedGrade: undefined,
      rating: undefined,
    });
  });

  // ── 13. Comment posted as beta tip ──────────────────────────────

  it("posts comment as beta tip when comment is non-empty", () => {
    // When the user writes a comment in the ascent form, it should
    // also be saved as a route_feedback row so it appears in the
    // Beta Tips section on the route detail screen.
    render(<AscentFormScreen />);

    fireEvent.press(screen.getByTestId("status-send"));
    fireEvent.changeText(screen.getByTestId("comment-input"), "Use the heel hook!");
    fireEvent.press(screen.getByTestId("submit-ascent-button"));

    expect(mockCreateFeedback).toHaveBeenCalledWith({ body: "Use the heel hook!" });
  });

  it("does not post beta tip when comment is empty", () => {
    // An empty comment should NOT create a feedback row.
    render(<AscentFormScreen />);

    fireEvent.press(screen.getByTestId("status-flash"));
    fireEvent.press(screen.getByTestId("submit-ascent-button"));

    expect(mockCreateFeedback).not.toHaveBeenCalled();
  });
});
