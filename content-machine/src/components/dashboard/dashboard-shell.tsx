"use client";

import { Fragment } from "react";
import { OnboardingBypassBanner } from "@/components/onboarding/onboarding-bypass-controls";
import { ToastProvider } from "@/components/ui/toast-provider";
import type { ClientOption } from "./client-switcher";
import { MobileTabBar } from "./mobile-tab-bar";
import { TopBar } from "./top-bar";

/**
 * Zero-chrome shell: sticky top bar + centered main column.
 * Mobile adds a bottom tab bar (Home / Create); studio routes live in the avatar menu.
 */
export function DashboardShell({
  children,
  clients = [],
  activeClientSlug = "",
  orgLabel = "",
  onboardingBypassActive = false,
}: {
  children: React.ReactNode;
  clients?: ClientOption[];
  activeClientSlug?: string;
  orgLabel?: string;
  onboardingBypassActive?: boolean;
}) {
  const slug =
    activeClientSlug && clients.some((c) => c.slug === activeClientSlug)
      ? activeClientSlug
      : (clients[0]?.slug ?? "");

  return (
    <ToastProvider>
      <div className="flex min-h-svh w-full max-w-full flex-col bg-zinc-50 dark:bg-zinc-950">
        <OnboardingBypassBanner active={onboardingBypassActive} />
        <TopBar clients={clients} activeSlug={slug} orgSlug={orgLabel} />
        <div className="min-h-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {/* Remount route subtree when the active creator changes so client state
              (Generate sessions, Intelligence selection, modals, etc.) cannot leak
              across clients. Server props already refresh via router.refresh(). */}
          <Fragment key={slug || "no-active-creator"}>{children}</Fragment>
        </div>
        <MobileTabBar />
      </div>
    </ToastProvider>
  );
}
