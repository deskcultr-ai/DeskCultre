export default function Loading() {
  return (
    <main className="min-h-screen bg-[#f8fafc] p-6">
      <div className="mx-auto grid max-w-7xl gap-5 xl:grid-cols-[360px_1fr]">
        <div className="h-[620px] animate-pulse rounded-xl border border-[#e7ebf5] bg-white" />
        <div className="h-[620px] animate-pulse rounded-xl border border-[#e7ebf5] bg-white" />
      </div>
    </main>
  );
}
