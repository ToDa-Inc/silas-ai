import { Calendar, CheckCircle2, Copy, Download, Music2, Smartphone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { InstagramPostChecklist } from "@/components/instagram-post-checklist";

/**
 * /scheduling — manual Instagram posting guide (no API publish yet).
 */
export default async function SchedulingPage() {
  const t = await getTranslations("scheduling");

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <div className="glass rounded-2xl border border-app-card-border p-8 md:p-10">
        <div className="mb-6 flex items-center gap-3">
          <Calendar className="h-8 w-8 text-app-accent" aria-hidden />
          <div>
            <h1 className="text-lg font-semibold text-app-fg">{t("title")}</h1>
            <p className="mt-1 text-sm text-app-fg-muted">{t("subtitle")}</p>
          </div>
        </div>

        <InstagramPostChecklist
          videoUrl={null}
          onCopyCaption={() => {}}
          className="border-app-card-border bg-app-chip-bg/30"
        />

        <div className="mt-6 space-y-3 rounded-xl border border-app-divider/70 bg-app-chip-bg/20 p-4 text-sm text-app-fg-secondary">
          <p className="font-semibold text-app-fg">{t("whereFiles")}</p>
          <ul className="space-y-2 text-xs leading-relaxed text-app-fg-muted">
            <li className="flex gap-2">
              <Download className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <span>{t("downloadStep")}</span>
            </li>
            <li className="flex gap-2">
              <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-app-accent" aria-hidden />
              <span>{t("copyCaptionStep")}</span>
            </li>
            <li className="flex gap-2">
              <Music2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <span>{t("trendingSoundStep")}</span>
            </li>
            <li className="flex gap-2">
              <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-app-fg-muted" aria-hidden />
              <span>{t("roadmapStep")}</span>
            </li>
          </ul>
        </div>

        <p className="mt-6 flex items-center gap-2 text-xs text-app-fg-muted">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
          {t("rendersInMedia")}
        </p>
      </div>
    </main>
  );
}
