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

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Renders a small "Soon" pill next to the label for routes that exist as
   *  honest placeholders (e.g. /scheduling is intentionally not built yet). */
  comingSoon?: boolean;
};

/** Primary surfaces — promoted in the top bar (desktop) and bottom tabs (mobile). */
export const primaryNav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  // `/generate` is the editor entry point. Sidebar / page title / empty
  // states all say "Create" so users have one consistent name for the
  // creation surface. Route kept as `/generate` to avoid breaking deep links.
  { href: "/generate", label: "Create", icon: Sparkles },
];

/** Power features — tucked under the avatar menu as "Studio". */
export const studioNav: NavItem[] = [
  { href: "/intelligence", label: "Intelligence", icon: BarChart3 },
  { href: "/media", label: "Media", icon: FolderOpen },
  { href: "/context", label: "Context", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/scheduling", label: "Scheduling", icon: Calendar, comingSoon: true },
];

/** @deprecated Prefer `primaryNav` + `studioNav`. Kept for any legacy imports. */
export const mainNav: NavItem[] = [...primaryNav, ...studioNav];
