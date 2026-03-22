/**
 * GradeSlider Component Tests
 *
 * Tests the horizontal grade slider used on the ascent form for
 * climbers to indicate their perceived grade for a route.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";

// Mock @react-native-community/slider — native module unavailable in Jest.
// Renders a View that exposes props and fires onValueChange on press.
jest.mock("@react-native-community/slider", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: (props: any) => (
      <View
        testID={props.testID}
        accessibilityValue={{
          min: props.minimumValue,
          max: props.maximumValue,
          now: props.value,
        }}
        onStartShouldSetResponder={() => {
          props.onValueChange?.(15);
          return true;
        }}
      />
    ),
  };
});

// Mock grades utility — return controlled display strings.
jest.mock("@/utils/grades", () => ({
  canonicalToDisplay: jest.fn((canonical: number) => `V${Math.floor(canonical / 2.5)}`),
}));

import { GradeSlider } from "../GradeSlider";

describe("GradeSlider", () => {
  it("renders the selected grade label", () => {
    render(<GradeSlider value={10} onChange={jest.fn()} />);

    // canonicalToDisplay(10) → "V4" from our mock
    expect(screen.getByTestId("grade-slider-value")).toBeOnTheScreen();
  });

  it("renders the slider with correct range", () => {
    render(<GradeSlider value={10} onChange={jest.fn()} />);

    const slider = screen.getByTestId("grade-slider");
    expect(slider.props.accessibilityValue.min).toBe(0);
    expect(slider.props.accessibilityValue.max).toBe(30);
    expect(slider.props.accessibilityValue.now).toBe(10);
  });

  it("renders min and max grade labels", () => {
    render(<GradeSlider value={10} onChange={jest.fn()} />);

    // Min label (canonical 0) and max label (canonical 30) should both render
    // Our mock returns "V0" for 0 and "V12" for 30
    expect(screen.getAllByText(/V\d+/).length).toBeGreaterThanOrEqual(2);
  });
});
