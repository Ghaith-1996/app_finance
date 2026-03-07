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
      return "bg-gradient-to-br from-brand/18 via-brand/6 to-transparent";
    case "interactive-brokers":
      return "bg-gradient-to-br from-slate-950/10 via-slate-900/6 to-transparent";
    default:
      return "bg-gradient-to-br from-amber-200/45 via-amber-100/18 to-transparent";
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
        "relative overflow-hidden border-black/6 bg-white/82 p-6",
        selected && "border-brand/28 bg-brand/10 shadow-[0_18px_45px_rgba(23,182,122,0.1)]",
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
            <p className="text-lg font-semibold text-slate-950">{provider.name}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
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
            <div key={capability} className="flex items-center gap-3 text-sm text-slate-600">
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
