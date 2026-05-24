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

export const mainNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/intelligence", label: "Intelligence", icon: BarChart3 },
  // `/generate` is the editor entry point. Sidebar / page title / empty
  // states all say "Create" so users have one consistent name for the
  // creation surface. Route kept as `/generate` to avoid breaking deep links.
  { href: "/generate", label: "Create", icon: Sparkles },
  { href: "/media", label: "Media", icon: FolderOpen },
  { href: "/scheduling", label: "Scheduling", icon: Calendar, comingSoon: true },
  { href: "/context", label: "Context", icon: Database },
  { href: "/settings", label: "Settings", icon: Settings },
];
