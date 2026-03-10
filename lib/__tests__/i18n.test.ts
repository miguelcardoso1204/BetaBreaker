/**
 * Tests for lib/i18n.ts — i18n initialization and language switching.
 *
 * These tests verify the core i18n behavior:
 *   - Initializes without error
 *   - Default language is English
 *   - Translation lookup returns English strings
 *   - Unknown keys return the key itself (i18next default)
 *   - Language switching to Portuguese works
 *   - Device locale "pt" maps to "pt-PT"
 *   - Unsupported device locale falls back to "en"
 *   - Stored language preference in SecureStore is respected
 *
 * WHY RESET i18n BETWEEN TESTS?
 * i18next is a singleton — once initialized, calling init() again is
 * a no-op. We need to reset it before each test to verify different
 * initialization scenarios (stored pref, device locale, etc.).
 */

import i18n from "i18next";

// ── Mocks ────────────────────────────────────────────────────────────

// Mock expo-secure-store to control stored language preference
const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
jest.mock("expo-secure-store", () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
}));

// Mock expo-localization to control device locale detection
const mockGetLocales = jest.fn();
jest.mock("expo-localization", () => ({
  getLocales: () => mockGetLocales(),
}));

// Import after mocks are set up (jest.mock is hoisted, but imports
// of the module under test should come after mock declarations for clarity)
import { initI18n, changeLanguage, SUPPORTED_LANGUAGES } from "../i18n";
import en from "@/locales/en.json";
import ptPT from "@/locales/pt-PT.json";

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Reset i18next to uninitialized state between tests.
 *
 * i18next's init() is a no-op if already initialized. We need to
 * fully reset the internal state so each test can call initI18n()
 * with different mock configurations (stored pref, device locale, etc.).
 *
 * Simply setting isInitialized = false isn't enough — the language
 * set by a previous changeLanguage() call persists in the internal
 * store. We also need to clear the language so init()'s `lng` option
 * takes effect again.
 */
function resetI18n() {
  if (i18n.isInitialized) {
    (i18n as any).isInitialized = false;
    // Clear internal language state so the next init()'s lng is respected.
    // Without this, changeLanguage("pt-PT") from one test leaks into the next.
    (i18n as any).language = undefined;
    (i18n as any).languages = undefined;
  }
}

// ── Test Suite ───────────────────────────────────────────────────────

describe("lib/i18n", () => {
  beforeEach(() => {
    resetI18n();
    jest.clearAllMocks();

    // Default mock behavior: no stored preference, device locale is English
    mockGetItemAsync.mockResolvedValue(null);
    mockSetItemAsync.mockResolvedValue(undefined);
    mockGetLocales.mockReturnValue([{ languageTag: "en-US" }]);
  });

  it("initializes without error", async () => {
    await expect(initI18n()).resolves.not.toThrow();
  });

  it("defaults to English when no stored preference exists", async () => {
    mockGetItemAsync.mockResolvedValue(null);
    mockGetLocales.mockReturnValue([{ languageTag: "en-US" }]);

    await initI18n();

    expect(i18n.language).toBe("en");
  });

  it("returns the correct English string for a known key", async () => {
    await initI18n();

    // t() should return the English translation from en.json
    expect(i18n.t("common.cancel")).toBe("Cancel");
    expect(i18n.t("auth.login.title")).toBe("Beta Breaker");
    expect(i18n.t("settings.signOut")).toBe("Sign Out");
  });

  it("returns the key itself for an unknown key", async () => {
    await initI18n();

    // i18next returns the key string when no translation exists
    expect(i18n.t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("switches to Portuguese via changeLanguage", async () => {
    await initI18n();
    expect(i18n.language).toBe("en");

    await changeLanguage("pt-PT");

    expect(i18n.language).toBe("pt-PT");
    expect(i18n.t("common.cancel")).toBe("Cancelar");
    expect(i18n.t("auth.login.title")).toBe("Beta Breaker");
  });

  it("persists language choice to SecureStore", async () => {
    await initI18n();

    await changeLanguage("pt-PT");

    expect(mockSetItemAsync).toHaveBeenCalledWith("app_language", "pt-PT");
  });

  it('maps device locale "pt" to "pt-PT"', async () => {
    mockGetItemAsync.mockResolvedValue(null);
    // Device reports Portuguese without country code
    mockGetLocales.mockReturnValue([{ languageTag: "pt" }]);

    await initI18n();

    expect(i18n.language).toBe("pt-PT");
  });

  it('maps device locale "pt-BR" to "pt-PT"', async () => {
    mockGetItemAsync.mockResolvedValue(null);
    // Brazilian Portuguese should map to our PT-PT since it's the
    // closest supported language
    mockGetLocales.mockReturnValue([{ languageTag: "pt-BR" }]);

    await initI18n();

    expect(i18n.language).toBe("pt-PT");
  });

  it('falls back to "en" for unsupported device locale', async () => {
    mockGetItemAsync.mockResolvedValue(null);
    // French is not supported — should fall back to English
    mockGetLocales.mockReturnValue([{ languageTag: "fr-FR" }]);

    await initI18n();

    expect(i18n.language).toBe("en");
  });

  it("respects stored language preference over device locale", async () => {
    // User previously chose Portuguese, but device is English
    mockGetItemAsync.mockResolvedValue("pt-PT");
    mockGetLocales.mockReturnValue([{ languageTag: "en-US" }]);

    await initI18n();

    // Stored preference should win
    expect(i18n.language).toBe("pt-PT");
  });

  it("exports SUPPORTED_LANGUAGES with correct structure", () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(2);
    expect(SUPPORTED_LANGUAGES[0]).toEqual({ code: "en", name: "English" });
    expect(SUPPORTED_LANGUAGES[1]).toEqual({ code: "pt-PT", name: "Português" });
  });

  it("handles SecureStore read failure gracefully", async () => {
    mockGetItemAsync.mockRejectedValue(new Error("SecureStore unavailable"));
    mockGetLocales.mockReturnValue([{ languageTag: "en-US" }]);

    // Should not throw — falls back to device locale
    await expect(initI18n()).resolves.not.toThrow();
    expect(i18n.language).toBe("en");
  });
});
