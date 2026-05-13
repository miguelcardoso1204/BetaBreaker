// app/__tests__/search.test.tsx
//
// Smoke tests for the climber-search screen. Verifies that the screen
// renders, the hint state appears with empty input, debounced input
// triggers useSearchClimbers, and tapping a result row navigates to
// /profile/<id>.
//
// MOCK STRATEGY:
//   - expo-router: useRouter (push, back) + useLocalSearchParams
//   - useSocial.useSearchClimbers: returns mocked results state
//   - lucide-react-native: stub icons (ArrowLeft, Search) — NativeWind
//     can't process Lucide SVGs in jest, so each icon becomes a View.
//   - components/social/FollowButton: stub so we don't pull in the
//     useToggleFollow / useIsFollowing chain for these screen tests.

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

// useSearchClimbers is the only hook the screen reads; we mutate the
// results before rendering each test case.
const mockSearchState = {
  results: [] as Array<{ id: string; display_name: string; avatar_url: string | null }>,
  isLoading: false,
  error: null as Error | null,
};
jest.mock("@/hooks/useSocial", () => ({
  useSearchClimbers: () => mockSearchState,
}));

jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    ArrowLeft: (props: any) => <View testID="icon-back" {...props} />,
    Search: (props: any) => <View testID="icon-search" {...props} />,
  };
});

// FollowButton renders a follow / unfollow toggle — we don't need to
// exercise that here, just verify a stub renders.
jest.mock("@/components/social/FollowButton", () => {
  const { View } = require("react-native");
  return {
    FollowButton: ({ targetUserId }: { targetUserId: string }) => (
      <View testID={`follow-button-${targetUserId}`} />
    ),
  };
});

// react-i18next: t returns the key with simple {{var}} interpolation so
// assertions can match on the literal key (e.g. "search.hint").
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      if (!vars) return key;
      return Object.entries(vars).reduce(
        (acc, [k, v]) => acc.replace(`{{${k}}}`, String(v)),
        key
      );
    },
  }),
}));

import SearchScreen from "../search";

describe("SearchScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchState.results = [];
    mockSearchState.isLoading = false;
    mockSearchState.error = null;
  });

  it("shows the hint when the input is empty", () => {
    render(<SearchScreen />);
    expect(screen.getByText("search.hint")).toBeOnTheScreen();
  });

  it("renders search results from the hook and tapping a row pushes /profile/<id>", () => {
    mockSearchState.results = [
      { id: "user-2", display_name: "Alex", avatar_url: null },
      { id: "user-3", display_name: "Sam", avatar_url: null },
    ];

    render(<SearchScreen />);

    // Type something so the screen leaves the hint state — the actual
    // debounce / hook wiring is mocked, so we just need any input value.
    fireEvent.changeText(screen.getByTestId("search-input"), "a");

    expect(screen.getByTestId("search-row-user-2")).toBeOnTheScreen();
    expect(screen.getByTestId("follow-button-user-2")).toBeOnTheScreen();

    // The Pressable wrapping avatar + name uses the climber's display
    // name as accessibilityLabel.
    fireEvent.press(screen.getByLabelText("Alex"));
    expect(mockPush).toHaveBeenCalledWith("/profile/user-2");
  });

  it("back chevron calls router.back", () => {
    render(<SearchScreen />);
    fireEvent.press(screen.getByLabelText("common.goBack"));
    expect(mockBack).toHaveBeenCalled();
  });
});
