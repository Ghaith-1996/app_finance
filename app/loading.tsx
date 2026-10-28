export default function Loading() {
  return (
    <div className="min-h-screen bg-background px-6 py-10 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-7xl space-y-6 animate-pulse">
        <div className="h-16 rounded-4xl border border-subtle bg-surface-raised" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-40 rounded-4xl border border-subtle bg-surface-raised lg:col-span-2" />
          <div className="h-40 rounded-4xl border border-subtle bg-surface-raised" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-96 rounded-4xl border border-subtle bg-surface-raised" />
          <div className="h-96 rounded-4xl border border-subtle bg-surface-raised" />
        </div>
      </div>
    </div>
  );
}
