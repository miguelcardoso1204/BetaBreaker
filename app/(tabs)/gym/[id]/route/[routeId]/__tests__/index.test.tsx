/**
 * Route Detail Screen Tests
 *
 * Tests the screen that displays all metadata about a single climbing route.
 * Users reach this screen by tapping a RouteCard on the Gym Routes list.
 *
 * This screen shows:
 *   - Route name, color swatch, grade, wall section, setter, status badge
 *   - "Add Ascent" CTA button (placeholder until Phase 5)
 *   - Video submissions section (empty state until Phase 12)
 *   - "Retiring Soon" banner when status is "retiring_soon"
 *
 * Mock strategy (matching routes.test.tsx patterns):
 *   - expo-router: provides gymId and routeId via useLocalSearchParams
 *   - useRouteDetail: controls the route data / loading / error states
 *   - lucide-react-native: replaces SVG icons with simple test Views
 *   - @/utils/grades: returns controlled grade display strings
 *   - Alert: capture alert calls for the Add Ascent placeholder
 */

import React from "react";
import { Alert } from "react-native";
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
  const mockRatingData = {
    averageRating: null as number | null,
    ratingCount: 0,
    isLoading: false,
  };
  return {
    useRouteDetail: () => mockData,
    useRouteRating: () => mockRatingData,
    __mockData: mockData,
    __mockRatingData: mockRatingData,
    useRoutes: jest.fn(),
  };
});

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
    ChevronLeft: (props: any) => <View testID="icon-chevron-left" {...props} />,
    Heart: (props: any) => <View testID="icon-heart" {...props} />,
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
    ChevronDown: (props: any) => <View testID="icon-chevron-down" {...props} />,
    ChevronUp: (props: any) => <View testID="icon-chevron-up" {...props} />,
  };
});

// Mock FeedbackItem — renders a simplified card that exposes key props
// via testIDs so we can verify the route detail screen passes the right
// data without needing the full FeedbackItem implementation.
jest.mock("@/components/social/FeedbackItem", () => {
  const { View, Text, Pressable } = require("react-native");
  return {
    FeedbackItem: (props: any) => (
      <View testID={`feedback-item-${props.feedback.id}`}>
        <Text>{props.feedback.body}</Text>
        <Text testID="feedback-author">{props.feedback.profile?.display_name}</Text>
        <Text testID="feedback-score">{props.feedback.score}</Text>
        {props.userVote && <Text testID="feedback-user-vote">{props.userVote}</Text>}
        <Pressable testID="like-button" onPress={() => props.onVote(props.feedback.id, "up")} />
        {props.feedback.user_id === props.currentUserId && (
          <Pressable testID="delete-button" onPress={() => props.onDelete(props.feedback.id)} />
        )}
        {props.feedback.user_id !== props.currentUserId && props.onReport && (
          <Pressable testID="report-button" onPress={() => props.onReport(props.feedback.id)} />
        )}
      </View>
    ),
  };
});

// Mock expo-image — native module unavailable in Jest
jest.mock("expo-image", () => {
  const { View } = require("react-native");
  return {
    Image: (props: any) => <View testID="expo-image" {...props} />,
  };
});

// Mock expo-video — BetaVideoPlayer uses useVideoPlayer and VideoView
// for video playback. We mock them to avoid native module errors in Jest.
jest.mock("expo-video", () => {
  const { View } = require("react-native");
  return {
    useVideoPlayer: () => null,
    VideoView: (props: any) => <View testID="video-view" {...props} />,
  };
});

// Mock expo's useEvent — used by BetaVideoPlayer to track player status
jest.mock("expo", () => ({
  useEvent: () => ({ status: "idle" }),
}));

