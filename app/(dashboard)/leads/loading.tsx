export default function LeadsLoading() {
  return (
    <div className="flex flex-col flex-1 w-full gap-5 pb-4" aria-busy="true" aria-label="Loading leads">
      <div>
        <div className="h-7 w-28 rounded-lg bg-muted animate-pulse" />
        <div className="h-4 w-72 max-w-full rounded-lg bg-muted/70 animate-pulse mt-2" />
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-8 w-12 rounded bg-muted animate-pulse mt-3" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border/40 bg-muted/20">
          <div className="h-10 w-full sm:max-w-xs rounded-xl bg-muted animate-pulse" />
        </div>
        <div className="divide-y divide-border/40">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4">
              <div className="h-9 w-9 rounded-xl bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted/70 animate-pulse" />
              </div>
              <div className="h-8 w-28 rounded-xl bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
