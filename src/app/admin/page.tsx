"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, ProgressBar, ProgressCircle, Avatar, Button } from "@/components/ui";

type Stats = {
  employees: number;
  departments: number;
  tasks: number;
  pendingApprovals: number;
  meetingsToday: number;
  storageUsed: number;
  storageLimit: number;
};

type StatusCount = { status: string; count: number };
type DeptRow = { id: string; name: string; workload: string; total: number; done: number };
type ActivityRow = { id: string; summary: string | null; action: string; created_at: string };
type MeetingRow = { id: string; title: string; starts_at: string };
type WorkspaceRow = { id: string; name: string; total: number };

const TASK_TONES: Record<string, string> = {
  completed: "bg-success",
  in_progress: "bg-primary",
  todo: "bg-slate-300",
  review: "bg-warning",
  on_hold: "bg-slate-400",
  overdue: "bg-danger",
  cancelled: "bg-slate-200",
};

function fmtBytes(bytes: number) {
  if (!bytes) return "0 GB";
  const gb = bytes / 1024 ** 3;
  return gb < 1 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${gb.toFixed(1)} GB`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [taskStatuses, setTaskStatuses] = useState<StatusCount[]>([]);
  const [attendance, setAttendance] = useState<StatusCount[]>([]);
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);

  const load = useCallback(async () => {
    const me = await getProfile();
    if (!me) {
      router.replace("/");
      return;
    }
    setProfile(me);
    if (!isAdmin(me) || !me.company_id) {
      setDenied(true);
      setLoading(false);
      return;
    }

    const companyId = me.company_id;
    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const dayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();
    const workDate = today.toISOString().slice(0, 10);

    const [
      employeesRes,
      deptRes,
      tasksRes,
      requestsRes,
      pendingProfilesRes,
      leaveRes,
      meetingsTodayRes,
      filesRes,
      companyRes,
      attendanceRes,
      activityRes,
      upcomingRes,
      workspacesRes,
    ] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active"),
      supabase.from("departments").select("id, name, workload").eq("company_id", companyId),
      supabase.from("tasks").select("id, status, department_id, workspace_id").eq("company_id", companyId),
      supabase.from("requests").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
      supabase.from("meetings").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("starts_at", dayStart).lt("starts_at", dayEnd),
      supabase.from("drive_files").select("size_bytes").eq("company_id", companyId).eq("is_trashed", false),
      supabase.from("companies").select("storage_limit_bytes").eq("id", companyId).maybeSingle(),
      supabase.from("attendance_sessions").select("status").eq("company_id", companyId).eq("work_date", workDate),
      supabase.from("activity_log").select("id, summary, action, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(6),
      supabase.from("meetings").select("id, title, starts_at").eq("company_id", companyId).gte("starts_at", new Date().toISOString()).order("starts_at").limit(4),
      supabase.from("workspaces").select("id, name").eq("company_id", companyId).eq("is_active", true).limit(5),
    ]);

    const tasks = tasksRes.data ?? [];
    const storageUsed = (filesRes.data ?? []).reduce((sum, f) => sum + (f.size_bytes ?? 0), 0);

    setStats({
      employees: employeesRes.count ?? 0,
      departments: (deptRes.data ?? []).length,
      tasks: tasks.length,
      pendingApprovals: (requestsRes.count ?? 0) + (pendingProfilesRes.count ?? 0) + (leaveRes.count ?? 0),
      meetingsToday: meetingsTodayRes.count ?? 0,
      storageUsed,
      storageLimit: companyRes.data?.storage_limit_bytes ?? 0,
    });

    const byStatus = new Map<string, number>();
    for (const t of tasks) byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
    setTaskStatuses([...byStatus.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count));

    const att = new Map<string, number>();
    for (const a of attendanceRes.data ?? []) att.set(a.status, (att.get(a.status) ?? 0) + 1);
    setAttendance([...att.entries()].map(([status, count]) => ({ status, count })));

    setDepartments(
      (deptRes.data ?? []).map((d) => {
        const deptTasks = tasks.filter((t) => t.department_id === d.id);
        return {
          id: d.id,
          name: d.name,
          workload: d.workload,
          total: deptTasks.length,
          done: deptTasks.filter((t) => t.status === "completed").length,
        };
      })
    );

    setWorkspaces(
      (workspacesRes.data ?? []).map((w) => ({
        id: w.id,
        name: w.name,
        total: tasks.filter((t) => t.workspace_id === w.id).length,
      })).sort((a, b) => b.total - a.total)
    );

    setActivity(activityRes.data ?? []);
    setMeetings(upcomingRes.data ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading dashboard...</main>;
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Admin Dashboard" variant="admin">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-h4 text-slate-900">Admin access required</h2>
          <p className="mt-2 text-sm text-slate-600">
            {profile?.company_id
              ? "Your role doesn't have access to the admin dashboard."
              : "Your account isn't assigned to a company yet. An admin needs to approve you."}
          </p>
          <Button className="mt-5" onClick={() => router.push("/dashboard")}>
            Go to my dashboard
          </Button>
        </Card>
      </AppShell>
    );
  }

  const totalTasks = taskStatuses.reduce((s, t) => s + t.count, 0);
  const totalAttendance = attendance.reduce((s, a) => s + a.count, 0);
  const presentPct = totalAttendance
    ? Math.round(((attendance.find((a) => a.status === "present")?.count ?? 0) / totalAttendance) * 100)
    : 0;
  const storagePct = stats?.storageLimit ? Math.round((stats.storageUsed / stats.storageLimit) * 100) : 0;

  return (
    <AppShell
      profile={profile}
      variant="admin"
      title="Admin Dashboard"
      subtitle={`Welcome back, ${profile?.first_name ?? "Admin"}! Here's what's happening in DeskCulture.`}
    >
      {/* Stat row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Employees" value={stats?.employees ?? 0} tone="bg-primary-light text-primary" iconPath="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Z" />
        <StatCard label="Departments" value={stats?.departments ?? 0} tone="bg-info-light text-info" iconPath="M3.75 21h16.5M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5" />
        <StatCard label="Tasks" value={stats?.tasks ?? 0} tone="bg-success-light text-success" iconPath="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        <StatCard label="Pending Approvals" value={stats?.pendingApprovals ?? 0} tone="bg-warning-light text-warning" iconPath="M12 6.75V12l3 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        <StatCard label="Meetings Today" value={stats?.meetingsToday ?? 0} tone="bg-violet-100 text-violet-600" iconPath="m15.75 10.5 4.72-2.36a.75.75 0 0 1 1.03.67v9.38a.75.75 0 0 1-1.03.67l-4.72-2.36M4.5 6.75h9a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5h-9a1.5 1.5 0 0 1-1.5-1.5v-7.5a1.5 1.5 0 0 1 1.5-1.5Z" />
        <Card className="p-5">
          <p className="text-xs font-semibold text-slate-500">Storage Used</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <p className="text-h3 text-slate-900">{fmtBytes(stats?.storageUsed ?? 0)}</p>
              <p className="text-xs text-slate-400">of {fmtBytes(stats?.storageLimit ?? 0)}</p>
            </div>
            <ProgressCircle value={storagePct} size={54} strokeWidth={6} label={<span className="text-[11px] font-bold">{storagePct}%</span>} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {/* Task overview */}
        <Card>
          <h3 className="text-h4 text-slate-900">Task Overview</h3>
          {totalTasks === 0 ? (
            <Empty message="No tasks yet." />
          ) : (
            <>
              <div className="mt-5 flex items-center justify-center">
                <ProgressCircle
                  value={Math.round(((taskStatuses.find((t) => t.status === "completed")?.count ?? 0) / totalTasks) * 100)}
                  size={150}
                  strokeWidth={16}
                  color="var(--color-success)"
                  label={
                    <span className="text-center">
                      <span className="block text-2xl font-black">{totalTasks}</span>
                      <span className="block text-[11px] font-medium text-slate-500">Total Tasks</span>
                    </span>
                  }
                />
              </div>
              <ul className="mt-6 space-y-2.5">
                {taskStatuses.map((t) => (
                  <li key={t.status} className="flex items-center gap-3 text-sm">
                    <span className={`h-2.5 w-2.5 rounded-full ${TASK_TONES[t.status] ?? "bg-slate-300"}`} />
                    <span className="flex-1 capitalize text-slate-600">{t.status.replace("_", " ")}</span>
                    <span className="font-bold text-slate-900">{t.count}</span>
                    <span className="w-12 text-right text-xs text-slate-400">
                      {Math.round((t.count / totalTasks) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Department performance */}
        <Card>
          <h3 className="text-h4 text-slate-900">Department Performance</h3>
          {departments.length === 0 ? (
            <Empty message="No departments yet." />
          ) : (
            <div className="mt-5 space-y-4">
              {departments.map((d) => {
                const pct = d.total ? Math.round((d.done / d.total) * 100) : 0;
                return (
                  <div key={d.id}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{d.name}</span>
                      <span className="text-xs text-slate-400">
                        {d.done}/{d.total} · {pct}%
                      </span>
                    </div>
                    <ProgressBar value={pct} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Recent activity */}
        <Card>
          <h3 className="text-h4 text-slate-900">Recent Activity</h3>
          {activity.length === 0 ? (
            <Empty message="No activity recorded yet." />
          ) : (
            <ul className="mt-4 space-y-4">
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-light text-primary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75 11.25 15 15 9.75" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{a.summary ?? a.action}</p>
                    <p className="text-xs text-slate-400">{timeAgo(a.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {/* Attendance */}
        <Card>
          <h3 className="text-h4 text-slate-900">Attendance Overview</h3>
          {totalAttendance === 0 ? (
            <Empty message="No attendance recorded today." />
          ) : (
            <>
              <div className="mt-5 flex justify-center">
                <ProgressCircle value={presentPct} size={140} strokeWidth={14} color="var(--color-success)"
                  label={<span className="text-center"><span className="block text-xl font-black">{presentPct}%</span><span className="block text-[11px] text-slate-500">Present</span></span>} />
              </div>
              <ul className="mt-6 space-y-2.5">
                {attendance.map((a) => (
                  <li key={a.status} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-slate-600">{a.status.replace("_", " ")}</span>
                    <span className="font-bold text-slate-900">{a.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Workspaces */}
        <Card>
          <h3 className="text-h4 text-slate-900">Top Active Workspaces</h3>
          {workspaces.length === 0 ? (
            <Empty message="No workspaces yet." />
          ) : (
            <div className="mt-5 space-y-4">
              {workspaces.map((w) => {
                const max = Math.max(...workspaces.map((x) => x.total), 1);
                return (
                  <div key={w.id}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{w.name}</span>
                      <span className="text-xs text-slate-400">{w.total} tasks</span>
                    </div>
                    <ProgressBar value={Math.round((w.total / max) * 100)} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Upcoming meetings */}
        <Card>
          <h3 className="text-h4 text-slate-900">Upcoming Meetings</h3>
          {meetings.length === 0 ? (
            <Empty message="No upcoming meetings." />
          ) : (
            <ul className="mt-4 space-y-3">
              {meetings.map((m) => {
                const d = new Date(m.starts_at);
                return (
                  <li key={m.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary-light text-center">
                      <span className="text-[10px] font-bold uppercase text-primary">
                        {d.toLocaleString(undefined, { month: "short" })}
                      </span>
                      <span className="-mt-1 text-sm font-black text-primary">{d.getDate()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{m.title}</p>
                      <p className="text-xs text-slate-500">
                        {d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Department workload */}
      <Card className="mt-6">
        <h3 className="text-h4 text-slate-900">Department Workload</h3>
        {departments.length === 0 ? (
          <Empty message="No departments yet." />
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {departments.map((d) => (
              <div key={d.id} className="rounded-lg border border-slate-100 p-4">
                <p className="text-sm font-bold text-slate-900">{d.name}</p>
                <Badge
                  className="mt-2"
                  tone={d.workload === "high" ? "danger" : d.workload === "medium" ? "warning" : "success"}
                >
                  {d.workload}
                </Badge>
                <p className="mt-3 text-xs text-slate-400">{d.total} tasks</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </AppShell>
  );
}

function StatCard({ label, value, tone, iconPath }: { label: string; value: number; tone: string; iconPath: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-h1 text-slate-900">{value}</p>
        </div>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={iconPath} />
          </svg>
        </span>
      </div>
    </Card>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="mt-6 rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-400">{message}</p>;
}
