"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  Newspaper,
  ShieldAlert,
} from "lucide-react";

import { markAlertRead, markAllAlertsRead } from "@/lib/actions/alerts";
import type { AlertCenterItem, AlertCenterSummary } from "@/lib/server/alerts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AlertTypeFilter =
  | "all"
  | "critical_news"
  | "earnings_report"
  | "price_move"
  | "concentration";
type ReadFilter = "all" | "unread" | "read";

const typeOptions: Array<{ label: string; value: AlertTypeFilter }> = [
  { label: "All", value: "all" },
  { label: "Critical news", value: "critical_news" },
  { label: "Earnings", value: "earnings_report" },
  { label: "Price moves", value: "price_move" },
  { label: "Concentration", value: "concentration" },
];

const readOptions: Array<{ label: string; value: ReadFilter }> = [
  { label: "All", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "Read", value: "read" },
];

function typeLabel(type: string): string {
  switch (type) {
    case "critical_news":
      return "Critical news";
    case "earnings_report":
      return "Earnings";
    case "price_move":
      return "Price move";
    case "concentration":
      return "Concentration";
    default:
      return type;
  }
}

function typeIcon(type: string) {
  switch (type) {
    case "critical_news":
      return Newspaper;
    case "earnings_report":
      return DollarSign;
    case "price_move":
      return AlertTriangle;
    case "concentration":
      return ShieldAlert;
    default:
      return Bell;
  }
}

function severityTone(severity: string): "brand" | "warning" | "danger" | "neutral" {
  if (severity === "high") return "danger";
  if (severity === "medium") return "warning";
  if (severity === "low") return "neutral";
  return "neutral";
}

function formatAlertTime(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "Unknown time";
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export function AlertsCenter({
  initialAlerts,
  summary,
}: {
  initialAlerts: AlertCenterItem[];
  summary: AlertCenterSummary;
}) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [typeFilter, setTypeFilter] = useState<AlertTypeFilter>("all");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentSummary = useMemo(() => {
    const unread = alerts.filter((alert) => !alert.readAt).length;
    const high = alerts.filter((alert) => alert.severity === "high").length;
    return { ...summary, total: alerts.length, unread, high };
  }, [alerts, summary]);

  const filteredAlerts = useMemo(
    () =>
      alerts.filter((alert) => {
        const typeMatches = typeFilter === "all" || alert.alertType === typeFilter;
        const readMatches =
          readFilter === "all" ||
          (readFilter === "unread" ? !alert.readAt : Boolean(alert.readAt));
        return typeMatches && readMatches;
      }),
    [alerts, readFilter, typeFilter],
  );

  function handleMarkRead(alertId: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await markAlertRead(alertId);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      const readAt = new Date().toISOString();
      setAlerts((current) =>
        current.map((alert) =>
          alert.id === alertId && !alert.readAt ? { ...alert, readAt } : alert,
        ),
      );
    });
  }

  function handleMarkAllRead() {
    setMessage(null);
    startTransition(async () => {
      const result = await markAllAlertsRead();
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      const readAt = new Date().toISOString();
      setAlerts((current) =>
        current.map((alert) => (alert.readAt ? alert : { ...alert, readAt })),
      );
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryTile label="Unread" value={currentSummary.unread} detail="Needs review" />
        <SummaryTile label="High severity" value={currentSummary.high} detail="Priority alerts" />
        <SummaryTile label="Total" value={currentSummary.total} detail="Last 100 alerts" />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {typeOptions.map((option) => (
            <FilterButton
              key={option.value}
              active={typeFilter === option.value}
              onClick={() => setTypeFilter(option.value)}
            >
              {option.label}
            </FilterButton>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readOptions.map((option) => (
            <FilterButton
              key={option.value}
              active={readFilter === option.value}
              onClick={() => setReadFilter(option.value)}
            >
              {option.label}
            </FilterButton>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={handleMarkAllRead}
            disabled={isPending || currentSummary.unread === 0}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Mark all read
          </Button>
        </div>
      </div>

      {message ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {message}
        </p>
      ) : null}

      {filteredAlerts.length > 0 ? (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => {
            const Icon = typeIcon(alert.alertType);
            return (
              <article
                key={alert.id}
                className={cn(
                  "rounded-2xl border bg-surface-raised p-5 transition",
                  alert.readAt
                    ? "border-white/[0.06] opacity-75"
                    : "border-brand/20 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]",
                )}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={severityTone(alert.severity)}>
                          {alert.severity}
                        </Badge>
                        <Badge tone="neutral">{typeLabel(alert.alertType)}</Badge>
                        {!alert.readAt ? <Badge tone="brand">Unread</Badge> : null}
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                          {formatAlertTime(alert.createdAt)}
                        </span>
                      </div>
                      <h2 className="mt-3 text-lg font-bold tracking-tight text-white">
                        {alert.title}
                      </h2>
                      <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
                        {alert.message}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    {!alert.readAt ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleMarkRead(alert.id)}
                        disabled={isPending}
                      >
                        Mark read
                      </Button>
                    ) : null}
                    <Link
                      href={alert.actionHref}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-[#080c11] transition hover:bg-brand-strong"
                    >
                      Open
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 bg-surface-raised/60 p-10 text-center">
          <Bell className="mx-auto h-8 w-8 text-slate-500" />
          <h2 className="mt-4 text-xl font-bold text-white">No alerts match this view</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500">
            Adjust the filters or enable smart alert rules in Settings to populate
            this center as the cron runs.
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition",
        active
          ? "bg-brand/15 text-brand"
          : "bg-white/[0.04] text-slate-500 hover:bg-white/[0.08] hover:text-slate-300",
      )}
    >
      {children}
    </button>
  );
}
