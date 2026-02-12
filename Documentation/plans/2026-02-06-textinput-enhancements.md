# AppTextInput Enhancements — Left Icons & Password Toggle

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add optional left/right icon support and a built-in password visibility toggle to AppTextInput.

**Architecture:** Extend the existing `AppTextInput` component with three new optional props: `leftIcon`, `rightIcon`, and an automatic eye toggle when `secureTextEntry` is true. The input container becomes a `View` wrapper with absolute-positioned icons, and padding adjusts dynamically. All changes are backward-compatible — existing usage without icons works identically.

**Tech Stack:** React Native, NativeWind, lucide-react-native (icons), @testing-library/react-native (tests)

---

### Task 1: Write Failing Tests for Left Icon

**Files:**
- Modify: `components/ui/__tests__/TextInput.test.tsx`

**Step 1: Add lucide mock and left-icon test**

Add the lucide mock at the top of the file (after existing imports, before `describe`), then add a new test inside the `describe` block:

```tsx
// Add after the existing imports at line 3:
// (Must be before any `describe` or `import` of the component under test)

jest.mock("lucide-react-native", () => ({
  Mail: (props: any) => {
    const { Text } = require("react-native");
    return <Text testID={props.testID}>MailIcon</Text>;
  },
  Lock: (props: any) => {
    const { Text } = require("react-native");
    return <Text testID={props.testID}>LockIcon</Text>;
  },
  Eye: (props: any) => {
    const { Text } = require("react-native");
    return <Text testID={props.testID}>EyeIcon</Text>;
  },
  EyeOff: (props: any) => {
    const { Text } = require("react-native");
    return <Text testID={props.testID}>EyeOffIcon</Text>;
  },
}));
```

Then add inside the existing `describe("AppTextInput", () => {` block:

```tsx
  // -- Left Icon --

  it("renders left icon when leftIcon prop is provided", () => {
    const { Mail } = require("lucide-react-native");
    render(
      <AppTextInput
        label="Email"
        value=""
        onChangeText={() => {}}
        leftIcon={Mail}
      />
    );
    expect(screen.getByText("MailIcon")).toBeOnTheScreen();
  });
```

**Step 2: Run test to verify it fails**

Run: `npm test -- components/ui/__tests__/TextInput.test.tsx`
Expected: FAIL — `AppTextInput` doesn't accept `leftIcon` prop yet, "MailIcon" not found.

---

### Task 2: Write Failing Tests for Right Icon

**Files:**
- Modify: `components/ui/__tests__/TextInput.test.tsx`

**Step 1: Add right-icon test**

Add inside the `describe` block:

```tsx
  // -- Right Icon --

  it("renders right icon when rightIcon prop is provided", () => {
    const { Lock } = require("lucide-react-native");
    render(
      <AppTextInput
        label="Code"
        value=""
        onChangeText={() => {}}
        rightIcon={Lock}
      />
    );
    expect(screen.getByText("LockIcon")).toBeOnTheScreen();
  });
```

**Step 2: Run test to verify it fails**

Run: `npm test -- components/ui/__tests__/TextInput.test.tsx`
Expected: FAIL — `rightIcon` prop not recognized, "LockIcon" not found.

---

### Task 3: Write Failing Tests for Password Toggle

**Files:**
- Modify: `components/ui/__tests__/TextInput.test.tsx`

**Step 1: Add password toggle tests**

Add inside the `describe` block:

```tsx
  // -- Password Toggle --

  it("shows eye toggle icon when secureTextEntry is true", () => {
    render(
      <AppTextInput
        label="Password"
        value="secret"
        onChangeText={() => {}}
        secureTextEntry
      />
    );
    // The component should automatically add an Eye/EyeOff toggle
    // as a right icon when secureTextEntry is true.
    expect(screen.getByTestID("password-toggle")).toBeOnTheScreen();
  });

  it("toggles password visibility when eye icon is pressed", () => {
    render(
      <AppTextInput
        label="Password"
        value="secret"
        onChangeText={() => {}}
        secureTextEntry
        placeholder="Enter password"
      />
    );
    const toggle = screen.getByTestId("password-toggle");

    // Initially should show the EyeOff icon (password is hidden)
    expect(screen.getByText("EyeOffIcon")).toBeOnTheScreen();

    // After pressing toggle, should show Eye icon (password is visible)
    fireEvent.press(toggle);
    expect(screen.getByText("EyeIcon")).toBeOnTheScreen();

    // Press again to re-hide
    fireEvent.press(toggle);
    expect(screen.getByText("EyeOffIcon")).toBeOnTheScreen();
  });
```

**Step 2: Add no-regression test**

