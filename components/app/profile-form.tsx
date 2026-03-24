"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import type { UserProfileFormData } from "@/lib/profile/utils";

interface Props {
  initialProfile: UserProfileFormData;
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: (input: {
    firstName: string;
    lastName: string;
    handle: string;
    redirectTo?: string;
  }) => Promise<
    | void
    | { ok: false; error: string }
    | { ok: true; profile?: unknown }
  >;
  redirectTo?: string;
  successMessage?: string;
}

export function ProfileForm({
  initialProfile,
  title,
  description,
  submitLabel,
  onSubmit,
  redirectTo,
  successMessage,
}: Props) {
  const [firstName, setFirstName] = useState(initialProfile.firstName);
  const [lastName, setLastName] = useState(initialProfile.lastName);
  const [handle, setHandle] = useState(initialProfile.handle);
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

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
