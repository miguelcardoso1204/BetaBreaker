// app/__tests__/onboarding.test.tsx
//
// Tests for the onboarding wizard screen — a 4-step flow that collects
// home gym and grade system preferences from new users.
//
// Steps: Welcome → Gym Selection → Grade System → Done
//
// MOCK STRATEGY (same pattern as settings/index.test.tsx):
//   - useAuth: controls user data + refreshProfile
//   - useProfile: captures useUpdateProfile mutation calls
//   - useGyms: provides gym list
//   - lucide-react-native: stubs icons as plain Views

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// ── Mocks ────────────────────────────────────────────────────────────

// Mock useAuth — provides user data and refreshProfile callback
const mockRefreshProfile = jest.fn().mockResolvedValue(undefined);
let mockUser: any = {
  id: "user-onboarding",
  displayName: "NewClimber",
  preferredGradeSystem: "v-scale",
  homeGymId: null,
  onboardingCompleted: false,
};

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    refreshProfile: mockRefreshProfile,
  }),
}));

// Mock useUpdateProfile — captures mutation calls.
// The hook takes refreshProfile as a param and returns a mutation object.
const mockMutate = jest.fn();
let mockIsPending = false;

jest.mock("@/hooks/useProfile", () => ({
  useUpdateProfile: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
  }),
}));

// Mock useGyms — provides a list of gyms for the gym selection step
jest.mock("@/hooks/useGyms", () => ({
  useGyms: () => ({
    data: [
      { id: "gym-1", name: "The Crag" },
      { id: "gym-2", name: "Summit Climbing" },
      { id: "gym-3", name: "Boulder House" },
    ],
    isLoading: false,
  }),
}));

// Mock lucide-react-native — Jest can't process SVG transforms from Lucide.
// Replace each icon with a plain View carrying a testID.
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Mountain: (props: any) => <View testID="icon-mountain" {...props} />,
    Check: (props: any) => <View testID="icon-check" {...props} />,
  };
});

// Import after mocks are set up
import OnboardingScreen from "../onboarding";

