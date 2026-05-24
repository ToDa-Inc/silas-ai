"use client";

import Link, { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type LinkProps = ComponentProps<typeof Link>;

type PendingLinkProps = LinkProps & {
  children: ReactNode;
  pendingLabel?: string;
  spinnerClassName?: string;
};

export function LinkPendingSpinner({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      <Loader2
        className={cn("inline h-3 w-3 shrink-0 animate-spin align-[-1px]", className)}
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </>
  );
}

export function LinkPendingOverlay({
  label = "Loading...",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-[inherit] bg-zinc-950/65 text-xs font-semibold text-white backdrop-blur-[1px]",
        className,
      )}
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function PendingLink({
  children,
  pendingLabel = "Loading",
  spinnerClassName,
  ...props
}: PendingLinkProps) {
  return (
    <Link {...props}>
      {children}
      <LinkPendingSpinner className={cn("ml-1.5", spinnerClassName)} label={pendingLabel} />
    </Link>
  );
}
