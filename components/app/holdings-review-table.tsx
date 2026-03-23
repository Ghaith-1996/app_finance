"use client";

import type { HoldingDraft, HoldingResolutionCandidate } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { formatPrice } from "@/lib/utils";

interface HoldingsReviewTableProps {
  drafts: HoldingDraft[];
  onToggleStatus: (tempId: string) => void;
  onSelectCandidate: (tempId: string, candidate: HoldingResolutionCandidate) => void;
}

export function HoldingsReviewTable({
  drafts,
  onToggleStatus,
  onSelectCandidate,
}: HoldingsReviewTableProps) {
  if (drafts.length === 0) {
    return (
      <Panel className="p-8 text-center">
        <p className="text-sm text-slate-500">No holdings to review yet.</p>
      </Panel>
    );
  }

  return (
    <Panel className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/[0.06]">
          <thead className="bg-white/[0.03]">
            <tr className="text-left text-xs uppercase tracking-[0.22em] text-slate-500">
              <th className="px-5 py-4">Symbol</th>
              <th className="px-5 py-4">Company</th>
              <th className="px-5 py-4">Shares</th>
              <th className="px-5 py-4">Avg Cost</th>
              <th className="px-5 py-4">Source</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {drafts.map((draft) => (
              <tr key={draft.tempId} className="transition hover:bg-white/[0.02]">
                <td className="px-5 py-4">
                  <span className="text-sm font-semibold text-white">
                    {draft.symbol || "—"}
                  </span>
                  {draft.market && (
                    <span className="ml-2 text-xs text-slate-500">{draft.market}</span>
                  )}
                </td>
                <td className="px-5 py-4 text-sm text-slate-400">
                  {draft.company || "—"}
                </td>
                <td className="px-5 py-4 text-sm text-white">
                  {draft.quantity > 0 ? draft.quantity : "—"}
                </td>
                <td className="px-5 py-4 text-sm text-white">
                  {draft.averageCost > 0 ? formatPrice(draft.averageCost) : "—"}
                </td>
                <td className="px-5 py-4">
                  <Badge tone="neutral">
                    {draft.importSource === "csv" ? "CSV" : "Manual"}
                  </Badge>
                </td>
                <td className="px-5 py-4">
                  {draft.status === "confirmed" && (
                    <Badge tone="success">Confirmed</Badge>
                  )}
                  {draft.status === "unresolved" && (
                    <div className="space-y-1">
                      <Badge tone="warning">Needs review</Badge>
                      {draft.issues.map((issue, i) => (
                        <p key={i} className="text-xs text-amber-400">
                          {issue.message}
                        </p>
                      ))}
                    </div>
                  )}
                  {draft.status === "skipped" && (
                    <Badge tone="neutral">Skipped</Badge>
                  )}
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-col gap-1">
                    {draft.candidates.length > 0 && draft.status === "unresolved" && (
                      <div className="space-y-1">
                        {draft.candidates.slice(0, 4).map((c) => (
                          <button
                            key={c.symbol}
                            type="button"
                            onClick={() => onSelectCandidate(draft.tempId, c)}
                            className="block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-left text-xs transition hover:border-brand/30 hover:bg-brand/5"
                          >
                            <span className="font-semibold text-white">{c.symbol}</span>{" "}
                            <span className="text-slate-500">{c.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onToggleStatus(draft.tempId)}
                      className="text-xs text-slate-500 underline underline-offset-2 transition hover:text-slate-300"
                    >
                      {draft.status === "skipped" ? "Include" : "Skip"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
