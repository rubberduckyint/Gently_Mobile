import { Platform } from "react-native";

import { tokens } from "./tokens";

const baseFamily = Platform.select({
  ios: "System",
  android: "Inter_500Medium",
  default: "System",
});

const lightFamily = Platform.select({
  ios: "System",
  android: "Inter_300Light",
  default: "System",
});

const boldFamily = Platform.select({
  ios: "System",
  android: "Inter_700Bold",
  default: "System",
});

const semiboldFamily = Platform.select({
  ios: "System",
  android: "Inter_600SemiBold",
  default: "System",
});

export const typographyV2 = {
  wordmark: {
    fontFamily: baseFamily,
    fontSize: 24,
    fontWeight: tokens.font.weightMedium,
    letterSpacing: -0.24,
  },
  h1Onboarding: {
    fontFamily: semiboldFamily,
    fontSize: 28,
    fontWeight: "600" as const,
    letterSpacing: -0.56,
  },
  h1AlarmEdit: {
    fontFamily: semiboldFamily,
    fontSize: 17,
    fontWeight: "600" as const,
    letterSpacing: -0.17,
  },
  glucoseHero: {
    fontFamily: lightFamily,
    fontSize: 140,
    fontWeight: tokens.font.weightLight,
    letterSpacing: -7.0,
  },
  threshold: {
    fontFamily: lightFamily,
    fontSize: 72,
    fontWeight: tokens.font.weightLight,
    letterSpacing: -2.88,
  },
  sliderValue: {
    fontFamily: lightFamily,
    fontSize: 30,
    fontWeight: tokens.font.weightLight,
    letterSpacing: -0.6,
  },
  body: {
    fontFamily: baseFamily,
    fontSize: 15,
    fontWeight: "400" as const,
  },
  eyebrow: {
    fontFamily: boldFamily,
    fontSize: 11,
    fontWeight: tokens.font.weightStrong,
    letterSpacing: 0.99,
    textTransform: "uppercase" as const,
  },
};

// Helper for tabular numerals — pass into <Text fontVariant={tabularNums}>
export const tabularNums = ["tabular-nums" as const];
