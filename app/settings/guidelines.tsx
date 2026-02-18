/**
 * Community Guidelines Screen — Platform Behavior Standards
 *
 * A static informational screen that outlines what behavior is acceptable
 * on Beta Breaker. Linked from:
 *   - The settings menu (users can review anytime)
 *   - The report flow (so reporters understand what's reportable)
 *
 * The guidelines are organized into four sections:
 *   1. Be Respectful — basic social conduct
 *   2. No Spam — no promotional or off-topic content
 *   3. Safety First — no dangerous or irresponsible climbing advice
 *   4. Report Violations — how to flag content that breaks the rules
 *
 * This is a purely presentational screen — no data fetching, no hooks,
 * just formatted text in a ScrollView.
 */

import React from "react";
import { ScrollView, View, Text } from "react-native";
import { useTranslation } from "react-i18next";

/**
 * A single guideline section with a bold heading and body paragraph.
 * Extracted to reduce repetition in the render tree.
 */
function Section({
  title,
  children,
}: {
  title: string;
  children: string;
}) {
  return (
    <View className="mb-6">
      <Text className="text-text-primary text-lg font-bold mb-2">
        {title}
      </Text>
      <Text className="text-text-secondary text-base leading-6">
        {children}
      </Text>
    </View>
  );
}

export default function GuidelinesScreen() {
  const { t } = useTranslation();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16 }}
    >
      <Text className="text-2xl font-bold text-text-primary mb-6">
        {t("guidelines.title")}
      </Text>

      <Text className="text-text-secondary text-base mb-6 leading-6">
        {t("guidelines.intro")}
      </Text>

      <Section title={t("guidelines.respectTitle")}>
        {t("guidelines.respectBody")}
      </Section>

      <Section title={t("guidelines.spamTitle")}>
        {t("guidelines.spamBody")}
      </Section>

      <Section title={t("guidelines.safetyTitle")}>
        {t("guidelines.safetyBody")}
      </Section>

      <Section title={t("guidelines.reportTitle")}>
        {t("guidelines.reportBody")}
      </Section>
    </ScrollView>
  );
}
