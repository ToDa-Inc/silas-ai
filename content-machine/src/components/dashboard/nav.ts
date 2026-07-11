"use client";

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Calendar,
  Database,
  FolderOpen,
  LayoutDashboard,
  Settings,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  comingSoon?: boolean;
};

type NavConfigItem = {
  href: string;
  labelKey: "home" | "create" | "intelligence" | "media" | "context" | "settings" | "howToPost";
  icon: LucideIcon;
  comingSoon?: boolean;
};

const primaryNavConfig: NavConfigItem[] = [
  { href: "/dashboard", labelKey: "home", icon: LayoutDashboard },
  { href: "/generate", labelKey: "create", icon: Sparkles },
];

const studioNavConfig: NavConfigItem[] = [
  { href: "/intelligence", labelKey: "intelligence", icon: BarChart3 },
  { href: "/media", labelKey: "media", icon: FolderOpen },
  { href: "/context", labelKey: "context", icon: Database },
  { href: "/settings", labelKey: "settings", icon: Settings },
  { href: "/scheduling", labelKey: "howToPost", icon: Calendar },
];

function resolveNav(config: NavConfigItem[], t: ReturnType<typeof useTranslations<"nav">>): NavItem[] {
  return config.map(({ labelKey, ...rest }) => ({
    ...rest,
    label: t(labelKey),
  }));
}

export function usePrimaryNav(): NavItem[] {
  const t = useTranslations("nav");
  return resolveNav(primaryNavConfig, t);
}

export function useStudioNav(): NavItem[] {
  const t = useTranslations("nav");
  return resolveNav(studioNavConfig, t);
}

/** @deprecated Use usePrimaryNav() / useStudioNav() in client components. */
export const primaryNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/generate", label: "Create", icon: Sparkles },
];

/** @deprecated Use useStudioNav() in client components. */
export const studioNav: NavItem[] = [
  { href: "/intelligence", label: "Intelligence", icon: BarChart3 },
  { href: "/media", label: "Media", icon: FolderOpen },
  { href: "/context", label: "Context", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/scheduling", label: "How to post", icon: Calendar },
];

/** @deprecated Prefer usePrimaryNav() + useStudioNav(). */
export const mainNav: NavItem[] = [...primaryNav, ...studioNav];
