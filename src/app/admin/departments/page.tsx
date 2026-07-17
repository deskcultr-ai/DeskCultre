"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Input, Select, Alert, Modal, Avatar } from "@/components/ui";

type DeptMember = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  status: string;
  src?: string;
};

type Department = {
  id: string;
  name: string;
  description: string | null;
  workload: string;
  members: DeptMember[];
  taskCount: number;
  openCount: number;
};

const WORKLOADS = ["low", "medium", "high"];
const WORKLOAD_TONE: Record<string, "success" | "warning" | "danger"> = {
  low: "success",
  medium: "warning",
  high: "danger",
};

export default function DepartmentsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", workload: "medium" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Details Modal States
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<DeptMember | null>(null);
  const [actionType, setActionType] = useState<"none" | "task" | "request">("none");

  // Task Form States
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [taskDueDate, setTaskDueDate] = useState("");

  // Request Form States
  const [reqTitle, setReqTitle] = useState("");
  const [reqDesc, setReqDesc] = useState("");

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
    if (!isAdmin(me)) {
      setDenied(true);
      setLoading(false);
      return;
    }

    const [deptRes, peopleRes, tasksRes] = await Promise.all([
      supabase.from("departments").select("id, name, description, workload").eq("company_id", me.company_id).order("name"),
      supabase
        .from("profiles")
        .select("id, department_id, full_name, first_name, email, avatar_url, role, status")
        .eq("company_id", me.company_id),
      supabase.from("tasks").select("id, department_id, status").eq("company_id", me.company_id),
    ]);

    const people = peopleRes.data ?? [];
    const tasks = tasksRes.data ?? [];

    const mappedDepts = (deptRes.data ?? []).map((d) => {
      const deptTasks = tasks.filter((t) => t.department_id === d.id);
      const deptMembers = people
        .filter((p) => p.department_id === d.id)
        .map((p) => ({
          id: p.id,
          name: p.full_name || p.first_name || p.email?.split("@")[0] || "Member",
          email: p.email,
          role: p.role,
          status: p.status,
          src: p.avatar_url ?? undefined,
        }));

      return {
        ...d,
        members: deptMembers,
        taskCount: deptTasks.length,
        openCount: deptTasks.filter((t) => !["completed", "cancelled"].includes(t.status)).length,
      };
    });

    setDepartments(mappedDepts);

    // Update active detail modal view if open
    if (selectedDept) {
      const updated = mappedDepts.find((x) => x.id === selectedDept.id);
      if (updated) {
        setSelectedDept(updated);
      }
    }

    setLoading(false);
  }, [router, selectedDept]);

  useEffect(() => {
    load();
  }, [load]);

  async function createDept(event: React.FormEvent) {
    event.preventDefault();
    if (!profile?.company_id) return;
    setBusy(true);
    setError("");
    const { error: insertError } = await supabase.from("departments").insert({
      company_id: profile.company_id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      workload: form.workload,
    });
    setBusy(true);
    if (insertError) {
      setError(insertError.message);
      setBusy(false);
      return;
    }
    setOpen(false);
    setForm({ name: "", description: "", workload: "medium" });
    setBusy(false);
    load();
  }

  async function setWorkload(id: string, workload: string) {
    const { error: updateError } = await supabase.from("departments").update({ workload }).eq("id", id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDepartments((prev) => prev.map((d) => (d.id === id ? { ...d, workload } : d)));
  }

  async function removeDept(id: string) {
    const { error: deleteError } = await supabase.from("departments").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    load();
  }

  async function handleAssignTask(event: React.FormEvent) {
    event.preventDefault();
    if (!profile?.company_id || !selectedDept || !selectedEmployee || !taskTitle.trim()) return;

    setBusy(true);
    setError("");
    setSuccess("");

    const { error: taskError } = await supabase.from("tasks").insert({
      company_id: profile.company_id,
      department_id: selectedDept.id,
      title: taskTitle.trim(),
      description: taskDesc.trim() || null,
      priority: taskPriority,
      assignee_id: selectedEmployee.id,
      created_by: profile.id,
      due_date: taskDueDate || null,
      status: "todo",
    });

    setBusy(false);
    if (taskError) {
      setError(taskError.message);
      return;
    }

    setSuccess(`Task assigned successfully to ${selectedEmployee.name}!`);
    setTaskTitle("");
    setTaskDesc("");
    setTaskDueDate("");
    setActionType("none");
    setSelectedEmployee(null);
    load();
  }

  async function handleCreateRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!profile?.company_id || !selectedDept || !selectedEmployee || !reqTitle.trim()) return;

    setBusy(true);
    setError("");
    setSuccess("");

    const { error: reqError } = await supabase.from("requests").insert({
      company_id: profile.company_id,
      title: reqTitle.trim(),
      description: reqDesc.trim() || null,
      requester_id: selectedEmployee.id,
      from_department_id: selectedDept.id,
      status: "pending",
    });

    setBusy(false);
    if (reqError) {
      setError(reqError.message);
      return;
    }

    setSuccess(`Request created successfully on behalf of ${selectedEmployee.name}!`);
    setReqTitle("");
    setReqDesc("");
    setActionType("none");
    setSelectedEmployee(null);
    load();
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading departments...</main>;
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Departments" variant="admin">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-h4 text-slate-900">Admin access required</h2>
          <p className="mt-2 text-sm text-slate-600">Your role doesn&apos;t have access to department management.</p>
          <Button className="mt-5" onClick={() => router.push("/dashboard")}>
            Go to my dashboard
          </Button>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      profile={profile}
      variant="admin"
      title="Departments"
      subtitle="Click on any department card to view its employees, active tasks, or create requests for them."
      actions={<Button onClick={() => setOpen(true)}>+ New department</Button>}
    >
      {error && (
        <Alert tone="danger" className="mb-4" onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert tone="success" className="mb-4" onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      {departments.length === 0 ? (
        <Card className="mx-auto max-w-lg text-center">
          <h2 className="text-h4 text-slate-900">No departments yet</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Create your first department, then assign people to it in Users &amp; Teams. New joiners pick their
            department when they enter your join code.
          </p>
          <Button className="mt-5" onClick={() => setOpen(true)}>
            Create department
          </Button>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {departments.map((d) => (
            <div
              key={d.id}
              onClick={() => setSelectedDept(d)}
              className="cursor-pointer transition duration-200 hover:-translate-y-1"
            >
              <Card className="h-full flex flex-col justify-between hover:border-indigo-400">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-slate-900">{d.name}</h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{d.description || "No description"}</p>
                    </div>
                    <Badge tone={WORKLOAD_TONE[d.workload]} className="shrink-0 capitalize">
                      {d.workload}
                    </Badge>
                  </div>

                  <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                    <Stat label="People" value={d.members.length} />
                    <Stat label="Tasks" value={d.taskCount} />
                    <Stat label="Open" value={d.openCount} />
                  </dl>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4" onClick={(e) => e.stopPropagation()}>
                  <Select
                    className="h-8 w-32 text-xs"
                    value={d.workload}
                    onChange={(e) => setWorkload(d.id, e.target.value)}
                  >
                    {WORKLOADS.map((w) => (
                      <option key={w} value={w}>
                        {w} workload
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => removeDept(d.id)}>
                    Delete
                  </Button>
                </div>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Creation Modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New department"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="new-dept" disabled={busy || !form.name.trim()}>
              {busy ? "Creating..." : "Create"}
            </Button>
          </>
        }
      >
        <form id="new-dept" onSubmit={createDept} className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">
            Name
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Marketing" className="mt-2" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Description
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Campaigns, brand and content"
              className="mt-2"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Workload
            <Select value={form.workload} onChange={(e) => setForm({ ...form, workload: e.target.value })} className="mt-2">
              {WORKLOADS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </Select>
          </label>
          {error && <Alert tone="danger">{error}</Alert>}
        </form>
      </Modal>

      {/* Details View Modal */}
      {selectedDept && (
        <Modal
          open={!!selectedDept}
          onClose={() => {
            setSelectedDept(null);
            setActionType("none");
            setSelectedEmployee(null);
          }}
          title={`Department: ${selectedDept.name}`}
          className="max-w-2xl"
        >
          <div className="space-y-6">
            <div className="flex justify-between items-start gap-4 pb-4 border-b border-slate-100">
              <div>
                <p className="text-sm text-slate-500">{selectedDept.description || "No description provided."}</p>
                <div className="mt-3 flex items-center gap-3">
                  <Badge tone={WORKLOAD_TONE[selectedDept.workload]}>{selectedDept.workload} workload</Badge>
                  <span className="text-xs text-slate-400">ID: {selectedDept.id}</span>
                </div>
              </div>
              <div className="flex gap-4 text-center shrink-0">
                <div className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg">
                  <span className="block font-black text-slate-900 text-lg">{selectedDept.members.length}</span>
                  <span className="text-[10px] uppercase text-slate-400 font-bold">People</span>
                </div>
                <div className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg">
                  <span className="block font-black text-slate-900 text-lg">{selectedDept.taskCount}</span>
                  <span className="text-[10px] uppercase text-slate-400 font-bold">Tasks</span>
                </div>
              </div>
            </div>

            {/* Employees List */}
            <div>
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Employees & Assign Actions</h4>
              {selectedDept.members.length === 0 ? (
                <p className="text-sm text-slate-400 bg-slate-50 p-4 rounded-xl text-center">No employees assigned to this department yet.</p>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 text-xs uppercase font-bold tracking-wide border-b border-slate-100">
                        <th className="p-3">Employee Name / ID</th>
                        <th className="p-3">Role</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDept.members.map((member) => (
                        <tr key={member.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={member.name} src={member.src} size="sm" />
                              <div>
                                <p className="font-bold text-slate-800 leading-tight">{member.name}</p>
                                <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{member.id}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 capitalize text-slate-600">{member.role}</td>
                          <td className="p-3">
                            <Badge tone={member.status === "active" ? "success" : member.status === "pending" ? "warning" : "danger"}>
                              {member.status}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setSelectedEmployee(member);
                                  setActionType("task");
                                }}
                              >
                                + Task
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setSelectedEmployee(member);
                                  setActionType("request");
                                }}
                              >
                                + Request
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Sub-form for Tasks or Requests assignment */}
            {selectedEmployee && actionType !== "none" && (
              <div className="p-5 bg-indigo-50/60 rounded-3xl border border-indigo-100 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-slate-800 text-sm">
                    {actionType === "task" ? "Assign Task to" : "Create Request on behalf of"} {selectedEmployee.name}
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEmployee(null);
                      setActionType("none");
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                </div>

                {actionType === "task" ? (
                  <form onSubmit={handleAssignTask} className="space-y-3">
                    <label className="block text-xs font-bold text-slate-700">
                      Task Title
                      <Input
                        required
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        placeholder="e.g. Prepare Quarter Audit Reports"
                        className="mt-1"
                      />
                    </label>
                    <label className="block text-xs font-bold text-slate-700">
                      Description
                      <Input
                        value={taskDesc}
                        onChange={(e) => setTaskDesc(e.target.value)}
                        placeholder="Detail of the auditing specs..."
                        className="mt-1"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-xs font-bold text-slate-700">
                        Priority
                        <Select
                          value={taskPriority}
                          onChange={(e) => setTaskPriority(e.target.value as any)}
                          className="mt-1"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </Select>
                      </label>
                      <label className="block text-xs font-bold text-slate-700">
                        Due Date
                        <Input
                          type="date"
                          value={taskDueDate}
                          onChange={(e) => setTaskDueDate(e.target.value)}
                          className="mt-1"
                        />
                      </label>
                    </div>
                    <Button disabled={busy || !taskTitle.trim()} className="w-full mt-2">
                      {busy ? "Assigning..." : "Assign Task"}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleCreateRequest} className="space-y-3">
                    <label className="block text-xs font-bold text-slate-700">
                      Request Title
                      <Input
                        required
                        value={reqTitle}
                        onChange={(e) => setReqTitle(e.target.value)}
                        placeholder="e.g. Access to Sales Folder"
                        className="mt-1"
                      />
                    </label>
                    <label className="block text-xs font-bold text-slate-700">
                      Description
                      <Input
                        value={reqDesc}
                        onChange={(e) => setReqDesc(e.target.value)}
                        placeholder="Explain access requirements..."
                        className="mt-1"
                      />
                    </label>
                    <Button disabled={busy || !reqTitle.trim()} className="w-full mt-2">
                      {busy ? "Creating Request..." : "Submit Request"}
                    </Button>
                  </form>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 py-2">
      <p className="text-base font-black text-slate-900">{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}
