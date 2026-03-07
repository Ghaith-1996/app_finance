import type { Holding } from "@/lib/types";

import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { formatPercent, formatPrice } from "@/lib/utils";

export function PortfolioTable({ holdings }: { holdings: Holding[] }) {
  return (
    <Panel className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-black/6">
          <thead className="bg-[#f7f2ea]">
            <tr className="text-left text-xs uppercase tracking-[0.22em] text-slate-500">
              <th className="px-6 py-4">Holding</th>
              <th className="px-6 py-4">Sector</th>
              <th className="px-6 py-4">Source</th>
              <th className="px-6 py-4">Price</th>
              <th className="px-6 py-4">Day</th>
              <th className="px-6 py-4">Allocation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/6">
            {holdings.map((holding) => (
              <tr key={holding.id} className="bg-white/88">
                <td className="px-6 py-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-950">
                        {holding.symbol}
                      </span>
                      <Badge tone="neutral">{holding.market}</Badge>
                    </div>
                    <p className="text-sm text-slate-500">{holding.company}</p>
                  </div>
                </td>
                <td className="px-6 py-5 text-sm text-slate-600">{holding.sector}</td>
                <td className="px-6 py-5 text-sm text-slate-600">{holding.source}</td>
                <td className="px-6 py-5 text-sm text-slate-950">
                  {formatPrice(holding.price)}
                </td>
                <td
                  className={
                    holding.dailyChange >= 0
                      ? "px-6 py-5 text-sm text-emerald-700"
                      : "px-6 py-5 text-sm text-rose-700"
                  }
                >
                  {formatPercent(holding.dailyChange)}
                </td>
                <td className="px-6 py-5 text-sm font-semibold text-slate-950">
                  {holding.allocation}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
