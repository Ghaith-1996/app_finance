"use client";

import { useState } from "react";
import { Activity, RefreshCw, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

type AdminAction = {
  id: string;
  label: string;
  description: string;
  method: "GET" | "POST";
  path: string;
  icon: typeof Activity;
};

type ActionState = {
  activeId: string | null;
  loading: boolean;
  status: number | null;
  output: string | null;
  error: string | null;
};

const ACTIONS: AdminAction[] = [
  {
    id: "health",
    label: "News health",
    description: "Checks the admin-only diagnostics route for current worker and pipeline readiness.",
    method: "GET",
    path: "/api/news/health",
    icon: Activity,
  },
  {
    id: "refresh-current",
    label: "Refresh current pipeline",
    description: "Runs the current admin refresh route against your latest portfolio and existing providers.",
    method: "POST",
    path: "/api/news/refresh",
    icon: RefreshCw,
  },
  {
    id: "refresh-candidate",
    label: "Refresh candidate pipeline",
    description: "Runs the candidate provider refresh using NewsAPI.ai, GNews, and NewsCatcher in parallel with EDGAR.",
    method: "POST",
    path: "/api/news/refresh-v2",
    icon: Shield,
  },
];

function formatOutput(body: string): string {
  if (!body.trim()) {
    return "(empty response)";
  }

  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

export function AdminConsolePanel() {
  const [state, setState] = useState<ActionState>({
    activeId: null,
    loading: false,
    status: null,
    output: null,
    error: null,
  });

  async function runAction(action: AdminAction) {
    setState({
      activeId: action.id,
      loading: true,
      status: null,
      output: null,
      error: null,
    });

    try {
      const response = await fetch(action.path, {
        method: action.method,
        headers: {
          Accept: "application/json",
          ...(action.method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        credentials: "include",
        ...(action.method === "POST" ? { body: "{}" } : {}),
      });
      const body = await response.text();
      const formatted = formatOutput(body);

      setState({
        activeId: action.id,
        loading: false,
        status: response.status,
        output: formatted,
        error: response.ok ? null : `Request failed with HTTP ${response.status}`,
      });
    } catch (error) {
      setState({
        activeId: action.id,
        loading: false,
        status: null,
        output: null,
        error: error instanceof Error ? error.message : "Request failed",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          const isActive = state.activeId === action.id;
          return (
            <Panel key={action.id} className="space-y-4 rounded-[1.75rem] p-5">
              <div className="flex items-start gap-3">
                <span className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-brand">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-white">{action.label}</p>
                  <p className="text-sm leading-6 text-slate-400">{action.description}</p>
                </div>
              </div>
              <Button
                onClick={() => void runAction(action)}
                variant={action.method === "POST" ? "primary" : "secondary"}
                disabled={state.loading}
                className="w-full"
              >
                {state.loading && isActive ? "Running..." : action.label}
              </Button>
            </Panel>
          );
        })}
      </div>

      <Panel className="space-y-3 rounded-[1.75rem] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Latest response
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Requests are sent with your current session and use empty POST bodies, so the server defaults to your latest portfolio.
            </p>
          </div>
          {state.status !== null ? (
            <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
              HTTP {state.status}
            </span>
          ) : null}
        </div>

        {state.error ? (
          <p className="text-sm text-rose-400">{state.error}</p>
        ) : null}

        <pre className="max-h-[480px] overflow-auto rounded-2xl border border-white/[0.06] bg-[#0a1119] p-4 text-xs leading-6 text-slate-300">
          {state.output ?? "Run an admin action to inspect the response here."}
        </pre>
      </Panel>
    </div>
  );
}
