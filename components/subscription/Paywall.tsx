/**
 * Paywall Component — Subscription Upsell Modal
 *
 * Displayed when a free-tier user tries to access a Pro-only feature.
 * Shows a modal with:
 *   - The feature that triggered the paywall
 *   - A list of all Pro benefits
 *   - A Subscribe button (triggers IAP purchase flow)
 *   - A Restore Purchases link (for users who previously subscribed)
 *   - Loading spinner during purchase
 *   - Error message if purchase fails
 *   - Auto-dismiss on successful purchase
 *
 * Usage:
 *   const { hasAccess } = useEntitlement('analytics');
 *   const [showPaywall, setShowPaywall] = useState(false);
 *
 *   if (!hasAccess) {
 *     return <Paywall visible={showPaywall} onDismiss={() => setShowPaywall(false)} feature="analytics" />;
 *   }
 *
 * Architecture:
 *   Paywall → useSubscription() → purchaseService → react-native-iap → verify-iap Edge Function
 */

import React, { useEffect } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useSubscription } from "@/hooks/useSubscription";
import { PromoCodeInput } from "@/components/subscription/PromoCodeInput";
import { IAP_PRODUCT_IDS } from "@/lib/constants";
import type { EntitlementFeature } from "@/lib/constants";

interface PaywallProps {
  /** Whether the paywall modal is visible. */
  visible: boolean;
  /** Callback to close the paywall (called on dismiss or after successful purchase). */
  onDismiss: () => void;
  /** The feature that triggered the paywall — displayed to the user. */
  feature: EntitlementFeature;
}

/**
 * Maps feature identifiers to i18n keys for Pro benefit descriptions.
 * Used to look up the translated feature name for the paywall subtitle.
 */
const FEATURE_LABEL_KEYS: Record<EntitlementFeature, string> = {
  analytics: "subscription.featureAnalytics",
  unlimited_beta: "subscription.featureVideos",
  extra_badges: "subscription.featureBadges",
};

export function Paywall({ visible, onDismiss, feature }: PaywallProps) {
  const { t } = useTranslation();
  const { purchaseMutation, restoreMutation } = useSubscription();

  // Auto-dismiss the paywall when the purchase succeeds.
  // The user just paid — get them to the feature ASAP.
  useEffect(() => {
    if (purchaseMutation.isSuccess) {
      onDismiss();
    }
  }, [purchaseMutation.isSuccess, onDismiss]);

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* Header */}
        <Text style={styles.title}>{t("subscription.upgradeToPro")}</Text>
        <Text style={styles.subtitle}>
          {t("subscription.unlockFeature", { feature: t(FEATURE_LABEL_KEYS[feature]).toLowerCase() })}
        </Text>

        {/* Benefits list — shows all Pro perks, not just the triggered one */}
        <View style={styles.benefitsList}>
          <Text style={styles.benefitItem}>
            {"\u2713"} {t("subscription.featureAnalytics")}
          </Text>
          <Text style={styles.benefitItem}>
            {"\u2713"} {t("subscription.featureVideos")}
          </Text>
          <Text style={styles.benefitItem}>
            {"\u2713"} {t("subscription.featureBadges")}
          </Text>
        </View>

        {/* Subscribe button — triggers the store purchase sheet */}
        <Pressable
          style={styles.subscribeButton}
          onPress={() =>
            purchaseMutation.mutate(IAP_PRODUCT_IDS.PRO_MONTHLY)
          }
          disabled={purchaseMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={t("subscription.subscribe")}
          accessibilityState={{ disabled: purchaseMutation.isPending }}
        >
          <Text style={styles.subscribeButtonText}>{t("subscription.subscribe")}</Text>
        </Pressable>

        {/* Loading indicator while purchase/verification is in progress */}
        {purchaseMutation.isPending && (
          <ActivityIndicator
            testID="purchase-loading"
            size="small"
            style={styles.loading}
          />
        )}

        {/* Error message if purchase or verification failed */}
        {purchaseMutation.isError && (
          <Text style={styles.errorText}>
            {t("subscription.purchaseFailed")}
          </Text>
        )}

        {/* Restore link for users who previously purchased */}
        <Pressable
          style={styles.restoreButton}
          onPress={() => restoreMutation.mutate()}
          disabled={restoreMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={t("subscription.restorePurchases")}
          accessibilityState={{ disabled: restoreMutation.isPending }}
        >
          <Text style={styles.restoreText}>{t("subscription.restorePurchases")}</Text>
        </Pressable>

        {/* Promo code input — expandable section for trial codes */}
        <PromoCodeInput onSuccess={onDismiss} />

        {/* Dismiss link — lets the user close without purchasing */}
        <Pressable
          style={styles.dismissButton}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={t("subscription.notNow")}
        >
          <Text style={styles.dismissText}>{t("subscription.notNow")}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#1a1a1a",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 32,
    textAlign: "center",
  },
  benefitsList: {
    alignSelf: "stretch",
    marginBottom: 32,
    paddingHorizontal: 24,
  },
  benefitItem: {
    fontSize: 16,
    color: "#333",
    marginBottom: 12,
    lineHeight: 24,
  },
  subscribeButton: {
    backgroundColor: "#7C3AED",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    marginBottom: 16,
  },
  subscribeButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  loading: {
    marginBottom: 16,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 14,
    marginBottom: 16,
  },
  restoreButton: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  restoreText: {
    color: "#7C3AED",
    fontSize: 14,
    fontWeight: "500",
  },
  dismissButton: {
    paddingVertical: 12,
  },
  dismissText: {
    color: "#999",
    fontSize: 14,
  },
});
