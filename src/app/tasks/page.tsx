"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Alert, Badge, Button, Card, Modal, Select } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { getProfile, type Profile } from "@/lib/session";
import { cn } from "@/lib/cn";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  departmentId: string | null;
  departmentName: string | null;
  assigneeId: string | null;
  assignedToMe: boolean;
  createdByName: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  checklistDone: number;
  checklistTotal: number;
  commentCount: number;
};
type TasksData = { tasks: Task[] };

const emptyData: TasksData = { tasks: [] };

const statusLabels: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  completed: "Completed",
  on_hold: "On Hold",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

const priorityTone: Record<string, "danger" | "warning" | "success" | "neutral"> = {
  urgent: "danger",
  high: "danger",
  medium: "warning",
  low: "success",
};

function dueText(value: string | null) {
  if (!value) return "No due date";
  const today = new Date().toISOString().slice(0, 10);
  if (value < today) return "Overdue";
  if (value === today) return "Due today";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function EmployeeTasksPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [data, setData] = useState<TasksData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("open");
  const [selected, setSelected] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const me = await getProfile();
    if (!me) {
      router.replace("/login");
      return;
    }
    setProfile(me);
    if (!me.company_id || me.status !== "active") {
      router.replace("/onboarding");
      return;
    }
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_employee_tasks_data");
    if (rpcError) {
      setError(rpcError.message);
      setData(emptyData);
    } else {
      const next = { ...emptyData, ...(rpcData as TasksData) };
      setData(next);
      setSelected((current) => (current ? next.tasks.find((task) => task.id === current.id) ?? null : null));
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return data.tasks.filter((task) => {
      if (view === "open") return !["completed", "cancelled"].includes(task.status);
      if (view === "mine") return task.assignedToMe;
      if (view === "department") return !task.assignedToMe;
      return task.status === view;
    });
  }, [data.tasks, view]);

  const counts = useMemo(
    () => ({
      open: data.tasks.filter((task) => !["completed", "cancelled"].includes(task.status)).length,
      mine: data.tasks.filter((task) => task.assignedToMe).length,
      department: data.tasks.filter((task) => !task.assignedToMe).length,
      completed: data.tasks.filter((task) => task.status === "completed").length,
    }),
    [data.tasks]
  );

  async function completeTask(task: Task) {
    setBusy(true);
    setError("");
    const { error: completeError } = await supabase.rpc("complete_employee_task", { target_task: task.id });
    setBusy(false);
    if (completeError) {
      setError(completeError.message);
      return;
    }
    setNotice("Task marked complete.");
    await load();
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading tasks...</main>;
  }

  return (
    <AppShell profile={profile} title="Tasks" subtitle="View assigned work, inspect details, and mark completed tasks.">
      <div className="space-y-6">
        {error && <Alert tone="danger" onClose={() => setError("")}>{error}</Alert>}
        {notice && <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TaskStat active={view === "open"} label="Open Tasks" value={counts.open} onClick={() => setView("open")} />
          <TaskStat active={view === "mine"} label="Assigned To Me" value={counts.mine} onClick={() => setView("mine")} />
          <TaskStat active={view === "department"} label="Department Tasks" value={counts.department} onClick={() => setView("department")} />
          <TaskStat active={view === "completed"} label="Completed" value={counts.completed} onClick={() => setView("completed")} />
        </section>

        <Card className="rounded-xl border-[#dfe6f3] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-black text-[#071035]">Task List</h2>
            <Select value={view} onChange={(event) => setView(event.target.value)} className="h-10 sm:w-48">
              <option value="open">Open tasks</option>
              <option value="mine">Assigned to me</option>
              <option value="department">Department tasks</option>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="review">Review</option>
              <option value="completed">Completed</option>
            </Select>
          </div>
        </Card>

        <section className="grid gap-4 xl:grid-cols-2">
          {filtered.map((task) => (
            <button
              key={task.id}
              onClick={() => setSelected(task)}
              className="text-left"
            >
              <Card className="rounded-xl border-[#dfe6f3] p-5 transition hover:-translate-y-0.5 hover:border-[#bdb5ff] hover:shadow-[0_18px_42px_rgba(40,55,105,0.12)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn("text-base font-black text-[#071035]", task.status === "completed" && "text-[#7b88a8] line-through")}>{task.title}</p>
                    <p className="mt-1 text-xs font-bold text-[#526184]">{task.departmentName ?? "General"} - {task.assignedToMe ? "Assigned to you" : "Department task"}</p>
                  </div>
                  <Badge tone={priorityTone[task.priority] ?? "neutral"} className="capitalize">{task.priority}</Badge>
                </div>
                {task.description && <p className="mt-4 line-clamp-2 text-sm font-semibold leading-6 text-[#526184]">{task.description}</p>}
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Badge tone={task.status === "completed" ? "success" : task.status === "review" ? "warning" : "info"}>{statusLabels[task.status] ?? task.status}</Badge>
                  <span className="rounded-full bg-[#f3f5fb] px-3 py-1 text-xs font-black text-[#526184]">{dueText(task.dueDate)}</span>
                  <span className="rounded-full bg-[#f3f5fb] px-3 py-1 text-xs font-black text-[#526184]">{task.checklistDone}/{task.checklistTotal} checklist</span>
                </div>
              </Card>
            </button>
          ))}
          {filtered.length === 0 && <Card className="rounded-xl border-dashed border-[#dfe6f3] p-8 text-center text-sm font-bold text-[#526184] xl:col-span-2">No tasks match this view.</Card>}
        </section>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} className="max-w-xl">
        {selected && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Badge tone={selected.status === "completed" ? "success" : "info"}>{statusLabels[selected.status] ?? selected.status}</Badge>
                <h2 className="mt-3 text-2xl font-black text-[#071035]">{selected.title}</h2>
                <p className="mt-1 text-sm font-bold text-[#526184]">Assigned by {selected.createdByName ?? "Admin"}</p>
              </div>
              <button onClick={() => setSelected(null)} className="grid h-9 w-9 place-items-center rounded-lg text-[#526184] hover:bg-[#f3f5fb]">x</button>
            </div>
            {selected.description && <p className="rounded-lg bg-[#fbfcff] p-4 text-sm font-semibold leading-6 text-[#33415c]">{selected.description}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <Info label="Department" value={selected.departmentName ?? "General"} />
              <Info label="Due date" value={dueText(selected.dueDate)} />
              <Info label="Priority" value={selected.priority} />
              <Info label="Checklist" value={`${selected.checklistDone}/${selected.checklistTotal}`} />
            </div>
            <Button className="w-full" disabled={busy || selected.status === "completed"} onClick={() => completeTask(selected)}>
              {busy ? "Saving..." : selected.status === "completed" ? "Completed" : "Mark Task Complete"}
            </Button>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}

function TaskStat({ active, label, value, onClick }: { active: boolean; label: string; value: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className={cn("rounded-xl border-[#dfe6f3] p-5 transition hover:-translate-y-0.5 hover:border-[#bdb5ff] hover:shadow-[0_18px_42px_rgba(40,55,105,0.12)]", active && "border-[#7c66ff] ring-2 ring-[#ece8ff]")}>
        <p className="text-[12px] font-black uppercase tracking-wide text-[#526184]">{label}</p>
        <p className="mt-3 text-3xl font-black text-[#071035]">{value}</p>
      </Card>
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#edf0f7] bg-white p-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-[#7b88a8]">{label}</p>
      <p className="mt-1 text-sm font-black capitalize text-[#071035]">{value.replace("_", " ")}</p>
    </div>
  );
}
