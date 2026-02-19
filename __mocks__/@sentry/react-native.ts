// __mocks__/@sentry/react-native.ts
//
// Jest manual mock for @sentry/react-native.
//
// WHY A MANUAL MOCK?
// Sentry's SDK includes native modules (crash reporting, ANR detection)
// that don't exist in Jest's Node.js environment. Without this mock,
// any test that imports a file using Sentry would crash.
//
// Manual mocks live in __mocks__/<package-name> and are automatically
// used by Jest whenever the real package is imported in tests. Every
// export is a jest.fn() so tests can assert on calls (e.g., verify
// that captureException was called with the right error).

// Stub for reactNavigationIntegration — returns an object that looks
// like a Sentry integration with a registerNavigationContainer method.
// Tests can spy on registerNavigationContainer to verify it's called
// with the navigation ref.
export const reactNavigationIntegration = jest.fn(() => ({
  name: "ReactNavigation",
  registerNavigationContainer: jest.fn(),
  setupOnce: jest.fn(),
  options: {
    routeChangeTimeoutMs: 1000,
    enableTimeToInitialDisplay: false,
    ignoreEmptyBackNavigationTransactions: true,
    enableTimeToInitialDisplayForPreloadedRoutes: false,
    useDispatchedActionData: false,
  },
}));

// Core SDK functions — all no-ops that tests can spy on.
export const init = jest.fn();
export const captureException = jest.fn();
export const captureMessage = jest.fn();
export const setUser = jest.fn();
export const addBreadcrumb = jest.fn();
export const getCurrentScope = jest.fn(() => ({
  setUser: jest.fn(),
  setTag: jest.fn(),
  setExtra: jest.fn(),
}));

// withScope calls the callback with a mock scope object.
export const withScope = jest.fn((callback: (scope: unknown) => void) => {
  callback({
    setUser: jest.fn(),
    setTag: jest.fn(),
    setExtra: jest.fn(),
    setLevel: jest.fn(),
  });
});

// wrap() is used to wrap the root component for touch event breadcrumbs
// and app start profiling. In tests, it returns the component unchanged.
export const wrap = jest.fn(
  <T extends React.ComponentType<any>>(component: T): T => component
);

// ErrorBoundary — renders children as-is (no error boundary behavior in tests).
export const ErrorBoundary = jest.fn(
  ({ children }: { children: React.ReactNode }) => children
);
