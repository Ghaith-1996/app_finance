import { redirect } from "next/navigation";

import { OnboardingPageClient } from "@/components/app/onboarding-page-client";
import { getUserPortfolios } from "@/lib/actions/portfolio";

export default async function OnboardingPage() {
  const { data: portfolios } = await getUserPortfolios();

  if ((portfolios ?? []).length > 0) {
    redirect("/home");
  }

  return <OnboardingPageClient />;
}
