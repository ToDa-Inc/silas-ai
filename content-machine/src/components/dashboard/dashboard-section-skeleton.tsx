import { AppSkeleton } from "@/components/ui/app-skeleton";

/** Shared pulse skeleton while a dashboard route segment loads (see `app/(dashboard)/loading.tsx`). */
export function DashboardSectionSkeleton() {
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-8 md:px-8">
      <AppSkeleton lines={2} className="mb-8" />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-24 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <AppSkeleton lines={3} />
    </main>
  );
}
