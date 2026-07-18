"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Alert, Avatar, Badge, Button, Card, Input, Modal, Select } from "@/components/ui";
import { getProfile, isManager, type Profile } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/cn";

type Priority = "low" | "medium" | "high" | "urgent";
type Status = "all" | "todo" | "in_progress" | "review" | "completed" | "department";

type Department = { id: string; name: string; priority: Priority };
type Person = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  departmentId: string | null;
  departmentName: string | null;
};
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: Exclude<Status, "all" | "department"> | "on_hold" | "overdue" | "cancelled";
  priority: Priority;
  departmentId: string | null;
  departmentName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatarUrl: string | null;
  createdBy: string | null;
  dueDate: string | null;
  createdAt: string;
};
type TasksData = {
  stats: {
    totalTasks: number;
    assignedToDepartments: number;
    assignedToEmployees: number;
    inProgress: number;
    completed: number;
  };
  departments: Department[];
  people: Person[];
  tasks: Task[];
};

const emptyData: TasksData = {
  stats: { totalTasks: 0, assignedToDepartments: 0, assignedToEmployees: 0, inProgress: 0, completed: 0 },
  departments: [],
  people: [],
  tasks: [],
};

const statusLabels: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  completed: "Completed",
  on_hold: "On Hold",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

const priorityClass: Record<Priority, string> = {
  urgent: "bg-[#feecec] text-[#bf263c]",
  high: "bg-[#fff0df] text-[#a54f00]",
  medium: "bg-[#eef2ff] text-[#4f46e5]",
  low: "bg-[#e8f8ef] text-[#08764f]",
};

const statusTone: Record<string, "primary" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  todo: "neutral",
  in_progress: "info",
  review: "warning",
  completed: "success",
  on_hold: "warning",
  overdue: "danger",
  cancelled: "neutral",
};

function icon(path: string) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

const icons = {
  task: "M9 5h6M9 12l2 2 4-4M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
  department: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15",
  user: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.1a7.5 7.5 0 0 1 15 0",
  progress: "M12 6.75V12l3 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  check: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
};

function dueLabel(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
}

function StatCard({
  active,
  label,
  value,
  helper,
  tone,
  iconNode,
  onClick,
}: {
  active: boolean;
  label: string;
  value: number;
  helper: string;
  tone: string;
  iconNode: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className={cn("min-h-[126px] rounded-lg border-[#dfe6f3] p-5 transition hover:-translate-y-0.5 hover:border-[#bdb5ff] hover:shadow-[0_18px_42px_rgba(40,55,105,0.12)]", active && "border-[#7c66ff] ring-2 ring-[#ece8ff]")}>
        <div className="flex items-start justify-between gap-4">
          <span className={cn("grid h-12 w-12 place-items-center rounded-lg", tone)}>{iconNode}</span>
          <span className="text-right">
            <span className="block text-[12px] font-black uppercase tracking-wide text-[#526184]">{label}</span>
            <span className="mt-2 block text-[30px] font-black leading-none text-[#071035]">{value}</span>
          </span>
        </div>
        <p className="mt-5 text-xs font-black text-[#08764f]">{helper}</p>
      </Card>
    </button>
  );
}

