import Link from "next/link";

export default function TasksPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 text-center shadow-2xl">
        <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>
        <h1 className="mt-3 text-3xl font-bold">Tasks</h1>
        <p className="mt-3 text-slate-300">Tasks module coming soon</p>
        <p className="mt-2 text-sm text-slate-400">
          This page will show all tasks for your company.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white"
          >
            Dashboard
          </Link>
          <Link
            href="/tasks/new"
            className="rounded-xl bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950"
          >
            Create Task
          </Link>
        </div>
      </section>
    </main>
  );
}
