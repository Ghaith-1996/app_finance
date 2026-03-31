"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import type { ProfileFormValues } from "@/lib/profile/utils";

interface Props {
  initialProfile: ProfileFormValues;
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (input: {
    firstName: string;
    lastName: string;
    handle: string;
    acceptTerms?: boolean;
    redirectTo?: string;
  }) => Promise<
    | void
    | { ok: false; error: string }
    | { ok: true }
  >;
  redirectTo?: string;
  successMessage?: string;
  /** Show Terms of Service checkbox (for first-time profile completion). */
  requireTerms?: boolean;
}

export function ProfileForm({
  initialProfile,
  title,
  description,
  submitLabel,
  onSubmit,
  redirectTo,
  successMessage,
  requireTerms,
}: Props) {
  const [firstName, setFirstName] = useState(initialProfile.firstName);
  const [lastName, setLastName] = useState(initialProfile.lastName);
  const [handle, setHandle] = useState(initialProfile.handle);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Panel className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="text-sm text-slate-400">{description}</p>
      </div>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setSaved(null);
          startTransition(async () => {
            const result = await onSubmit({
              firstName,
              lastName,
              handle,
              acceptTerms: requireTerms ? acceptedTerms : undefined,
              redirectTo,
            });
            if (result && "ok" in result && result.ok === false) {
              setError(result.error);
              return;
            }
            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("profile-updated"));
            }
            if (successMessage) setSaved(successMessage);
          });
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-300">First name</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-brand/40"
              placeholder="First name"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-300">Last name</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-brand/40"
              placeholder="Last name"
            />
          </label>
        </div>

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-300">Username</span>
          <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <span className="text-sm text-slate-500">@</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              className="w-full bg-transparent pl-2 text-sm text-slate-200 outline-none"
              placeholder="username"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>
          <p className="text-xs text-slate-500">
            Use 3-20 lowercase letters, numbers, or underscores.
          </p>
        </label>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {saved ? <p className="text-sm text-brand">{saved}</p> : null}

        {requireTerms ? (
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border border-white/20 bg-white/[0.03] accent-brand"
            />
            <span className="text-sm text-slate-400">
              I agree to the{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-brand underline underline-offset-2 hover:text-brand-strong"
              >
                Terms of Service
              </a>
            </span>
          </label>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={pending || (requireTerms && !acceptedTerms)}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
