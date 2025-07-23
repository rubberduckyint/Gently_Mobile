"use client";

import { useEffect } from "react";

import { authClient } from "~/auth/client";

export function LocaleSync() {
  const { data: session } = authClient.useSession();

  useEffect(() => {
    // Better-auth user doesn't have language property, so skip language syncing
    // This component can be simplified or removed if language sync is not needed
    if (session?.user) {
      // You could implement language detection/syncing here if needed
      // For now, just log that the user is logged in
      console.log("LocaleSync - user is logged in:", session.user.id);
    }
  }, [session?.user]);

  return null; // This component doesn't render anything
}
