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
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react-native";
import { IconButton } from "@/components/ui/IconButton";

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
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header: back button + title. The settings stack hides its own
          header (settings/_layout.tsx), so each screen renders its own. */}
      <View className="px-4 pt-2 pb-2 flex-row items-center">
        <IconButton
          icon={ArrowLeft}
          label={t("common.goBack")}
          onPress={() => router.back()}
          size={24}
          color="#FFFFFF"
        />
        <Text className="text-text-primary text-xl font-bold ml-3">
          {t("guidelines.title")}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16 }}
      >
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
    </SafeAreaView>
  );
}
