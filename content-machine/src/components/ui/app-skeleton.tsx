import { cn } from "@/lib/cn";

type Props = {
  className?: string;
  lines?: number;
};

/** Shared pulse skeleton — replaces one-off dashboard/onboarding/chart placeholders. */
export function AppSkeleton({ className, lines = 3 }: Props) {
  return (
    <div className={cn("animate-pulse space-y-3", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-4 rounded-lg bg-zinc-200 dark:bg-zinc-800",
            i === 0 && "h-6 w-2/5",
            i === lines - 1 && "w-4/5",
          )}
        />
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "glass animate-pulse rounded-2xl border border-app-divider/50 p-4",
        className,
      )}
    >
      <div className="mb-4 flex gap-2">
        <div className="h-7 w-16 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-7 w-16 rounded-full bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-7 w-20 rounded-full bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="h-[320px] rounded-xl bg-zinc-200/80 dark:bg-zinc-800/80" />
    </div>
  );
}
