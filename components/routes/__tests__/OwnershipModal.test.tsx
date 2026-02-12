/**
 * OwnershipModal Component Tests (Step 12.1)
 *
 * Tests the content ownership affirmation modal that appears before
 * a video upload begins. FR-K1 requires users to confirm they own
 * the content before it can be published.
 *
 * The modal has:
 *   - Explanation text about why ownership matters
 *   - A checkbox to affirm ownership
 *   - Cancel and Upload buttons (Upload disabled until checkbox checked)
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

// Mock lucide-react-native — icons used in the modal
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return {
    ShieldCheck: (props: any) => <View testID="icon-shield-check" {...props} />,
    Square: (props: any) => <View testID="icon-square" {...props} />,
    CheckSquare: (props: any) => <View testID="icon-check-square" {...props} />,
  };
});

import { OwnershipModal } from '../OwnershipModal';

describe('OwnershipModal', () => {
  const defaultProps = {
    visible: true,
    onConfirm: jest.fn(),
    onDismiss: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title and explanation when visible', () => {
    render(<OwnershipModal {...defaultProps} />);

    expect(screen.getByText('Content Ownership')).toBeOnTheScreen();
    expect(
      screen.getByText(/I affirm that I own this content/)
    ).toBeOnTheScreen();
  });

  it('does not render when visible is false', () => {
    render(<OwnershipModal {...defaultProps} visible={false} />);

    expect(screen.queryByText('Content Ownership')).toBeNull();
  });

  it('Upload button is disabled before checkbox is checked', () => {
    render(<OwnershipModal {...defaultProps} />);

    const uploadButton = screen.getByTestId('ownership-upload-button');
    expect(uploadButton.props.accessibilityState?.disabled).toBe(true);
  });

  it('Upload button becomes enabled after checking the checkbox', () => {
    render(<OwnershipModal {...defaultProps} />);

    // Tap the checkbox to affirm ownership
    fireEvent.press(screen.getByTestId('ownership-checkbox'));

    const uploadButton = screen.getByTestId('ownership-upload-button');
    expect(uploadButton.props.accessibilityState?.disabled).toBe(false);
  });

  it('calls onConfirm when Upload is pressed after affirming', () => {
    render(<OwnershipModal {...defaultProps} />);

    // Check the box, then press Upload
    fireEvent.press(screen.getByTestId('ownership-checkbox'));
    fireEvent.press(screen.getByTestId('ownership-upload-button'));

    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when Cancel is pressed', () => {
    render(<OwnershipModal {...defaultProps} />);

    fireEvent.press(screen.getByText('Cancel'));

    expect(defaultProps.onDismiss).toHaveBeenCalledTimes(1);
  });
});
