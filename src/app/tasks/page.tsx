"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Input, Select, Alert, Modal, Avatar, Tabs, Checkbox } from "@/components/ui";
import { cn } from "@/lib/cn";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_id: string | null;
  workspace_id: string | null;
  due_date: string | null;
  created_at: string;
};
type Request = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  from_department_id: string | null;
  to_department_id: string | null;
};
type Person = { id: string; name: string; avatar_url: string | null };
type Workspace = { id: string; name: string };
type Department = { id: string; name: string };
type ChecklistItem = { id: string; label: string; is_done: boolean };
type Comment = { id: string; body: string; created_at: string; author_id: string | null };

const BOARD = [
  { id: "todo", label: "To Do", head: "bg-slate-50 text-slate-700" },
  { id: "in_progress", label: "In Progress", head: "bg-primary-light text-primary" },
  { id: "review", label: "Review", head: "bg-warning-light text-amber-700" },
  { id: "completed", label: "Completed", head: "bg-success-light text-emerald-700" },
];

const ALL_STATUSES = ["todo", "in_progress", "review", "completed", "on_hold", "cancelled"];
const PRIORITIES = ["low", "medium", "high", "urgent"];
const REQUEST_STATUSES = ["pending", "accepted", "in_progress", "completed", "rejected"];

const PRIORITY_TONE: Record<string, "danger" | "warning" | "success" | "neutral"> = {
  urgent: "danger",
  high: "danger",
  medium: "warning",
  low: "success",
};

function dueLabel(due: string | null) {
  if (!due) return null;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (due < today) return { text: "Overdue", danger: true };
  if (due === today) return { text: "Due Today", danger: true };
  if (due === tomorrow) return { text: "Due Tomorrow", danger: false };
  return { text: new Date(due).toLocaleDateString(undefined, { month: "short", day: "numeric" }), danger: false };
}

