"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Alert, Avatar, Select, Input } from "@/components/ui";

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

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400",
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  manager: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  member: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  guest: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
};

export default function UsersAndTeamsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [joinCode, setJoinCode] = useState<string>("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

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

  const totalUsers = members.length;
  const activeUsers = members.filter((m) => m.status === "active").length;
  const pendingUsers = members.filter((m) => m.status === "pending").length;
  const inactiveUsers = members.filter((m) => m.status === "suspended").length;
  const adminUsers = members.filter((m) => m.role === "admin" || m.role === "super_admin").length;

  const filteredMembers = members.filter((m) => {
    const name = `${m.full_name || ""} ${m.first_name || ""} ${m.email || ""}`.toLowerCase();
    if (searchQuery.trim() && !name.includes(searchQuery.toLowerCase())) return false;
    if (filterDept !== "all" && m.department_id !== filterDept) return false;
    if (filterRole !== "all" && m.role !== filterRole) return false;
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    return true;
  });

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setNotice(`Simulated invitation link copied for email: ${inviteEmail}`);
    setInviteEmail("");
    setInviteOpen(false);
  }

  async function approve(memberId: string) {
    const { error: err } = await supabase.rpc("approve_member", {
      target_profile: memberId,
      assigned_role: "member",
    });
    if (err) setError(err.message);
    else load();
  }

  async function reject(memberId: string) {
    const { error: err } = await supabase.rpc("remove_member", { target_profile: memberId });
    if (err) setError(err.message);
    else load();
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] dark:bg-slate-950 text-slate-500">Loading users...</main>;
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Users & Teams" variant="admin">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-h4 text-slate-900">Admin access required</h2>
          <p className="mt-2 text-sm text-slate-600">Your role doesn&apos;t have access to user management.</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      profile={profile}
      variant="admin"
      title="Users & Teams"
      subtitle="Manage and organize users across your organization."
      actions={
        <div className="flex gap-2">
          <Button variant="secondary">Export</Button>
          <Button onClick={() => setInviteOpen(true)}>+ Invite User</Button>
        </div>
      }
    >
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-4">{notice}</Alert>}

      {/* ── Metric Cards Row ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5 mb-6">
        <Card className="p-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Total Users</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{totalUsers}</p>
          <span className="text-[10px] text-emerald-500 font-bold block mt-1">↑ 12 this week</span>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Active Users</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{activeUsers}</p>
          <span className="text-[10px] text-slate-400 block mt-1">{totalUsers ? Math.round((activeUsers/totalUsers)*100) : 0}% of total</span>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Pending Invites</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{pendingUsers}</p>
          <span className="text-[10px] text-slate-400 block mt-1">Invitations sent</span>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Deactivated</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{inactiveUsers}</p>
          <span className="text-[10px] text-slate-400 block mt-1">{totalUsers ? Math.round((inactiveUsers/totalUsers)*100) : 0}% of total</span>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Admins</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{adminUsers}</p>
          <span className="text-[10px] text-slate-400 block mt-1">System admins</span>
        </Card>
      </div>

      {/* ── Filters Card ── */}
      <Card className="p-4 mb-6 flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[240px]">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email or role..."
            className="h-10"
          />
        </div>

        <div className="w-44">
          <Select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="h-10">
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </div>

        <div className="w-36">
          <Select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="h-10">
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="member">Member</option>
            <option value="guest">Guest</option>
          </Select>
        </div>

        <div className="w-36">
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-10">
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Deactivated</option>
          </Select>
        </div>
      </Card>

      {/* ── Users Table ── */}
      <Card className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs uppercase font-bold tracking-wider">
                <th className="pb-3">User</th>
                <th className="pb-3">Role</th>
                <th className="pb-3">Department</th>
                <th className="pb-3">Workspace</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((m) => {
                const deptName = departments.find((d) => d.id === m.department_id)?.name || "Not assigned";
                return (
                  <tr key={m.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="py-3 flex items-center gap-3">
                      <Avatar name={m.full_name || m.first_name || m.email || "?"} src={m.avatar_url ?? undefined} size="sm" />
                      <div>
                        <span className="font-bold text-slate-850 dark:text-white block">{m.full_name || m.first_name || "New User"}</span>
                        <span className="text-[10px] text-slate-400 font-semibold">{m.email}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <Badge className={`text-[10px] uppercase tracking-wide font-black ${ROLE_COLORS[m.role] || "bg-slate-100 text-slate-600"}`}>
                        {m.role === "member" ? "Employee" : m.role}
                      </Badge>
                    </td>
                    <td className="py-3 text-slate-600 dark:text-slate-400 font-semibold text-xs">
                      {deptName}
                    </td>
                    <td className="py-3 text-slate-600 dark:text-slate-400 font-semibold text-xs">
                      All Workspaces
                    </td>
                    <td className="py-3">
                      <Badge
                        tone={m.status === "active" ? "success" : m.status === "pending" ? "warning" : "neutral"}
                        className="text-[10px]"
                      >
                        {m.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-right">
                      {m.status === "pending" ? (
                        <div className="inline-flex gap-2">
                          <button
                            onClick={() => approve(m.id)}
                            className="bg-indigo-600 text-white text-xs px-2.5 py-1 rounded-lg font-bold hover:bg-indigo-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => reject(m.id)}
                            className="bg-slate-200 text-slate-700 text-xs px-2.5 py-1 rounded-lg font-bold hover:bg-slate-300"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => reject(m.id)}
                          className="text-xs text-red-500 hover:text-red-700 font-bold hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No employees matching filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Invite Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <Card className="max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900">Invite New Employee</h3>
            <form onSubmit={handleSendInvite} className="space-y-4">
              <label className="block text-xs font-bold text-slate-700">
                Email Address
                <Input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="mt-1"
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button type="submit">Copy Invitation Link</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
