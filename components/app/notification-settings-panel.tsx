"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  Gauge,
  Loader2,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type {
  NotificationPreferenceInput,
  NotificationPreferences,
} from "@/lib/notifications/types";

export function NotificationSettingsPanel({
  initialPreferences,
  onSubmit,
}: {
  initialPreferences: NotificationPreferences;
  onSubmit: (
    input: NotificationPreferenceInput,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [emailDigestEnabled, setEmailDigestEnabled] = useState(
    initialPreferences.emailDigestEnabled,
  );
  const [smsDigestEnabled, setSmsDigestEnabled] = useState(
    initialPreferences.smsDigestEnabled,
  );
  const [phoneNumber, setPhoneNumber] = useState(initialPreferences.phoneNumber);
  const [criticalNewsAlertsEnabled, setCriticalNewsAlertsEnabled] = useState(
    initialPreferences.criticalNewsAlertsEnabled,
  );
  const [earningsReportAlertsEnabled, setEarningsReportAlertsEnabled] = useState(
    initialPreferences.earningsReportAlertsEnabled,
  );
  const [priceMoveAlertsEnabled, setPriceMoveAlertsEnabled] = useState(
    initialPreferences.priceMoveAlertsEnabled,
  );
  const [priceMoveThresholdPercent, setPriceMoveThresholdPercent] = useState(
    String(initialPreferences.priceMoveThresholdPercent),
  );
  const [concentrationAlertsEnabled, setConcentrationAlertsEnabled] = useState(
    initialPreferences.concentrationAlertsEnabled,
  );
  const [concentrationThresholdPercent, setConcentrationThresholdPercent] = useState(
    String(initialPreferences.concentrationThresholdPercent),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Panel className="space-y-6 rounded-[2rem] p-6">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Notifications
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          Morning digest
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-slate-400">
          Sent daily at 9:00 AM Eastern. Email includes the full top-10 digest.
          SMS stays short with the overnight bullish and bearish leaders plus one
          Pulsefolio link.
        </p>
      </div>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setSaved(null);
          startTransition(async () => {
            const result = await onSubmit({
              emailDigestEnabled,
              smsDigestEnabled,
              phoneNumber,
              criticalNewsAlertsEnabled,
              earningsReportAlertsEnabled,
              priceMoveAlertsEnabled,
              priceMoveThresholdPercent: Number(priceMoveThresholdPercent),
              concentrationAlertsEnabled,
              concentrationThresholdPercent: Number(concentrationThresholdPercent),
            });

            if (!result.ok) {
              setError(result.error);
              return;
            }

            setSaved("Notification preferences updated.");
          });
        }}
      >
        <label className="flex items-start justify-between gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-4">
          <span className="space-y-1">
            <span className="block text-sm font-semibold text-white">
              Email digest
            </span>
            <span className="block text-sm text-slate-400">
              Send the full top-10 overnight digest to your current account email.
            </span>
          </span>
          <input
            type="checkbox"
            checked={emailDigestEnabled}
            onChange={(event) => setEmailDigestEnabled(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border border-subtle bg-surface-soft accent-brand"
          />
        </label>

        <label className="flex items-start justify-between gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-4">
          <span className="space-y-1">
            <span className="block text-sm font-semibold text-white">
              SMS digest
            </span>
            <span className="block text-sm text-slate-400">
              Send a short bullish and bearish summary with one digest link.
            </span>
          </span>
          <input
            type="checkbox"
            checked={smsDigestEnabled}
            onChange={(event) => setSmsDigestEnabled(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border border-subtle bg-surface-soft accent-brand"
          />
        </label>

        <div className="border-t border-white/[0.06] pt-6">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Smart alerts
            </p>
            <h3 className="text-xl font-semibold tracking-tight text-white">
              Portfolio alert rules
            </h3>
            <p className="max-w-2xl text-sm leading-7 text-slate-400">
              Saved rules for critical news, earnings, price moves, and concentration changes.
            </p>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <AlertToggle
              icon={AlertTriangle}
              title="Critical news"
              description="Risk, regulation, macro, and earnings stories matched to your holdings."
              checked={criticalNewsAlertsEnabled}
              onChange={setCriticalNewsAlertsEnabled}
            />

            <AlertToggle
              icon={CalendarDays}
              title="Earnings reports"
              description="Latest company or SEC report links for tracked symbols."
              checked={earningsReportAlertsEnabled}
              onChange={setEarningsReportAlertsEnabled}
            />

            <AlertThreshold
              icon={TrendingUp}
              title="Price move"
              description="Holding move threshold."
              checked={priceMoveAlertsEnabled}
              value={priceMoveThresholdPercent}
              min={1}
              max={50}
              onCheckedChange={setPriceMoveAlertsEnabled}
              onValueChange={setPriceMoveThresholdPercent}
            />

            <AlertThreshold
              icon={Gauge}
              title="Concentration"
              description="Largest position threshold."
              checked={concentrationAlertsEnabled}
              value={concentrationThresholdPercent}
              min={10}
              max={90}
              onCheckedChange={setConcentrationAlertsEnabled}
              onValueChange={setConcentrationThresholdPercent}
            />
          </div>
        </div>

        <label className="space-y-2">
          <span className="text-sm font-medium text-white">
            Phone number
          </span>
          <input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="+14165551234"
            autoComplete="tel"
            className="w-full rounded-xl border border-subtle bg-surface-soft px-4 py-3 text-sm text-primary outline-none transition focus:border-brand/40"
          />
          <p className="text-xs text-slate-500">
            Required for SMS. Use E.164 format, for example +14165551234.
          </p>
        </label>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {saved ? <p className="text-sm text-brand">{saved}</p> : null}

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function AlertToggle({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: typeof BellRing;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-4">
      <span className="flex min-w-0 gap-3">
        <span className="mt-0.5 rounded-xl border border-white/10 bg-white/5 p-2.5 text-brand">
          <Icon className="h-4 w-4" />
        </span>
        <span className="space-y-1">
          <span className="block text-sm font-semibold text-white">{title}</span>
          <span className="block text-sm text-slate-400">{description}</span>
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-2 h-4 w-4 rounded border border-subtle bg-surface-soft accent-brand"
      />
    </label>
  );
}

function AlertThreshold({
  icon: Icon,
  title,
  description,
  checked,
  value,
  min,
  max,
  onCheckedChange,
  onValueChange,
}: {
  icon: typeof BellRing;
  title: string;
  description: string;
  checked: boolean;
  value: string;
  min: number;
  max: number;
  onCheckedChange: (checked: boolean) => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-4">
      <label className="flex items-start justify-between gap-4">
        <span className="flex min-w-0 gap-3">
          <span className="mt-0.5 rounded-xl border border-white/10 bg-white/5 p-2.5 text-brand">
            <Icon className="h-4 w-4" />
          </span>
          <span className="space-y-1">
            <span className="block text-sm font-semibold text-white">{title}</span>
            <span className="block text-sm text-slate-400">{description}</span>
          </span>
        </span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="mt-2 h-4 w-4 rounded border border-subtle bg-surface-soft accent-brand"
        />
      </label>
      <label className="mt-4 block space-y-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
          Threshold
        </span>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={min}
            max={max}
            step="0.5"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            className="w-28 rounded-xl border border-subtle bg-surface-soft px-3 py-2 text-sm text-primary outline-none transition focus:border-brand/40"
          />
          <span className="text-sm font-medium text-slate-400">%</span>
        </div>
      </label>
    </div>
  );
}
