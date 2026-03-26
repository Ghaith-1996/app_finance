import { AppShell } from "@/components/app/app-shell";

export default function FeedLoading() {
  return (
    <AppShell
      eyebrow="Daily brief"
      title="Loading your feed..."
      description="Preparing your latest portfolio-aware market view."
      activePath="/feed"
    >
      <div className="animate-pulse space-y-8">
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-40 rounded-2xl border border-white/[0.06] bg-white/5"
            />
          ))}
        </div>
        <div className="h-28 rounded-2xl border border-white/[0.06] bg-white/5" />
        <div className="space-y-4">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="h-40 rounded-2xl border border-white/[0.06] bg-white/5"
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