export default function AdminTasksPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [data, setData] = useState<TasksData>(emptyData);
  const [view, setView] = useState<Status>("all");
  const [layout, setLayout] = useState<"board" | "list">("board");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [taskOpen, setTaskOpen] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium" as Priority,
    departmentId: "",
    assigneeId: "",
    dueDate: "",
  });

  const load = useCallback(async () => {
    setError("");
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
    if (!isManager(me)) {
      setDenied(true);
      setLoading(false);
      return;
    }
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_admin_tasks_data");
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

  useEffect(() => {
    ["/tasks", "/admin/departments", "/admin/users"].forEach((href) => router.prefetch(href));
  }, [router]);

  const peopleForForm = useMemo(
    () => data.people.filter((person) => !form.departmentId || person.departmentId === form.departmentId),
    [data.people, form.departmentId]
  );

  const peopleForSelected = useMemo(
    () => data.people.filter((person) => !selected?.departmentId || person.departmentId === selected.departmentId),
    [data.people, selected?.departmentId]
  );

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.tasks.filter((task) => {
      if (view === "department" && task.assigneeId) return false;
      if (view !== "all" && view !== "department" && task.status !== view) return false;
      if (departmentFilter && task.departmentId !== departmentFilter) return false;
      if (assigneeFilter && task.assigneeId !== assigneeFilter) return false;
      if (query && !`${task.title} ${task.description ?? ""} ${task.departmentName ?? ""} ${task.assigneeName ?? ""}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [assigneeFilter, data.tasks, departmentFilter, search, view]);

  const boardColumns = ["todo", "in_progress", "review", "completed"];

  async function createTask(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: assignError } = await supabase.rpc("assign_admin_task", {
      task_title: form.title.trim(),
      task_description: form.description.trim() || null,
      task_priority: form.priority,
      target_department: form.departmentId || null,
      target_assignee: form.assigneeId || null,
      target_due_date: form.dueDate || null,
    });
    setBusy(false);
    if (assignError) {
      setError(assignError.message);
      return;
    }
    setNotice(form.assigneeId ? "Task assigned to employee." : "Task assigned to department.");
    setForm({ title: "", description: "", priority: "medium", departmentId: "", assigneeId: "", dueDate: "" });
    setTaskOpen(false);
    load();
  }

  async function patchTask(taskId: string, patch: Partial<Task>) {
    const payload: Record<string, unknown> = {};
    if (patch.status) payload.status = patch.status;
    if (patch.priority) payload.priority = patch.priority;
    if (patch.dueDate !== undefined) payload.due_date = patch.dueDate;
    const { error: updateError } = await supabase.from("tasks").update(payload).eq("id", taskId);
    if (updateError) setError(updateError.message);
    else load();
  }

  async function reassignTask(task: Task, departmentId: string | null, assigneeId: string | null) {
    const { error: reassignError } = await supabase.rpc("reassign_admin_task", {
      target_task: task.id,
      target_department: departmentId,
      target_assignee: assigneeId,
    });
    if (reassignError) setError(reassignError.message);
    else {
      setNotice("Task assignment updated.");
      load();
    }
  }

  if (loading) {
    return (
      <AppShell profile={profile} title="Tasks" subtitle="Assign and forward tasks by department and employee." variant="admin">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-[126px] animate-pulse rounded-lg border border-[#e7ebf5] bg-white" />)}
          </div>
          <div className="h-[420px] animate-pulse rounded-lg border border-[#e7ebf5] bg-white" />
        </div>
      </AppShell>
    );
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Tasks" variant="admin">
        <Card className="mx-auto max-w-md rounded-lg text-center">
          <h2 className="text-xl font-black text-[#071035]">Manager access required</h2>
          <p className="mt-2 text-sm font-semibold text-[#526184]">Your role does not have access to task assignment.</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      profile={profile}
      variant="admin"
      title="Tasks"
      subtitle="Assign tasks to departments or employees, then forward them as work changes."
      actions={<Button onClick={() => setTaskOpen(true)} className="hidden bg-[#5b36f2] text-white hover:bg-[#4d2ed0] sm:inline-flex">+ Create Task</Button>}
    >
      <div className="space-y-6">
        {error && <Alert tone="danger">{error}</Alert>}
        {notice && <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard active={view === "all"} label="Total Tasks" value={data.stats.totalTasks} helper="All task records" tone="bg-[#ece8ff] text-[#4f46e5]" iconNode={icon(icons.task)} onClick={() => setView("all")} />
          <StatCard active={view === "department"} label="Department Tasks" value={data.stats.assignedToDepartments} helper="Waiting on dept lead" tone="bg-[#eaf1ff] text-[#2458d3]" iconNode={icon(icons.department)} onClick={() => setView("department")} />
          <StatCard active={assigneeFilter !== ""} label="Employee Tasks" value={data.stats.assignedToEmployees} helper="Assigned to people" tone="bg-[#e5f8ee] text-[#08764f]" iconNode={icon(icons.user)} onClick={() => setAssigneeFilter("")} />
          <StatCard active={view === "in_progress"} label="In Progress" value={data.stats.inProgress} helper="Currently moving" tone="bg-[#fff4df] text-[#a54f00]" iconNode={icon(icons.progress)} onClick={() => setView("in_progress")} />
          <StatCard active={view === "completed"} label="Completed" value={data.stats.completed} helper="Done work" tone="bg-[#edfdf5] text-[#08764f]" iconNode={icon(icons.check)} onClick={() => setView("completed")} />
        </section>

        <Card className="rounded-lg border-[#dfe6f3] p-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_190px_190px_132px_132px]">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, departments, employees..." className="h-11 text-[#071035] placeholder:text-[#7b88a8]" />
            <Select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="h-11 text-[#071035]">
              <option value="">All Departments</option>
              {data.departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
            </Select>
            <Select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className="h-11 text-[#071035]">
              <option value="">All Employees</option>
              {data.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </Select>
            <Select value={view} onChange={(event) => setView(event.target.value as Status)} className="h-11 text-[#071035]">
              <option value="all">All Status</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="review">Review</option>
              <option value="completed">Completed</option>
              <option value="department">Dept Only</option>
            </Select>
            <Select value={layout} onChange={(event) => setLayout(event.target.value as "board" | "list")} className="h-11 text-[#071035]">
              <option value="board">Board</option>
              <option value="list">List</option>
            </Select>
          </div>
          <Button className="mt-4 w-full sm:hidden" onClick={() => setTaskOpen(true)}>Create Task</Button>
        </Card>

        {layout === "board" ? (
          <section className="grid gap-5 xl:grid-cols-4">
            {boardColumns.map((column) => {
              const columnTasks = visibleTasks.filter((task) => task.status === column);
              return (
                <Card key={column} className="min-h-[360px] rounded-lg border-[#dfe6f3] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-sm font-black text-[#071035]">{statusLabels[column]}</h2>
                    <Badge tone={statusTone[column]} className="font-black">{columnTasks.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {columnTasks.map((task) => (
                      <button key={task.id} onClick={() => setSelected(task)} className="w-full rounded-lg border border-[#edf0f7] bg-[#fbfcff] p-4 text-left transition hover:border-[#bdb5ff] hover:bg-white">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="line-clamp-2 text-sm font-black text-[#071035]">{task.title}</h3>
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-black capitalize", priorityClass[task.priority])}>{task.priority}</span>
                        </div>
                        <p className="mt-3 text-xs font-bold text-[#526184]">{task.departmentName || "No department"}</p>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          {task.assigneeId ? (
                            <span className="flex min-w-0 items-center gap-2">
                              <Avatar name={task.assigneeName || "Member"} src={task.assigneeAvatarUrl ?? undefined} size="sm" />
                              <span className="truncate text-xs font-black text-[#33415c]">{task.assigneeName}</span>
                            </span>
                          ) : (
                            <span className="rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-black text-[#4f46e5]">Department queue</span>
                          )}
                          <span className="text-xs font-bold text-[#7b88a8]">{dueLabel(task.dueDate)}</span>
                        </div>
                      </button>
                    ))}
                    {columnTasks.length === 0 && <p className="rounded-lg border border-dashed border-[#dfe6f3] p-5 text-center text-sm font-bold text-[#526184]">No tasks here.</p>}
                  </div>
                </Card>
              );
            })}
          </section>
        ) : (
          <Card className="rounded-lg border-[#dfe6f3] p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#18213d] text-[12px] font-black uppercase tracking-wide text-[#6b7898]">
                    <th className="px-5 py-4">Task</th>
                    <th className="px-5 py-4">Department</th>
                    <th className="px-5 py-4">Assignee</th>
                    <th className="px-5 py-4">Priority</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Due</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.map((task) => (
                    <tr key={task.id} className="border-b border-[#edf0f7] last:border-0 hover:bg-[#fbfcff]">
                      <td className="px-5 py-4">
                        <button onClick={() => setSelected(task)} className="text-left">
                          <span className="block font-black text-[#071035]">{task.title}</span>
                          {task.description && <span className="mt-1 block max-w-[340px] truncate text-xs font-semibold text-[#526184]">{task.description}</span>}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-xs font-black text-[#33415c]">{task.departmentName || "Not assigned"}</td>
                      <td className="px-5 py-4">
                        {task.assigneeId ? (
                          <span className="inline-flex items-center gap-2 text-xs font-black text-[#33415c]">
                            <Avatar name={task.assigneeName || "Member"} src={task.assigneeAvatarUrl ?? undefined} size="sm" />
                            {task.assigneeName}
                          </span>
                        ) : (
                          <Badge tone="info" className="font-black">Department queue</Badge>
                        )}
                      </td>
                      <td className="px-5 py-4"><span className={cn("rounded-full px-3 py-1 text-xs font-black capitalize", priorityClass[task.priority])}>{task.priority}</span></td>
                      <td className="px-5 py-4"><Badge tone={statusTone[task.status]} className="font-black">{statusLabels[task.status] || task.status}</Badge></td>
                      <td className="px-5 py-4 text-xs font-bold text-[#526184]">{dueLabel(task.dueDate)}</td>
                      <td className="px-5 py-4 text-right"><Button size="sm" variant="secondary" onClick={() => setSelected(task)}>Forward</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleTasks.length === 0 && <p className="p-8 text-center text-sm font-bold text-[#526184]">No tasks match this view.</p>}
            </div>
          </Card>
        )}
      </div>

      <Modal open={taskOpen} onClose={() => setTaskOpen(false)} title="Create Task" className="max-w-xl">
        <form onSubmit={createTask} className="space-y-4">
          <label className="block text-xs font-black text-[#33415c]">
            Task Title
            <Input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Prepare product listing campaign" className="mt-1 h-11 text-[#071035]" />
          </label>
          <label className="block text-xs font-black text-[#33415c]">
            Description
            <Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Add details, links, or acceptance notes..." className="mt-1 h-11 text-[#071035]" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-black text-[#33415c]">
              Department
              <Select value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value, assigneeId: "" })} className="mt-1 h-11 text-[#071035]">
                <option value="">No department</option>
                {data.departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
              </Select>
            </label>
            <label className="block text-xs font-black text-[#33415c]">
              Employee
              <Select value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })} className="mt-1 h-11 text-[#071035]">
                <option value="">Assign to department queue</option>
                {peopleForForm.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </Select>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-black text-[#33415c]">
              Priority
              <Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })} className="mt-1 h-11 text-[#071035]">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </label>
            <label className="block text-xs font-black text-[#33415c]">
              Due Date
              <Input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="mt-1 h-11 text-[#071035]" />
            </label>
          </div>
          <div className="flex justify-end gap-3 border-t border-[#18213d] pt-4">
            <Button type="button" variant="ghost" onClick={() => setTaskOpen(false)}>Cancel</Button>
            <Button disabled={busy}>Create Task</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.title} className="max-w-2xl">
        {selected && (
          <div className="space-y-5">
            <p className="text-sm font-semibold leading-6 text-[#33415c]">{selected.description || "No description added."}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-black text-[#33415c]">
                Forward to Department
                <Select
                  value={selected.departmentId ?? ""}
                  onChange={(event) => reassignTask(selected, event.target.value || null, null)}
                  className="mt-1 h-11 text-[#071035]"
                >
                  <option value="">No department</option>
                  {data.departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                </Select>
              </label>
              <label className="block text-xs font-black text-[#33415c]">
                Forward to Employee
                <Select
                  value={selected.assigneeId ?? ""}
                  onChange={(event) => reassignTask(selected, selected.departmentId, event.target.value || null)}
                  className="mt-1 h-11 text-[#071035]"
                >
                  <option value="">Department queue</option>
                  {peopleForSelected.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </Select>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-xs font-black text-[#33415c]">
                Status
                <Select value={selected.status} onChange={(event) => patchTask(selected.id, { status: event.target.value as Task["status"] })} className="mt-1 h-10 text-[#071035]">
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="completed">Completed</option>
                  <option value="on_hold">On Hold</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </label>
              <label className="block text-xs font-black text-[#33415c]">
                Priority
                <Select value={selected.priority} onChange={(event) => patchTask(selected.id, { priority: event.target.value as Priority })} className="mt-1 h-10 text-[#071035]">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </Select>
              </label>
              <label className="block text-xs font-black text-[#33415c]">
                Due Date
                <Input type="date" value={selected.dueDate ?? ""} onChange={(event) => patchTask(selected.id, { dueDate: event.target.value || null })} className="mt-1 h-10 text-[#071035]" />
              </label>
            </div>
            <div className="rounded-lg border border-[#edf0f7] bg-[#fbfcff] p-4">
              <p className="text-xs font-black uppercase text-[#7b88a8]">Current route</p>
              <p className="mt-2 text-sm font-black text-[#071035]">
                {selected.departmentName || "No department"} / {selected.assigneeName || "Department queue"}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
