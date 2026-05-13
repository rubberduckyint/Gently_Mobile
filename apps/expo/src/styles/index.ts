// Common style combinations for frequently used patterns
import { colors } from "./colors";
import { spacing } from "./spacing";

/**
 * Design System - Main Export
 *
 * Centralized export of all design system tokens and utilities
 */

// Core design tokens
export * from "./colors";
export * from "./typography";
export * from "./spacing";
export * from "./layout";
export * from "./components";

// Accessibility-focused layout utilities
export * from "./accessibleLayouts";

export { tokens } from "./tokens";

export const commonStyles = {
  // Centered content
  centered: {
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },

  // Full screen loading
  fullScreenLoading: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    backgroundColor: colors.background.primary,
  },

  // Screen with header
  screenWithHeader: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },

  // Header section
  headerSection: {
    alignItems: "center" as const,
    marginBottom: spacing[12], // 48px
  },

  // Divider with text
  dividerWithText: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginVertical: spacing[6], // 24px
  },
} as const;
