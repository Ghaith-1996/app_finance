import Link from "next/link";
import type { ReactNode } from "react";

type RelatedLink = {
  href: string;
  label: string;
};

interface LegalDocumentShellProps {
  title: string;
  description: string;
  effectiveDate: string;
  lastUpdated: string;
  relatedLinks?: RelatedLink[];
  children: ReactNode;
}

export function LegalDocumentShell({
  title,
  description,
  effectiveDate,
  lastUpdated,
  relatedLinks = [],
  children,
}: LegalDocumentShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-16 lg:py-24">
        <Link
          href="/"
          className="mb-10 inline-block text-sm text-slate-400 transition-colors hover:text-brand"
        >
          &larr; Back to home
        </Link>

        <div className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-300">{description}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs uppercase tracking-[0.16em] text-slate-500">
            <p>Effective date: {effectiveDate}</p>
            <p>Last updated: {lastUpdated}</p>
          </div>
          {relatedLinks.length > 0 ? (
            <div className="flex flex-wrap gap-4 text-sm text-slate-400">
              {relatedLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="font-medium text-brand underline underline-offset-2 hover:text-brand-strong"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-slate-300">{children}</div>
      </div>
    </div>
  );
}
