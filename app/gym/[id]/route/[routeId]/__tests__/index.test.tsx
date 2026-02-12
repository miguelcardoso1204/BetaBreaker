/**
 * Route Detail Screen Tests
 *
 * Tests the screen that displays all metadata about a single climbing route.
 * Users reach this screen by tapping a RouteCard on the Gym Routes list.
 *
 * This screen shows:
 *   - Route name, color swatch, grade, wall section, setter, status badge
 *   - Favorite toggle (star icon button)
 *   - "Add Ascent" CTA button (placeholder until Phase 5)
 *   - Video submissions section (empty state until Phase 12)
 *   - "Retiring Soon" banner when status is "retiring_soon"
 *
 * Mock strategy (matching routes.test.tsx patterns):
 *   - expo-router: provides gymId and routeId via useLocalSearchParams
 *   - useRouteDetail: controls the route data / loading / error states
 *   - useIsFavorite / useToggleFavorite: controls favorite state
 *   - lucide-react-native: replaces SVG icons with simple test Views
 *   - @/utils/grades: returns controlled grade display strings
 *   - Alert: capture alert calls for the Add Ascent placeholder
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────

// Mock expo-router — provide gymId and routeId via useLocalSearchParams.
const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "gym-1", routeId: "route-1" }),
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

// Mock useRouteDetail — control the route data returned to the screen.
// We use the __mockData pattern from routes.test.tsx so tests can
// mutate the mock state before rendering.
jest.mock("@/hooks/useRoutes", () => {
  const mockData = {
    data: null as any | null,
    isLoading: false,
    error: null as Error | null,
  };
  return {
    useRouteDetail: () => mockData,
    __mockData: mockData,
    // Also export useRoutes in case it's imported elsewhere
    useRoutes: jest.fn(),
  };
});

// Mock useSavedRoutes — control favorite state and capture toggle calls.
const mockMutate = jest.fn();
jest.mock("@/hooks/useSavedRoutes", () => ({
  useIsFavorite: () => ({
    isFavorite: false,
    isLoading: false,
  }),
  useToggleFavorite: () => ({
    mutate: mockMutate,
  }),
}));

// Mock useAuth — provide user for feedback features.
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    session: { user: { id: "user-1" } },
    isAuthenticated: true,
  }),
}));

// Mock useFeedback — control beta tips data and capture mutation calls.
// Uses __mockFeedbackData so tests can mutate the feedback state.
const mockCreateFeedback = jest.fn();
const mockDeleteFeedback = jest.fn();
const mockVoteFeedback = jest.fn();
jest.mock("@/hooks/useFeedback", () => {
  const mockFeedbackData = {
    feedback: [] as any[],
    userVotes: {} as Record<string, string>,
  };
  return {
    useRouteFeedback: () => ({
      ...mockFeedbackData,
      isLoading: false,
      error: null,
    }),
    useCreateFeedback: () => ({
      mutate: mockCreateFeedback,
      isPending: false,
    }),
    useDeleteFeedback: () => ({
      mutate: mockDeleteFeedback,
    }),
    useVoteFeedback: () => ({
      mutate: mockVoteFeedback,
    }),
    __mockFeedbackData: mockFeedbackData,
  };
});

// Mock useModeration — used by ReportSheet which is rendered inside the
// route detail screen. We mock it to prevent actual service calls.
const mockCreateReport = jest.fn();
jest.mock("@/hooks/useModeration", () => ({
  useCreateReport: () => ({
    mutate: mockCreateReport,
    isPending: false,
    isSuccess: false,
  }),
}));

// Mock grades utility — return a controlled display string so we can
// verify the screen formats grades correctly without testing the grade
// conversion logic (that has its own tests in utils/__tests__/grades.test.ts).
jest.mock("@/utils/grades", () => ({
  canonicalToDisplay: jest.fn().mockReturnValue("V4"),
}));

// Mock lucide-react-native — replace SVG icon components with simple
// Views that have testIDs. This avoids native SVG rendering in tests
// and lets us verify which icons are rendered.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Star: (props: any) => <View testID="icon-star" {...props} />,
    ArrowLeft: (props: any) => <View testID="icon-arrow-left" {...props} />,
    ThumbsUp: (props: any) => <View testID="icon-thumbs-up" {...props} />,
    ThumbsDown: (props: any) => <View testID="icon-thumbs-down" {...props} />,
    Trash2: (props: any) => <View testID="icon-trash" {...props} />,
    Send: (props: any) => <View testID="icon-send" {...props} />,
    Flag: (props: any) => <View testID="icon-flag" {...props} />,
    Video: (props: any) => <View testID="icon-video" {...props} />,
    Upload: (props: any) => <View testID="icon-upload" {...props} />,
    ShieldCheck: (props: any) => <View testID="icon-shield-check" {...props} />,
    Square: (props: any) => <View testID="icon-square" {...props} />,
    CheckSquare: (props: any) => <View testID="icon-check-square" {...props} />,
  };
});

// Mock expo-image — native module unavailable in Jest
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return {
    Image: (props: any) => <View testID="expo-image" {...props} />,
  };
});

// Mock useMedia — control media list and capture delete mutation calls.
const mockDeleteMedia = jest.fn();
jest.mock("@/hooks/useMedia", () => {
  const mockMediaData = {
    media: [] as any[],
  };
  return {
    useRouteMedia: () => ({
      ...mockMediaData,
      isLoading: false,
      error: null,
    }),
    useDeleteMedia: () => ({
      mutate: mockDeleteMedia,
    }),
    // useUploadVideo mock for VideoUploadButton rendered inside the screen
    useUploadVideo: () => ({
      mutate: jest.fn(),
      isPending: false,
      isError: false,
      error: null,
    }),
    __mockMediaData: mockMediaData,
  };
});

// Mock mediaService — used for extractStoragePath in the delete flow.
jest.mock("@/services/media.service", () => ({
  mediaService: {
    extractStoragePath: jest.fn().mockReturnValue("user-1/route-1/12345.mp4"),
  },
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

// Alert import removed — the Add Ascent button now navigates to the
// Full Ascent Form instead of showing a placeholder dialog.

import RouteDetailScreen from "../index";
import { canonicalToDisplay } from "@/utils/grades";

const { __mockData } = jest.requireMock<{
  __mockData: {
    data: any | null;
    isLoading: boolean;
    error: Error | null;
  };
}>("@/hooks/useRoutes");

const { __mockFeedbackData } = jest.requireMock<{
  __mockFeedbackData: {
    feedback: any[];
    userVotes: Record<string, string>;
  };
}>("@/hooks/useFeedback");

const { __mockMediaData } = jest.requireMock<{
  __mockMediaData: {
    media: any[];
  };
}>("@/hooks/useMedia");

// ── Fixtures ─────────────────────────────────────────────────────

/** A full route object matching the shape returned by getRouteById */
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

