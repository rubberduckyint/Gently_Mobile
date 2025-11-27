/**
 * Design System Colors - Gently Theme
 *
 * A soft, calming color palette inspired by the Gently brand.
 * The theme uses a gentle sky blue as the primary color,
 * with warm grays and soft accents for a friendly, accessible experience.
 *
 * Brand colors from logo:
 * - #5CC5FF - Sky blue (primary)
 * - #19304F - Deep navy (dark text)
 * - #F8FAF9 - Soft white (backgrounds)
 * - #747E97 - Muted gray-blue (secondary text)
 */

export const colors = {
  // Primary colors - Gentle Sky Blue
  // Based on logo's #5CC5FF with accessible variations
  primary: {
    50: "#f0f9ff", // Very soft blue tint
    100: "#e0f4fe", // Light blue wash
    200: "#b9e8fd", // Soft sky
    300: "#7cd5fc", // Light sky blue
    400: "#5CC5FF", // Brand blue (logo color)
    500: "#38b6f8", // Main primary - slightly darker for better contrast
    600: "#1c9edf", // Medium blue
    700: "#1680b8", // Deep sky blue
    800: "#176893", // Dark blue
    900: "#195678", // Very dark blue
  },

  // Success colors - Soft Teal Green
  success: {
    50: "#f0fdfa",
    100: "#ccfbef",
    200: "#99f6e0",
    300: "#5fe8c8",
    400: "#2ed3ac",
    500: "#14b894", // Main success - accessible green
    600: "#0d9479",
    700: "#0f7763",
    800: "#115e50",
    900: "#124d43",
  },

  // Error/Danger colors - Soft Coral Red
  error: {
    50: "#fef2f2",
    100: "#fee5e5",
    200: "#fecdd0",
    300: "#fca5ab",
    400: "#f87179",
    500: "#ef4452", // Main error - accessible red
    600: "#dc2635",
    700: "#b91c2a",
    800: "#991b26",
    900: "#7f1d24",
  },

  // Warning colors - Soft Amber
  warning: {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b", // Main warning
    600: "#d97706",
    700: "#b45309",
    800: "#92400e",
    900: "#78350f",
  },

  // Secondary colors - Soft Purple/Lavender
  secondary: {
    50: "#faf5ff",
    100: "#f3e8ff",
    200: "#e9d5ff",
    300: "#d8b4fe",
    400: "#c084fc",
    500: "#a855f7", // Main secondary
    600: "#9333ea",
    700: "#7e22ce",
    800: "#6b21a8",
    900: "#581c87",
  },

  // Gray colors - Warm Gray with slight blue tint
  // Based on logo's #747E97 for a cohesive feel
  gray: {
    50: "#f8fafb", // Softest gray (almost white)
    100: "#f1f4f6", // Very light gray
    200: "#e4e8ec", // Light gray
    300: "#d1d7de", // Medium light gray
    400: "#9ca5b4", // Medium gray
    500: "#747e97", // Logo gray - main text gray
    600: "#5a6478", // Dark gray
    700: "#434c5c", // Darker gray
    800: "#2d3442", // Very dark gray
    900: "#19304f", // Logo navy - darkest
  },

  // Background colors - Soft, warm tones
  background: {
    primary: "#f8fafb", // Soft off-white (slightly cooler)
    secondary: "#ffffff", // Pure white for cards
    tertiary: "#f1f4f6", // Light gray for sections
    overlay: "rgba(25, 48, 79, 0.5)", // Navy overlay
  },

  // Text colors - Using logo navy and gray-blue
  text: {
    primary: "#19304f", // Logo navy - high contrast
    secondary: "#5a6478", // Slightly lighter for secondary
    tertiary: "#747e97", // Logo gray-blue
    inverse: "#ffffff",
    link: "#1c9edf", // Primary 600 for accessible links
    error: "#ef4452",
    success: "#0d9479",
    warning: "#d97706",
  },

  // Border colors - Soft, subtle borders
  border: {
    light: "#f1f4f6",
    medium: "#d1d7de",
    dark: "#9ca5b4",
    focus: "#5CC5FF", // Brand blue for focus states
    error: "#ef4452",
    success: "#14b894",
  },

  // Battery level colors (for devices)
  battery: {
    high: "#14b894", // Success green
    medium: "#f59e0b", // Warning amber
    low: "#ef4452", // Error red
  },

  // Status colors (for sync status, etc.)
  status: {
    synced: "#0d9479",
    syncing: "#1c9edf",
    error: "#dc2635",
    pending: "#747e97",
  },
} as const;

// Semantic color aliases for easier usage
export const semanticColors = {
  primary: colors.primary[500],
  primaryBrand: colors.primary[400], // Logo blue
  success: colors.success[500],
  error: colors.error[500],
  warning: colors.warning[500],
  background: colors.background.primary,
  surface: colors.background.secondary,
  textPrimary: colors.text.primary,
  textSecondary: colors.text.secondary,
  borderDefault: colors.border.medium,
} as const;

// Brand colors - direct from logo
export const brandColors = {
  skyBlue: "#5CC5FF",
  navy: "#19304F",
  softWhite: "#F8FAF9",
  mutedGray: "#747E97",
} as const;
