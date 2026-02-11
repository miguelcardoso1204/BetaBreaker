/**
 * Admin Route Group Layout — Role-Gated Container for Admin Screens
 *
 * This layout wraps all routes under `app/(admin)/` and enforces that
 * only users with admin-level roles (gym_admin or super_admin) can access
 * them. Non-admin users are redirected to the main tabs.
 *
 * WHY A LAYOUT GUARD?
 * RLS enforces data access at the database level (the hard security boundary).
 * This layout guard is a UX convenience — it prevents non-admins from seeing
 * an empty moderation queue or getting confusing errors. Even if someone
 * bypasses this guard, RLS would block their queries.
 *
 * REDIRECT PATTERN (from MEMORY.md — Expo Router AuthGate):
 * We always render <Slot /> and use useEffect + router.replace() for
 * redirects. Conditionally returning <Redirect> instead of <Slot />
 * causes infinite remount loops because child routes have no container
 * to render in. The useSegments() check prevents unnecessary redirects
 * when already navigating away.
 */

import React, { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { useAuth } from "@/hooks/useAuth";

export default function AdminLayout() {
  const { role, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Don't redirect while auth is still loading — we don't know the
    // user's role yet. Redirecting prematurely would flash the admin
    // screen before bouncing non-admins.
    if (isLoading) return;

    // Check if the user has admin privileges. Only gym_admin and
    // super_admin roles can access admin screens. Other roles
    // (climber, setter, judge) are redirected to the main tabs.
    const isAdmin = role === "gym_admin" || role === "super_admin";

    // Only redirect if we're still in the (admin) route group.
    // This prevents redirect loops if the navigation is already
    // taking the user elsewhere.
    // Cast to string because Expo Router's auto-generated segment types
    // may not include "(admin)" yet until the next type generation pass.
    if (!isAdmin && (segments[0] as string) === "(admin)") {
      router.replace("/(tabs)");
    }
  }, [role, isLoading, segments, router]);

  // Always render <Slot /> to provide a container for child routes.
  // The redirect happens via useEffect, not by conditionally omitting Slot.
  return <Slot />;
}
