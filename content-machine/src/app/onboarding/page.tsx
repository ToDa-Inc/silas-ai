import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/ui/toast-provider";
import { fetchClient, fetchOnboardingStatus, getCachedServerApiContext } from "@/lib/api";
import {
  ONBOARDING_BYPASS_COOKIE,
  readOnboardingBypassActive,
} from "@/lib/onboarding-bypass";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const { user, tenancy, clientSlug, orgSlug } = await getCachedServerApiContext();
  const cookieStore = await cookies();
  const onboardingBypassActive = readOnboardingBypassActive(
    cookieStore.get(ONBOARDING_BYPASS_COOKIE)?.value,
  );
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
          onboardingBypassActive={onboardingBypassActive}
        />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <OnboardingWizard
        hasTenancy={false}
        clientSlug=""
        orgSlug=""
        initialStatus={null}
        onboardingBypassActive={onboardingBypassActive}
      />
    </ToastProvider>
  );
}
