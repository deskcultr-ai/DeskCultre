export default function Loading() {
  return (
    <main className="min-h-screen bg-[#f8fafc] p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl border border-[#e7ebf5] bg-white" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-xl border border-[#e7ebf5] bg-white" />
          ))}
        </div>
      </div>
    </main>
  );
}
