import type { NewsItem } from "@/lib/types";

import { ArrowUpRight, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { impactTone, sentimentTone } from "@/lib/utils";

export function NewsFeedCard({
  story,
  onOpen,
}: {
  story: NewsItem;
  onOpen?: () => void;
}) {
  return (
    <Panel className="h-full space-y-5 border-black/6 bg-white/82 p-6 transition duration-200 hover:-translate-y-0.5 hover:border-black/10 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">{story.relevanceScore}% match</Badge>
        <Badge tone={impactTone(story.impact)}>{story.impact} impact</Badge>
        <Badge tone={sentimentTone(story.sentiment)}>{story.sentiment}</Badge>
      </div>
      <div className="space-y-3">
        <h3 className="text-xl font-semibold tracking-tight text-slate-950">
          {story.headline}
        </h3>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
          <span>{story.source}</span>
          <span className="inline-flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            {story.publishedAt}
          </span>
          <span>{story.angle}</span>
        </div>
      </div>
      <p className="text-sm leading-7 text-slate-600">{story.aiSummary}</p>
      <div className="flex flex-wrap gap-2">
        {story.holdings.map((holding) => (
          <Badge key={holding} tone="neutral">
            {holding}
          </Badge>
        ))}
        {story.sectors.map((sector) => (
          <Badge key={sector} tone="warning">
            {sector}
          </Badge>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-black/6 pt-4">
        <p className="text-sm text-slate-600">{story.whyItMatters}</p>
        <Button variant="secondary" onClick={onOpen}>
          Open
          <ArrowUpRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </Panel>
  );
}
