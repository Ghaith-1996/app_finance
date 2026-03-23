import type { Provider } from "@/lib/types";

import { ArrowRight, CheckCircle2, Clock3, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

function providerTone(status: Provider["status"]) {
  switch (status) {
    case "Preview":
      return "brand";
    case "Demo":
      return "warning";
    default:
      return "neutral";
  }
}

function providerIcon(status: Provider["status"]) {
  switch (status) {
    case "Preview":
      return <CheckCircle2 className="h-4 w-4" />;
    case "Demo":
      return <Sparkles className="h-4 w-4" />;
    default:
      return <Clock3 className="h-4 w-4" />;
  }
}

function providerGradient(id: Provider["id"]) {
  switch (id) {
    case "wealthsimple":
      return "bg-gradient-to-br from-brand/10 via-brand/5 to-transparent";
    case "interactive-brokers":
      return "bg-gradient-to-br from-white/5 via-white/[0.02] to-transparent";
    default:
      return "bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent";
  }
}

export function ProviderCard({
  provider,
  selected = false,
  onSelect,
}: {
  provider: Provider;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <Panel
      className={cn(
        "relative overflow-hidden p-6",
        selected && "border-brand/25 bg-brand/5 shadow-[0_0_30px_rgba(16,185,129,0.08)]",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 opacity-80",
          providerGradient(provider.id),
        )}
      />
      <div className="relative space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-white">{provider.name}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {provider.summary}
            </p>
          </div>
          <Badge tone={providerTone(provider.status)}>
            {providerIcon(provider.status)}
            {provider.status}
          </Badge>
        </div>
        <div className="space-y-2">
          {provider.capabilities.map((capability) => (
            <div key={capability} className="flex items-center gap-3 text-sm text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              <span>{capability}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          className={buttonStyles({
            variant: selected ? "primary" : "secondary",
          })}
          onClick={onSelect}
        >
          {provider.ctaLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </button>
      </div>
    </Panel>
  );
}
