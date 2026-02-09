/**
 * SessionTimer — Live Elapsed Time Display for Active Sessions
 *
 * Shows a ticking HH:MM:SS clock during an active climbing session. When
 * the user starts a session (Step 5.1), this component reads the start
 * time from the session store and computes elapsed time every second.
 *
 * WHY READ FROM useSession INSTEAD OF PROPS?
 * The timer is tightly coupled to the session lifecycle — it only makes
 * sense when there's an active session. Reading isActive and startTime
 * directly from the hook (rather than accepting them as props) means:
 *   1. Parent components don't need to thread session state through
 *   2. The timer auto-starts/stops when session state changes
 *   3. There's no risk of prop/store desync
 *
 * WHY Date.now() - startTime EACH TICK?
 * The alternative would be incrementing a counter by 1000ms each tick.
 * But setInterval isn't perfectly accurate — intervals can drift by a few
 * ms each tick, compounding over long sessions. By computing the real
 * elapsed time from timestamps each tick, we stay accurate regardless
 * of how long the session runs.
 *
 * HOW IT CONNECTS:
 * 1. Session store (Step 5.1) → provides isActive + startTime
 * 2. useSession hook (Step 5.3) → bridges store to this component
 * 3. formatElapsedTime (Step 5.5) → converts ms to "HH:MM:SS"
 * 4. QuickLog sheet (Step 5.4) → appears alongside this timer
 */

import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { useSession } from "@/hooks/useSession";
import { formatElapsedTime } from "@/utils/time";

// ── Props ────────────────────────────────────────────────────────────

export interface SessionTimerProps {
  /** Additional NativeWind classes for layout customization. */
  className?: string;
  /** Test ID for finding this component in tests. */
  testID?: string;
}

// ── Component ────────────────────────────────────────────────────────

/**
 * SessionTimer — displays live elapsed time in HH:MM:SS format.
 *
 * When the session is active, an interval updates the display every second.
 * When inactive, it shows "00:00:00" as a placeholder.
 *
 * Usage:
 * ```tsx
 * // In a session screen layout
 * <SessionTimer className="mb-4" />
 * ```
 */
export function SessionTimer({ className = "", testID }: SessionTimerProps) {
  const { isActive, startTime } = useSession();

  // Local state for the current elapsed time in milliseconds.
  // Updated every second by the interval when the session is active.
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    // Only run the timer when there's an active session with a valid
    // start time. The startTime check is important — 0 is falsy in JS,
    // but our store uses Date.now() which is always a large positive
    // number, so this truthy check is safe here.
    if (!isActive || !startTime) {
      // Reset to zero when session becomes inactive (e.g., user ends session).
      setElapsedMs(0);
      return;
    }

    // Compute the initial elapsed time immediately so the display doesn't
    // show "00:00:00" for the first second before the interval fires.
    setElapsedMs(Date.now() - startTime);

    // Start a 1-second interval that recomputes elapsed time from the
    // real timestamps. This avoids drift — even if an interval fires
    // late (e.g., app was backgrounded), the next tick self-corrects
    // by using the true current time.
    const intervalId = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 1000);

    // Cleanup: stop the interval when the component unmounts or when
    // dependencies change (session becomes inactive, new session starts).
    // Without cleanup, the interval would keep running and cause a
    // "setState on unmounted component" warning.
    return () => clearInterval(intervalId);
  }, [isActive, startTime]);

  return (
    <Text
      testID={testID}
      // Monospace font for consistent digit width — prevents the timer
      // from "jumping" horizontally as digits change (e.g., 1→2 is narrower
      // than 0→0 in proportional fonts). text-4xl for large, prominent display.
      className={`text-4xl font-bold text-white font-mono text-center ${className}`}
    >
      {formatElapsedTime(elapsedMs)}
    </Text>
  );
}
