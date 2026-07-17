"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Tabs } from "@/components/ui";

type RoleId = "admin" | "manager" | "member" | "guest";

const ROLES: Array<{ id: RoleId; label: string; description: string; tone: "primary" | "info" | "neutral" }> = [
  { id: "admin", label: "Admin", description: "Full access to the organization, people and settings.", tone: "primary" },
  { id: "manager", label: "Manager", description: "Manages their department's people, tasks and requests.", tone: "info" },
  { id: "member", label: "Member", description: "Works on assigned tasks in their department.", tone: "neutral" },
  { id: "guest", label: "Guest", description: "Limited, read-mostly access to specific resources.", tone: "neutral" },
];

type Access = "full" | "limited" | "view" | "none";

// Mirrors what the database policies actually enforce (is_admin() / is_manager()
// / company_id scoping). This grid is documentation of the real rules, not a
// separate permission system -- changing a cell here would not change access.
const MATRIX: Array<{ area: string; detail: string; access: Record<RoleId, Access> }> = [
  {
    area: "Organization settings",
    detail: "Rename the org, employee count, join code",
    access: { admin: "full", manager: "none", member: "none", guest: "none" },
  },
  {
    area: "User management",
    detail: "Approve joiners, assign roles, remove members",
    access: { admin: "full", manager: "none", member: "none", guest: "none" },
  },
  {
    area: "Departments",
    detail: "Create and manage departments",
    access: { admin: "full", manager: "view", member: "view", guest: "none" },
  },
  {
    area: "Tasks",
    detail: "Create, edit and complete tasks",
    access: { admin: "full", manager: "full", member: "full", guest: "view" },
  },
  {
    area: "Requests",
    detail: "Raise and action cross-department requests",
    access: { admin: "full", manager: "full", member: "full", guest: "view" },
  },
  {
    area: "Meetings",
    detail: "Schedule and join meetings",
    access: { admin: "full", manager: "full", member: "full", guest: "view" },
  },
  {
    area: "Announcements",
    detail: "Publish org-wide updates",
    access: { admin: "full", manager: "full", member: "view", guest: "view" },
  },
  {
    area: "Attendance",
    detail: "Own check-in/out; managers see everyone",
    access: { admin: "full", manager: "full", member: "limited", guest: "none" },
  },
  {
    area: "Leave requests",
    detail: "Raise own; managers approve",
    access: { admin: "full", manager: "full", member: "limited", guest: "none" },
  },
  {
    area: "Audit log",
    detail: "See what happened in the org",
    access: { admin: "full", manager: "view", member: "view", guest: "none" },
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
    className: "text-slate-300",
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
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading roles...</main>;
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Roles & Permissions" variant="admin">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-h4 text-slate-900">Admin access required</h2>
          <p className="mt-2 text-sm text-slate-600">Only admins can view roles and permissions.</p>
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
      title="Roles & Permissions"
      subtitle="Manage roles and control access across DeskCulture."
    >
      <Card className="mb-6">
        <Tabs
          tabs={[
            { id: "roles", label: "Roles" },
            { id: "permissions", label: "Permissions" },
          ]}
          value={tab}
          onValueChange={setTab}
          className="border-0"
        />
      </Card>

      {tab === "roles" ? (
        <Card>
          <h3 className="text-h4 text-slate-900">Default roles</h3>
          <p className="mt-1 text-sm text-slate-500">Assign these to people in Users &amp; Teams.</p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Users</th>
                  <th className="pb-3">Description</th>
                </tr>
              </thead>
              <tbody>
                {ROLES.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-4">
                      <Badge tone={r.tone} className="capitalize">
                        {r.label}
                      </Badge>
                    </td>
                    <td className="py-4 font-bold text-slate-900">{counts[r.id] ?? 0}</td>
                    <td className="py-4 text-slate-600">{r.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-400">
            Roles are fixed and enforced by the database. Custom roles aren&apos;t supported yet — they&apos;d need
            matching policies server-side, so we haven&apos;t faked a &quot;Create role&quot; button that couldn&apos;t
            actually grant anything.
          </p>
        </Card>
      ) : (
        <Card>
          <h3 className="text-h4 text-slate-900">Permissions overview</h3>
          <p className="mt-1 text-sm text-slate-500">What each role can access and modify.</p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="pb-3">Permission</th>
                  {ROLES.map((r) => (
                    <th key={r.id} className="pb-3 text-center capitalize">
                      {r.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((row) => (
                  <tr key={row.area} className="border-b border-slate-50 last:border-0">
                    <td className="py-3.5">
                      <p className="font-semibold text-slate-900">{row.area}</p>
                      <p className="text-xs text-slate-400">{row.detail}</p>
                    </td>
                    {ROLES.map((r) => {
                      const ui = ACCESS_UI[row.access[r.id]];
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

          <div className="mt-6 flex flex-wrap items-center gap-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
            {(Object.keys(ACCESS_UI) as Access[]).map((a) => (
              <span key={a} className="flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={`h-4 w-4 ${ACCESS_UI[a].className}`}>
                  {ACCESS_UI[a].icon}
                </svg>
                {ACCESS_UI[a].label}
              </span>
            ))}
          </div>

          <p className="mt-4 text-xs leading-5 text-slate-400">
            This grid documents the rules the database already enforces via row-level security — it isn&apos;t a
            separate switchboard. Access is checked server-side on every query, so it holds even if someone bypasses
            the UI.
          </p>
        </Card>
      )}
    </AppShell>
  );
}
