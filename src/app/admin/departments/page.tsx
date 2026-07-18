"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Alert, Avatar, Badge, Button, Card, Input, Modal, ProgressBar, Select } from "@/components/ui";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/cn";

type Priority = "low" | "medium" | "high" | "urgent";
type ViewMode = "all" | "members" | "heads" | "completion";

type DeptMember = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
};

type Department = {
  id: string;
  name: string;
  description: string | null;
  priority: Priority;
  memberCount: number;
  taskCount: number;
  openTaskCount: number;
  completionRate: number;
  headName: string;
  headRole: string | null;
  members: DeptMember[];
};

type DepartmentData = {
  stats: {
    totalDepartments: number;
    totalMembers: number;
    departmentHeads: number;
    avgCompletion: number;
  };
  departments: Department[];
};

const emptyData: DepartmentData = {
  stats: { totalDepartments: 0, totalMembers: 0, departmentHeads: 0, avgCompletion: 0 },
  departments: [],
};

const priorityClass: Record<Priority, string> = {
  urgent: "bg-[#feecec] text-[#bf263c]",
  high: "bg-[#fff0df] text-[#a54f00]",
  medium: "bg-[#eef2ff] text-[#4f46e5]",
  low: "bg-[#e8f8ef] text-[#08764f]",
};

const roleLabel: Record<string, string> = {
  super_admin: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Employee",
  guest: "Guest",
};

function icon(path: string) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

const icons = {
  department: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.25c0-.69.56-1.25 1.25-1.25h3.5c.69 0 1.25.56 1.25 1.25V21",
  users: "M17 20h5v-2a4 4 0 0 0-6.7-2.95M17 20H7m10 0v-2a5 5 0 0 0-.86-2.8M7 20H2v-2a4 4 0 0 1 6.7-2.95M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm8 1a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  shield: "M9 12.75 11.25 15 15 9.75m-3-12.29A12 12 0 0 1 3.6 6 12 12 0 0 0 3 9.75c0 5.59 3.82 10.29 9 11.62 5.18-1.33 9-6.03 9-11.62 0-1.31-.21-2.57-.6-3.75A12 12 0 0 1 12 2.71Z",
  chart: "M3 3v16.5A1.5 1.5 0 0 0 4.5 21H21M7.5 15.75V12M12 15.75V8.25M16.5 15.75v-4.5",
};

