// components/navigation/CustomTabBar.tsx
//
// Custom bottom tab bar with 4 route tabs and a raised center FAB.
//
// WHY A CUSTOM TAB BAR?
// React Navigation's built-in tab bar doesn't support injecting a non-tab
// element (like our Start Session FAB) into the middle. By providing a
// custom `tabBar` prop to the <Tabs> navigator, we take full control of
// the layout: Home, Map, [FAB], Leaderboards, Profile.
//
// The FAB is NOT a tab screen — it doesn't correspond to any route in the
// tab navigator. Instead, it uses `router.push("/start-session")` to open
// a modal screen that lives outside the (tabs) group. This means tapping
// the FAB doesn't change which tab is active; the session modal slides
// up on top of whatever tab the user was viewing.
//
// LAYOUT STRATEGY:
// The bar is a flex-row with 5 equally-sized columns. Tabs occupy columns
// 1, 2, 4, and 5. Column 3 is a "spacer" that contains the FAB, which
// uses a negative top margin to rise above the bar's top edge. This creates
// the raised/floating visual effect.
//
// WHY PLATFORM.SELECT FOR SHADOWS?
// NativeWind's shadow utilities don't map directly to React Native's shadow
// system (iOS uses shadow* props, Android uses elevation). We use
// Platform.select to apply the correct shadow implementation per OS.

import React, { useState } from "react";
import { View, Text, Pressable, Platform, Modal } from "react-native";
import { Home, MapPin, Plus, Trophy, User, ScanLine } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

// ── Constants ────────────────────────────────────────────────────────

// Colors for active/inactive tab icons and labels.
// Active uses the app's accent purple; inactive uses a muted gray.
// These match the design system's --accent and --text-secondary tokens.
const ACTIVE_COLOR = "#7C3AED";
const INACTIVE_COLOR = "#6B6B80";

/**
 * Maps each tab route name to its Lucide icon component.
 * Route names come from the file-based routing in app/(tabs)/ —
 * "index" is the Home tab (app/(tabs)/index.tsx), etc.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  index: Home,
  map: MapPin,
  leaderboards: Trophy,
  profile: User,
};

/**
 * Maps each tab route name to its i18n translation key.
 * "index" → "tabs.home" because the file is named index.tsx (Expo Router's
 * convention for the default route in a group), but users see the localized "Home".
 * We store keys here instead of display strings — the t() function resolves
 * them to the user's language at render time.
 */
const LABEL_KEY_MAP: Record<string, string> = {
  index: "tabs.home",
  map: "tabs.map",
  leaderboards: "tabs.leaderboards",
  profile: "tabs.profile",
};

/**
 * Platform-specific shadow for the FAB.
 *
 * iOS: Uses the native shadow system (shadowColor, shadowOffset, etc.)
 * to create a purple glow effect below and around the button.
 *
 * Android: Uses `elevation` which creates a material-design shadow.
 * Android's elevation doesn't support custom shadow colors (it's always
 * a dark gray), but it still provides the raised visual effect.
 */
