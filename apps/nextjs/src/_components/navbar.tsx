// Navbar for authenticated users
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Globe, LogOut, Settings as SettingsIcon, Shield } from "lucide-react";
import { useTheme } from "next-themes";

import { Avatar, AvatarFallback, AvatarImage } from "~/_components/ui/avatar";
import { Button } from "~/_components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/_components/ui/dropdown-menu";
import { Switch } from "~/_components/ui/switch";
import { authClient } from "~/auth/client";
import { useLocaleSwitch } from "~/hooks/useLocaleSwitch";

export function Navbar() {
  const { data: session } = authClient.useSession();
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { switchLocale } = useLocaleSwitch();

  // Get current locale from cookie - only on client side
  const [currentLocale, setCurrentLocale] = useState("en");

  useEffect(() => {
    const updateLocaleFromCookie = () => {
      if (typeof window === "undefined") return;
      const cookieLocale = /locale=([^;]+)/.exec(document.cookie)?.[1];
      if (cookieLocale) {
        setCurrentLocale(cookieLocale);
      }
    };

    // Initial load
    updateLocaleFromCookie();

    // Poll for cookie changes for a short period after component mounts
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

  // Language options
  const languages = [
    { code: "en", name: "English", flag: "🇺🇸" },
    { code: "es", name: "Español", flag: "🇪🇸" },
    { code: "fr", name: "Français", flag: "🇫🇷" },
  ];

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Toggle dark mode using next-themes
  const handleToggleDark = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  // Prevent hydration mismatch by not rendering anything until mounted
  if (!mounted) {
    return (
      <div className="bg-background sticky top-0 z-50 w-full border-b">
        <nav className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight">
            <span className="sr-only">Gently</span>
            <Image
              src="/images/logo-dark.svg"
              alt="Gently Logo"
              width={120}
              height={32}
              priority
            />
          </Link>
          <div className="bg-muted h-10 w-10 animate-pulse rounded-full" />
        </nav>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="bg-background sticky top-0 z-50 w-full border-b">
      <nav className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-3">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight">
          <span className="sr-only">Gently</span>
          <Image
            src={
              theme === "dark"
                ? "/images/logo-light.svg"
                : "/images/logo-dark.svg"
            }
            alt="Gently Logo"
            width={120}
            height={32}
            priority
          />
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar>
                <AvatarImage
                  src={session.user.image ?? undefined}
                  alt={session.user.name || session.user.email}
                  className="bg-muted"
                />
                <AvatarFallback className="bg-muted text-foreground">
                  {(session.user.name || session.user.email || "U")
                    .slice(0, 2)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="text-muted-foreground px-2 py-2 text-xs font-semibold">
              {session.user.name || session.user.email}
            </div>
            <DropdownMenuSeparator />
            {/* Remove isAdmin check since it's not part of standard better-auth user schema */}
            <DropdownMenuItem asChild>
              <Link
                href="/admin/users"
                className="flex items-center gap-2 hover:cursor-pointer"
              >
                <Shield className="h-4 w-4" />
                <span>Admin</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href="/settings"
                className="flex items-center gap-2 hover:cursor-pointer"
              >
                <SettingsIcon className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                <span>Language</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
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
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <span className="flex w-full items-center justify-between">
                Dark mode
                <Switch
                  className="ml-2 hover:cursor-pointer"
                  checked={theme === "dark"}
                  onCheckedChange={handleToggleDark}
                />
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => authClient.signOut()}
              className="text-destructive flex items-center gap-2 hover:cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </div>
  );
}
