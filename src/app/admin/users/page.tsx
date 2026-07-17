"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Alert, Avatar, Select, Input, Tabs } from "@/components/ui";

type Member = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  email: string | null;
  avatar_url: string | null;
  job_title: string | null;
  role: Profile["role"];
  status: Profile["status"];
  department_id: string | null;
  created_at: string;
};

type Department = { id: string; name: string };

// super_admin is a platform role and is deliberately not offered here.
const ASSIGNABLE_ROLES: Array<{ value: Profile["role"]; label: string; hint: string }> = [
  { value: "admin", label: "Admin", hint: "Manages the whole organization" },
  { value: "manager", label: "Manager", hint: "Manages a department's people and work" },
  { value: "member", label: "Member", hint: "Regular employee access" },
  { value: "guest", label: "Guest", hint: "Limited, read-mostly access" },
];

const ROLE_TONE: Record<string, "primary" | "info" | "neutral" | "warning"> = {
  super_admin: "warning",
  admin: "primary",
  manager: "info",
  member: "neutral",
  guest: "neutral",
};

function nameOf(m: Member) {
  return m.full_name || m.first_name || m.email?.split("@")[0] || "Unnamed";
}

export default function UsersAndTeamsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [joinCode, setJoinCode] = useState<string>("");
  const [tab, setTab] = useState("pending");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newDept, setNewDept] = useState("");
  const [pendingRole, setPendingRole] = useState<Record<string, Profile["role"]>>({});

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
    if (!isAdmin(me)) {
      setDenied(true);
      setLoading(false);
      return;
    }

    const [membersRes, deptRes, companyRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, first_name, email, avatar_url, job_title, role, status, department_id, created_at")
        .eq("company_id", me.company_id)
        .order("created_at", { ascending: false }),
      supabase.from("departments").select("id, name").eq("company_id", me.company_id).order("name"),
      supabase.from("companies").select("join_code").eq("id", me.company_id).maybeSingle(),
    ]);

    setMembers(membersRes.data ?? []);
    setDepartments(deptRes.data ?? []);
    setJoinCode(companyRes.data?.join_code ?? "");
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(message: string) {
    setNotice(message);
    setError("");
    setTimeout(() => setNotice(""), 4000);
  }

  async function approve(member: Member) {
    setBusyId(member.id);
    setError("");
    const role = pendingRole[member.id] ?? "member";
    const { error: rpcError } = await supabase.rpc("approve_member", {
      target_profile: member.id,
      assigned_role: role,
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    flash(`${nameOf(member)} approved as ${role}.`);
    load();
  }

  async function remove(member: Member) {
    setBusyId(member.id);
    setError("");
    const { error: rpcError } = await supabase.rpc("remove_member", { target_profile: member.id });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    flash(`${nameOf(member)} removed from the organization.`);
    load();
  }

  async function changeRole(member: Member, role: Profile["role"]) {
    setBusyId(member.id);
    setError("");
    const { error: updateError } = await supabase.from("profiles").update({ role }).eq("id", member.id);
    setBusyId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    flash(`${nameOf(member)} is now ${role}.`);
    load();
  }

  async function changeDepartment(member: Member, departmentId: string) {
    setBusyId(member.id);
    setError("");
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ department_id: departmentId || null })
      .eq("id", member.id);
    setBusyId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    load();
  }

  async function toggleSuspend(member: Member) {
    setBusyId(member.id);
    setError("");
    const next = member.status === "suspended" ? "active" : "suspended";
    const { error: updateError } = await supabase.from("profiles").update({ status: next }).eq("id", member.id);
    setBusyId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    flash(`${nameOf(member)} ${next === "suspended" ? "suspended" : "reactivated"}.`);
    load();
  }

  async function addDepartment(event: React.FormEvent) {
    event.preventDefault();
    if (!profile?.company_id || !newDept.trim()) return;
    setError("");
    const { error: insertError } = await supabase
      .from("departments")
      .insert({ company_id: profile.company_id, name: newDept.trim() });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setNewDept("");
    flash("Department created.");
    load();
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading members...</main>;
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Users & Teams" variant="admin">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-h4 text-slate-900">Admin access required</h2>
          <p className="mt-2 text-sm text-slate-600">Your role doesn&apos;t have access to member management.</p>
          <Button className="mt-5" onClick={() => router.push("/dashboard")}>
            Go to my dashboard
          </Button>
        </Card>
      </AppShell>
    );
  }

  const pending = members.filter((m) => m.status === "pending");
  const active = members.filter((m) => m.status !== "pending");
  const shown = tab === "pending" ? pending : active;

  return (
    <AppShell
      profile={profile}
      variant="admin"
      title="Users & Teams"
      subtitle="Approve joiners, assign roles and departments."
    >
      {/* Invite + stats */}
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <h3 className="text-h4 text-slate-900">Invite your team</h3>
          <p className="mt-2 text-sm text-slate-600">
            Share this join code. New members sign up, enter the code, then appear here for approval.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <code className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-lg font-bold tracking-widest text-slate-900">
              {joinCode || "—"}
            </code>
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(joinCode);
                flash("Join code copied.");
              }}
            >
              Copy
            </Button>
          </div>
        </Card>

        <Card>
          <p className="text-xs font-semibold text-slate-500">Members</p>
          <p className="mt-2 text-h1 text-slate-900">{active.length}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold text-slate-500">Awaiting approval</p>
          <p className="mt-2 text-h1 text-slate-900">{pending.length}</p>
        </Card>
      </div>

      {notice && (
        <Alert tone="success" className="mt-4">
          {notice}
        </Alert>
      )}
      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}

      {/* Departments */}
      <Card className="mt-6">
        <h3 className="text-h4 text-slate-900">Departments</h3>
        <form onSubmit={addDepartment} className="mt-4 flex flex-wrap items-center gap-3">
          <Input
            value={newDept}
            onChange={(e) => setNewDept(e.target.value)}
            placeholder="e.g. Marketing"
            className="max-w-xs"
          />
          <Button disabled={!newDept.trim()}>Add department</Button>
        </form>
        {departments.length === 0 ? (
          <p className="mt-4 rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-400">
            No departments yet. Add one so you can assign people to it.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {departments.map((d) => (
              <Badge key={d.id} tone="neutral">
                {d.name}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {/* Members */}
      <Card className="mt-6">
        <Tabs
          tabs={[
            { id: "pending", label: `Pending (${pending.length})` },
            { id: "active", label: `Members (${active.length})` },
          ]}
          value={tab}
          onValueChange={setTab}
        />

        {shown.length === 0 ? (
          <p className="mt-6 rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-400">
            {tab === "pending" ? "No one is waiting for approval." : "No members yet."}
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="pb-3">Person</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Department</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => {
                  const isSelf = m.id === profile?.id;
                  const isPlatform = m.role === "super_admin";
                  return (
                    <tr key={m.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={nameOf(m)} src={m.avatar_url ?? undefined} size="md" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">
                              {nameOf(m)} {isSelf && <span className="text-xs font-normal text-slate-400">(you)</span>}
                            </p>
                            <p className="truncate text-xs text-slate-500">{m.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 pr-3">
                        {tab === "pending" ? (
                          <Select
                            className="h-9 w-36"
                            value={pendingRole[m.id] ?? "member"}
                            onChange={(e) =>
                              setPendingRole((prev) => ({ ...prev, [m.id]: e.target.value as Profile["role"] }))
                            }
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </Select>
                        ) : isSelf || isPlatform ? (
                          // Self-role changes and platform roles are rejected by the
                          // DB guard trigger, so don't offer them.
                          <Badge tone={ROLE_TONE[m.role]} className="capitalize">
                            {m.role.replace("_", " ")}
                          </Badge>
                        ) : (
                          <Select
                            className="h-9 w-36"
                            value={m.role}
                            disabled={busyId === m.id}
                            onChange={(e) => changeRole(m, e.target.value as Profile["role"])}
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </Select>
                        )}
                      </td>

                      <td className="py-3 pr-3">
                        <Select
                          className="h-9 w-40"
                          value={m.department_id ?? ""}
                          disabled={busyId === m.id || departments.length === 0}
                          onChange={(e) => changeDepartment(m, e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </Select>
                      </td>

                      <td className="py-3">
                        <Badge
                          tone={m.status === "active" ? "success" : m.status === "pending" ? "warning" : "danger"}
                          className="capitalize"
                        >
                          {m.status}
                        </Badge>
                      </td>

                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          {tab === "pending" ? (
                            <>
                              <Button size="sm" disabled={busyId === m.id} onClick={() => approve(m)}>
                                {busyId === m.id ? "..." : "Approve"}
                              </Button>
                              <Button size="sm" variant="ghost" disabled={busyId === m.id} onClick={() => remove(m)}>
                                Reject
                              </Button>
                            </>
                          ) : (
                            !isSelf && (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={busyId === m.id}
                                  onClick={() => toggleSuspend(m)}
                                >
                                  {m.status === "suspended" ? "Reactivate" : "Suspend"}
                                </Button>
                                <Button size="sm" variant="ghost" disabled={busyId === m.id} onClick={() => remove(m)}>
                                  Remove
                                </Button>
                              </>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs leading-5 text-slate-400">
        Roles are enforced by the database, not just this screen. <strong>Super Admin</strong> is a platform role and
        cannot be granted here, and admins cannot change their own role.
      </p>
    </AppShell>
  );
}
