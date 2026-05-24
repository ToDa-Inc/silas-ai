import { Calendar } from "lucide-react";

/**
 * /scheduling — explicit "Coming soon" placeholder.
 *
 * The nav exposes this route so users know publishing/scheduling is on the
 * roadmap, but there is no functionality behind it yet (today's publish flow
 * is manual: download MP4 + copy caption + post from the Instagram app).
 * Keeping the page honest avoids the "half-built product" smell of a nav item
 * that opens onto vague placeholder copy.
 */
export default function SchedulingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <div className="glass rounded-2xl border border-app-card-border p-10 text-center">
        <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          Coming soon
        </span>
        <Calendar className="mx-auto mb-4 h-12 w-12 text-app-fg-muted" aria-hidden />
        <h1 className="text-lg font-semibold text-app-fg">Scheduling</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-app-fg-secondary">
          Direct Instagram publishing and a calendar queue are coming. For now,
          finish a render in <strong>Create</strong>, then <strong>Download MP4</strong>{" "}
          and <strong>Copy caption</strong> from the Output card and post manually.
        </p>
      </div>
    </main>
  );
}
