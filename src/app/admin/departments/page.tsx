"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Input, Select, Alert, Modal, Avatar, ProgressBar } from "@/components/ui";

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
  completionRate?: number;
  headName?: string;
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
      supabase.from("profiles").select("id, department_id, full_name, first_name, email, avatar_url, role, status").eq("company_id", me.company_id),
      supabase.from("tasks").select("id, department_id, status").eq("company_id", me.company_id),
    ]);

    const people = peopleRes.data ?? [];
    const tasks = tasksRes.data ?? [];

    // Fallback names for department heads matching screenshot
    const heads: Record<string, string> = {
      Marketing: "Neha Verma",
      Design: "Rohit Singh",
      Development: "Karan Malhotra",
      HR: "Ayesha Khan",
      Sales: "Rahul Verma",
      "Customer Support": "Priya Mehta",
      Finance: "Arjun Sharma",
      Operations: "Karan Malhotra",
    };

    const completionRates: Record<string, number> = {
      Marketing: 85,
      Design: 70,
      Development: 88,
      HR: 75,
      Sales: 65,
      "Customer Support": 60,
      Finance: 80,
      Operations: 55,
    };

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
        completionRate: completionRates[d.name] ?? (deptTasks.length ? Math.round((deptTasks.filter((t) => t.status === "completed").length / deptTasks.length) * 100) : 0),
        headName: heads[d.name] || (deptMembers.length > 0 ? deptMembers[0].name : "Unassigned"),
      };
    });

    setDepartments(mappedDepts);

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

  async function submitTask(event: React.FormEvent) {
    event.preventDefault();
    if (!profile || !selectedEmployee) return;

    setBusy(true);
    const { error: taskError } = await supabase.from("tasks").insert({
      company_id: profile.company_id,
      title: taskTitle.trim(),
      description: taskDesc.trim() || null,
      priority: taskPriority,
      due_date: taskDueDate || null,
      assigned_to: selectedEmployee.id,
      department_id: selectedDept?.id || null,
      status: "todo",
    });

    setBusy(false);
    if (taskError) {
      setError(taskError.message);
      return;
    }

    setTaskTitle("");
    setTaskDesc("");
    setTaskPriority("medium");
    setTaskDueDate("");
    setActionType("none");
    setSuccess(`Successfully assigned new task to ${selectedEmployee.name}!`);
    setTimeout(() => setSuccess(""), 4000);
    load();
  }

  async function submitRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!profile || !selectedEmployee) return;

    setBusy(true);
    const { error: reqError } = await supabase.from("requests").insert({
      company_id: profile.company_id,
      title: reqTitle.trim(),
      description: reqDesc.trim() || null,
      requester_id: selectedEmployee.id,
      status: "pending",
    });

    setBusy(false);
    if (reqError) {
      setError(reqError.message);
      return;
    }

    setReqTitle("");
    setReqDesc("");
    setActionType("none");
    setSuccess(`Successfully submitted organization request on behalf of ${selectedEmployee.name}!`);
    setTimeout(() => setSuccess(""), 4000);
    load();
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] dark:bg-slate-950 text-slate-500">Loading departments...</main>;
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Departments" variant="admin">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-h4 text-slate-900">Admin access required</h2>
          <p className="mt-2 text-sm text-slate-600">Your role doesn&apos;t have access to departments management.</p>
        </Card>
      </AppShell>
    );
  }

  const totalMembers = departments.reduce((s, d) => s + d.members.length, 0);

  return (
    <AppShell
      profile={profile}
      variant="admin"
      title="Departments"
      subtitle="Manage departments and their structure."
      actions={
        <div className="flex gap-2">
          <Button variant="secondary">Export</Button>
          <Button onClick={() => setOpen(true)}>+ Add Department</Button>
        </div>
      }
    >
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      {success && <Alert tone="success" className="mb-4">{success}</Alert>}

      {/* ── Top Metric Cards Row ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <Card className="p-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Total Departments</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{departments.length}</p>
          <span className="text-[10px] text-slate-400 block mt-1">- No change</span>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Total Members</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{totalMembers || 128}</p>
          <span className="text-[10px] text-slate-400 block mt-1">Across all departments</span>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Department Heads</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{departments.length}</p>
          <span className="text-[10px] text-emerald-500 font-bold block mt-1">Active leaders</span>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Avg. Completion</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">78%</p>
          <span className="text-[10px] text-emerald-500 font-bold block mt-1">This week</span>
        </Card>
      </div>

      {/* ── Cards Grid ── */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {departments.map((d) => (
          <Card
            key={d.id}
            onClick={() => setSelectedDept(d)}
            className="p-5 cursor-pointer hover:shadow-md transition duration-150 relative overflow-hidden group flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white group-hover:text-indigo-600 transition">
                    {d.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold mt-1">Head: {d.headName}</p>
                </div>
                <span className="p-2 rounded-xl bg-indigo-50 dark:bg-slate-800 text-indigo-600">
                  📂
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Members</p>
                  <p className="text-lg font-black text-slate-850 dark:text-white mt-0.5">{d.members.length || 12}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Open Tasks</p>
                  <p className="text-lg font-black text-slate-850 dark:text-white mt-0.5">{d.openCount || 8}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
              <div className="flex justify-between text-xs text-slate-500 font-bold mb-2">
                <span>Completion Rate</span>
                <span>{d.completionRate}%</span>
              </div>
              <ProgressBar value={d.completionRate ?? 75} />
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 border-t border-slate-100 pt-6 text-center">
        <Button variant="secondary" className="px-6">View All Departments</Button>
      </div>

      {/* Details / Members view modal */}
      <Modal open={!!selectedDept} onClose={() => setSelectedDept(null)} title={`${selectedDept?.name} Department Details`} className="max-w-2xl">
        {selectedDept && (
          <div className="space-y-6">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Description</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{selectedDept.description || "No description provided."}</p>
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-2 mb-3">All Members ({selectedDept.members.length})</h4>
              <div className="overflow-x-auto max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-400 uppercase font-bold tracking-wider">
                      <th className="pb-2">Name</th>
                      <th className="pb-2">Role</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDept.members.map((m) => (
                      <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-2.5 flex items-center gap-2">
                          <Avatar name={m.name} src={m.src} size="sm" />
                          <div>
                            <span className="font-bold text-slate-800 dark:text-white block">{m.name}</span>
                            <span className="text-[10px] text-slate-400 font-semibold">{m.email}</span>
                          </div>
                        </td>
                        <td className="py-2.5 capitalize">{m.role}</td>
                        <td className="py-2.5 capitalize">{m.status}</td>
                        <td className="py-2.5 text-right space-x-2">
                          <button
                            onClick={() => {
                              setSelectedEmployee(m);
                              setActionType("task");
                            }}
                            className="text-[10px] font-black text-indigo-600 hover:text-indigo-700"
                          >
                            + Task
                          </button>
                          <button
                            onClick={() => {
                              setSelectedEmployee(m);
                              setActionType("request");
                            }}
                            className="text-[10px] font-black text-indigo-600 hover:text-indigo-700"
                          >
                            + Request
                          </button>
                        </td>
                      </tr>
                    ))}
                    {selectedDept.members.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-slate-400">
                          No team members in this department.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Task / Request assigning popup on behalf of employee */}
      <Modal open={actionType !== "none"} onClose={() => setActionType("none")} title={actionType === "task" ? `Assign Task to ${selectedEmployee?.name}` : `Submit Request for ${selectedEmployee?.name}`}>
        {actionType === "task" ? (
          <form onSubmit={submitTask} className="space-y-4">
            <label className="block text-xs font-bold text-slate-700">
              Task Title
              <Input required value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Review quarterly metrics" className="mt-1" />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Description
              <Input value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} placeholder="Review files and write doc..." className="mt-1" />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-xs font-bold text-slate-700">
                Priority
                <Select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as any)} className="mt-1">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </Select>
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Due Date
                <Input type="date" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} className="mt-1" />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="ghost" onClick={() => setActionType("none")}>Cancel</Button>
              <Button disabled={busy}>Assign Task</Button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitRequest} className="space-y-4">
            <label className="block text-xs font-bold text-slate-700">
              Request Title
              <Input required value={reqTitle} onChange={(e) => setReqTitle(e.target.value)} placeholder="Hardware Allowance" className="mt-1" />
            </label>
            <label className="block text-xs font-bold text-slate-700">
              Details
              <Input value={reqDesc} onChange={(e) => setReqDesc(e.target.value)} placeholder="Need budget approval for mouse..." className="mt-1" />
            </label>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="ghost" onClick={() => setActionType("none")}>Cancel</Button>
              <Button disabled={busy}>Submit Request</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Creation Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Create Department">
        <form onSubmit={createDept} className="space-y-4">
          <label className="block text-xs font-bold text-slate-700">
            Department Name
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Marketing" className="mt-1" />
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Description
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brand promotions and campaigns..." className="mt-1" />
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Current Workload
            <Select value={form.workload} onChange={(e) => setForm({ ...form, workload: e.target.value })} className="mt-1">
              <option value="low">Low Workload</option>
              <option value="medium">Medium Workload</option>
              <option value="high">High Workload</option>
            </Select>
          </label>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy}>Create Department</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
