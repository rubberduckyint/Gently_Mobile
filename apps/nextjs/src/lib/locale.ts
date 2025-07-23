import { cookies } from "next/headers";

export const locales = ["en", "es", "fr"] as const;
export type Locale = (typeof locales)[number];

const defaultLocale: Locale = "en";

export async function getUserLocale(): Promise<Locale> {
  try {
    // Get locale from cookie
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get("locale")?.value;

    if (cookieLocale && locales.includes(cookieLocale as Locale)) {
      return cookieLocale as Locale;
    }

    return defaultLocale;
  } catch (error) {
    console.error("Error getting user locale:", error);
    return defaultLocale;
  }
}

export async function setUserLocale(locale: Locale) {
  const cookieStore = await cookies();
  cookieStore.set("locale", locale);
}
