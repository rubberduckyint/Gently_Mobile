import { router } from "expo-router";

import { FEATURE_FLAGS } from "~/config/feature-flags";
import type { MenuOption } from "~/components/ui/HamburgerMenu";

export type { MenuOption };

export function sourceMenuItem(opts: {
  primarySourceId: string | undefined;
}): MenuOption | null {
  const icon: MenuOption["icon"] = "pulse";

  if (FEATURE_FLAGS.MULTI_DEVICE_ENABLED) {
    return {
      label: "Dexcom Sources",
      icon,
      onPress: () => router.push("/cgm"),
    };
  }
  if (opts.primarySourceId) {
    return {
      label: "Dexcom Source",
      icon,
      onPress: () =>
        router.push({
          pathname: "/cgm/[sourceId]/edit",
          params: { sourceId: opts.primarySourceId! },
        }),
    };
  }
  return null;
}
