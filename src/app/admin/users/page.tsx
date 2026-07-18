"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Alert, Avatar, Badge, Button, Card, Input, Select } from "@/components/ui";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/cn";

type ViewMode = "all" | "active" | "pending" | "deactivated" | "admins";
type Role = "admin" | "manager" | "member" | "guest";

type Member = {
  id: string;
  fullName: string | null;
  firstName: string | null;
  email: string | null;
  avatarUrl: string | null;
  jobTitle: string | null;
  role: Profile["role"];
  status: Profile["status"];
  departmentId: string | null;
  departmentName: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  activeToday: boolean;
  needsApproval: boolean;
};

type Department = { id: string; name: string };
type PendingInvite = {
  id: string;
  email: string;
  code: string;
  role: Role;
  departmentId: string | null;
  departmentName: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
};
type OrgInvite = {
  companyId: string;
  name: string;
  code: string;
  expiresAt: string;
};
type AdminSummary = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  role: Profile["role"];
  departmentName: string | null;
  responsibility: string;
};
type UsersData = {
  stats: {
    totalUsers: number;
    newUsers: number;
    activeToday: number;
    pendingInvites: number;
    approvalsLeft: number;
    deactivated: number;
    admins: number;
  };
  members: Member[];
  departments: Department[];
  pendingInvites: PendingInvite[];
  admins: AdminSummary[];
  orgInvite: OrgInvite | null;
};

const emptyData: UsersData = {
  stats: { totalUsers: 0, newUsers: 0, activeToday: 0, pendingInvites: 0, approvalsLeft: 0, deactivated: 0, admins: 0 },
  members: [],
  departments: [],
  pendingInvites: [],
  admins: [],
  orgInvite: null,
};

const roleLabels: Record<string, string> = {
  super_admin: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Employee",
  guest: "Guest",
};

const roleStyles: Record<string, string> = {
  super_admin: "bg-[#f1edff] text-[#4f2cc8]",
  admin: "bg-[#eaf1ff] text-[#2458d3]",
  manager: "bg-[#e7f8ef] text-[#08764f]",
  member: "bg-[#eef2f8] text-[#344466]",
  guest: "bg-[#fff4df] text-[#9a5b00]",
};

function icon(path: string) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

const icons = {
  users: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003A6.375 6.375 0 0 0 8.624 13.5a6.375 6.375 0 0 0-6.374 5.625l-.001.109A12.318 12.318 0 0 0 8.624 21c2.331 0 4.512-.645 6.374-1.766ZM12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Z",
  active: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  invite: "M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0-8.54 5.253a2.25 2.25 0 0 1-2.36 0L2.25 6.75",
  inactive: "M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636",
  shield: "M9 12.75 11.25 15 15 9.75m-3-12.29A12 12 0 0 1 3.6 6 12 12 0 0 0 3 9.75c0 5.59 3.82 10.29 9 11.62 5.18-1.33 9-6.03 9-11.62 0-1.31-.21-2.57-.6-3.75A12 12 0 0 1 12 2.71Z",
};

