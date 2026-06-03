import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { SavedArticlesList } from "@/components/app/saved-articles-list";
import { buttonStyles } from "@/components/ui/button";
import { loadSavedArticlesPageData } from "@/lib/server/saved-articles";

export default async function SavedArticlesPage() {
  const { showOnboardingNav, showAdminLink, articles } =
    await loadSavedArticlesPageData();

  return (
    <AppShell
      eyebrow="Reading list"
      title="Saved Articles"
      description="Keep important stories in one place and reopen them in the portfolio-aware feed."
      activePath="/saved"
      showOnboardingNav={showOnboardingNav}
      showAdminLink={showAdminLink}
      actions={
        <Link href="/feed" className={buttonStyles({ size: "lg" })}>
          Open feed
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      }
    >
      <SavedArticlesList initialArticles={articles} />
    </AppShell>
  );
}
