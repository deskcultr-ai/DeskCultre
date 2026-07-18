const navGroups = [
  ["Dashboard"],
  ["Users & Teams", "Departments", "Roles & Permissions"],
  ["Tasks", "Requests", "Projects", "Meetings", "Calendar", "Announcements", "Chat", "Drive"],
];

export default function AdminLoading() {
  return (
    <main className="flex min-h-screen bg-[#f8faff] text-[#101936]">
      <aside className="hidden w-[264px] shrink-0 border-r border-[#e7ebf5] bg-white lg:block">
        <div className="flex items-center gap-3 px-6 py-5">
          <div className="h-9 w-9 rounded-lg bg-[#ede8ff]" />
          <div className="h-5 w-28 rounded bg-[#eef1f7]" />
        </div>
        <div className="space-y-6 px-3">
          {navGroups.map((items, index) => (
            <div key={index} className="space-y-2">
              {index > 0 && <div className="mx-3 h-3 w-20 rounded bg-[#eef1f7]" />}
              {items.map((item) => (
                <div key={item} className="flex h-10 items-center gap-3 rounded-lg px-3">
                  <div className="h-5 w-5 rounded bg-[#eef1f7]" />
                  <div className="h-3.5 w-28 rounded bg-[#eef1f7]" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>
      <section className="min-w-0 flex-1">
        <header className="flex h-[73px] items-center gap-4 border-b border-[#e6eaf3] bg-white/90 px-6">
          <div className="h-9 w-9 rounded-lg bg-[#eef1f7]" />
          <div className="h-5 w-40 rounded bg-[#eef1f7]" />
          <div className="ml-auto hidden h-11 w-[360px] rounded-lg bg-[#eef1f7] md:block" />
          <div className="h-10 w-10 rounded-full bg-[#eef1f7]" />
        </header>
        <div className="space-y-5 p-6">
          <div className="h-[108px] rounded-lg border border-[#e7ebf5] bg-white shadow-ds-sm" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-[126px] rounded-lg border border-[#e7ebf5] bg-white shadow-ds-sm" />
            ))}
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
            <div className="h-[360px] rounded-lg border border-[#e7ebf5] bg-white shadow-ds-sm" />
            <div className="h-[360px] rounded-lg border border-[#e7ebf5] bg-white shadow-ds-sm" />
          </div>
        </div>
      </section>
    </main>
  );
}
