import "server-only";

import { isAdminUser } from "@/lib/security/admin";
import { sanitizeRedirect } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

type AlertRow = {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  action_href: string | null;
  source_table: string | null;
  source_id: string | null;
  triggered_at: string;
  read_at: string | null;
  created_at: string;
};

export type AlertCenterItem = {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  actionHref: string;
  sourceTable: string | null;
  sourceId: string | null;
  triggeredAt: string;
  readAt: string | null;
  createdAt: string;
};

export type AlertCenterSummary = {
  total: number;
  unread: number;
  high: number;
  criticalNews: number;
  earnings: number;
  priceMoves: number;
  concentration: number;
};

export async function loadAlertsPageData(): Promise<{
  showOnboardingNav: boolean;
  showAdminLink: boolean;
  alerts: AlertCenterItem[];
  summary: AlertCenterSummary;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      showOnboardingNav: true,
      showAdminLink: false,
      alerts: [],
      summary: emptySummary(),
    };
  }

  const [portfolioResult, alertResult] = await Promise.all([
    supabase
      .from("portfolios")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("notification_alerts")
      .select(
        "id, alert_type, severity, title, message, action_href, source_table, source_id, triggered_at, read_at, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const alerts = ((alertResult.data ?? []) as AlertRow[]).map((row) => ({
    id: row.id,
    alertType: row.alert_type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    actionHref: sanitizeRedirect(row.action_href, "/alerts"),
    sourceTable: row.source_table,
    sourceId: row.source_id,
    triggeredAt: row.triggered_at,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));

  return {
    showOnboardingNav: (portfolioResult.count ?? 0) === 0,
    showAdminLink: isAdminUser(user),
    alerts,
    summary: summarizeAlerts(alerts),
  };
}

function emptySummary(): AlertCenterSummary {
  return {
    total: 0,
    unread: 0,
    high: 0,
    criticalNews: 0,
    earnings: 0,
    priceMoves: 0,
    concentration: 0,
  };
}

function summarizeAlerts(alerts: AlertCenterItem[]): AlertCenterSummary {
  return alerts.reduce<AlertCenterSummary>(
    (summary, alert) => {
      summary.total += 1;
      if (!alert.readAt) summary.unread += 1;
      if (alert.severity === "high") summary.high += 1;
      if (alert.alertType === "critical_news") summary.criticalNews += 1;
      if (alert.alertType === "earnings_report") summary.earnings += 1;
      if (alert.alertType === "price_move") summary.priceMoves += 1;
      if (alert.alertType === "concentration") summary.concentration += 1;
      return summary;
    },
    emptySummary(),
  );
}
