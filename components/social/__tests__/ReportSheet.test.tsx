/**
 * ReportSheet Component Tests
 *
 * Tests the bottom sheet modal for reporting inappropriate content.
 * The sheet displays a list of predefined reasons (Inappropriate content,
 * Spam, Harassment, etc.) and a submit button. Users select a reason,
 * tap submit, and the report is created via useCreateReport.
 *
 * The component follows the QuickLogSheet pattern: a React Native Modal
 * with animationType="slide" and transparent backdrop, rather than a
 * gesture-driven bottom sheet library.
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";

// ── Mock lucide-react-native ─────────────────────────────────────────
jest.mock("lucide-react-native", () => {
  const { View } = require("react-native");
  return {
    Flag: (props: any) => <View testID="icon-flag" {...props} />,
    X: (props: any) => <View testID="icon-x" {...props} />,
    Check: (props: any) => <View testID="icon-check" {...props} />,
  };
});

// ── Mock useModeration ───────────────────────────────────────────────
const mockMutate = jest.fn();
jest.mock("@/hooks/useModeration", () => ({
  useCreateReport: () => ({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
  }),
}));

import { ReportSheet } from "../ReportSheet";

// ── Default props ────────────────────────────────────────────────────
const defaultProps = {
  visible: true,
  onDismiss: jest.fn(),
  targetType: "feedback" as const,
  targetId: "target-123",
};

describe("ReportSheet", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders reason options when visible", () => {
    // The sheet should display all predefined report reasons as
    // tappable options when the modal is visible.
    render(<ReportSheet {...defaultProps} />);

    expect(screen.getByText("Inappropriate content")).toBeOnTheScreen();
    expect(screen.getByText("Spam")).toBeOnTheScreen();
    expect(screen.getByText("Harassment")).toBeOnTheScreen();
    expect(screen.getByText("Dangerous activity")).toBeOnTheScreen();
    expect(screen.getByText("Other")).toBeOnTheScreen();
  });

  it("does not render content when not visible", () => {
    // When visible is false, the Modal is not rendered, so none
    // of the reason options should appear in the tree.
    render(<ReportSheet {...defaultProps} visible={false} />);

    expect(screen.queryByText("Report Content")).toBeNull();
  });

  it("selecting a reason enables submit button", () => {
    // The submit button starts disabled (no reason selected).
    // Tapping a reason should enable it.
    render(<ReportSheet {...defaultProps} />);

    // Submit button should start disabled
    const submitButton = screen.getByText("Submit Report");
    // Can't easily test disabled state on Pressable, so we verify
    // that pressing submit without selection doesn't call mutate
    fireEvent.press(submitButton);
    expect(mockMutate).not.toHaveBeenCalled();

    // Select a reason
    fireEvent.press(screen.getByText("Spam"));

    // Now pressing submit should call the mutation
    fireEvent.press(screen.getByText("Submit Report"));
    expect(mockMutate).toHaveBeenCalled();
  });

  it("submit calls createReport mutation with selected reason", () => {
    // After selecting a reason, the submit button should call
    // useCreateReport's mutate with the targetType, targetId, and reason.
    render(<ReportSheet {...defaultProps} />);

    // Select "Harassment" as the reason
    fireEvent.press(screen.getByText("Harassment"));

    // Tap submit
    fireEvent.press(screen.getByText("Submit Report"));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        targetType: "feedback",
        targetId: "target-123",
        reason: "Harassment",
      },
      // The second argument is the mutation callbacks object
      expect.any(Object)
    );
  });

  it("shows success message after submission", () => {
    // After a successful report submission, the sheet should show
    // a confirmation message instead of the reason picker.
    // We simulate this by re-rendering with isSuccess: true.
    const useCreateReportMock = jest.requireMock("@/hooks/useModeration").useCreateReport;
    const originalImpl = useCreateReportMock;

    // Override to return isSuccess: true
    jest.spyOn(
      require("@/hooks/useModeration"),
      "useCreateReport"
    ).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isSuccess: true,
    });

    render(<ReportSheet {...defaultProps} />);

    expect(screen.getByText("Report submitted")).toBeOnTheScreen();
  });
});