// Mock BetaVideoPlayer — renders as a View with testID so we can verify
// it receives correct props without needing the full video player stack.
// Includes markers for accordion props (isExpanded, onToggleExpand),
// avatar, likes, and like state.
jest.mock("@/components/routes/BetaVideoPlayer", () => {
  const { View, Text, Pressable } = require("react-native");
  return {
    BetaVideoPlayer: (props: any) => (
      <View testID={`beta-video-player-${props.url}`}>
        <Text>{props.uploaderName}</Text>
        <Text>{props.uploadDate}</Text>
        {props.isOwner && <Text testID="owner-marker">Owner</Text>}
        {props.uploaderAvatarUrl && (
          <Text testID="avatar-url-marker">{props.uploaderAvatarUrl}</Text>
        )}
        <Text testID={`likes-count-${props.url}`}>{props.likesCount}</Text>
        {props.isLiked && <Text testID="liked-marker">Liked</Text>}
        {/* Expose isExpanded state so tests can verify accordion behavior */}
        {props.isExpanded && <Text testID={`expanded-${props.url}`}>Expanded</Text>}
        {/* Expose onToggleExpand so tests can simulate tapping a video row */}
        <Pressable testID={`toggle-expand-${props.url}`} onPress={props.onToggleExpand} />
        {/* Expose onDelete as a pressable so tests can trigger it */}
        {props.isOwner && (
          <Pressable testID="mock-delete-button" onPress={props.onDelete} />
        )}
        {/* Expose onReport as a pressable so tests can trigger the ReportSheet */}
        {props.onReport && (
          <Pressable testID="mock-report-button" onPress={props.onReport} />
        )}
      </View>
    ),
  };
});

// Mock ReportSheet — renders as a View with visibility markers so we
// can verify it opens with the correct targetType and targetId.
jest.mock("@/components/social/ReportSheet", () => {
  const { View, Text } = require("react-native");
  return {
    ReportSheet: (props: any) =>
      props.visible ? (
        <View testID="report-sheet">
          <Text testID="report-target-type">{props.targetType}</Text>
          <Text testID="report-target-id">{props.targetId}</Text>
        </View>
      ) : null,
  };
});