```tsx
  // -- No regression --

  it("renders without icons when no icon props provided", () => {
    render(
      <AppTextInput
        label="Plain"
        value=""
        onChangeText={() => {}}
        placeholder="No icons"
      />
    );
    // No icon elements should be in the tree
    expect(screen.queryByText("MailIcon")).not.toBeOnTheScreen();
    expect(screen.queryByText("LockIcon")).not.toBeOnTheScreen();
    expect(screen.queryByText("EyeIcon")).not.toBeOnTheScreen();
    expect(screen.queryByText("EyeOffIcon")).not.toBeOnTheScreen();
    // Input should still work
    expect(screen.getByPlaceholderText("No icons")).toBeOnTheScreen();
  });
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- components/ui/__tests__/TextInput.test.tsx`
Expected: FAIL — password toggle doesn't exist yet, `getByTestId("password-toggle")` throws.

---

### Task 4: Implement Icon Support in AppTextInput

**Files:**
- Modify: `components/ui/TextInput.tsx`

**Step 1: Implement the enhanced component**

Replace the entire `components/ui/TextInput.tsx` with this implementation:

```tsx
// components/ui/TextInput.tsx
//
// Styled text input with optional left/right icons and password toggle.
//
// ICON ARCHITECTURE:
// Icons are rendered inside a wrapper View that uses `relative` positioning.
// The icons themselves are `absolute`-positioned on the left or right side
// of the input. When a leftIcon is present, extra left padding (pl-10)
// prevents text from overlapping the icon. Same logic for rightIcon (pr-10).
//
// PASSWORD TOGGLE:
// When `secureTextEntry` is true, the component automatically adds an
// Eye/EyeOff toggle as a right icon (unless a custom `rightIcon` is
// already provided). This manages its own internal `isPasswordVisible`
// state — the parent doesn't need to know about visibility toggling.
// This is one of the few cases where internal state is appropriate:
// the toggle is a purely visual concern that doesn't affect form data.

import React, { useState } from "react";
import {
  TextInput as RNTextInput,
  Text,
  View,
  Pressable,
} from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

export interface AppTextInputProps {
  /** Label displayed above the input field. */
  label: string;
  /** Current text value (controlled component pattern). */
  value: string;
  /** Called when the user types — receives the new text string. */
  onChangeText: (text: string) => void;
  /** Placeholder text shown when input is empty. */
  placeholder?: string;
  /** Hides the text for password fields (shows dots instead). */
  secureTextEntry?: boolean;
  /** Validation error message. Shown in red below the input. */
  error?: string;
  /** Whether the input is interactive. Defaults to true. */
  editable?: boolean;
  /** Keyboard type hint — tells the OS which keyboard layout to show. */
  keyboardType?: RNTextInput["props"]["keyboardType"];
  /** Auto-capitalize behavior. "none" for emails/passwords. */
  autoCapitalize?: RNTextInput["props"]["autoCapitalize"];
  /** Optional testID for testing — passed to the outer View wrapper. */
  testID?: string;
  /**
   * Optional icon component rendered inside the input, left-aligned.
   * Pass a Lucide icon component (e.g., `Mail` from lucide-react-native).
   * The icon serves as a visual cue about what the field expects — e.g.,
   * a Mail icon next to the email field, a Lock icon next to password.
   */
  leftIcon?: LucideIcon;
  /**
   * Optional icon component rendered inside the input, right-aligned.
   * Note: When `secureTextEntry` is true, the component automatically
   * uses an Eye/EyeOff toggle as the right icon. If you provide a custom
   * `rightIcon` AND `secureTextEntry`, the custom icon takes priority
   * and the password toggle is not shown.
   */
  rightIcon?: LucideIcon;
}

export function AppTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  error,
  editable = true,
  keyboardType,
  autoCapitalize,
  testID,
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
}: AppTextInputProps) {
  // Internal state for password visibility toggle.
  // When true, the password text is shown as plain text.
  // This state is local because it's a purely visual concern —
  // the form's value doesn't change, only how it's displayed.
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  // Show the built-in Eye/EyeOff toggle when:
  // 1. secureTextEntry is true (this is a password field)
  // 2. No custom rightIcon was provided (custom icons take priority)
  const showPasswordToggle = secureTextEntry && !RightIcon;

  // Determine if the text should actually be hidden.
  // If secureTextEntry is true but the user toggled visibility on,
  // we show the text as plain (secureTextEntry={false}).
  const effectiveSecureEntry = secureTextEntry && !isPasswordVisible;

  return (
    <View className="mb-4" testID={testID}>
      {/* Label */}
      <Text className="text-text-secondary text-sm font-medium mb-1">
        {label}
      </Text>

      {/* Input container — relative positioning so icons can be
          absolute-positioned inside it without affecting text flow. */}
      <View className="relative justify-center">
        <RNTextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#6B6B80"
          secureTextEntry={effectiveSecureEntry}
          editable={editable}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          className={`bg-surface border ${
            error ? "border-error" : "border-border"
          } rounded-lg py-3 text-text-primary text-base ${
            !editable ? "opacity-50" : ""
          } ${LeftIcon ? "pl-10" : "px-4"} ${
            showPasswordToggle || RightIcon ? "pr-10" : "px-4"
          }`}
        />

        {/* Left icon — absolute-positioned so it sits inside the input
            without pushing the text. The icon uses our muted text color
            (#A0A0B0) to look like part of the input chrome, not content. */}
        {LeftIcon ? (
          <View className="absolute left-3" pointerEvents="none">
            <LeftIcon size={20} color="#A0A0B0" />
          </View>
        ) : null}

        {/* Right icon — either a custom icon or the password toggle.
            The password toggle is wrapped in Pressable so users can tap
            it to show/hide their password. Custom right icons are not
            tappable (they're decorative, like left icons). */}
        {showPasswordToggle ? (
          <Pressable
            className="absolute right-3"
            onPress={() => setIsPasswordVisible((prev) => !prev)}
            testID="password-toggle"
            accessibilityLabel={
              isPasswordVisible ? "Hide password" : "Show password"
            }
            accessibilityRole="button"
          >
            {isPasswordVisible ? (
              <Eye size={20} color="#A0A0B0" />
            ) : (
              <EyeOff size={20} color="#A0A0B0" />
            )}
          </Pressable>
        ) : RightIcon ? (
          <View className="absolute right-3" pointerEvents="none">
            <RightIcon size={20} color="#A0A0B0" />
          </View>
        ) : null}
      </View>

      {/* Error message */}
      {error ? (
        <Text className="text-error text-xs mt-1">{error}</Text>
      ) : null}
    </View>
  );
}
```