// ── Helper ───────────────────────────────────────────────────────

/** Reset mock data to default (no data, not loading, no error). */
function resetMockData() {
  __mockData.data = null;
  __mockData.isLoading = false;
  __mockData.error = null;
  __mockFeedbackData.feedback = [];
  __mockFeedbackData.userVotes = {};
  __mockMediaData.media = [];
}

// ── Tests ────────────────────────────────────────────────────────

describe("RouteDetailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
  });

  // ── Loading & Error states ──────────────────────────────────────

  it("shows loading indicator when isLoading is true", () => {
    __mockData.isLoading = true;

    render(<RouteDetailScreen />);

    expect(screen.getByTestId("loading-indicator")).toBeOnTheScreen();
  });

  it("shows error state when error is present", () => {
    __mockData.error = new Error("Network error");

    render(<RouteDetailScreen />);

    expect(screen.getByTestId("error-state")).toBeOnTheScreen();
    expect(screen.getByText("Network error")).toBeOnTheScreen();
  });

  // ── Route info rendering ───────────────────────────────────────

  it("renders route name, wall section, setter name, and status badge", () => {
    // The route detail screen should display all key metadata about
    // the route so climbers know what they're looking at.
    __mockData.data = mockRoute;

    render(<RouteDetailScreen />);

    // Route name should be prominently displayed
    expect(screen.getByText("Crimpy Arete")).toBeOnTheScreen();
    // Wall section helps climbers find the route in the gym
    expect(screen.getByText(/North Wall/)).toBeOnTheScreen();
    // Setter name gives credit and helps climbers find similar styles
    expect(screen.getByText(/Sam Setter/)).toBeOnTheScreen();
    // Status badge shows the route's lifecycle state
    expect(screen.getByText("Active")).toBeOnTheScreen();
    // Color swatch should be rendered (the large visual identifier)
    expect(screen.getByTestId("color-swatch")).toBeOnTheScreen();
  });

  it("displays the converted grade using canonicalToDisplay", () => {
    // Grades are stored as canonical integers (0-30) in the database.
    // The screen must convert them to human-readable display strings
    // using the user's preferred grade system (hardcoded to v-scale for now).
    __mockData.data = mockRoute;

    render(<RouteDetailScreen />);

    // Verify canonicalToDisplay was called with the correct grade
    expect(canonicalToDisplay).toHaveBeenCalledWith(10, "v-scale");
    // The display string "V4" (from our mock) should be visible
    expect(screen.getByText(/V4/)).toBeOnTheScreen();
  });

  // ── Beta videos section ────────────────────────────────────────

  it("shows Video Submissions heading and empty state when no media", () => {
    // When no videos have been uploaded yet, show an encouraging
    // empty state message plus the upload button.
    __mockData.data = mockRoute;

    render(<RouteDetailScreen />);

    expect(screen.getByText("Video Submissions")).toBeOnTheScreen();
    expect(
      screen.getByText(/No beta videos yet/)
    ).toBeOnTheScreen();
    // VideoUploadButton should be present even with no media
    expect(screen.getByTestId("video-upload-button")).toBeOnTheScreen();
  });

  it("renders media items when videos exist", () => {
    // When videos have been uploaded, the screen should show each
    // uploader's name and the upload date.
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-1",
        route_id: "route-1",
        user_id: "user-2",
        url: "https://example.com/video.mp4",
        type: "video",
        created_at: "2026-02-12T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    expect(screen.getByText("Alex")).toBeOnTheScreen();
    expect(screen.getByTestId("media-item-media-1")).toBeOnTheScreen();
    // Empty state should NOT be shown when media exists
    expect(screen.queryByTestId("empty-videos")).toBeNull();
  });

  it("shows delete button only for own media uploads", () => {
    // Users should only see the Delete button on their own uploads.
    // The current user is "user-1" (from the auth mock).
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-own",
        route_id: "route-1",
        user_id: "user-1", // current user's upload
        url: "https://example.com/own.mp4",
        type: "video",
        created_at: "2026-02-12T00:00:00Z",
        profile: { display_name: "Me", avatar_url: null },
      },
      {
        id: "media-other",
        route_id: "route-1",
        user_id: "user-2", // another user's upload
        url: "https://example.com/other.mp4",
        type: "video",
        created_at: "2026-02-11T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    // Own upload should have a delete button
    expect(screen.getByTestId("delete-media-media-own")).toBeOnTheScreen();
    // Other user's upload should NOT have a delete button
    expect(screen.queryByTestId("delete-media-media-other")).toBeNull();
  });

  // ── Favorite button ────────────────────────────────────────────

  it("renders star icon button and calls toggleFavorite on press", () => {
    // The star IconButton is the primary way users save routes.
    // Tapping it should call the toggle mutation.
    __mockData.data = mockRoute;

    render(<RouteDetailScreen />);

    const starButton = screen.getByTestId("favorite-button");
    expect(starButton).toBeOnTheScreen();

    fireEvent.press(starButton);

    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  // ── Add Ascent button ──────────────────────────────────────────

  it("renders Add Ascent button and navigates to ascent form on press", () => {
    // The "Add Ascent" button navigates to the Full Ascent Form
    // sub-route at /gym/[id]/route/[routeId]/ascent.
    __mockData.data = mockRoute;

    render(<RouteDetailScreen />);

    const addAscentButton = screen.getByText("Add Ascent");
    expect(addAscentButton).toBeOnTheScreen();

    fireEvent.press(addAscentButton);

    expect(mockPush).toHaveBeenCalledWith("/gym/gym-1/route/route-1/ascent");
  });

  // ── Status banner ──────────────────────────────────────────────

  it("shows Retiring Soon banner when status is retiring_soon", () => {
    // Routes have a lifecycle: active → retiring_soon → archived.
    // When a route is "retiring_soon", a warning banner alerts climbers
    // that the route will be taken off the wall soon.
    __mockData.data = { ...mockRoute, status: "retiring_soon" };

    render(<RouteDetailScreen />);

    expect(screen.getByTestId("status-banner")).toBeOnTheScreen();
    // Use the exact banner text to avoid matching the status badge as well
    expect(screen.getByText("This route is retiring soon!")).toBeOnTheScreen();
  });

  it("does not show status banner when status is active", () => {
    // Active routes don't need a warning banner — they're in normal state.
    __mockData.data = mockRoute;

    render(<RouteDetailScreen />);

    expect(screen.queryByTestId("status-banner")).toBeNull();
  });

  // ── Beta Tips section ──────────────────────────────────────────

  it("shows Beta Tips section heading", () => {
    // The Beta Tips section should always appear on route detail
    // when data is loaded, even if there are no tips yet.
    __mockData.data = mockRoute;

    render(<RouteDetailScreen />);

    expect(screen.getByText("Beta Tips")).toBeOnTheScreen();
  });

  it("shows FeedbackComposer", () => {
    // Authenticated users should see the tip submission form.
    __mockData.data = mockRoute;

    render(<RouteDetailScreen />);

    expect(
      screen.getByPlaceholderText("Share a tip for this route...")
    ).toBeOnTheScreen();
  });

  it("renders feedback items when data exists", () => {
    // When tips exist, the screen should render each one as a
    // FeedbackItem component showing the author and body text.
    __mockData.data = mockRoute;
    __mockFeedbackData.feedback = [
      {
        id: "fb-1",
        route_id: "route-1",
        user_id: "user-2",
        body: "Start with left hand on the jug",
        score: 3,
        created_at: "2026-02-10T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    expect(
      screen.getByText("Start with left hand on the jug")
    ).toBeOnTheScreen();
    expect(screen.getByText("Beta Tips (1)")).toBeOnTheScreen();
  });

  it("shows empty state when no feedback", () => {
    // When there are no tips yet, show an encouraging empty state
    // message instead of a blank space.
    __mockData.data = mockRoute;
    __mockFeedbackData.feedback = [];

    render(<RouteDetailScreen />);

    expect(
      screen.getByText("No beta tips yet — share your knowledge!")
    ).toBeOnTheScreen();
  });

  it("shows report button on other users' feedback items", () => {
    // Feedback items authored by other users should show a Flag icon
    // for reporting. The current user is "user-1" (from the auth mock),
    // so feedback by "user-2" should show the report button.
    __mockData.data = mockRoute;
    __mockFeedbackData.feedback = [
      {
        id: "fb-1",
        route_id: "route-1",
        user_id: "user-2",
        body: "Some tip",
        score: 0,
        created_at: "2026-02-10T00:00:00Z",
        profile: { display_name: "Other User", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    expect(screen.getByTestId("report-button")).toBeOnTheScreen();
  });
});
