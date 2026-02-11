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
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16 }}
    >
      <Text className="text-2xl font-bold text-text-primary mb-6">
        Community Guidelines
      </Text>

      <Text className="text-text-secondary text-base mb-6 leading-6">
        Beta Breaker is a community of climbers helping each other improve.
        To keep things positive and productive, please follow these guidelines.
      </Text>

      <Section title="Be Respectful">
        Treat other climbers with respect regardless of skill level,
        experience, or background. Constructive feedback on beta tips is
        encouraged, but personal attacks, insults, or discriminatory
        language will not be tolerated. Everyone was a beginner once.
      </Section>

      <Section title="No Spam">
        Keep content relevant to climbing and the gym community. Do not post
        promotional content, repetitive messages, or off-topic material in
        beta tips or feedback. Commercial promotions should go through
        official gym channels.
      </Section>

      <Section title="Safety First">
        Never share beta that encourages dangerous or reckless climbing
        practices. Tips should promote safe technique and proper use of
        equipment. If you see advice that could lead to injury, report it
        immediately.
      </Section>

      <Section title="Report Violations">
        If you encounter content that violates these guidelines, use the
        report button (flag icon) on the offending content. Select the
        appropriate reason and our moderation team will review it. False
        reports waste moderator time, so please only report genuine
        violations.
      </Section>
    </ScrollView>
  );
}
