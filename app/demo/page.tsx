import Link from "next/link";

import { ArrowLeft, ArrowRight } from "lucide-react";

import { AppLogo } from "@/components/brand/app-logo";
import { DemoWorkspace } from "@/components/marketing/demo-workspace";
import { buttonStyles } from "@/components/ui/button";

export const metadata = {
  title: "Pulsefolio Demo",
  description:
    "Explore a sample portfolio, personalized news brief, article impact view, AI advisor, and portfolio guardrails.",
};

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-subtle bg-background/95 px-6 py-4 backdrop-blur-xl lg:px-8">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="inline-flex items-center gap-3">
            <AppLogo size="md" />
            <span>
              <span className="block text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                Pulsefolio demo
              </span>
              <span className="block text-xs text-secondary">
                Public product walkthrough
              </span>
            </span>
          </Link>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/" className={buttonStyles({ variant: "secondary" })}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back home
            </Link>
            <Link href="/onboarding" className={buttonStyles({})}>
              Use my portfolio
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="px-6 py-8 lg:px-8 lg:py-10">
        <DemoWorkspace />
      </main>
    </div>
  );
}
