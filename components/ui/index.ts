// components/ui/index.ts
//
// Barrel export for all base UI components.
// Allows importing multiple components from a single path:
//   import { Button, Card, Badge } from "@/components/ui";
//
// This keeps import statements clean and provides a single place
// to see what primitives are available in the design system.

export { Button } from "./Button";
export type { ButtonProps } from "./Button";

export { AppTextInput } from "./TextInput";
export type { AppTextInputProps } from "./TextInput";

export { Card } from "./Card";
export type { CardProps } from "./Card";

export { Badge } from "./Badge";
export type { BadgeProps } from "./Badge";

export { IconButton } from "./IconButton";
export type { IconButtonProps } from "./IconButton";

export { Divider } from "./Divider";
export type { DividerProps } from "./Divider";

export { Avatar } from "./Avatar";
export type { AvatarProps } from "./Avatar";

// Legacy component kept for compatibility (used by expo-router links).
// Will be removed once all screens are rebuilt with NativeWind components.
export { ExternalLink } from "./ExternalLink";
