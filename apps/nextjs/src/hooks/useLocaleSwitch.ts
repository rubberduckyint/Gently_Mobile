"use client";

import { useTransition } from "react";

export function useLocaleSwitch() {
  const [isPending, startTransition] = useTransition();

  function switchLocale(locale: string) {
    startTransition(() => {
      // Set cookie for locale
      document.cookie = `locale=${locale}; path=/; max-age=31536000; SameSite=lax`;

      // Force a full page reload to apply new locale
      window.location.reload();
    });
  }

  return {
    switchLocale,
    isPending,
  };
}
