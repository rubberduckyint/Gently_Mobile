"use client";

import { useState, useEffect } from "react";
import { Globe } from "lucide-react";
import { Button } from "~/_components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/_components/ui/dropdown-menu";
import { useLocaleSwitch } from "~/hooks/useLocaleSwitch";

const languages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
];

export function LanguageSelector() {
  const { switchLocale } = useLocaleSwitch();
  const [currentLocale, setCurrentLocale] = useState("en");

  useEffect(() => {
    const updateLocaleFromCookie = () => {
      const cookieLocale = (/locale=([^;]+)/.exec(document.cookie))?.[1];
      if (cookieLocale) {
        setCurrentLocale(cookieLocale);
      }
    };

    // Initial load
    updateLocaleFromCookie();

    // Poll for cookie changes every 100ms for a short period after component mounts
    const pollInterval = setInterval(updateLocaleFromCookie, 100);

    // Stop polling after 2 seconds
    setTimeout(() => clearInterval(pollInterval), 2000);

    // Also listen for focus events (when user comes back to tab)
    const handleFocus = () => updateLocaleFromCookie();
    window.addEventListener("focus", handleFocus);

    // Cleanup
    return () => {
      clearInterval(pollInterval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const handleLocaleSwitch = (locale: string) => {
    setCurrentLocale(locale); // Update immediately for better UX
    switchLocale(locale);
  };

  const currentLanguage = languages.find((lang) => lang.code === currentLocale);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground flex items-center gap-2"
        >
          <Globe className="h-4 w-4" />
          <span className="text-lg">{currentLanguage?.flag}</span>
          <span>{currentLanguage?.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        {languages.map((language) => (
          <DropdownMenuItem
            key={language.code}
            onClick={() => handleLocaleSwitch(language.code)}
            className="flex items-center gap-2 hover:cursor-pointer"
          >
            <span className="text-lg">{language.flag}</span>
            <span>{language.name}</span>
            {language.code === currentLocale && (
              <span className="text-primary ml-auto">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
