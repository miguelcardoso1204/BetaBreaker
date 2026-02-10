/**
 * Jest configuration for Beta Breaker — multi-project setup.
 *
 * We split tests into two "projects" so they run in different environments:
 *
 * 1. **unit** — Uses jest-expo preset (React Native + Expo env).
 *    Runs all tests in the app except `supabase/__tests__/`.
 *    This is the default when you run `npm test`.
 *
 * 2. **integration** — Uses plain Node.js env (no React Native).
 *    Runs database integration tests in `supabase/__tests__/`.
 *    Requires local Supabase to be running (`npx supabase start`).
 *    Run with `npm run test:integration`.
 *
 * Why two projects?
 * - Unit tests need the React Native runtime (transforms JSX, handles
 *   native modules). They should be fast and not require Docker.
 * - Integration tests connect directly to Postgres via the `pg` npm
 *   package to verify migrations, RLS, triggers, etc. They need a
 *   Node.js environment with network access, not a React Native one.
 *
 * `npm test` runs only unit tests (fast, no Docker needed).
 * `npm run test:integration` runs only DB integration tests.
 */
module.exports = {
  projects: [
    // --- Unit tests (React Native / Expo) ---
    {
      displayName: 'unit',

      // jest-expo/jest-preset configures the test environment for React Native + Expo
      preset: 'jest-expo',

      // Override jest-expo's default transformIgnorePatterns to also transform
      // `jose` (JWT library). jose ships only ESM — Node/Jest can't run ESM
      // syntax directly, so Babel must transpile it. We add `jose` to the
      // allow-list alongside the other ESM-only packages from the preset.
      transformIgnorePatterns: [
        '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|jose))',
        '/node_modules/react-native-reanimated/plugin/',
      ],

      // Load built-in matchers from @testing-library/react-native
      // Gives us assertions like toBeOnTheScreen(), toHaveTextContent(), etc.
      // Also load our custom setup that makes TanStack Query updates synchronous
      // in tests (prevents flaky mutation error state assertions).
      setupFilesAfterEnv: [
        '@testing-library/react-native/build/matchers/extend-expect',
        '<rootDir>/jest.setup.ts',
      ],

      // Mirror the @/* path alias from tsconfig.json so tests can use the same import paths.
      // Also map .css imports to an empty module — Jest runs in Node.js and can't
      // parse CSS. Without this, `import "../global.css"` in _layout.tsx would crash.
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '\\.(css)$': '<rootDir>/__mocks__/styleMock.js',
      },

      // Run all tests EXCEPT those in supabase/__tests__/ (those are integration tests)
      testPathIgnorePatterns: [
        '/node_modules/',
        '<rootDir>/supabase/__tests__/',
      ],
    },

    // --- Integration tests (Node.js + Postgres) ---
    {
      displayName: 'integration',

      // Plain Node.js environment — no React Native transforms needed.
      // We talk directly to Postgres via the `pg` package.
      testEnvironment: 'node',

      // Only run tests inside supabase/__tests__/
      testMatch: ['<rootDir>/supabase/__tests__/**/*.test.ts'],

      // Integration tests are written in TypeScript, so we need ts-jest
      // to compile them. We use the default tsconfig which has strict mode.
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          // Use the project's tsconfig but override the module system
          // to CommonJS since Jest doesn't support ESM natively
          tsconfig: {
            module: 'commonjs',
            moduleResolution: 'node',
            esModuleInterop: true,
            // Inherit strict mode from the project tsconfig
            strict: true,
          },
        }],
      },

      // Mirror the @/* path alias so integration tests can import shared utils
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
      },

      testPathIgnorePatterns: ['/node_modules/'],
    },
  ],
};
