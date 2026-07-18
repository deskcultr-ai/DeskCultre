"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Tabs } from "@/components/ui";

type RoleId = "super_admin" | "admin" | "manager" | "member" | "guest";

type RoleDetails = {
  id: RoleId;
  label: string;
  count: number;
  accessLevel: string;
  description: string;
  lastUpdated: string;
  color: string;
};

type Access = "full" | "limited" | "view" | "none";

const MATRIX: Array<{ area: string; detail: string; access: Record<RoleId, Access> }> = [
  {
    area: "Organization settings",
    detail: "Rename the org, employee count, join code",
    access: { super_admin: "full", admin: "full", manager: "none", member: "none", guest: "none" },
  },
  {
    area: "User management",
    detail: "Approve joiners, assign roles, remove members",
    access: { super_admin: "full", admin: "full", manager: "none", member: "none", guest: "none" },
  },
  {
    area: "Departments",
    detail: "Create and manage departments",
    access: { super_admin: "full", admin: "full", manager: "view", member: "view", guest: "none" },
  },
  {
    area: "Tasks",
    detail: "Create, edit and complete tasks",
    access: { super_admin: "full", admin: "full", manager: "full", member: "full", guest: "view" },
  },
  {
    area: "Requests",
    detail: "Raise and action cross-department requests",
    access: { super_admin: "full", admin: "full", manager: "full", member: "full", guest: "view" },
  },
  {
    area: "Meetings",
    detail: "Schedule and join meetings",
    access: { super_admin: "full", admin: "full", manager: "full", member: "full", guest: "view" },
  },
  {
    area: "Announcements",
    detail: "Publish org-wide updates",
    access: { super_admin: "full", admin: "full", manager: "full", member: "view", guest: "view" },
  },
  {
    area: "Attendance",
    detail: "Own check-in/out; managers see everyone",
    access: { super_admin: "full", admin: "full", manager: "full", member: "limited", guest: "none" },
  },
  {
    area: "Leave requests",
    detail: "Raise own; managers approve",
    access: { super_admin: "full", admin: "full", manager: "full", member: "limited", guest: "none" },
  },
  {
    area: "Audit log",
    detail: "See what happened in the org",
    access: { super_admin: "full", admin: "full", manager: "view", member: "view", guest: "none" },
  },
];

const ACCESS_UI: Record<Access, { label: string; className: string; icon: React.ReactNode }> = {
  full: {
    label: "Full access",
    className: "text-success",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  },
  limited: {
    label: "Limited access",
    className: "text-warning",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  },
  view: {
    label: "View only",
    className: "text-info",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />,
  },
  none: {
    label: "No access",
    className: "text-slate-300 dark:text-slate-700",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />,
  },
};

export default function RolesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [tab, setTab] = useState("roles");

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

    const { data } = await supabase.from("profiles").select("role").eq("company_id", me.company_id).eq("status", "active");
    const tally: Record<string, number> = {};
    for (const row of data ?? []) tally[row.role] = (tally[row.role] ?? 0) + 1;
    setCounts(tally);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] dark:bg-slate-950 text-slate-500">Loading roles...</main>;
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Roles & Permissions" variant="admin">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-h4 text-slate-900">Admin access required</h2>
          <p className="mt-2 text-sm text-slate-600">Only admins can view roles and permissions.</p>
        </Card>
      </AppShell>
    );
  }

  const roleDetails: RoleDetails[] = [
    { id: "super_admin", label: "Super Admin", count: counts.super_admin ?? 3, accessLevel: "Full Access", description: "Full access to all features and settings.", lastUpdated: "May 15, 2024", color: "bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400" },
    { id: "admin", label: "Admin", count: counts.admin ?? 8, accessLevel: "High Access", description: "Manage users, workspaces and settings.", lastUpdated: "May 16, 2024", color: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400" },
    { id: "manager", label: "Manager", count: counts.manager ?? 24, accessLevel: "Medium Access", description: "Manage team, tasks and workspace.", lastUpdated: "May 13, 2024", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" },
    { id: "member", label: "Employee", count: counts.member ?? 82, accessLevel: "Basic Access", description: "Access to assigned workspace and tasks.", lastUpdated: "May 12, 2024", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    { id: "guest", label: "Guest", count: counts.guest ?? 11, accessLevel: "Limited Access", description: "Limited access to specific resources.", lastUpdated: "May 10, 2024", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" },
  ];

  return (
    <AppShell
      profile={profile}
      variant="admin"
      title="Roles & Permissions"
      subtitle="Define roles and manage access permissions."
      actions={
        <div className="flex gap-2">
          <Button variant="secondary">Export</Button>
          <Button>+ Create Role</Button>
        </div>
      }
    >
      <Card className="mb-6">
        <Tabs
          tabs={[
            { id: "roles", label: "Roles" },
            { id: "permissions", label: "Permissions" },
            { id: "access", label: "Access Control" },
          ]}
          value={tab}
          onValueChange={setTab}
          className="border-0"
        />
      </Card>

      {tab === "roles" ? (
        <div className="space-y-6">
          {/* Metrics cards row */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {roleDetails.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-xs">{r.label}</h4>
                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{r.count}</p>
                    <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">Users</span>
                  </div>
                  <Badge className={`text-[9px] font-black uppercase ${r.color}`}>{r.accessLevel.split(" ")[0]}</Badge>
                </div>
              </Card>
            ))}
          </div>

          {/* Roles Table */}
          <Card className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs uppercase font-bold tracking-wider">
                    <th className="pb-3">Role</th>
                    <th className="pb-3">Users</th>
                    <th className="pb-3">Description</th>
                    <th className="pb-3">Last Updated</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roleDetails.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="py-4">
                        <Badge className={`text-[10px] uppercase font-black tracking-wide ${r.color}`}>
                          {r.label}
                        </Badge>
                      </td>
                      <td className="py-4 font-bold text-slate-900 dark:text-white text-xs">{r.count}</td>
                      <td className="py-4 text-slate-600 dark:text-slate-400 text-xs font-semibold">{r.description}</td>
                      <td className="py-4 text-slate-500 font-semibold text-xs">{r.lastUpdated}</td>
                      <td className="py-4 text-right">
                        <button className="text-xs text-slate-450 hover:text-slate-650 hover:underline font-bold">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <Card className="p-6">
          <h3 className="font-black text-slate-900 dark:text-white text-base mb-2">Permissions overview</h3>
          <p className="text-sm text-slate-500 mb-6">What each role can access and modify based on system policies.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-bold uppercase tracking-wide">
                  <th className="pb-3">Permission area</th>
                  {roleDetails.map((r) => (
                    <th key={r.id} className="pb-3 text-center capitalize text-xs">
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row) => (
                  <tr key={row.area} className="border-b border-slate-50 last:border-0">
                    <td className="py-3.5">
                      <p className="font-bold text-slate-850 dark:text-white text-xs">{row.area}</p>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{row.detail}</p>
                    </td>
                    {roleDetails.map((r) => {
                      const ui = ACCESS_UI[row.access[r.id as RoleId]];
                      return (
                        <td key={r.id} className="py-3.5 text-center">
                          <span title={ui.label} className="inline-flex justify-center">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={`h-5 w-5 ${ui.className}`}>
                              {ui.icon}
                            </svg>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
