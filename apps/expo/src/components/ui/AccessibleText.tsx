/**
 * AccessibleText Component
 *
 * A text component that properly handles accessibility font scaling
 * with configurable maximum scale factors and proper text wrapping.
 *
 * Key features:
 * - Respects system font scale settings
 * - Caps extreme scaling to prevent UI breaking
 * - Automatic text wrapping with numberOfLines support
 * - Proper line height scaling
 */

import type { StyleProp, TextStyle } from "react-native";
import { Text, useWindowDimensions } from "react-native";

import { colors, typography } from "~/styles";

export type TextVariant =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "bodyLarge"
  | "body"
  | "bodySmall"
  | "caption"
  | "label";

interface AccessibleTextProps {
  /** Text content */
  children: React.ReactNode;
  /** Typography variant */
  variant?: TextVariant;
  /** Maximum font scale factor (default: 1.5 for body, 1.3 for headings) */
  maxFontScale?: number;
  /** Number of lines before truncating (undefined = no limit) */
  numberOfLines?: number;
  /** Allow font scaling (default: true) */
  allowFontScaling?: boolean;
  /** Additional styles */
  style?: StyleProp<TextStyle>;
  /** Text color override */
  color?: string;
  /** Text alignment */
  align?: "left" | "center" | "right";
  /** Accessibility label override */
  accessibilityLabel?: string;
  /** Is this a heading for screen readers? */
  accessibilityRole?: "header" | "text" | "link";
}

// Default max scale by variant type
const defaultMaxScale: Record<TextVariant, number> = {
  h1: 1.3,
  h2: 1.3,
  h3: 1.35,
  h4: 1.4,
  h5: 1.4,
  h6: 1.4,
  bodyLarge: 1.5,
  body: 1.5,
  bodySmall: 1.5,
  caption: 1.4,
  label: 1.4,
};

// Map variants to typography styles
const variantStyles: Record<TextVariant, TextStyle> = {
  h1: typography.h1,
  h2: typography.h2,
  h3: typography.h3,
  h4: typography.h4,
  h5: typography.h5,
  h6: typography.h6,
  bodyLarge: typography.bodyLarge,
  body: typography.body,
  bodySmall: typography.bodySmall,
  caption: typography.caption,
  label: typography.label,
};

export function AccessibleText({
  children,
  variant = "body",
  maxFontScale,
  numberOfLines,
  allowFontScaling = true,
  style,
  color,
  align,
  accessibilityLabel,
  accessibilityRole,
}: AccessibleTextProps) {
  const { fontScale } = useWindowDimensions();

  // Use provided maxScale or default for variant
  const maxScale = maxFontScale ?? defaultMaxScale[variant];

  // Cap the font scale
  const cappedFontScale = Math.min(fontScale, maxScale);

  // Get base style for variant
  const baseStyle = variantStyles[variant];
  const baseFontSize = baseStyle.fontSize ?? 16;

  // Calculate scaled font size (RN auto-scales, but we want to cap it)
  // We need to divide by fontScale and multiply by cappedFontScale
  // This effectively caps the scaling
  const scaledFontSize = baseFontSize * (cappedFontScale / fontScale);

  // Scale line height proportionally
  const baseLineHeight = baseStyle.lineHeight ?? 24;
  const scaledLineHeight = baseLineHeight * (cappedFontScale / fontScale);

  return (
    <Text
      style={[
        baseStyle,
        {
          fontSize: scaledFontSize,
          lineHeight: scaledLineHeight,
        },
        color && { color },
        align && { textAlign: align },
        style,
      ]}
      numberOfLines={numberOfLines}
      ellipsizeMode={numberOfLines ? "tail" : undefined}
      allowFontScaling={allowFontScaling}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
    >
      {children}
    </Text>
  );
}

/**
 * Heading component with proper accessibility semantics
 */
export function Heading({
  level = 1,
  children,
  ...props
}: Omit<AccessibleTextProps, "variant" | "accessibilityRole"> & {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}) {
  const variant = `h${level}` as TextVariant;
  return (
    <AccessibleText variant={variant} accessibilityRole="header" {...props}>
      {children}
    </AccessibleText>
  );
}

/**
 * Body text component
 */
export function BodyText({
  size = "medium",
  children,
  ...props
}: Omit<AccessibleTextProps, "variant"> & {
  size?: "small" | "medium" | "large";
}) {
  const variantMap = {
    small: "bodySmall" as TextVariant,
    medium: "body" as TextVariant,
    large: "bodyLarge" as TextVariant,
  };
  return (
    <AccessibleText variant={variantMap[size]} {...props}>
      {children}
    </AccessibleText>
  );
}

/**
 * Caption text for secondary information
 */
export function Caption({
  children,
  ...props
}: Omit<AccessibleTextProps, "variant">) {
  return (
    <AccessibleText variant="caption" color={colors.text.secondary} {...props}>
      {children}
    </AccessibleText>
  );
}

/**
 * Label text for form fields and UI elements
 */
export function Label({
  children,
  ...props
}: Omit<AccessibleTextProps, "variant">) {
  return (
    <AccessibleText variant="label" {...props}>
      {children}
    </AccessibleText>
  );
}
