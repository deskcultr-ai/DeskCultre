import Link from "next/link";

export default function NewTaskPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 text-center shadow-2xl">
        <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>
        <h1 className="mt-3 text-3xl font-bold">Create Task</h1>
        <p className="mt-3 text-slate-300">Create Task coming soon</p>
        <p className="mt-2 text-sm text-slate-400">
          This page will let you create and assign new tasks.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white"
        >
          Back to Dashboard
        </Link>
      </section>
    </main>
  );
}
