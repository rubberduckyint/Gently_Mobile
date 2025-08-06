import { getRequestConfig } from "next-intl/server";

import { getUserLocale } from "~/lib/locale";

export default getRequestConfig(async () => {
  // Get locale from user session/cookies
  const locale = await getUserLocale();

  return {
    locale,
    messages: (
      (await import(`../languages/${locale}.json`)) as {
        default: Record<string, string>;
      }
    ).default,
  };
});
