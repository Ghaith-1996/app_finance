import type { HomeDashboardData } from "@/lib/server/page-loaders";

export type NextActionTone = "risk" | "watch" | "neutral";

export type NextAction = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: NextActionTone;
};

export const NEXT_ACTION_LIMIT = 3;

/**
 * The few things worth doing now (audit D06): high-severity alerts first, then risk and watch
 * signals, then what changed. Setup steps (digest, alert rules) only fill empty slots.
 * Items that point at the same place with the same title are shown once.
 */
export function buildNextActions(
  data: Pick<HomeDashboardData, "recentAlerts" | "riskRadar" | "whatChanged" | "notifications">,
): NextAction[] {
  const alertTone = (severity: string): NextActionTone =>
    severity === "high" ? "risk" : severity === "medium" ? "watch" : "neutral";
  const rank: Record<NextActionTone, number> = { risk: 0, watch: 1, neutral: 2 };

  const alerts = data.recentAlerts.map((alert) => ({
    id: `alert-${alert.id}`,
    title: alert.title,
    detail: alert.message,
    href: alert.actionHref,
    tone: alertTone(alert.severity),
  }));
  const signals = [...data.riskRadar, ...data.whatChanged]
    .filter((item) => item.tone === "risk" || item.tone === "watch")
    .map((item) => ({ id: item.id, title: item.title, detail: item.detail, href: item.href, tone: item.tone as NextActionTone }));

  const candidates = [...alerts, ...signals].sort((left, right) => rank[left.tone] - rank[right.tone]);
  const seen = new Set<string>();
  const actions: NextAction[] = [];
  for (const item of candidates) {
    const key = `${item.href}|${item.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    actions.push(item);
    if (actions.length === NEXT_ACTION_LIMIT) return actions;
  }

  const digestOn = data.notifications.emailDigestEnabled || data.notifications.smsDigestEnabled;
  const setup: NextAction[] = [
    ...(!digestOn
      ? [{ id: "setup-digest", title: "Turn on the morning digest", detail: "Get the overnight stories for your holdings at 9 AM Eastern.", href: "/settings", tone: "neutral" as const }]
      : []),
    ...(data.notifications.smartAlertRuleCount === 0
      ? [{ id: "setup-alerts", title: "Set up smart alerts", detail: "Choose price-move, concentration, earnings and critical-news rules.", href: "/settings", tone: "neutral" as const }]
      : []),
  ];
  return [...actions, ...setup].slice(0, NEXT_ACTION_LIMIT);
}
