/**
 * Sanity test — verifies that the Jest testing infrastructure works.
 *
 * This is the first test in the project (Step 0.3). If this test passes,
 * it means Jest is correctly configured with the jest-expo preset and
 * can discover + run TypeScript test files from the utils/__tests__/ directory.
 *
 * This file will be replaced by real utility tests in Phase 1.
 */

describe('Testing infrastructure', () => {
  it('runs a basic arithmetic assertion', () => {
    // The simplest possible test: if this fails, Jest itself is broken
    expect(1 + 1).toBe(2);
  });

  it('handles string expectations', () => {
    // Verify that Jest matchers work for strings too
    expect('Beta Breaker').toContain('Beta');
  });

  it('handles truthiness checks', () => {
    // Confirm boolean matchers are available
    expect(true).toBeTruthy();
    expect(null).toBeNull();
    expect(undefined).toBeUndefined();
  });
});