// Mock useMedia — control media list, likes, and capture mutation calls.
const mockDeleteMedia = jest.fn();
const mockLikeMedia = jest.fn();
jest.mock("@/hooks/useMedia", () => {
  const mockMediaData = {
    media: [] as any[],
    userLikes: new Set<string>(),
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
    useLikeMedia: () => ({
      mutate: mockLikeMedia,
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

// Mock mediaService — used by components that reference the service.
jest.mock("@/services/media.service", () => ({
  mediaService: {},
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

// Mock sessionStore — controls whether the "Add Ascent" button appears.
// The button is only visible when there's an active session at this gym.
import { useSessionStore } from "@/stores/sessionStore";
jest.mock("@/stores/sessionStore", () => ({
  useSessionStore: jest.fn(),
}));
const mockUseSessionStore = useSessionStore as unknown as jest.Mock;

/**
 * Helper to configure session store mock state.
 * By default: active session at gym-1 (the gym in our route params).
 */
function setSessionState(overrides: { isActive?: boolean; gymId?: string | null } = {}) {
  const state = { isActive: true, gymId: "gym-1", ...overrides };
  mockUseSessionStore.mockImplementation((selector: (s: any) => any) => selector(state));
}

import RouteDetailScreen from "../index";
import { canonicalToDisplay } from "@/utils/grades";

const { __mockData, __mockRatingData } = jest.requireMock<{
  __mockData: {
    data: any | null;
    isLoading: boolean;
    error: Error | null;
  };
  __mockRatingData: {
    averageRating: number | null;
    ratingCount: number;
    isLoading: boolean;
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
    userLikes: Set<string>;
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
  __mockMediaData.userLikes = new Set<string>();
  __mockRatingData.averageRating = null;
  __mockRatingData.ratingCount = 0;
}

// ── Tests ────────────────────────────────────────────────────────

describe("RouteDetailScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockData();
    // Default: active session at this gym so "Add Ascent" tests pass.
    setSessionState();
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

    // Route name appears in both the header bar and the metadata section
    expect(screen.getAllByText("Crimpy Arete").length).toBeGreaterThanOrEqual(1);
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
    // empty state message (no upload button — upload is on the ascent form).
    __mockData.data = mockRoute;

    render(<RouteDetailScreen />);

    expect(screen.getByText("Video Submissions")).toBeOnTheScreen();
    expect(
      screen.getByText(/No beta videos yet/)
    ).toBeOnTheScreen();
  });

  it("renders BetaVideoPlayer for each media item", () => {
    // When videos have been uploaded, the screen should render a
    // BetaVideoPlayer component for each one (not text-only items).
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-1",
        route_id: "route-1",
        user_id: "user-2",
        url: "https://example.com/video.mp4",
        type: "video",
        likes_count: 3,
        created_at: "2026-02-12T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: "https://example.com/alex.jpg" },
      },
    ];

    render(<RouteDetailScreen />);

    // BetaVideoPlayer should be rendered with the video URL
    expect(
      screen.getByTestId("beta-video-player-https://example.com/video.mp4")
    ).toBeOnTheScreen();
    expect(screen.getByText("Alex")).toBeOnTheScreen();
    // Empty state should NOT be shown when media exists
    expect(screen.queryByTestId("empty-videos")).toBeNull();
    // Avatar URL should be passed through to the player
    expect(screen.getByTestId("avatar-url-marker")).toBeOnTheScreen();
    // Likes count should be passed through
    expect(screen.getByTestId("likes-count-https://example.com/video.mp4")).toHaveTextContent("3");
  });

  it("passes correct isOwner prop to BetaVideoPlayer", () => {
    // BetaVideoPlayer receives isOwner=true only for videos uploaded
    // by the current user (user-1). This controls delete button visibility.
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-own",
        route_id: "route-1",
        user_id: "user-1", // current user's upload
        url: "https://example.com/own.mp4",
        type: "video",
        likes_count: 0,
        created_at: "2026-02-12T00:00:00Z",
        profile: { display_name: "Me", avatar_url: null },
      },
      {
        id: "media-other",
        route_id: "route-1",
        user_id: "user-2", // another user's upload
        url: "https://example.com/other.mp4",
        type: "video",
        likes_count: 0,
        created_at: "2026-02-11T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    // Own upload should have the owner marker (from our mock)
    const ownPlayer = screen.getByTestId(
      "beta-video-player-https://example.com/own.mp4"
    );
    expect(ownPlayer).toBeOnTheScreen();
    // The mock renders "Owner" text only when isOwner=true
    expect(screen.getByTestId("owner-marker")).toBeOnTheScreen();

    // Other user's upload should NOT have the owner marker
    const otherPlayer = screen.getByTestId(
      "beta-video-player-https://example.com/other.mp4"
    );
    expect(otherPlayer).toBeOnTheScreen();
  });

  // ── Add Ascent button ──────────────────────────────────────────

  it("renders Add Ascent button when session is active at this gym", () => {
    // The "Add Ascent" button only appears when the user has an active
    // session at this gym — ascents belong to sessions.
    __mockData.data = mockRoute;
    setSessionState({ isActive: true, gymId: "gym-1" });

    render(<RouteDetailScreen />);

    const addAscentButton = screen.getByText("Add Ascent");
    expect(addAscentButton).toBeOnTheScreen();

    fireEvent.press(addAscentButton);

    expect(mockPush).toHaveBeenCalledWith("/(tabs)/gym/gym-1/route/route-1/ascent");
  });

  it("hides Add Ascent button when no session is active", () => {
    __mockData.data = mockRoute;
    setSessionState({ isActive: false, gymId: null });

    render(<RouteDetailScreen />);

    expect(screen.queryByTestId("add-ascent-button")).toBeNull();
  });

  it("hides Add Ascent button when session is active at a different gym", () => {
    // A session at gym-2 shouldn't show the button on a route at gym-1.
    __mockData.data = mockRoute;
    setSessionState({ isActive: true, gymId: "gym-2" });

    render(<RouteDetailScreen />);

    expect(screen.queryByTestId("add-ascent-button")).toBeNull();
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

  it("calls voteFeedback when upvote is pressed", () => {
    __mockData.data = mockRoute;
    __mockFeedbackData.feedback = [
      {
        id: "fb-1",
        route_id: "route-1",
        user_id: "user-2",
        body: "Some tip",
        score: 3,
        created_at: "2026-02-10T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    fireEvent.press(screen.getByTestId("like-button"));

    expect(mockVoteFeedback).toHaveBeenCalledWith({
      feedbackId: "fb-1",
      direction: "up",
    });
  });

  it("calls voteFeedback with null to unvote when same direction pressed", () => {
    __mockData.data = mockRoute;
    __mockFeedbackData.feedback = [
      {
        id: "fb-1",
        route_id: "route-1",
        user_id: "user-2",
        body: "Some tip",
        score: 3,
        created_at: "2026-02-10T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];
    // User already upvoted this tip
    __mockFeedbackData.userVotes = { "fb-1": "up" };

    render(<RouteDetailScreen />);

    fireEvent.press(screen.getByTestId("like-button"));

    // Same direction → toggle off (unvote)
    expect(mockVoteFeedback).toHaveBeenCalledWith({
      feedbackId: "fb-1",
      direction: null,
    });
  });

  it("shows confirmation dialog before deleting own feedback", () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    __mockData.data = mockRoute;
    __mockFeedbackData.feedback = [
      {
        id: "fb-own",
        route_id: "route-1",
        user_id: "user-1", // current user
        body: "My own tip",
        score: 0,
        created_at: "2026-02-10T00:00:00Z",
        profile: { display_name: "Me", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    fireEvent.press(screen.getByTestId("delete-button"));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(mockDeleteFeedback).not.toHaveBeenCalled();

    // Confirm the destructive action
    const buttons = alertSpy.mock.calls[0][2] as any[];
    const deleteBtn = buttons.find((b: any) => b.style === "destructive");
    deleteBtn.onPress();

    expect(mockDeleteFeedback).toHaveBeenCalledWith({ feedbackId: "fb-own" });
    alertSpy.mockRestore();
  });

  it("opens ReportSheet when report button is pressed on feedback", () => {
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

    fireEvent.press(screen.getByTestId("report-button"));

    expect(screen.getByTestId("report-sheet")).toBeOnTheScreen();
    expect(screen.getByTestId("report-target-type")).toHaveTextContent("feedback");
    expect(screen.getByTestId("report-target-id")).toHaveTextContent("fb-1");
  });

  // ── Delete confirmation ─────────────────────────────────────────

  it("shows confirmation dialog before deleting a video", () => {
    // Tapping delete should show an Alert with Cancel/Delete options,
    // not immediately delete the video.
    const alertSpy = jest.spyOn(Alert, "alert");
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-own",
        route_id: "route-1",
        user_id: "user-1",
        url: "https://example.com/own.mp4",
        type: "video",
        likes_count: 0,
        created_at: "2026-02-12T00:00:00Z",
        profile: { display_name: "Me", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    // Tap the mock delete button — should trigger the confirmation dialog
    fireEvent.press(screen.getByTestId("mock-delete-button"));

    // Alert.alert should have been called with title + message + buttons
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      expect.any(String), // title
      expect.any(String), // confirmation message
      expect.arrayContaining([
        expect.objectContaining({ style: "cancel" }),
        expect.objectContaining({ style: "destructive" }),
      ])
    );

    // deleteMedia should NOT have been called yet (waiting for user confirmation)
    expect(mockDeleteMedia).not.toHaveBeenCalled();

    // Simulate pressing the destructive "Delete" button in the Alert
    const buttons = alertSpy.mock.calls[0][2] as any[];
    const deleteButton = buttons.find((b: any) => b.style === "destructive");
    deleteButton.onPress();

    // Now deleteMedia should have been called
    expect(mockDeleteMedia).toHaveBeenCalledWith({ mediaId: "media-own" });

    alertSpy.mockRestore();
  });

  // ── Sort controls ──────────────────────────────────────────────

  it("shows sort controls when 2+ videos exist", () => {
    // Sort pills should only appear when there are multiple videos.
    // With 0-1 videos, sorting is pointless.
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-1",
        route_id: "route-1",
        user_id: "user-2",
        url: "https://example.com/v1.mp4",
        type: "video",
        likes_count: 5,
        created_at: "2026-02-12T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
      {
        id: "media-2",
        route_id: "route-1",
        user_id: "user-3",
        url: "https://example.com/v2.mp4",
        type: "video",
        likes_count: 2,
        created_at: "2026-02-11T00:00:00Z",
        profile: { display_name: "Sam", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    expect(screen.getByTestId("sort-controls")).toBeOnTheScreen();
    expect(screen.getByTestId("sort-newest")).toBeOnTheScreen();
    expect(screen.getByTestId("sort-most-liked")).toBeOnTheScreen();
  });

  it("hides sort controls when fewer than 2 videos", () => {
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-1",
        route_id: "route-1",
        user_id: "user-2",
        url: "https://example.com/v1.mp4",
        type: "video",
        likes_count: 0,
        created_at: "2026-02-12T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    expect(screen.queryByTestId("sort-controls")).toBeNull();
  });

  // ── Like state ─────────────────────────────────────────────────

  it("passes isLiked=true when media ID is in userLikes set", () => {
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-1",
        route_id: "route-1",
        user_id: "user-2",
        url: "https://example.com/liked.mp4",
        type: "video",
        likes_count: 1,
        created_at: "2026-02-12T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];
    __mockMediaData.userLikes = new Set(["media-1"]);

    render(<RouteDetailScreen />);

    // The mock BetaVideoPlayer renders "Liked" text when isLiked=true
    expect(screen.getByTestId("liked-marker")).toBeOnTheScreen();
  });

  // ── Video report flow ───────────────────────────────────────────

  it("passes onReport to non-owner videos but not to owner videos", () => {
    // The mock BetaVideoPlayer renders a "mock-report-button" when
    // onReport is provided. Owner videos should NOT get this prop.
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-own",
        route_id: "route-1",
        user_id: "user-1", // current user
        url: "https://example.com/own.mp4",
        type: "video",
        likes_count: 0,
        created_at: "2026-02-12T00:00:00Z",
        profile: { display_name: "Me", avatar_url: null },
      },
      {
        id: "media-other",
        route_id: "route-1",
        user_id: "user-2", // another user
        url: "https://example.com/other.mp4",
        type: "video",
        likes_count: 0,
        created_at: "2026-02-11T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    // Non-owner video should have the report button
    expect(screen.getByTestId("mock-report-button")).toBeOnTheScreen();
    // ReportSheet should NOT be visible yet (no report triggered)
    expect(screen.queryByTestId("report-sheet")).toBeNull();
  });

  it("opens ReportSheet with correct target when report is triggered", () => {
    // Tapping the Flag icon on a non-owner video should open
    // the ReportSheet with targetType="video" and the media ID.
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-other",
        route_id: "route-1",
        user_id: "user-2",
        url: "https://example.com/other.mp4",
        type: "video",
        likes_count: 0,
        created_at: "2026-02-11T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    // Tap the report button on the mock BetaVideoPlayer
    fireEvent.press(screen.getByTestId("mock-report-button"));

    // ReportSheet should now be visible
    expect(screen.getByTestId("report-sheet")).toBeOnTheScreen();
    expect(screen.getByTestId("report-target-type")).toHaveTextContent("video");
    expect(screen.getByTestId("report-target-id")).toHaveTextContent("media-other");
  });

  // ── Accordion behavior ──────────────────────────────────────────

  it("renders all videos collapsed by default", () => {
    // When the screen first loads, no video should be expanded.
    // The accordion starts fully collapsed.
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-1",
        route_id: "route-1",
        user_id: "user-2",
        url: "https://example.com/v1.mp4",
        type: "video",
        likes_count: 0,
        created_at: "2026-02-12T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
      {
        id: "media-2",
        route_id: "route-1",
        user_id: "user-3",
        url: "https://example.com/v2.mp4",
        type: "video",
        likes_count: 0,
        created_at: "2026-02-11T00:00:00Z",
        profile: { display_name: "Sam", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    // Neither video should have the "Expanded" marker
    expect(screen.queryByTestId("expanded-https://example.com/v1.mp4")).toBeNull();
    expect(screen.queryByTestId("expanded-https://example.com/v2.mp4")).toBeNull();
  });

  it("expands a video when its toggle is pressed", () => {
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-1",
        route_id: "route-1",
        user_id: "user-2",
        url: "https://example.com/v1.mp4",
        type: "video",
        likes_count: 0,
        created_at: "2026-02-12T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    // Tap the toggle button for video 1
    fireEvent.press(screen.getByTestId("toggle-expand-https://example.com/v1.mp4"));

    // Video 1 should now be expanded
    expect(screen.getByTestId("expanded-https://example.com/v1.mp4")).toBeOnTheScreen();
  });

  it("collapses the first video when a second is expanded (accordion)", () => {
    // Accordion behavior: only one video can be expanded at a time.
    // Expanding video B should collapse video A.
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-1",
        route_id: "route-1",
        user_id: "user-2",
        url: "https://example.com/v1.mp4",
        type: "video",
        likes_count: 0,
        created_at: "2026-02-12T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
      {
        id: "media-2",
        route_id: "route-1",
        user_id: "user-3",
        url: "https://example.com/v2.mp4",
        type: "video",
        likes_count: 0,
        created_at: "2026-02-11T00:00:00Z",
        profile: { display_name: "Sam", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    // Expand video 1
    fireEvent.press(screen.getByTestId("toggle-expand-https://example.com/v1.mp4"));
    expect(screen.getByTestId("expanded-https://example.com/v1.mp4")).toBeOnTheScreen();

    // Expand video 2 — should collapse video 1
    fireEvent.press(screen.getByTestId("toggle-expand-https://example.com/v2.mp4"));
    expect(screen.getByTestId("expanded-https://example.com/v2.mp4")).toBeOnTheScreen();
    expect(screen.queryByTestId("expanded-https://example.com/v1.mp4")).toBeNull();
  });

  it("collapses a video when tapped again (toggle off)", () => {
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-1",
        route_id: "route-1",
        user_id: "user-2",
        url: "https://example.com/v1.mp4",
        type: "video",
        likes_count: 0,
        created_at: "2026-02-12T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    // Expand
    fireEvent.press(screen.getByTestId("toggle-expand-https://example.com/v1.mp4"));
    expect(screen.getByTestId("expanded-https://example.com/v1.mp4")).toBeOnTheScreen();

    // Collapse by tapping again
    fireEvent.press(screen.getByTestId("toggle-expand-https://example.com/v1.mp4"));
    expect(screen.queryByTestId("expanded-https://example.com/v1.mp4")).toBeNull();
  });

  it("resets expanded state when sort changes", () => {
    // Changing the sort order reorders the list, so keeping an item
    // expanded would be confusing (it might jump to a new position).
    // Switching sort should collapse all videos.
    __mockData.data = mockRoute;
    __mockMediaData.media = [
      {
        id: "media-1",
        route_id: "route-1",
        user_id: "user-2",
        url: "https://example.com/v1.mp4",
        type: "video",
        likes_count: 5,
        created_at: "2026-02-12T00:00:00Z",
        profile: { display_name: "Alex", avatar_url: null },
      },
      {
        id: "media-2",
        route_id: "route-1",
        user_id: "user-3",
        url: "https://example.com/v2.mp4",
        type: "video",
        likes_count: 2,
        created_at: "2026-02-11T00:00:00Z",
        profile: { display_name: "Sam", avatar_url: null },
      },
    ];

    render(<RouteDetailScreen />);

    // Expand video 1
    fireEvent.press(screen.getByTestId("toggle-expand-https://example.com/v1.mp4"));
    expect(screen.getByTestId("expanded-https://example.com/v1.mp4")).toBeOnTheScreen();

    // Switch sort to "Most Liked"
    fireEvent.press(screen.getByTestId("sort-most-liked"));

    // Video 1 should no longer be expanded
    expect(screen.queryByTestId("expanded-https://example.com/v1.mp4")).toBeNull();
    expect(screen.queryByTestId("expanded-https://example.com/v2.mp4")).toBeNull();
  });
});
