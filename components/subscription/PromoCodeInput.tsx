/**
 * PromoCodeInput — Expandable Promo Code Entry Component
 *
 * Renders inside the Paywall between "Restore Purchases" and "Not now":
 *   1. Initially shows a "Have a promo code?" toggle text
 *   2. When tapped, expands to show a TextInput + Redeem button
 *   3. On redemption: loading spinner, then success or error message
 *   4. On success: calls onSuccess prop (which dismisses the Paywall)
 *
 * Architecture:
 *   PromoCodeInput → useTrials().redeemMutation → trialService → redeem-promo Edge Function
 *
 * The component is intentionally self-contained — it manages its own
 * expanded/collapsed state and input value. The parent (Paywall) only
 * needs to provide onSuccess for dismissal.
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useTrials } from "@/hooks/useTrials";

interface PromoCodeInputProps {
  /** Called after successful promo code redemption (dismiss the paywall). */
  onSuccess: () => void;
}

export function PromoCodeInput({ onSuccess }: PromoCodeInputProps) {
  // Whether the input field is visible (starts collapsed)
  const [expanded, setExpanded] = useState(false);
  // The promo code text the user is typing
  const [code, setCode] = useState("");

  const { redeemMutation } = useTrials();

  // Auto-call onSuccess when redemption succeeds — same pattern as
  // Paywall's auto-dismiss on successful purchase.
  useEffect(() => {
    if (redeemMutation.isSuccess) {
      onSuccess();
    }
  }, [redeemMutation.isSuccess, onSuccess]);

  // ── Collapsed state: just a toggle link ────────────────────────────
  if (!expanded) {
    return (
      <Pressable
        style={styles.toggleButton}
        onPress={() => setExpanded(true)}
      >
        <Text style={styles.toggleText}>Have a promo code?</Text>
      </Pressable>
    );
  }

  // ── Expanded state: input + redeem button ──────────────────────────
  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Enter promo code"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!redeemMutation.isPending}
      />

      <Pressable
        style={[
          styles.redeemButton,
          // Dim the button when disabled (empty code or loading)
          (!code.trim() || redeemMutation.isPending) && styles.redeemButtonDisabled,
        ]}
        onPress={() => redeemMutation.mutate(code.trim())}
        disabled={!code.trim() || redeemMutation.isPending}
      >
        <Text style={styles.redeemButtonText}>Redeem</Text>
      </Pressable>

      {/* Loading spinner while the Edge Function processes the code */}
      {redeemMutation.isPending && (
        <ActivityIndicator
          testID="promo-loading"
          size="small"
          style={styles.indicator}
        />
      )}

      {/* Error message if redemption failed */}
      {redeemMutation.isError && (
        <Text style={styles.errorText}>
          {(redeemMutation.error as Error)?.message ||
            "Redemption failed. Please try again."}
        </Text>
      )}

      {/* Success message (briefly visible before onSuccess dismisses) */}
      {redeemMutation.isSuccess && (
        <Text style={styles.successText}>
          Promo code redeemed! Enjoy Pro.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggleButton: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  toggleText: {
    color: "#7C3AED",
    fontSize: 14,
    fontWeight: "500",
  },
  container: {
    alignSelf: "stretch",
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 8,
  },
  redeemButton: {
    backgroundColor: "#7C3AED",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  redeemButtonDisabled: {
    opacity: 0.5,
  },
  redeemButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  indicator: {
    marginBottom: 8,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 4,
  },
  successText: {
    color: "#22C55E",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 4,
  },
});
