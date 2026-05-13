export interface OnboardingState {
  hasBracelet: boolean;
  sources: { id: string; displayName: string; active: boolean }[];
}

export function nextOnboardingRoute(state: OnboardingState): string | null {
  if (!state.hasBracelet) return "/(onboarding)/pair-bracelet";
  if (state.sources.length === 0) return "/(onboarding)/connect-dexcom";
  return null;
}