function StatCard({
  active,
  label,
  value,
  helper,
  tone,
  onClick,
  iconNode,
}: {
  active: boolean;
  label: string;
  value: number;
  helper: string;
  tone: string;
  onClick: () => void;
  iconNode: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className={cn("min-h-[128px] rounded-lg border-[#dfe6f3] p-5 transition hover:-translate-y-0.5 hover:border-[#bdb5ff] hover:shadow-[0_18px_42px_rgba(40,55,105,0.12)]", active && "border-[#7c66ff] ring-2 ring-[#ece8ff]")}>
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

export default function DepartmentsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [data, setData] = useState<DepartmentData>(emptyData);
  const [view, setView] = useState<ViewMode>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Department | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ name: "", description: "", priority: "medium" as Priority });

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
    if (!isAdmin(me)) {
      setDenied(true);
      setLoading(false);
      return;
    }
    await supabase.rpc("ensure_default_departments", { target_company: me.company_id });
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_admin_departments_data");
    if (rpcError) {
      setError(rpcError.message);
      setData(emptyData);
    } else {
      const next = { ...emptyData, ...(rpcData as DepartmentData) };
      setData(next);
      setSelected((current) => (current ? next.departments.find((dept) => dept.id === current.id) ?? null : null));
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    ["/admin/tasks", "/admin/users", "/admin"].forEach((href) => router.prefetch(href));
  }, [router]);

  const visibleDepartments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.departments.filter((dept) => {
      if (view === "members" && dept.memberCount === 0) return false;
      if (view === "heads" && !dept.headRole) return false;
      if (q && !`${dept.name} ${dept.description ?? ""} ${dept.headName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data.departments, search, view]);

  async function createDept(event: React.FormEvent) {
    event.preventDefault();
    if (!profile?.company_id) return;
    setBusy(true);
    setError("");
    const { error: insertError } = await supabase.from("departments").insert({
      company_id: profile.company_id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setForm({ name: "", description: "", priority: "medium" });
    setOpen(false);
    setNotice("Department created.");
    load();
  }

  async function updatePriority(dept: Department, priority: Priority) {
    const { error: updateError } = await supabase.from("departments").update({ priority }).eq("id", dept.id);
    if (updateError) setError(updateError.message);
    else {
      setNotice(`${dept.name} priority updated.`);
      load();
    }
  }

  async function deleteDepartment(dept: Department) {
    if (!window.confirm(`Delete ${dept.name}? Members and tasks will become unassigned.`)) return;
    const { error: deleteError } = await supabase.from("departments").delete().eq("id", dept.id);
    if (deleteError) setError(deleteError.message);
    else {
      setSelected(null);
      setNotice(`${dept.name} deleted.`);
      load();
    }
  }

  if (loading) {
    return (
      <AppShell profile={profile} title="Departments" subtitle="Manage departments and task priority." variant="admin">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[128px] animate-pulse rounded-lg border border-[#e7ebf5] bg-white" />)}
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-[220px] animate-pulse rounded-lg border border-[#e7ebf5] bg-white" />)}
          </div>
        </div>
      </AppShell>
    );
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Departments" variant="admin">
        <Card className="mx-auto max-w-md rounded-lg text-center">
          <h2 className="text-xl font-black text-[#071035]">Admin access required</h2>
          <p className="mt-2 text-sm font-semibold text-[#526184]">Your role does not have access to department management.</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      profile={profile}
      variant="admin"
      title="Departments"
      subtitle="Manage departments, heads, members, priority, and completion."
      actions={<Button onClick={() => setOpen(true)} className="hidden bg-[#5b36f2] text-white hover:bg-[#4d2ed0] sm:inline-flex">+ Add Department</Button>}
    >
      <div className="space-y-6">
        {error && <Alert tone="danger">{error}</Alert>}
        {notice && <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard active={view === "all"} label="Total Departments" value={data.stats.totalDepartments} helper="Shows all departments" tone="bg-[#ece8ff] text-[#4f46e5]" iconNode={icon(icons.department)} onClick={() => setView("all")} />
          <StatCard active={view === "members"} label="Total Members" value={data.stats.totalMembers} helper="Across departments" tone="bg-[#e5f8ee] text-[#08764f]" iconNode={icon(icons.users)} onClick={() => setView("members")} />
          <StatCard active={view === "heads"} label="Department Heads" value={data.stats.departmentHeads} helper="Admins and managers" tone="bg-[#eaf1ff] text-[#2458d3]" iconNode={icon(icons.shield)} onClick={() => setView("heads")} />
          <StatCard active={view === "completion"} label="Avg Completion" value={data.stats.avgCompletion} helper="Click for dept values" tone="bg-[#fff4df] text-[#a54f00]" iconNode={icon(icons.chart)} onClick={() => setView("completion")} />
        </section>

        <Card className="rounded-lg border-[#dfe6f3] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search departments, heads, or descriptions..." className="h-11 text-[#071035] placeholder:text-[#7b88a8]" />
            <Button className="sm:hidden" onClick={() => setOpen(true)}>Add Department</Button>
          </div>
        </Card>

        {view === "completion" && (
          <Card className="rounded-lg border-[#dfe6f3] p-5">
            <h2 className="mb-5 text-base font-black text-[#071035]">Department-wise Task Completion</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.departments.map((dept) => (
                <button key={dept.id} onClick={() => setSelected(dept)} className="rounded-lg border border-[#edf0f7] bg-[#fbfcff] p-4 text-left hover:border-[#bdb5ff]">
                  <div className="flex items-center justify-between">
                    <p className="font-black text-[#071035]">{dept.name}</p>
                    <span className="font-black text-[#4f46e5]">{dept.completionRate}%</span>
                  </div>
                  <ProgressBar value={dept.completionRate} className="mt-3" />
                  <p className="mt-2 text-xs font-bold text-[#526184]">{dept.taskCount} tasks tracked</p>
                </button>
              ))}
            </div>
          </Card>
        )}

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visibleDepartments.map((dept) => (
            <Card key={dept.id} className="rounded-lg border-[#dfe6f3] p-5 transition hover:-translate-y-0.5 hover:border-[#bdb5ff] hover:shadow-[0_18px_42px_rgba(40,55,105,0.12)]">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => setSelected(dept)} className="min-w-0 flex-1 text-left">
                  <h3 className="truncate text-lg font-black text-[#071035]">{dept.name}</h3>
                  <p className="mt-1 line-clamp-2 min-h-[40px] text-sm font-semibold leading-5 text-[#526184]">{dept.description || "No department description yet."}</p>
                </button>
                <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-black capitalize", priorityClass[dept.priority])}>{dept.priority}</span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <button onClick={() => setSelected(dept)} className="rounded-lg bg-[#f7f9fd] p-3 text-left">
                  <p className="text-[11px] font-black uppercase text-[#7b88a8]">Members</p>
                  <p className="mt-1 text-xl font-black text-[#071035]">{dept.memberCount}</p>
                </button>
                <button onClick={() => router.push("/admin/tasks")} className="rounded-lg bg-[#f7f9fd] p-3 text-left">
                  <p className="text-[11px] font-black uppercase text-[#7b88a8]">Open</p>
                  <p className="mt-1 text-xl font-black text-[#071035]">{dept.openTaskCount}</p>
                </button>
                <button onClick={() => setView("completion")} className="rounded-lg bg-[#f7f9fd] p-3 text-left">
                  <p className="text-[11px] font-black uppercase text-[#7b88a8]">Done</p>
                  <p className="mt-1 text-xl font-black text-[#071035]">{dept.completionRate}%</p>
                </button>
              </div>

              <div className="mt-5 border-t border-[#edf0f7] pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase text-[#7b88a8]">Department Head</p>
                    <p className="mt-1 truncate text-sm font-black text-[#071035]">{dept.headName}</p>
                  </div>
                  <Badge tone={dept.headRole ? "info" : "neutral"} className="font-black">{dept.headRole ? roleLabel[dept.headRole] || dept.headRole : "Open"}</Badge>
                </div>
                <ProgressBar value={dept.completionRate} className="mt-4" />
              </div>
            </Card>
          ))}
        </section>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create Department">
        <form onSubmit={createDept} className="space-y-4">
          <label className="block text-xs font-black text-[#33415c]">
            Department Name
            <Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Marketing" className="mt-1 h-11 text-[#071035]" />
          </label>
          <label className="block text-xs font-black text-[#33415c]">
            Description
            <Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Brand promotions and campaigns..." className="mt-1 h-11 text-[#071035]" />
          </label>
          <label className="block text-xs font-black text-[#33415c]">
            Priority
            <Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })} className="mt-1 h-11 text-[#071035]">
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
              <option value="urgent">Urgent Priority</option>
            </Select>
          </label>
          <div className="flex justify-end gap-3 border-t border-[#18213d] pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy}>Create Department</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.name} className="max-w-3xl">
        {selected && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-[#f7f9fd] p-4">
                <p className="text-xs font-black uppercase text-[#7b88a8]">Priority</p>
                <Select value={selected.priority} onChange={(event) => updatePriority(selected, event.target.value as Priority)} className="mt-2 h-10 text-[#071035]">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </Select>
              </div>
              <div className="rounded-lg bg-[#f7f9fd] p-4">
                <p className="text-xs font-black uppercase text-[#7b88a8]">Completion</p>
                <p className="mt-2 text-2xl font-black text-[#071035]">{selected.completionRate}%</p>
              </div>
              <div className="rounded-lg bg-[#f7f9fd] p-4">
                <p className="text-xs font-black uppercase text-[#7b88a8]">Open Tasks</p>
                <p className="mt-2 text-2xl font-black text-[#071035]">{selected.openTaskCount}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-black uppercase text-[#7b88a8]">Description</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#33415c]">{selected.description || "No description provided."}</p>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-black text-[#071035]">Members ({selected.memberCount})</h3>
                <Button size="sm" onClick={() => router.push("/admin/tasks")}>Assign Task</Button>
              </div>
              <div className="max-h-[300px] overflow-y-auto rounded-lg border border-[#edf0f7]">
                {selected.members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 border-b border-[#edf0f7] px-4 py-3 last:border-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={member.name} src={member.avatarUrl ?? undefined} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[#071035]">{member.name}</p>
                        <p className="truncate text-xs font-semibold text-[#526184]">{member.email}</p>
                      </div>
                    </div>
                    <Badge tone={member.role === "admin" || member.role === "manager" ? "info" : "neutral"} className="font-black">{roleLabel[member.role] || member.role}</Badge>
                  </div>
                ))}
                {selected.members.length === 0 && <p className="p-5 text-center text-sm font-bold text-[#526184]">No members assigned to this department.</p>}
              </div>
            </div>

            <div className="flex justify-between gap-3 border-t border-[#edf0f7] pt-4">
              <Button variant="danger" onClick={() => deleteDepartment(selected)}>Delete Department</Button>
              <Button type="button" variant="secondary" onClick={() => setSelected(null)}>Keep Department</Button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
