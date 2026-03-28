import type { ReactNode } from "react";

import { AppShellLayout } from "@/components/app/app-shell-layout";

export function AppShell({
  eyebrow,
  title,
  description,
  children,
  activePath: _activePath,
  actions,
  mainClassName,
  backHref,
  backLabel = "Back to portfolio",
  showOnboardingNav = true,
  showAdminLink = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  /** Kept for API compatibility; active state is derived from the URL in the client layout. */
  activePath?: string;
  actions?: ReactNode;
  mainClassName?: string;
  backHref?: string;
  backLabel?: string;
  showOnboardingNav?: boolean;
  showAdminLink?: boolean;
}) {
  return (
    <AppShellLayout
      eyebrow={eyebrow}
      title={title}
      description={description}
      actions={actions}
      mainClassName={mainClassName}
      backHref={backHref}
      backLabel={backLabel}
      showOnboardingNav={showOnboardingNav}
      showAdminLink={showAdminLink}
    >
      {children}
    </AppShellLayout>
  );
}
