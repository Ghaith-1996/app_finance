export default function Loading() {
  return (
    <div className="min-h-screen bg-background px-6 py-10 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-7xl space-y-6 animate-pulse">
        <div className="h-16 rounded-[32px] border border-black/6 bg-white/80" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-40 rounded-[32px] border border-black/6 bg-white/80 lg:col-span-2" />
          <div className="h-40 rounded-[32px] border border-black/6 bg-white/80" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-96 rounded-[32px] border border-black/6 bg-white/80" />
          <div className="h-96 rounded-[32px] border border-black/6 bg-white/80" />
        </div>
      </div>
    </div>
  );
}
