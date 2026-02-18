/**
 * i18n Configuration — Internationalization Setup
 *
 * Uses i18next + react-i18next for translations, expo-localization for
 * detecting the device language, and expo-secure-store for persisting
 * the user's language preference across app restarts.
 *
 * SUPPORTED LANGUAGES:
 *   - "en" (English) — default fallback
 *   - "pt-PT" (Portuguese - Portugal)
 *
 * INITIALIZATION FLOW:
 *   1. Read stored language from SecureStore (if any)
 *   2. If no stored pref, detect device locale via expo-localization
 *   3. Map device locale to a supported language (e.g., "pt" → "pt-PT")
 *   4. Initialize i18next with the resolved language
 *
 * WHY expo-secure-store FOR LANGUAGE?
 * We already use SecureStore for auth tokens. Keeping all persistent
 * preferences in one place is simpler than introducing AsyncStorage
 * for a single key. The "security" aspect is irrelevant here — it's
 * just a convenient key-value store that's already in our dependency tree.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import * as SecureStore from "expo-secure-store";

import en from "@/locales/en.json";
import ptPT from "@/locales/pt-PT.json";

// ── Constants ────────────────────────────────────────────────────────

/** The SecureStore key where the user's language preference is stored. */
const LANGUAGE_STORAGE_KEY = "app_language";

/** All languages the app supports. Used in the language picker UI. */
export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "pt-PT", name: "Português" },
] as const;

/** Quick lookup set for validating language codes.
 *  Typed as Set<string> so we can pass arbitrary strings to .has()
 *  without TS complaining about "string is not assignable to 'en' | 'pt-PT'". */
const SUPPORTED_CODES: Set<string> = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));

// ── Locale Detection ─────────────────────────────────────────────────

/**
 * Maps a device locale string to a supported language code.
 *
 * expo-localization returns locales like "en-US", "pt-BR", "pt-PT", "fr-FR".
 * We need to map these to our supported codes:
 *   - Exact match first (e.g., "pt-PT" → "pt-PT")
 *   - Language prefix match (e.g., "pt-BR" → "pt-PT", "pt" → "pt-PT")
 *   - Fallback to "en" if no match
 */
function resolveLocale(deviceLocale: string): string {
  // Exact match (e.g., "pt-PT" or "en")
  if (SUPPORTED_CODES.has(deviceLocale)) {
    return deviceLocale;
  }

  // Extract the language prefix (e.g., "pt-BR" → "pt")
  const prefix = deviceLocale.split("-")[0];

  // Find any supported language that starts with this prefix
  const match = SUPPORTED_LANGUAGES.find(
    (l) => l.code === prefix || l.code.startsWith(prefix + "-")
  );

  return match ? match.code : "en";
}

// ── Initialization ───────────────────────────────────────────────────

/**
 * Initialize i18next with the user's preferred language.
 *
 * Call this once at app startup (in RootLayout) before rendering any
 * translated content. It's async because it reads from SecureStore and
 * detects the device locale.
 *
 * IMPORTANT: This function is idempotent — calling it multiple times
 * is safe. i18next.init() is a no-op if already initialized.
 */
export async function initI18n(): Promise<void> {
  // 1. Check if the user previously chose a language
  let language: string | null = null;
  try {
    language = await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);
  } catch {
    // SecureStore might fail in some test environments — that's fine,
    // we'll fall through to device locale detection.
  }

  // 2. If no stored preference, detect from device locale
  if (!language) {
    // Localization.getLocales() returns an array of locale objects
    // sorted by user preference. We take the first (most preferred).
    const locales = Localization.getLocales();
    const deviceLocale = locales[0]?.languageTag ?? "en";
    language = resolveLocale(deviceLocale);
  }

  // 3. Validate the stored/detected language is still supported
  // (in case we remove a language in a future update)
  if (!SUPPORTED_CODES.has(language)) {
    language = "en";
  }

  // 4. Initialize i18next
  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      "pt-PT": { translation: ptPT },
    },
    lng: language,
    fallbackLng: "en",
    interpolation: {
      // React Native already escapes rendered text — no need for
      // i18next to double-escape HTML entities.
      escapeValue: false,
    },
  });
}

// ── Language Switching ────────────────────────────────────────────────

/**
 * Change the app language and persist the choice to SecureStore.
 *
 * Call this from the settings screen's language picker. i18next
 * automatically re-renders all components that use `useTranslation()`
 * when the language changes.
 */
export async function changeLanguage(languageCode: string): Promise<void> {
  await i18n.changeLanguage(languageCode);
  try {
    await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, languageCode);
  } catch {
    // Persist failure is non-critical — the language is already changed
    // in memory. It just won't persist across app restarts.
  }
}

// Export the i18n instance for non-component code that needs translations
// (e.g., date formatting functions that need the current language).
export default i18n;
