import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/ui/toast-provider";
import { fetchClient, fetchOnboardingStatus, getCachedServerApiContext } from "@/lib/api";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const { user, tenancy, clientSlug, orgSlug } = await getCachedServerApiContext();
  if (!user) {
    redirect("/login?next=/onboarding");
  }

  if (tenancy && clientSlug) {
    const onboardingRes = await fetchOnboardingStatus();
    if (
      onboardingRes.ok &&
      onboardingRes.data?.status === "completed" &&
      onboardingRes.data?.current_step === "done"
    ) {
      redirect("/dashboard");
    }
    const clientRes = await fetchClient();
    return (
      <ToastProvider>
        <OnboardingWizard
          hasTenancy
          clientSlug={clientSlug}
          orgSlug={orgSlug}
          initialStatus={onboardingRes.ok ? onboardingRes.data : null}
          initialContext={
            clientRes.ok && clientRes.data?.client_context
              ? (clientRes.data.client_context as Record<string, unknown>)
              : null
          }
        />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <OnboardingWizard hasTenancy={false} clientSlug="" orgSlug="" initialStatus={null} />
    </ToastProvider>
  );
}