const FAB_SHADOW = Platform.select({
  ios: {
    shadowColor: ACTIVE_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  android: {
    elevation: 8,
  },
});

// ── Component ────────────────────────────────────────────────────────

/**
 * CustomTabBar — renders 4 route tabs with a center FAB.
 *
 * @param props - BottomTabBarProps from React Navigation, containing:
 *   - state: navigation state with routes array and active index
 *   - navigation: methods to emit events and navigate
 *   - insets: safe area insets for bottom padding
 *
 * The component is designed to be passed as the `tabBar` prop:
 * ```tsx
 * <Tabs tabBar={(props) => <CustomTabBar {...props} />}>
 * ```
 */
export function CustomTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const router = useRouter();
  // useTranslation gives us the t() function to resolve i18n keys at render time.
  // This must be called inside the component so it re-renders on language change.
  const { t } = useTranslation();

  // Tracks whether the FAB action menu is visible (opened via long press).
  // The menu appears as a card above the FAB with additional actions like
  // "Scan QR Code" — actions that are useful but don't warrant a tab slot.
  const [showMenu, setShowMenu] = useState(false);

  /**
   * Handle FAB press: trigger haptic feedback + navigate to session modal.
   *
   * WHY HAPTICS?
   * The FAB is the primary call-to-action in the app. Haptic feedback
   * makes it feel more "physical" and satisfying than a regular tap,
   * reinforcing that this is a special action (starting a climbing session).
   * We use Medium impact — strong enough to notice, not so strong it's jarring.
   */
  const handleFabPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/start-session");
  };

  /**
   * Handle FAB long press: show the action menu above the FAB.
   *
   * Long press is a "power user" gesture that reveals less-common actions.
   * This keeps the primary FAB interaction (short press → Start Session)
   * fast and uncluttered while still providing quick access to features
   * like the QR scanner.
   */
  const handleFabLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowMenu(true);
  };

  /**
   * Handle "Scan QR Code" menu item press: navigate to the scan screen.
   * The scan screen is a hidden tab (href: null) so it integrates with
   * tab navigation for seamless back-button behavior.
   */
  const handleScanPress = () => {
    setShowMenu(false);
    router.push("/(tabs)/scan");
  };

  /**
   * Handle tab press using React Navigation's two-step protocol:
   * 1. Emit a "tabPress" event so listeners can prevent default behavior
   *    (e.g., a screen might want to scroll-to-top instead of switching tabs)
   * 2. If the event wasn't prevented, navigate to the tab
   *
   * @param route - The route object for the pressed tab
   * @param isFocused - Whether this tab is already active
   */
  const handleTabPress = (
    route: { key: string; name: string },
    isFocused: boolean
  ) => {
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });

    // Only navigate if the event wasn't prevented by a listener
    // and the tab isn't already focused (avoid unnecessary re-renders).
    if (!event.defaultPrevented && !isFocused) {
      navigation.navigate(route.name);
    }
  };

  /**
   * Renders a single tab button with icon + label.
   *
   * @param route - Route object from navigation state
   * @param index - Tab index (0-3) to determine if this tab is active
   */
  const renderTab = (route: { key: string; name: string }, index: number) => {
    const isFocused = state.index === index;
    const color = isFocused ? ACTIVE_COLOR : INACTIVE_COLOR;
    const Icon = ICON_MAP[route.name];
    // Resolve the translation key to a localized label at render time
    const label = t(LABEL_KEY_MAP[route.name]);

    return (
      <Pressable
        key={route.key}
        onPress={() => handleTabPress(route, isFocused)}
        // accessibilityRole="tab" tells screen readers this is part of a
        // tab bar navigation. Combined with accessibilityState.selected,
        // VoiceOver says "Home, selected, tab" for the active tab.
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        className="flex-1 items-center justify-center py-2"
      >
        {/* Icon sized at 24px (Lucide's native grid size) with color
            based on active/inactive state */}
        <Icon size={24} color={color} strokeWidth={2} />
        {/* Label text below the icon, sized small to avoid crowding */}
        <Text
          style={{ color, fontSize: 10, marginTop: 2 }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      // The tab bar sits at the bottom of the screen.
      // - flex-row: horizontal layout for the 5 columns
      // - bg-background: matches the app's background color
      // - border-t border-border: subtle top border separating bar from content
      // - items-end: aligns children to the bottom, so the FAB can overflow upward
      className="flex-row bg-background border-t border-border items-end"
      // Bottom padding respects the device's safe area (e.g., iPhone home indicator)
      style={{ paddingBottom: insets.bottom }}
    >
      {/* Tabs 0 and 1 (Home, Map) — left side of the FAB */}
      {renderTab(state.routes[0], 0)}
      {renderTab(state.routes[1], 1)}

      {/* Center column: FAB spacer — same flex-1 width as each tab,
          but contains the FAB instead of a route tab */}
      <View className="flex-1 items-center justify-center py-2">
        <Pressable
          onPress={handleFabPress}
          onLongPress={handleFabLongPress}
          testID="fab-button"
          // accessibilityRole="button" (not "tab") because the FAB
          // isn't a tab — it's an action button that opens a modal.
          accessibilityRole="button"
          accessibilityLabel={t("session.startSession")}
          // The FAB is a 56x56 circle with accent background.
          // marginTop: -28 pulls it up by half its height, creating
          // the raised/floating effect above the tab bar edge.
          className="w-14 h-14 rounded-full bg-accent items-center justify-center"
          style={{
            marginTop: -28,
            ...FAB_SHADOW,
          }}
        >
          {/* Plus icon in white, centered inside the purple circle */}
          <Plus size={28} color="#FFFFFF" strokeWidth={2.5} />
        </Pressable>
      </View>

      {/* Tabs 2 and 3 (Leaderboards, Profile) — right side of the FAB */}
      {renderTab(state.routes[2], 2)}
      {renderTab(state.routes[3], 3)}

      {/* FAB Action Menu — appears above the FAB on long press.
          Uses a transparent Modal so tapping the backdrop closes the menu.
          The menu is intentionally extensible — more items (e.g., "View
          Logbook", "Quick Settings") can be added to the list later. */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        {/* Backdrop — tapping anywhere outside the menu closes it */}
        <Pressable
          className="flex-1"
          onPress={() => setShowMenu(false)}
        >
          {/* Menu card — positioned near the bottom, above the tab bar.
              We use absolute positioning from the bottom to place it
              just above where the FAB sits. */}
          <View
            className="absolute left-1/2 bg-background rounded-xl border border-border"
            style={{
              bottom: 90 + insets.bottom,
              // Center horizontally: translate left by half the menu width.
              // The menu is ~180px wide, so -90 centers it on the FAB.
              transform: [{ translateX: -90 }],
              width: 180,
              ...Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: -2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                },
                android: { elevation: 8 },
              }),
            }}
          >
            {/* Scan QR Code menu item */}
            <Pressable
              onPress={handleScanPress}
              className="flex-row items-center gap-3 px-4 py-3"
              accessibilityRole="button"
            >
              <ScanLine size={20} color={ACTIVE_COLOR} strokeWidth={2} />
              <Text className="text-foreground text-sm font-medium">
                {t("scan.scanQR")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