export default function TasksAndRequestsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("tasks");
  const [view, setView] = useState<"board" | "list">("board");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [wsFilter, setWsFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");

  const [selected, setSelected] = useState<Task | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newCheck, setNewCheck] = useState("");
  const [newComment, setNewComment] = useState("");

  const [taskOpen, setTaskOpen] = useState(false);
  const [reqOpen, setReqOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "todo",
    priority: "medium",
    assignee_id: "",
    workspace_id: "",
    due_date: "",
  });
  const [reqForm, setReqForm] = useState({ title: "", description: "", priority: "medium", to_department_id: "", due_date: "" });

  const load = useCallback(async () => {
    const me = await getProfile();
    if (!me) {
      router.replace("/login");
      return;
    }
    if (!me.company_id || me.status !== "active") {
      router.replace("/onboarding");
      return;
    }
    setProfile(me);

    const [tasksRes, reqRes, peopleRes, wsRes, deptRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, description, status, priority, assignee_id, workspace_id, due_date, created_at")
        .eq("company_id", me.company_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("requests")
        .select("id, title, status, priority, due_date, from_department_id, to_department_id")
        .eq("company_id", me.company_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name, first_name, email, avatar_url")
        .eq("company_id", me.company_id)
        .eq("status", "active"),
      supabase.from("workspaces").select("id, name").eq("company_id", me.company_id).order("name"),
      supabase.from("departments").select("id, name").eq("company_id", me.company_id).order("name"),
    ]);

    setTasks(tasksRes.data ?? []);
    setRequests(reqRes.data ?? []);
    setPeople(
      (peopleRes.data ?? []).map((p) => ({
        id: p.id,
        name: p.full_name || p.first_name || p.email?.split("@")[0] || "Member",
        avatar_url: p.avatar_url,
      }))
    );
    setWorkspaces(wsRes.data ?? []);
    setDepartments(deptRes.data ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const openTask = useCallback(async (task: Task) => {
    setSelected(task);
    setChecklist([]);
    setComments([]);
    const [clRes, cmRes] = await Promise.all([
      supabase.from("task_checklist_items").select("id, label, is_done").eq("task_id", task.id).order("position"),
      supabase.from("task_comments").select("id, body, created_at, author_id").eq("task_id", task.id).order("created_at"),
    ]);
    setChecklist(clRes.data ?? []);
    setComments(cmRes.data ?? []);
  }, []);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const wsById = useMemo(() => new Map(workspaces.map((w) => [w.id, w])), [workspaces]);
  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);

  const visible = useMemo(
    () => tasks.filter((t) => (!wsFilter || t.workspace_id === wsFilter) && (!assigneeFilter || t.assignee_id === assigneeFilter)),
    [tasks, wsFilter, assigneeFilter]
  );

  async function createTask(event: React.FormEvent) {
    event.preventDefault();
    if (!profile?.company_id) return;
    setBusy(true);
    setError("");
    const { error: insertError } = await supabase.from("tasks").insert({
      company_id: profile.company_id,
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      assignee_id: form.assignee_id || null,
      workspace_id: form.workspace_id || null,
      due_date: form.due_date || null,
      created_by: profile.id,
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setTaskOpen(false);
    setForm({ title: "", description: "", status: "todo", priority: "medium", assignee_id: "", workspace_id: "", due_date: "" });
    load();
  }

  async function createRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!profile?.company_id) return;
    setBusy(true);
    setError("");
    const { error: insertError } = await supabase.from("requests").insert({
      company_id: profile.company_id,
      title: reqForm.title.trim(),
      description: reqForm.description.trim() || null,
      priority: reqForm.priority,
      to_department_id: reqForm.to_department_id || null,
      from_department_id: profile.department_id,
      requester_id: profile.id,
      due_date: reqForm.due_date || null,
      status: "pending",
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setReqOpen(false);
    setReqForm({ title: "", description: "", priority: "medium", to_department_id: "", due_date: "" });
    load();
  }

  async function patchTask(id: string, patch: Partial<Task>) {
    const payload: Record<string, unknown> = { ...patch };
    if (patch.status === "completed") payload.completed_at = new Date().toISOString();
    const { error: updateError } = await supabase.from("tasks").update(payload).eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }

  async function toggleCheck(item: ChecklistItem) {
    await supabase.from("task_checklist_items").update({ is_done: !item.is_done }).eq("id", item.id);
    setChecklist((prev) => prev.map((c) => (c.id === item.id ? { ...c, is_done: !c.is_done } : c)));
  }

  async function addCheck(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !newCheck.trim()) return;
    const { data } = await supabase
      .from("task_checklist_items")
      .insert({ task_id: selected.id, label: newCheck.trim(), position: checklist.length })
      .select("id, label, is_done")
      .single();
    if (data) setChecklist((prev) => [...prev, data]);
    setNewCheck("");
  }

  async function addComment(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !newComment.trim() || !profile) return;
    const { data, error: insertError } = await supabase
      .from("task_comments")
      .insert({ task_id: selected.id, author_id: profile.id, body: newComment.trim() })
      .select("id, body, created_at, author_id")
      .single();
    if (insertError) {
      setError(insertError.message);
      return;
    }
    if (data) setComments((prev) => [...prev, data]);
    setNewComment("");
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading tasks...</main>;
  }

  const done = checklist.filter((c) => c.is_done).length;

  return (
    <AppShell
      profile={profile}
      title="Tasks & Requests"
      subtitle="Track, manage and complete tasks. Handle requests from other teams."
      actions={
        <Button onClick={() => (tab === "tasks" ? setTaskOpen(true) : setReqOpen(true))}>
          + Create {tab === "tasks" ? "task" : "request"}
        </Button>
      }
    >
      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Tabs
            tabs={[
              { id: "tasks", label: "Tasks" },
              { id: "requests", label: "Requests" },
            ]}
            value={tab}
            onValueChange={setTab}
            className="border-0"
          />

          {tab === "tasks" && (
            <div className="flex flex-wrap items-center gap-3">
              <Select className="h-9 w-44" value={wsFilter} onChange={(e) => setWsFilter(e.target.value)}>
                <option value="">All Workspaces</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
              <Select className="h-9 w-44" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                <option value="">All Assignees</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              <div className="flex items-center rounded-lg border border-slate-200 p-1 text-xs font-semibold">
                {(["board", "list"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={cn("rounded-md px-3 py-1.5 capitalize transition", view === v ? "bg-primary text-white" : "text-slate-500")}
                  >
                    {v}
                  </button>
                ))}
                <span className="cursor-not-allowed rounded-md px-3 py-1.5 text-slate-300" title="Not built yet">
                  Calendar
                </span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {error && (
        <Alert tone="danger" className="mb-4" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {tab === "tasks" ? (
        <>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-h4 text-slate-900">Task Board</h3>
            <Badge tone="neutral">{visible.length} Tasks</Badge>
          </div>

          {view === "board" ? (
            <div className="grid gap-4 lg:grid-cols-4">
              {BOARD.map((col) => {
                const items = visible.filter((t) => t.status === col.id);
                return (
                  <div key={col.id} className="rounded-xl border border-slate-200 bg-white">
                    <div className={cn("flex items-center justify-between rounded-t-xl px-4 py-3", col.head)}>
                      <span className="text-sm font-bold">{col.label}</span>
                      <span className="text-xs font-bold opacity-70">{items.length}</span>
                    </div>
                    <div className="space-y-3 p-3">
                      {items.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Nothing here</p>}
                      {items.map((t) => {
                        const due = dueLabel(t.due_date);
                        const a = t.assignee_id ? peopleById.get(t.assignee_id) : undefined;
                        return (
                          <button
                            key={t.id}
                            onClick={() => openTask(t)}
                            className="w-full rounded-lg border border-slate-200 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-ds-sm"
                          >
                            <p className={cn("text-sm font-semibold text-slate-900", t.status === "completed" && "text-slate-400 line-through")}>
                              {t.title}
                            </p>
                            {t.workspace_id && wsById.get(t.workspace_id) && (
                              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                                {wsById.get(t.workspace_id)!.name}
                              </p>
                            )}
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {a && <Avatar name={a.name} src={a.avatar_url ?? undefined} size="sm" />}
                                <Badge tone={PRIORITY_TONE[t.priority]} className="capitalize">
                                  {t.priority}
                                </Badge>
                              </div>
                              {due && (
                                <span className={cn("text-[11px] font-semibold", due.danger ? "text-danger" : "text-slate-400")}>
                                  {due.text}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      <button
                        onClick={() => {
                          setForm((f) => ({ ...f, status: col.id }));
                          setTaskOpen(true);
                        }}
                        className="w-full rounded-lg py-2 text-xs font-semibold text-slate-400 transition hover:bg-slate-50 hover:text-primary"
                      >
                        + Add Task
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Card>
              {visible.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-400">No tasks yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        <th className="pb-3">Task</th>
                        <th className="pb-3">Assignee</th>
                        <th className="pb-3">Priority</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3">Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((t) => {
                        const a = t.assignee_id ? peopleById.get(t.assignee_id) : undefined;
                        const due = dueLabel(t.due_date);
                        return (
                          <tr
                            key={t.id}
                            onClick={() => openTask(t)}
                            className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                          >
                            <td className="py-3 font-semibold text-slate-900">{t.title}</td>
                            <td className="py-3">
                              {a ? (
                                <span className="flex items-center gap-2">
                                  <Avatar name={a.name} src={a.avatar_url ?? undefined} size="sm" />
                                  {a.name}
                                </span>
                              ) : (
                                <span className="text-slate-400">Unassigned</span>
                              )}
                            </td>
                            <td className="py-3">
                              <Badge tone={PRIORITY_TONE[t.priority]} className="capitalize">
                                {t.priority}
                              </Badge>
                            </td>
                            <td className="py-3 capitalize text-slate-600">{t.status.replace("_", " ")}</td>
                            <td className={cn("py-3", due?.danger ? "font-semibold text-danger" : "text-slate-500")}>{due?.text ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      ) : (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <h3 className="text-h4 text-slate-900">Requests</h3>
            <Badge tone="neutral">{requests.length} Requests</Badge>
          </div>
          {requests.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-400">
              No requests yet. Create one to ask another team for something.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="pb-3">Request Title</th>
                    <th className="pb-3">From</th>
                    <th className="pb-3">Requested To</th>
                    <th className="pb-3">Priority</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => {
                    const due = dueLabel(r.due_date);
                    return (
                      <tr key={r.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-3 font-semibold text-slate-900">{r.title}</td>
                        <td className="py-3 text-slate-600">{r.from_department_id ? deptById.get(r.from_department_id)?.name ?? "—" : "—"}</td>
                        <td className="py-3 text-slate-600">{r.to_department_id ? deptById.get(r.to_department_id)?.name ?? "—" : "—"}</td>
                        <td className="py-3">
                          <Badge tone={PRIORITY_TONE[r.priority]} className="capitalize">
                            {r.priority}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <Select
                            className="h-8 w-32 text-xs"
                            value={r.status}
                            onChange={async (e) => {
                              const status = e.target.value;
                              const { error: updateError } = await supabase.from("requests").update({ status }).eq("id", r.id);
                              if (updateError) {
                                setError(updateError.message);
                                return;
                              }
                              setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
                            }}
                          >
                            {REQUEST_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s.replace("_", " ")}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className={cn("py-3", due?.danger ? "font-semibold text-danger" : "text-slate-500")}>{due?.text ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Task detail */}
      <Modal open={!!selected} onClose={() => setSelected(null)} className="max-w-lg">
        {selected && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <Select className="h-9 w-40" value={selected.status} onChange={(e) => patchTask(selected.id, { status: e.target.value })}>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </Select>
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <h2 className="text-h3 text-slate-900">{selected.title}</h2>
            {selected.description && <p className="text-sm leading-6 text-slate-600">{selected.description}</p>}

            <dl className="space-y-3 border-t border-slate-100 pt-4 text-sm">
              <Row label="Workspace">{selected.workspace_id ? wsById.get(selected.workspace_id)?.name ?? "—" : "—"}</Row>
              <Row label="Assignee">
                <Select
                  className="h-8 w-40 text-xs"
                  value={selected.assignee_id ?? ""}
                  onChange={(e) => patchTask(selected.id, { assignee_id: e.target.value || null })}
                >
                  <option value="">Unassigned</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Row>
              <Row label="Priority">
                <Select className="h-8 w-32 text-xs" value={selected.priority} onChange={(e) => patchTask(selected.id, { priority: e.target.value })}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </Row>
              <Row label="Due Date">
                <Input
                  type="date"
                  className="h-8 w-40 text-xs"
                  value={selected.due_date ?? ""}
                  onChange={(e) => patchTask(selected.id, { due_date: e.target.value || null })}
                />
              </Row>
            </dl>

            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">Checklist</h4>
                <span className="text-xs text-slate-400">
                  {done}/{checklist.length}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {checklist.map((c) => (
                  <li key={c.id}>
                    <Checkbox
                      checked={c.is_done}
                      onChange={() => toggleCheck(c)}
                      label={<span className={c.is_done ? "text-slate-400 line-through" : ""}>{c.label}</span>}
                    />
                  </li>
                ))}
              </ul>
              <form onSubmit={addCheck} className="mt-3 flex gap-2">
                <Input value={newCheck} onChange={(e) => setNewCheck(e.target.value)} placeholder="Add an item" className="h-9 text-xs" />
                <Button size="sm" variant="secondary" disabled={!newCheck.trim()}>
                  Add
                </Button>
              </form>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h4 className="text-sm font-bold text-slate-900">Activity</h4>
              <ul className="mt-3 space-y-3">
                {comments.length === 0 && <li className="text-xs text-slate-400">No comments yet.</li>}
                {comments.map((c) => {
                  const a = c.author_id ? peopleById.get(c.author_id) : undefined;
                  return (
                    <li key={c.id} className="flex gap-2">
                      <Avatar name={a?.name ?? "Someone"} src={a?.avatar_url ?? undefined} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800">{a?.name ?? "Someone"}</p>
                        <p className="text-xs leading-5 text-slate-600">{c.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <form onSubmit={addComment} className="mt-3 flex gap-2">
                <Input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment..." className="h-9 text-xs" />
                <Button size="sm" disabled={!newComment.trim()}>
                  Send
                </Button>
              </form>
            </div>
          </div>
        )}
      </Modal>

      {/* Create task */}
      <Modal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        title="New task"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTaskOpen(false)}>
              Cancel
            </Button>
            <Button form="new-task" disabled={busy || !form.title.trim()}>
              {busy ? "Creating..." : "Create task"}
            </Button>
          </>
        }
      >
        <form id="new-task" onSubmit={createTask} className="space-y-4">
          <Field label="Title">
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Create banner for Summer Sale" />
          </Field>
          <Field label="Description">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assignee">
              <Select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
                <option value="">Unassigned</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Workspace">
              <Select value={form.workspace_id} onChange={(e) => setForm({ ...form, workspace_id: e.target.value })}>
                <option value="">None</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Due date">
            <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
        </form>
      </Modal>

      {/* Create request */}
      <Modal
        open={reqOpen}
        onClose={() => setReqOpen(false)}
        title="New request"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReqOpen(false)}>
              Cancel
            </Button>
            <Button form="new-request" disabled={busy || !reqForm.title.trim()}>
              {busy ? "Creating..." : "Create request"}
            </Button>
          </>
        }
      >
        <form id="new-request" onSubmit={createRequest} className="space-y-4">
          <Field label="Title">
            <Input
              required
              value={reqForm.title}
              onChange={(e) => setReqForm({ ...reqForm, title: e.target.value })}
              placeholder="Need product images for 5 new products"
            />
          </Field>
          <Field label="Description">
            <Input value={reqForm.description} onChange={(e) => setReqForm({ ...reqForm, description: e.target.value })} placeholder="Optional" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Requested to">
              <Select value={reqForm.to_department_id} onChange={(e) => setReqForm({ ...reqForm, to_department_id: e.target.value })}>
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={reqForm.priority} onChange={(e) => setReqForm({ ...reqForm, priority: e.target.value })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Due date">
            <Input type="date" value={reqForm.due_date} onChange={(e) => setReqForm({ ...reqForm, due_date: e.target.value })} />
          </Field>
          {departments.length === 0 && <Alert tone="info">Add departments in Users &amp; Teams first so requests can be routed.</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}
        </form>
      </Modal>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800">{children}</dd>
    </div>
  );
}
