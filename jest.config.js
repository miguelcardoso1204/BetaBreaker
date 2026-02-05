/**
 * Jest configuration for Beta Breaker.
 *
 * Uses the jest-expo preset which pre-configures Jest for Expo/React Native:
 * - Sets up the React Native runtime environment
 * - Handles asset transforms (images, fonts, etc.)
 * - Configures module resolution for Expo packages
 *
 * The `setupFilesAfterEnv` array loads the built-in Jest matchers from
 * @testing-library/react-native, giving us assertions like toBeOnTheScreen(),
 * toHaveTextContent(), etc. without the deprecated @testing-library/jest-native.
 *
 * moduleNameMapper mirrors the @/* path alias from tsconfig.json so imports
 * like `@/utils/grades` resolve correctly in test files.
 */
module.exports = {
  // jest-expo/jest-preset configures the test environment for React Native + Expo
  preset: 'jest-expo',

  // Load built-in matchers from @testing-library/react-native (replaces deprecated jest-native)
  // Gives us assertions like toBeOnTheScreen(), toHaveTextContent(), etc.
  setupFilesAfterEnv: [
    '@testing-library/react-native/build/matchers/extend-expect',
  ],

  // Mirror the @/* path alias from tsconfig.json so tests can use the same import paths
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },

  // Only look for tests in project directories, not in node_modules
  testPathIgnorePatterns: [
    '/node_modules/',
  ],
};
