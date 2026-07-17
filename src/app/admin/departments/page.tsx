"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Input, Select, Alert, Modal, AvatarGroup } from "@/components/ui";

type Department = {
  id: string;
  name: string;
  description: string | null;
  workload: string;
  members: Array<{ name: string; src?: string }>;
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
        .select("id, department_id, full_name, first_name, email, avatar_url")
        .eq("company_id", me.company_id)
        .eq("status", "active"),
      supabase.from("tasks").select("id, department_id, status").eq("company_id", me.company_id),
    ]);

    const people = peopleRes.data ?? [];
    const tasks = tasksRes.data ?? [];

    setDepartments(
      (deptRes.data ?? []).map((d) => {
        const deptTasks = tasks.filter((t) => t.department_id === d.id);
        return {
          ...d,
          members: people
            .filter((p) => p.department_id === d.id)
            .map((p) => ({
              name: p.full_name || p.first_name || p.email?.split("@")[0] || "Member",
              src: p.avatar_url ?? undefined,
            })),
          taskCount: deptTasks.length,
          openCount: deptTasks.filter((t) => !["completed", "cancelled"].includes(t.status)).length,
        };
      })
    );
    setLoading(false);
  }, [router]);

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
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setOpen(false);
    setForm({ name: "", description: "", workload: "medium" });
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
      subtitle="Departments are how work, people and requests are organised."
      actions={<Button onClick={() => setOpen(true)}>+ New department</Button>}
    >
      {error && (
        <Alert tone="danger" className="mb-4" onClose={() => setError("")}>
          {error}
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
            <Card key={d.id}>
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

              <div className="mt-4 min-h-9">
                {d.members.length > 0 ? (
                  <AvatarGroup people={d.members} max={5} size="sm" />
                ) : (
                  <p className="text-xs text-slate-400">No one assigned yet</p>
                )}
              </div>

              <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4">
                <Select
                  className="h-8 flex-1 text-xs"
                  value={d.workload}
                  onChange={(e) => setWorkload(d.id, e.target.value)}
                >
                  {WORKLOADS.map((w) => (
                    <option key={w} value={w}>
                      {w} workload
                    </option>
                  ))}
                </Select>
                <Button size="sm" variant="ghost" onClick={() => removeDept(d.id)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

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
