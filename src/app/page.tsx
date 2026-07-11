const tasks = [
  {
    title: "Prepare monthly sales report",
    department: "Sales",
    assignee: "Amit",
    status: "In Progress",
    priority: "High",
    due: "Today",
  },
  {
    title: "Upload vendor payment proof",
    department: "Accounts",
    assignee: "Priya",
    status: "Submitted",
    priority: "Medium",
    due: "Tomorrow",
  },
  {
    title: "Review product photos",
    department: "Marketing",
    assignee: "Rohit",
    status: "Pending",
    priority: "Low",
    due: "Friday",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8">
        <nav className="flex items-center justify-between">
          <div>
            <p className="text-sm text-cyan-300">FlowDesk</p>
            <h1 className="text-2xl font-bold">Office Task Management</h1>
          </div>

          <button className="rounded-full bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950">
            Create Task
          </button>
        </nav>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-2">
          <div>
            <p className="mb-4 inline-block rounded-full border border-cyan-400/40 px-4 py-2 text-sm text-cyan-200">
              Built for managers, teams, approvals, and proof tracking
            </p>

            <h2 className="text-5xl font-bold leading-tight">
              Manage office tasks from assignment to approval.
            </h2>

            <p className="mt-6 max-w-xl text-lg text-slate-300">
              FlowDesk helps your office team create tasks, assign work,
              submit proof, approve or reject completion, and track everything
              department-wise.
            </p>

            <div className="mt-8 flex gap-4">
              <button className="rounded-xl bg-white px-6 py-3 font-semibold text-slate-950">
                Start Dashboard
              </button>
              <button className="rounded-xl border border-white/20 px-6 py-3 font-semibold text-white">
                View Reports
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-2xl">
            <div className="mb-5 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-slate-900 p-4">
                <p className="text-sm text-slate-400">Pending</p>
                <p className="mt-2 text-3xl font-bold">12</p>
              </div>
              <div className="rounded-2xl bg-slate-900 p-4">
                <p className="text-sm text-slate-400">Submitted</p>
                <p className="mt-2 text-3xl font-bold">5</p>
              </div>
              <div className="rounded-2xl bg-slate-900 p-4">
                <p className="text-sm text-slate-400">Overdue</p>
                <p className="mt-2 text-3xl font-bold text-red-400">3</p>
              </div>
            </div>

            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.title}
                  className="rounded-2xl border border-white/10 bg-slate-900 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">{task.title}</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {task.department} • Assigned to {task.assignee}
                      </p>
                    </div>

                    <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">
                      {task.status}
                    </span>
                  </div>

                  <div className="mt-4 flex justify-between text-sm text-slate-400">
                    <span>Priority: {task.priority}</span>
                    <span>Due: {task.due}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}