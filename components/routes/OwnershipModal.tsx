/**
 * OwnershipModal — Content Ownership Affirmation (FR-K1)
 *
 * Before uploading a beta video, users must confirm they own the content.
 * This is a legal/compliance requirement (FR-K1) — we can't host content
 * that someone doesn't have rights to distribute.
 *
 * The modal uses React Native's built-in <Modal> component rather than
 * a library because:
 *   - It's a simple confirm/cancel dialog, not a complex bottom sheet
 *   - <Modal> is built into React Native (no extra dependency)
 *   - It renders above everything else, including the tab bar
 *
 * STATE MANAGEMENT:
 * The checkbox state is internal to the modal. It resets every time
 * the modal opens (via useEffect on `visible`) so users can't
 * accidentally skip the affirmation on subsequent uploads.
 */

import React, { useState, useEffect } from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { ShieldCheck, Square, CheckSquare } from 'lucide-react-native';

export interface OwnershipModalProps {
  /** Whether the modal is visible. */
  visible: boolean;
  /** Called when the user confirms ownership and taps Upload. */
  onConfirm: () => void;
  /** Called when the user cancels (taps Cancel or dismisses). */
  onDismiss: () => void;
}

export function OwnershipModal({
  visible,
  onConfirm,
  onDismiss,
}: OwnershipModalProps) {
  // Track whether the user has checked the ownership checkbox.
  // Resets to false every time the modal opens.
  const [affirmed, setAffirmed] = useState(false);

  // Reset the checkbox when the modal opens. Without this, a user who
  // checked the box, cancelled, and re-opened would see it pre-checked.
  useEffect(() => {
    if (visible) {
      setAffirmed(false);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      {/* Semi-transparent backdrop — tapping it dismisses the modal. */}
      <Pressable
        className="flex-1 justify-center items-center bg-black/50"
        onPress={onDismiss}
      >
        {/* Modal card — stopPropagation prevents taps inside from
            triggering the backdrop's onPress. */}
        <Pressable
          className="bg-surface m-6 p-6 rounded-2xl w-[85%] max-w-md"
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header with shield icon */}
          <View className="flex-row items-center mb-4">
            <ShieldCheck size={24} color="#7C3AED" />
            <Text className="text-xl font-bold text-text-primary ml-2">
              Content Ownership
            </Text>
          </View>

          {/* Explanation text */}
          <Text className="text-text-secondary mb-6 leading-5">
            By uploading, you confirm that this video is your original
            content and you have the right to share it. Videos that
            violate copyright may be removed.
          </Text>

          {/* Ownership checkbox */}
          <Pressable
            testID="ownership-checkbox"
            className="flex-row items-center mb-6"
            onPress={() => setAffirmed(!affirmed)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: affirmed }}
          >
            {affirmed ? (
              <CheckSquare size={22} color="#7C3AED" />
            ) : (
              <Square size={22} color="#6B7280" />
            )}
            <Text className="text-text-primary ml-3 flex-1">
              I affirm that I own this content
            </Text>
          </Pressable>

          {/* Action buttons */}
          <View className="flex-row justify-end gap-3">
            <Pressable
              onPress={onDismiss}
              className="px-5 py-3 rounded-xl"
              accessibilityRole="button"
            >
              <Text className="text-text-secondary font-semibold">Cancel</Text>
            </Pressable>

            <Pressable
              testID="ownership-upload-button"
              onPress={affirmed ? onConfirm : undefined}
              disabled={!affirmed}
              className={`px-5 py-3 rounded-xl bg-accent ${
                !affirmed ? 'opacity-50' : ''
              }`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !affirmed }}
            >
              <Text className="text-white font-semibold">Upload</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
