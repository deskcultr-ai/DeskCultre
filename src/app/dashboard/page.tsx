export default function DashboardPage() {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
        <section className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>
          <h1 className="mt-2 text-3xl font-bold">Dashboard</h1>
  
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/10 p-8">
            <h2 className="text-xl font-semibold">Login successful</h2>
            <p className="mt-3 text-slate-300">
              You are now inside the FlowDesk workspace. Next we will connect this
              dashboard with real company, user, department, and task data.
            </p>
          </div>
        </section>
      </main>
    );
  }