**Step 2: Run all tests to verify they pass**

Run: `npm test -- components/ui/__tests__/TextInput.test.tsx`
Expected: ALL PASS (old tests + new tests).

---

### Task 5: Run Full Test Suite

**Step 1: Run all unit tests to check for regressions**

Run: `npm test`
Expected: All 230+ tests pass. The auth screen tests (login, register, forgot-password) should still pass since they don't pass icon props yet.

**Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No new errors (the pre-existing ExternalLink error may still show).

---

### Task 6: Commit

**Step 1: Commit the changes**

```bash
git add components/ui/TextInput.tsx components/ui/__tests__/TextInput.test.tsx
git commit -m "feat: add left/right icon support and password toggle to AppTextInput"
```

---

### Task 7: Update Auth Screens to Use Icons

**Files:**
- Modify: `app/(auth)/login.tsx`
- Modify: `app/(auth)/register.tsx`
- Modify: `app/(auth)/forgot-password.tsx`

**Step 1: Update login.tsx**

Add import at the top (after other imports):
```tsx
import { Mail } from "lucide-react-native";
```

Add `leftIcon={Mail}` to the email AppTextInput (the one with `label="Email"`).
Remove `secureTextEntry` from the password AppTextInput — wait, keep it! The password toggle is now automatic when `secureTextEntry` is true, so no changes needed for the password field. It will get the eye toggle for free.

The email input change:
```tsx
<AppTextInput
  label="Email"
  value={value}
  onChangeText={onChange}
  placeholder="your@email.com"
  keyboardType="email-address"
  autoCapitalize="none"
  error={errors.email?.message}
  testID="email-input"
  leftIcon={Mail}
/>
```

**Step 2: Update register.tsx**

Add import:
```tsx
import { Mail, User } from "lucide-react-native";
```

Add `leftIcon={Mail}` to the email AppTextInput.
Add `leftIcon={User}` to the display name AppTextInput.
Password field gets eye toggle automatically from `secureTextEntry`.

**Step 3: Update forgot-password.tsx**

Add import:
```tsx
import { Mail } from "lucide-react-native";
```

Add `leftIcon={Mail}` to the email AppTextInput.

**Step 4: Run tests**

Run: `npm test`
Expected: All tests pass. The auth screen tests mock the component behavior, not icons.

---

### Task 8: Final Commit and Documentation Update

**Step 1: Commit the auth screen updates**

```bash
git add app/(auth)/login.tsx app/(auth)/register.tsx app/(auth)/forgot-password.tsx
git commit -m "feat: add left icons to auth screen inputs (Mail, User)"
```

**Step 2: Update DevelopmentPlan.md**

Mark Step 3.7 as complete with implementation notes:
- Files modified: `components/ui/TextInput.tsx`, auth screens
- Tests extended: `components/ui/__tests__/TextInput.test.tsx`
- Key decisions: password toggle is automatic when `secureTextEntry` is true, custom `rightIcon` overrides the toggle