function timeAgo(value: string | null) {
  if (!value) return "No activity yet";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isDeactivated(member: Member) {
  if (member.status === "suspended") return true;
  if (member.status !== "active") return false;
  const lastSeen = member.lastSeenAt ? new Date(member.lastSeenAt).getTime() : new Date(member.createdAt).getTime();
  return lastSeen < Date.now() - 30 * 24 * 60 * 60 * 1000;
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
    <button onClick={onClick} className="group text-left">
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

export default function UsersAndTeamsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [data, setData] = useState<UsersData>(emptyData);
  const [view, setView] = useState<ViewMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [inviteDepartment, setInviteDepartment] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createdInvite, setCreatedInvite] = useState<{ code: string; link: string; orgName?: string; expiresAt?: string } | null>(null);

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
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_admin_users_data");
    if (rpcError) {
      setError(rpcError.message);
      setData(emptyData);
    } else {
      setData({ ...emptyData, ...(rpcData as UsersData) });
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    ["/admin", "/admin/departments", "/admin/roles", "/admin/requests"].forEach((href) => router.prefetch(href));
  }, [router]);

  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return data.members.filter((member) => {
      if (view === "active" && !member.activeToday) return false;
      if (view === "pending" && !member.needsApproval) return false;
      if (view === "deactivated" && !isDeactivated(member)) return false;
      if (view === "admins" && !["super_admin", "admin"].includes(member.role)) return false;
      const haystack = `${member.fullName ?? ""} ${member.firstName ?? ""} ${member.email ?? ""} ${member.role} ${member.departmentName ?? ""}`.toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (filterDept !== "all" && member.departmentId !== filterDept) return false;
      if (filterRole !== "all" && member.role !== filterRole) return false;
      if (filterStatus !== "all" && member.status !== filterStatus) return false;
      return true;
    });
  }, [data.members, filterDept, filterRole, filterStatus, searchQuery, view]);

  async function sendInvite(event: React.FormEvent) {
    event.preventDefault();
    setInviteBusy(true);
    setError("");
    setNotice("");
    setCreatedInvite(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Sign in again before sending invites.");
      setInviteBusy(false);
      return;
    }

    const response = await fetch("/api/admin/invites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: inviteEmail,
        role: inviteRole,
        departmentId: inviteDepartment || null,
      }),
    });
    const result = await response.json();
    setInviteBusy(false);
    if (!response.ok) {
      if (result.invite) {
        setCreatedInvite({
          code: result.invite.code,
          link: result.invite.link,
          orgName: result.invite.orgName,
          expiresAt: result.invite.expiresAt,
        });
        await load();
      }
      setError(result.error ?? "Could not create invite.");
      return;
    }
    setCreatedInvite({ code: result.invite.code, link: result.invite.link, orgName: result.invite.orgName, expiresAt: result.invite.expiresAt });
    setNotice(result.emailSent ? "Invite email sent." : result.warning ?? "Invite created. Email provider is not configured yet.");
    setInviteEmail("");
    await load();
  }

  async function approve(member: Member) {
    setError("");
    const { error: approveError } = await supabase.rpc("approve_member", {
      target_profile: member.id,
      assigned_role: member.role === "super_admin" ? "admin" : member.role,
    });
    if (approveError) setError(approveError.message);
    else {
      setNotice(`${member.fullName || member.email || "User"} approved.`);
      await load();
    }
  }

  async function reject(member: Member) {
    setError("");
    const { error: rejectError } = await supabase.rpc("remove_member", { target_profile: member.id });
    if (rejectError) setError(rejectError.message);
    else {
      setNotice(`${member.fullName || member.email || "User"} rejected or removed.`);
      await load();
    }
  }

  async function cancelInvite(inviteId: string) {
    const { error: cancelError } = await supabase.from("admin_user_invites").update({ status: "cancelled" }).eq("id", inviteId);
    if (cancelError) setError(cancelError.message);
    else load();
  }

  async function copyInviteCode() {
    if (!data.orgInvite?.code) return;
    await navigator.clipboard.writeText(data.orgInvite.code);
    setNotice("Invitation code copied.");
  }

  if (loading) {
    return (
      <AppShell profile={profile} variant="admin" title="Users & Teams" subtitle="Manage and organize users across your organization.">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-[128px] animate-pulse rounded-lg border border-[#e7ebf5] bg-white" />
            ))}
          </div>
          <div className="h-[360px] animate-pulse rounded-lg border border-[#e7ebf5] bg-white" />
        </div>
      </AppShell>
    );
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Users & Teams" variant="admin">
        <Card className="mx-auto max-w-md rounded-lg text-center">
          <h2 className="text-xl font-black text-[#071035]">Admin access required</h2>
          <p className="mt-2 text-sm font-semibold text-[#526184]">Your role does not have access to user management.</p>
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
        <Button onClick={() => setInviteOpen(true)} className="hidden bg-[#5b36f2] text-white hover:bg-[#4d2ed0] sm:inline-flex">
          + Invite User
        </Button>
      }
    >
      <div className="space-y-6">
        {error && <Alert tone="danger">{error}</Alert>}
        {notice && <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert>}

        <Card className="rounded-lg border-[#d8d1ff] bg-[linear-gradient(135deg,#ffffff_0%,#f7f5ff_100%)] p-5 shadow-[0_16px_36px_rgba(61,53,142,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[12px] font-black uppercase tracking-wide text-[#5b36f2]">Organization Invitation Code</p>
              <h2 className="mt-1 text-lg font-black text-[#071035]">{data.orgInvite?.name ?? "Your organization"}</h2>
              <p className="mt-1 text-sm font-semibold text-[#526184]">
                Share this 24-hour code with employees after they search your organization name on Join Org.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-lg border border-[#ded8ff] bg-white px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-wide text-[#7b88a8]">Current code</p>
                <p className="mt-1 font-mono text-xl font-black tracking-[0.18em] text-[#4f46e5]">{data.orgInvite?.code ?? "Preparing"}</p>
                {data.orgInvite?.expiresAt && (
                  <p className="mt-1 text-xs font-bold text-[#526184]">Expires {new Date(data.orgInvite.expiresAt).toLocaleString()}</p>
                )}
              </div>
              <Button type="button" onClick={copyInviteCode} disabled={!data.orgInvite?.code}>
                Copy Code
              </Button>
            </div>
          </div>
        </Card>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard active={view === "all"} label="Total Users" value={data.stats.totalUsers} helper={`+${data.stats.newUsers} this week`} tone="bg-[#ece8ff] text-[#4f46e5]" iconNode={icon(icons.users)} onClick={() => setView("all")} />
          <StatCard active={view === "active"} label="Active Users" value={data.stats.activeToday} helper="Active today" tone="bg-[#e5f8ee] text-[#08764f]" iconNode={icon(icons.active)} onClick={() => setView("active")} />
          <StatCard active={view === "pending"} label="Pending Invites" value={data.stats.pendingInvites} helper={`${data.stats.approvalsLeft} approvals left`} tone="bg-[#fff4df] text-[#b35b00]" iconNode={icon(icons.invite)} onClick={() => setView("pending")} />
          <StatCard active={view === "deactivated"} label="Deactivated" value={data.stats.deactivated} helper="On leave or inactive" tone="bg-[#feecec] text-[#c22f3d]" iconNode={icon(icons.inactive)} onClick={() => setView("deactivated")} />
          <StatCard active={view === "admins"} label="Admins" value={data.stats.admins} helper="Roles & responsibilities" tone="bg-[#eaf1ff] text-[#2458d3]" iconNode={icon(icons.shield)} onClick={() => setView("admins")} />
        </section>

        <Card className="rounded-lg border-[#dfe6f3] p-4">
          <div className="grid gap-4 xl:grid-cols-[1fr_180px_160px_160px]">
            <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search by name, email, role or department..." className="h-11 text-[#071035] placeholder:text-[#7b88a8]" />
            <Select value={filterDept} onChange={(event) => setFilterDept(event.target.value)} className="h-11 text-[#071035]">
              <option value="all">All Departments</option>
              {data.departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
            </Select>
            <Select value={filterRole} onChange={(event) => setFilterRole(event.target.value)} className="h-11 text-[#071035]">
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="member">Employee</option>
              <option value="guest">Guest</option>
            </Select>
            <Select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="h-11 text-[#071035]">
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Deactivated</option>
            </Select>
          </div>
        </Card>

        {view === "pending" && (
          <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="rounded-lg border-[#dfe6f3] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-black text-[#071035]">Approval Requests</h2>
                <Badge tone="warning" className="font-black">{data.stats.approvalsLeft} left</Badge>
              </div>
              <div className="space-y-3">
                {data.members.filter((member) => member.needsApproval).map((member) => (
                  <div key={member.id} className="flex flex-col gap-3 rounded-lg border border-[#edf0f7] bg-[#fbfcff] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={member.fullName || member.email || "User"} src={member.avatarUrl ?? undefined} size="md" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[#071035]">{member.fullName || member.email || "Pending user"}</p>
                        <p className="truncate text-xs font-semibold text-[#526184]">{member.email}</p>
                        <p className="mt-1 text-xs font-bold text-[#33415c]">{roleLabels[member.role]} {member.departmentName ? `· ${member.departmentName}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => approve(member)}>Accept</Button>
                      <Button size="sm" variant="danger" onClick={() => reject(member)}>Reject</Button>
                    </div>
                  </div>
                ))}
                {data.stats.approvalsLeft === 0 && <p className="rounded-lg border border-dashed border-[#dfe6f3] p-5 text-center text-sm font-bold text-[#526184]">No approval requests waiting.</p>}
              </div>
            </Card>
            <Card className="rounded-lg border-[#dfe6f3] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-black text-[#071035]">Pending Email Invites</h2>
                <Button size="sm" onClick={() => setInviteOpen(true)}>Invite User</Button>
              </div>
              <div className="space-y-3">
                {data.pendingInvites.map((inviteItem) => (
                  <div key={inviteItem.id} className="rounded-lg border border-[#edf0f7] bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-[#071035]">{inviteItem.email}</p>
                        <p className="mt-1 text-xs font-bold text-[#526184]">{roleLabels[inviteItem.role]} {inviteItem.departmentName ? `· ${inviteItem.departmentName}` : ""}</p>
                      </div>
                      <button onClick={() => cancelInvite(inviteItem.id)} className="text-xs font-black text-[#c22f3d] hover:underline">Cancel</button>
                    </div>
                    <div className="mt-3 inline-flex rounded-lg border border-[#ded8ff] bg-[#f8f7ff] px-3 py-2 font-mono text-xs font-black tracking-wider text-[#4f46e5]">
                      {data.orgInvite?.code ?? inviteItem.code}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[#667391]">
                      Uses today&apos;s organization code. {data.orgInvite?.expiresAt ? `Expires ${new Date(data.orgInvite.expiresAt).toLocaleString()}` : `Invite expires ${new Date(inviteItem.expiresAt).toLocaleDateString()}`}
                    </p>
                  </div>
                ))}
                {data.pendingInvites.length === 0 && <p className="rounded-lg border border-dashed border-[#dfe6f3] p-5 text-center text-sm font-bold text-[#526184]">No email invites are pending.</p>}
              </div>
            </Card>
          </section>
        )}

        {view === "admins" && (
          <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {data.admins.map((admin) => (
              <Card key={admin.id} className="rounded-lg border-[#dfe6f3] p-5">
                <div className="flex items-start gap-4">
                  <Avatar name={admin.name} src={admin.avatarUrl ?? undefined} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-black text-[#071035]">{admin.name}</p>
                    <p className="truncate text-xs font-semibold text-[#526184]">{admin.email}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={cn("rounded-full px-3 py-1 text-xs font-black", roleStyles[admin.role])}>{roleLabels[admin.role]}</span>
                      <span className="rounded-full bg-[#eef2f8] px-3 py-1 text-xs font-black text-[#33415c]">{admin.departmentName || "All departments"}</span>
                    </div>
                    <p className="mt-4 text-sm font-bold text-[#33415c]">{admin.responsibility}</p>
                  </div>
                </div>
              </Card>
            ))}
          </section>
        )}

        <Card className="rounded-lg border-[#dfe6f3] p-0">
          <div className="flex items-center justify-between border-b border-[#edf0f7] px-5 py-4">
            <h2 className="text-base font-black text-[#071035]">
              {view === "active" ? "Active Today" : view === "deactivated" ? "Deactivated & Inactive Users" : view === "admins" ? "All Admin Users" : "All Users"}
            </h2>
            <Button className="sm:hidden" size="sm" onClick={() => setInviteOpen(true)}>Invite</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#18213d] text-[12px] font-black uppercase tracking-wide text-[#6b7898]">
                  <th className="px-5 py-4">User</th>
                  <th className="px-5 py-4">Role</th>
                  <th className="px-5 py-4">Department</th>
                  <th className="px-5 py-4">Activity</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="border-b border-[#edf0f7] last:border-0 hover:bg-[#fbfcff]">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={member.fullName || member.email || "User"} src={member.avatarUrl ?? undefined} size="md" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[#071035]">{member.fullName || member.firstName || "New user"}</p>
                          <p className="truncate text-xs font-semibold text-[#526184]">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn("rounded-full px-3 py-1 text-xs font-black", roleStyles[member.role])}>{roleLabels[member.role]}</span>
                    </td>
                    <td className="px-5 py-4 text-xs font-black text-[#33415c]">{member.departmentName || "Not assigned"}</td>
                    <td className="px-5 py-4 text-xs font-bold text-[#526184]">
                      {member.activeToday ? <span className="text-[#08764f]">Active today</span> : timeAgo(member.lastSeenAt)}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={member.status === "active" ? "success" : member.status === "pending" ? "warning" : "danger"} className="font-black capitalize">{member.status}</Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {member.needsApproval ? (
                        <div className="inline-flex gap-2">
                          <Button size="sm" onClick={() => approve(member)}>Accept</Button>
                          <Button size="sm" variant="danger" onClick={() => reject(member)}>Reject</Button>
                        </div>
                      ) : member.id !== profile?.id ? (
                        <button onClick={() => reject(member)} className="text-xs font-black text-[#c22f3d] hover:underline">Remove</button>
                      ) : (
                        <span className="text-xs font-bold text-[#7b88a8]">Current user</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredMembers.length === 0 && <p className="px-5 py-8 text-center text-sm font-bold text-[#526184]">No users match this view.</p>}
        </Card>
      </div>

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071035]/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg rounded-lg border-[#dfe6f3] p-6 shadow-[0_28px_70px_rgba(7,16,53,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-[#071035]">Invite User</h3>
                <p className="mt-1 text-sm font-semibold text-[#526184]">Send a Deskcultr invite with today&apos;s organization code.</p>
              </div>
              <button onClick={() => setInviteOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-[#526184] hover:bg-[#f3f5fb]">x</button>
            </div>
            <form onSubmit={sendInvite} className="mt-6 space-y-4">
              <label className="block text-sm font-black text-[#33415c]">
                Email address
                <Input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@company.com" className="mt-2 h-11 text-[#071035]" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-black text-[#33415c]">
                  Role
                  <Select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)} className="mt-2 h-11 text-[#071035]">
                    <option value="member">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                    <option value="guest">Guest</option>
                  </Select>
                </label>
                <label className="block text-sm font-black text-[#33415c]">
                  Department
                  <Select value={inviteDepartment} onChange={(event) => setInviteDepartment(event.target.value)} className="mt-2 h-11 text-[#071035]">
                    <option value="">No department</option>
                    {data.departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                  </Select>
                </label>
              </div>
              {createdInvite && (
                <div className="rounded-lg border border-[#ded8ff] bg-[#f8f7ff] p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-[#526184]">Daily invitation code</p>
                  <p className="mt-2 font-mono text-lg font-black tracking-wider text-[#4f46e5]">{createdInvite.code}</p>
                  <p className="mt-2 text-xs font-semibold text-[#33415c]">
                    The employee should open {createdInvite.link}, enter {createdInvite.orgName ?? data.orgInvite?.name ?? "your organization name"}, then paste this code.
                  </p>
                  {createdInvite.expiresAt && <p className="mt-1 text-xs font-semibold text-[#667391]">Expires {new Date(createdInvite.expiresAt).toLocaleString()}</p>}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-3">
                <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>Close</Button>
                <Button type="submit" disabled={inviteBusy}>{inviteBusy ? "Sending..." : "Send Invite"}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
