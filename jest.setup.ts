/**
 * Jest Setup — Global Test Configuration
 *
 * This file runs after the test framework is installed but before tests execute.
 * It configures libraries that need special handling in the test environment.
 *
 * TanStack Query's notifyManager:
 * By default, TanStack Query batches state updates using setTimeout(fn, 0).
 * In tests, these deferred updates don't flush inside React's act() wrapper,
 * causing mutation error/success states to appear stale. Setting the schedule
 * function to synchronous (fn => fn()) ensures state updates happen immediately
 * during act(), making tests deterministic.
 *
 * This is the officially recommended approach from the TanStack Query docs:
 * https://tanstack.com/query/latest/docs/framework/react/guides/testing
 *
 * i18n initialization:
 * We initialize i18next synchronously with the real EN translations so that
 * all existing tests continue to work unchanged. Every `t("key")` call
 * returns the English string, so `getByText("Sign Out")` still matches.
 * This avoids modifying 1387+ existing test assertions.
 */

import { notifyManager } from "@tanstack/react-query";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";

// Make TanStack Query state updates synchronous in tests.
// Without this, useMutation error states may not be flushed
// before assertions run, causing flaky test failures.
notifyManager.setScheduler((fn) => {
  fn();
});

// Initialize i18next synchronously with real English translations.
// This is the test-environment equivalent of initI18n() from lib/i18n.ts,
// but without async SecureStore/Localization calls. All `useTranslation()`
// hooks will return English strings, keeping existing test assertions valid.
i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
