export const FEATURE_FLAGS = Object.freeze({
  MULTI_DEVICE_ENABLED: false,
} as const);

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