describe("OnboardingScreen", () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockRefreshProfile.mockClear();
    mockIsPending = false;
    mockUser = {
      id: "user-onboarding",
      displayName: "NewClimber",
      preferredGradeSystem: "v-scale",
      homeGymId: null,
      onboardingCompleted: false,
    };
  });

  // ── Step 0: Welcome ─────────────────────────────────────────────────

  describe("Step 0 — Welcome", () => {
    it("renders welcome heading and tagline", () => {
      render(<OnboardingScreen />);
      expect(screen.getByText("Welcome to Beta Breaker")).toBeOnTheScreen();
      expect(
        screen.getByText("Track your climbing, share beta, compete with friends.")
      ).toBeOnTheScreen();
    });

    it("renders progress dots with first dot active", () => {
      render(<OnboardingScreen />);
      // 4 dots total — one for each step
      const activeDot = screen.getByTestId("dot-0");
      const inactiveDot = screen.getByTestId("dot-1");
      expect(activeDot).toBeOnTheScreen();
      expect(inactiveDot).toBeOnTheScreen();
    });

    it("advances to step 1 when 'Let's get started' is pressed", () => {
      render(<OnboardingScreen />);
      fireEvent.press(screen.getByText("Let's get started"));
      // Step 1 heading should now be visible
      expect(screen.getByText("Select Your Home Gym")).toBeOnTheScreen();
    });

    it("calls mutation with onboarding_completed when 'Skip setup' is pressed", () => {
      render(<OnboardingScreen />);
      fireEvent.press(screen.getByText("Skip setup"));
      expect(mockMutate).toHaveBeenCalledWith({
        userId: "user-onboarding",
        fields: { onboarding_completed: true },
      });
    });
  });

  // ── Step 1: Gym Selection ───────────────────────────────────────────

  describe("Step 1 — Gym Selection", () => {
    /** Helper to advance past the welcome screen */
    function goToStep1() {
      render(<OnboardingScreen />);
      fireEvent.press(screen.getByText("Let's get started"));
    }

    it("renders gym selection heading", () => {
      goToStep1();
      expect(screen.getByText("Select Your Home Gym")).toBeOnTheScreen();
      expect(
        screen.getByText("You can change this later in settings.")
      ).toBeOnTheScreen();
    });

    it("renders gym list from useGyms", () => {
      goToStep1();
      expect(screen.getByText("The Crag")).toBeOnTheScreen();
      expect(screen.getByText("Summit Climbing")).toBeOnTheScreen();
      expect(screen.getByText("Boulder House")).toBeOnTheScreen();
    });

    it("highlights selected gym", () => {
      goToStep1();
      // Tap a gym to select it
      fireEvent.press(screen.getByText("Summit Climbing"));
      // The selected gym item should have an accessible selected state
      const gymItem = screen.getByTestId("gym-item-gym-2");
      expect(gymItem).toBeOnTheScreen();
    });

    it("advances to step 2 when 'Next' is pressed", () => {
      goToStep1();
      fireEvent.press(screen.getByText("The Crag"));
      fireEvent.press(screen.getByText("Next"));
      // Step 2 heading should now be visible
      expect(screen.getByText("Grade System")).toBeOnTheScreen();
    });

    it("advances to step 2 when 'Skip' is pressed without selecting a gym", () => {
      goToStep1();
      fireEvent.press(screen.getByText("Skip"));
      expect(screen.getByText("Grade System")).toBeOnTheScreen();
    });
  });

  // ── Step 2: Grade System ────────────────────────────────────────────

  describe("Step 2 — Grade System", () => {
    /** Helper to advance to grade system step */
    function goToStep2() {
      render(<OnboardingScreen />);
      fireEvent.press(screen.getByText("Let's get started"));
      fireEvent.press(screen.getByText("Skip")); // skip gym selection
    }

    it("renders grade system heading and three options", () => {
      goToStep2();
      expect(screen.getByText("Grade System")).toBeOnTheScreen();
      expect(screen.getByText("How do you read grades?")).toBeOnTheScreen();
      expect(screen.getByText("V-Scale")).toBeOnTheScreen();
      expect(screen.getByText("Font")).toBeOnTheScreen();
      expect(screen.getByText("YDS")).toBeOnTheScreen();
    });

    it("has V-Scale selected by default", () => {
      goToStep2();
      // V-Scale option should be visually distinct (selected)
      const vScaleOption = screen.getByTestId("grade-option-v-scale");
      expect(vScaleOption).toBeOnTheScreen();
    });

    it("selects Font when tapped", () => {
      goToStep2();
      fireEvent.press(screen.getByText("Font"));
      // Font option should now be selected
      const fontOption = screen.getByTestId("grade-option-font");
      expect(fontOption).toBeOnTheScreen();
    });

    it("advances to step 3 when 'Next' is pressed", () => {
      goToStep2();
      fireEvent.press(screen.getByText("Next"));
      expect(screen.getByText("You're all set!")).toBeOnTheScreen();
    });
  });

  // ── Step 3: Done ────────────────────────────────────────────────────

  describe("Step 3 — Done", () => {
    /** Helper to advance to the done step with specific selections */
    function goToStep3(options?: { selectGym?: boolean; selectFont?: boolean }) {
      render(<OnboardingScreen />);
      fireEvent.press(screen.getByText("Let's get started"));

      if (options?.selectGym) {
        fireEvent.press(screen.getByText("The Crag"));
        fireEvent.press(screen.getByText("Next"));
      } else {
        fireEvent.press(screen.getByText("Skip"));
      }

      if (options?.selectFont) {
        fireEvent.press(screen.getByText("Font"));
      }
      fireEvent.press(screen.getByText("Next"));
    }

    it("renders completion message", () => {
      goToStep3();
      expect(screen.getByText("You're all set!")).toBeOnTheScreen();
    });

    it("shows summary with selected gym name", () => {
      goToStep3({ selectGym: true });
      expect(screen.getByText("The Crag")).toBeOnTheScreen();
    });

    it("shows 'No gym selected' when gym was skipped", () => {
      goToStep3();
      expect(screen.getByText("No gym selected")).toBeOnTheScreen();
    });

    it("shows selected grade system label", () => {
      goToStep3({ selectFont: true });
      expect(screen.getByText("Font")).toBeOnTheScreen();
    });

    it("calls mutation with selected preferences when 'Get Started' is pressed", () => {
      goToStep3({ selectGym: true, selectFont: true });
      fireEvent.press(screen.getByText("Get Started"));
      expect(mockMutate).toHaveBeenCalledWith({
        userId: "user-onboarding",
        fields: {
          home_gym_id: "gym-1",
          preferred_grade_system: "font",
          onboarding_completed: true,
        },
      });
    });

    it("calls mutation with defaults when no gym selected", () => {
      goToStep3(); // skipped gym, default v-scale
      fireEvent.press(screen.getByText("Get Started"));
      expect(mockMutate).toHaveBeenCalledWith({
        userId: "user-onboarding",
        fields: {
          home_gym_id: null,
          preferred_grade_system: "v-scale",
          onboarding_completed: true,
        },
      });
    });

    it("shows loading state on button while saving", () => {
      mockIsPending = true;
      goToStep3();
      // The Button component shows a loading spinner when loading=true.
      // The button should be disabled (non-interactive) during save.
      const button = screen.getByRole("button", { name: "Get Started" });
      expect(button).toBeDisabled();
    });
  });
});
