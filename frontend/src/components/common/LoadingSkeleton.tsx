export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="w-full animate-pulse space-y-3 p-4">
      <div className="h-6 bg-slate-100/60 rounded w-full mb-4" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 bg-slate-100/40 rounded w-full flex items-center gap-4 px-3">
          <div className="h-4 bg-slate-700/50 rounded w-1/4" />
          <div className="h-4 bg-slate-700/50 rounded w-1/4" />
          <div className="h-4 bg-slate-700/50 rounded w-1/4" />
          <div className="h-4 bg-slate-700/50 rounded w-1/4" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-slate-200 bg-white/40 p-5 space-y-3">
      <div className="h-4 bg-slate-100 rounded w-1/3" />
      <div className="h-8 bg-slate-700/60 rounded w-2/3" />
      <div className="h-4 bg-slate-100/80 rounded w-1/2" />
    </div>
  );
}

export function LoadingSkeleton({ type = 'cards', count = 3, rows = 5 }: { type?: 'cards' | 'table'; count?: number; rows?: number }) {
  if (type === 'table') {
    return <TableSkeleton rows={rows} />;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
