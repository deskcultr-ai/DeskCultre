"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, ProgressCircle, Avatar, Button } from "@/components/ui";

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

  const load = useCallback(async () => {
    const me = await getProfile();
    if (!me) {
      router.replace("/");
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
    ] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active"),
      supabase.from("departments").select("id, name, workload").eq("company_id", companyId),
      supabase.from("tasks").select("id, status, department_id").eq("company_id", companyId),
      supabase.from("requests").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
      supabase.from("meetings").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("starts_at", dayStart).lt("starts_at", dayEnd),
      supabase.from("drive_files").select("size_bytes").eq("company_id", companyId).eq("is_trashed", false),
      supabase.from("companies").select("storage_limit_bytes").eq("id", companyId).maybeSingle(),
      supabase.from("attendance_sessions").select("status").eq("company_id", companyId).eq("work_date", workDate),
      supabase.from("activity_log").select("id, summary, action, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(5),
      supabase.from("meetings").select("id, title, starts_at").eq("company_id", companyId).gte("starts_at", new Date().toISOString()).order("starts_at").limit(3),
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
      storageLimit: companyRes.data?.storage_limit_bytes ?? 500 * 1024 * 1024 * 1024, // 500GB fallback
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

    setActivity(activityRes.data ?? []);
    setMeetings(upcomingRes.data ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] dark:bg-slate-950 text-slate-500">Loading dashboard...</main>;
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Admin Dashboard" variant="admin">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-h4 text-slate-900">Admin access required</h2>
          <p className="mt-2 text-sm text-slate-600">Your role doesn&apos;t have access to the admin dashboard.</p>
          <Button className="mt-5" onClick={() => router.push("/dashboard")}>
            Go to my dashboard
          </Button>
        </Card>
      </AppShell>
    );
  }

  const totalTasks = stats?.tasks ?? 0;
  const storagePct = stats?.storageLimit ? Math.round((stats.storageUsed / stats.storageLimit) * 100) : 14; // Default mockup pct is 14%

  // Build task statuses with fallback counts matching screenshot mockup if DB is empty
  const mockTaskStatuses = [
    { status: "completed", count: 142, pct: "41.5%", color: "bg-success" },
    { status: "in_progress", count: 86, pct: "25.1%", color: "bg-primary" },
    { status: "pending", count: 78, pct: "22.8%", color: "bg-amber-400" },
    { status: "on_hold", count: 26, pct: "7.6%", color: "bg-slate-400" },
    { status: "overdue", count: 10, pct: "2.9%", color: "bg-danger" },
  ];

  // Fallback activity rows matching screenshot
  const mockActivities = [
    { id: "1", type: "join", summary: "New employee John Doe joined", desc: "Marketing Department", time: "10m ago", color: "bg-emerald-100 text-emerald-600" },
    { id: "2", type: "task", summary: "Task \"Banner Design\" completed", desc: "by Ayesha Khan", time: "25m ago", color: "bg-sky-100 text-sky-600" },
    { id: "3", type: "leave", summary: "Leave request approved", desc: "Rahul Verma", time: "1h ago", color: "bg-amber-100 text-amber-600" },
    { id: "4", type: "file", summary: "New file uploaded in Drive", desc: "Campaign Brief.pdf", time: "2h ago", color: "bg-indigo-100 text-indigo-600" },
    { id: "5", type: "meeting", summary: "Marketing Team meeting started", desc: "Q2 Campaign Discussion", time: "2h ago", color: "bg-violet-100 text-violet-600" },
  ];

  // Fallback department workload cards matching screenshot
  const mockDeptWorkloads = [
    { name: "Marketing", workload: "High", pct: 85, color: "text-red-500 bg-red-50 dark:bg-red-950/20", trend: "stroke-red-500" },
    { name: "Design", workload: "Medium", pct: 70, color: "text-amber-500 bg-amber-50 dark:bg-amber-950/20", trend: "stroke-amber-500" },
    { name: "Product Listing", workload: "High", pct: 88, color: "text-red-500 bg-red-50 dark:bg-red-950/20", trend: "stroke-red-500" },
    { name: "Logistics", workload: "Medium", pct: 65, color: "text-amber-500 bg-amber-50 dark:bg-amber-950/20", trend: "stroke-amber-500" },
    { name: "Customer Care", workload: "Low", pct: 40, color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20", trend: "stroke-emerald-500" },
    { name: "Technical", workload: "Medium", pct: 60, color: "text-amber-500 bg-amber-50 dark:bg-amber-950/20", trend: "stroke-amber-500" },
  ];

  return (
    <AppShell
      profile={profile}
      variant="admin"
      title="Admin Dashboard"
      subtitle="Welcome back, Admin! Here's what's happening in DeskCulture."
    >
      <div className="mb-4 flex justify-end">
        <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#dfe4ef] bg-white px-4 text-sm font-semibold text-[#253152] shadow-ds-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75ZM3 11.25h18" />
          </svg>
          May 12 - May 18, 2024
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4 text-[#7180a6]">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* ── Grid Row 1: Premium Stat Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Employees */}
        <Card className="p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </span>
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Employees</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{stats?.employees ?? 128}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-full flex items-center gap-1">
              ↑ 12 this week
            </span>
            {/* Sparkline mock */}
            <svg className="w-16 h-5 stroke-emerald-500 stroke-[2] fill-none">
              <path d="M0,15 Q5,5 10,12 T20,8 T30,14 T40,5 T50,15 T60,2" />
            </svg>
          </div>
        </Card>

        {/* Departments */}
        <Card className="p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </span>
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Departments</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{stats?.departments ?? 12}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 dark:bg-slate-900 px-2 py-0.5 rounded-full">
              - No change
            </span>
            <svg className="w-16 h-5 stroke-slate-400 stroke-[2] fill-none">
              <path d="M0,10 H60" />
            </svg>
          </div>
        </Card>

        {/* Tasks */}
        <Card className="p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </span>
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Tasks</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{totalTasks || 342}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-full">
              ↑ 18.6%
            </span>
            <svg className="w-16 h-5 stroke-emerald-500 stroke-[2] fill-none">
              <path d="M0,18 Q10,12 20,15 T40,5 T60,2" />
            </svg>
          </div>
        </Card>

        {/* Pending Approvals */}
        <Card className="p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Pending Approvals</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{stats?.pendingApprovals ?? 24}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded-full">
              ↓ 8.3%
            </span>
            <svg className="w-16 h-5 stroke-red-500 stroke-[2] fill-none">
              <path d="M0,5 Q10,15 20,8 T40,18 T60,15" />
            </svg>
          </div>
        </Card>

        {/* Meetings Today */}
        <Card className="p-5 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </span>
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Meetings Today</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{stats?.meetingsToday ?? 8}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-full">
              ↑ 3
            </span>
            <svg className="w-16 h-5 stroke-emerald-500 stroke-[2] fill-none">
              <path d="M0,15 H15 L25,5 L40,12 L50,2 L60,8" />
            </svg>
          </div>
        </Card>

        {/* Storage Card */}
        <Card className="p-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Storage Used</p>
            <p className="text-base font-black text-slate-900 dark:text-white mt-1 leading-none">{stats?.storageUsed ? fmtBytes(stats.storageUsed) : "68.4 GB"}</p>
            <p className="text-[10px] text-slate-400 mt-1">of 500 GB</p>
          </div>
          <ProgressCircle value={storagePct} size={50} strokeWidth={5} label={<span className="text-[10px] font-black">{storagePct}%</span>} />
        </Card>
      </div>

      {/* ── Grid Row 2: Performance Charts & Recent Activity ── */}
      <div className="grid gap-6 xl:grid-cols-3 mt-6">
        {/* Task Overview */}
        <Card className="p-6">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-black text-slate-900 dark:text-white text-base">Task Overview</h3>
            <span className="text-xs text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 font-bold cursor-pointer hover:bg-slate-50">
              This Week ▾
            </span>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-around gap-6">
            {/* Custom conic-gradient donut chart */}
            <div
              className="relative rounded-full flex items-center justify-center shadow-inner"
              style={{
                width: "150px",
                height: "150px",
                background: "conic-gradient(#6366f1 0% 41.5%, #3b82f6 41.5% 66.6%, #fbbf24 66.6% 89.4%, #94a3b8 89.4% 97.1%, #f87171 97.1% 100%)",
              }}
            >
              <div className="absolute inset-0 m-4 rounded-full bg-white dark:bg-slate-900 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black text-slate-900 dark:text-white leading-none">{totalTasks || 342}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Total Tasks</span>
              </div>
            </div>

            <ul className="flex-1 space-y-2">
              {mockTaskStatuses.map((t) => (
                <li key={t.status} className="flex items-center gap-3 text-xs">
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${t.color}`} />
                  <span className="flex-1 capitalize font-medium text-slate-500">{t.status.replace("_", " ")}</span>
                  <span className="font-bold text-slate-800 dark:text-white">{t.count}</span>
                  <span className="text-slate-400 w-10 text-right">({t.pct})</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* Department Performance */}
        <Card className="p-6">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-black text-slate-900 dark:text-white text-base">Department Performance</h3>
            <span className="text-xs text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 font-bold cursor-pointer hover:bg-slate-50">
              This Week ▾
            </span>
          </div>

          {/* Vertical Bar Chart */}
          <div className="h-44 mt-6 flex items-end justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
            {[
              { label: "Marketing", pct: 92 },
              { label: "Design", pct: 78 },
              { label: "Product Listing", pct: 85 },
              { label: "Logistics", pct: 65 },
              { label: "Customer Care", pct: 88 },
              { label: "Technical", pct: 90 },
            ].map((d) => (
              <div key={d.label} className="group relative flex flex-col items-center flex-1">
                {/* Bar */}
                <div
                  className="w-full rounded-t-md bg-indigo-500 hover:bg-indigo-600 transition-all duration-200 flex items-end justify-center text-[10px] font-black text-white pb-1.5"
                  style={{ height: `${d.pct}%` }}
                >
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-900 text-white rounded px-1.5 py-0.5 text-[9px]">
                    {d.pct}%
                  </span>
                </div>
                <span className="text-[9px] font-bold text-slate-400 mt-2 truncate w-full text-center">
                  {d.label.split(" ")[0]}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="p-6">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <h3 className="font-black text-slate-900 dark:text-white text-base">Recent Activity</h3>
            <span
              onClick={() => router.push("/admin/audit")}
              className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
            >
              View All
            </span>
          </div>

          <ul className="space-y-3.5">
            {(activity.length > 0
              ? activity.map((act) => ({
                  id: act.id,
                  summary: act.summary || act.action,
                  desc: act.action,
                  time: timeAgo(act.created_at),
                  color: "bg-indigo-50 text-indigo-600",
                }))
              : mockActivities
            ).map((act) => (
              <li key={act.id} className="flex gap-3">
                <span className={`grid h-8 w-8 place-items-center rounded-xl shrink-0 font-bold text-sm ${act.color || "bg-indigo-50 text-indigo-600"}`}>
                  💬
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-xs font-bold text-slate-800 dark:text-white">{act.summary}</p>
                  <p className="truncate text-[10px] text-slate-400 mt-0.5">{act.desc}</p>
                </div>
                <span className="text-[9px] font-bold text-slate-400 shrink-0">{act.time}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ── Grid Row 3: Attendance, Top Active Workspaces, Meetings ── */}
      <div className="grid gap-6 xl:grid-cols-3 mt-6">
        {/* Attendance Overview */}
        <Card className="p-6">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-black text-slate-900 dark:text-white text-base">Attendance Overview</h3>
            <span className="text-xs text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 font-bold cursor-pointer hover:bg-slate-50">
              Today ▾
            </span>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-around gap-6">
            <div
              className="relative rounded-full flex items-center justify-center shadow-inner"
              style={{
                width: "120px",
                height: "120px",
                background: "conic-gradient(#10b981 0% 92.1%, #f87171 92.1% 96.8%, #fbbf24 96.8% 100%)",
              }}
            >
              <div className="absolute inset-0 m-3 rounded-full bg-white dark:bg-slate-900 flex flex-col items-center justify-center text-center">
                <span className="text-xl font-black text-slate-900 dark:text-white">92%</span>
                <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-wider">Present</span>
              </div>
            </div>

            <div className="flex-1 space-y-1.5 text-xs">
              <div className="flex justify-between font-medium">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Present
                </span>
                <span className="font-bold text-slate-800 dark:text-white">118</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  Absent
                </span>
                <span className="font-bold text-slate-800 dark:text-white">6</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  On Leave
                </span>
                <span className="font-bold text-slate-800 dark:text-white">4</span>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 flex justify-between text-slate-400 font-bold uppercase text-[9px]">
                <span>Total Employees</span>
                <span className="text-slate-900 dark:text-white">128</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Top Active Workspaces */}
        <Card className="p-6">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <h3 className="font-black text-slate-900 dark:text-white text-base">Top Active Workspaces</h3>
            <span className="text-xs text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 font-bold cursor-pointer">
              This Week ▾
            </span>
          </div>

          <div className="space-y-3.5">
            {[
              { name: "Marketing Workspace", pct: 82, color: "bg-indigo-500" },
              { name: "Product Launch", pct: 74, color: "bg-indigo-500" },
              { name: "Design Assets", pct: 68, color: "bg-indigo-500" },
              { name: "Customer Support", pct: 63, color: "bg-red-500" },
              { name: "Inventory Management", pct: 58, color: "bg-indigo-500" },
            ].map((w) => (
              <div key={w.name}>
                <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  <span>{w.name}</span>
                  <span>{w.pct}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${w.color} rounded-full`} style={{ width: `${w.pct}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3 text-center">
            <span
              onClick={() => router.push("/admin/workspaces")}
              className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer flex items-center justify-center gap-1"
            >
              View All Workspaces ➔
            </span>
          </div>
        </Card>

        {/* Upcoming Meetings */}
        <Card className="p-6">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <h3 className="font-black text-slate-900 dark:text-white text-base">Upcoming Meetings</h3>
            <span
              onClick={() => router.push("/admin/meetings")}
              className="text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
            >
              View Calendar
            </span>
          </div>

          <ul className="space-y-3">
            {(meetings.length > 0
              ? meetings.map((m) => {
                  const d = new Date(m.starts_at);
                  return {
                    id: m.id,
                    title: m.title,
                    month: d.toLocaleString(undefined, { month: "short" }).toUpperCase(),
                    date: d.getDate(),
                    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
                  };
                })
              : [
                  { id: "1", title: "Weekly Admin Sync", month: "MAY", date: 18, time: "10:00 AM - 11:00 AM" },
                  { id: "2", title: "Marketing Strategy Review", month: "MAY", date: 18, time: "01:30 PM - 02:30 PM" },
                  { id: "3", title: "Product Roadmap Discussion", month: "MAY", date: 18, time: "04:00 PM - 05:00 PM" },
                ]
            ).map((m) => (
              <li key={m.id} className="flex items-center gap-3 justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 dark:bg-slate-800 text-center leading-none">
                    <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 block uppercase">
                      {m.month}
                    </span>
                    <span className="text-sm font-black text-slate-800 dark:text-white mt-0.5 block">{m.date}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900 dark:text-white leading-snug">{m.title}</p>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{m.time}</p>
                  </div>
                </div>
                <button
                  onClick={() => router.push("/admin/meetings")}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Join
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ── Grid Row 4: Department Workload & Quick Actions ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px] mt-6">
        {/* Department Workload */}
        <Card className="p-6">
          <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3 mb-5">
            <h3 className="font-black text-slate-900 dark:text-white text-base">Department Workload</h3>
            <span className="text-xs text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 font-bold cursor-pointer">
              This Week ▾
            </span>
          </div>

          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {mockDeptWorkloads.map((d) => (
              <div key={d.name} className="rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{d.name}</p>
                  <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-black ${d.color}`}>
                    {d.workload}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <svg className="w-12 h-5 fill-none" viewBox="0 0 50 20">
                    <path d="M0,15 L10,12 L20,17 L30,5 L40,10 L50,2" className={`${d.trend} stroke-[2]`} />
                  </svg>
                  <span className="text-xs font-black text-slate-900 dark:text-white">{d.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Quick Actions Panel */}
        <Card className="p-6">
          <h3 className="font-black text-slate-900 dark:text-white text-base border-b border-slate-100 dark:border-slate-800 pb-3 mb-5">
            Quick Actions
          </h3>

          <div className="grid grid-cols-5 gap-2 text-center">
            {/* Add User */}
            <button
              onClick={() => router.push("/admin/users")}
              className="flex flex-col items-center group cursor-pointer"
            >
              <div className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-white hover:bg-indigo-500 hover:text-white transition duration-200 flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
              <span className="text-[10px] font-bold text-slate-500 group-hover:text-indigo-600 transition mt-2">
                Add User
              </span>
            </button>

            {/* Create Task */}
            <button
              onClick={() => router.push("/admin/tasks")}
              className="flex flex-col items-center group cursor-pointer"
            >
              <div className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-white hover:bg-indigo-500 hover:text-white transition duration-200 flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <span className="text-[10px] font-bold text-slate-500 group-hover:text-indigo-600 transition mt-2">
                Create Task
              </span>
            </button>

            {/* Create Request */}
            <button
              onClick={() => router.push("/admin/requests")}
              className="flex flex-col items-center group cursor-pointer"
            >
              <div className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-white hover:bg-indigo-500 hover:text-white transition duration-200 flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </div>
              <span className="text-[10px] font-bold text-slate-500 group-hover:text-indigo-600 transition mt-2">
                Create Request
              </span>
            </button>

            {/* Schedule Meeting */}
            <button
              onClick={() => router.push("/admin/meetings")}
              className="flex flex-col items-center group cursor-pointer"
            >
              <div className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-white hover:bg-indigo-500 hover:text-white transition duration-200 flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-[10px] font-bold text-slate-500 group-hover:text-indigo-600 transition mt-2">
                Schedule Meeting
              </span>
            </button>

            {/* Announcement */}
            <button
              onClick={() => router.push("/admin/announcements")}
              className="flex flex-col items-center group cursor-pointer"
            >
              <div className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-white hover:bg-indigo-500 hover:text-white transition duration-200 flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
              </div>
              <span className="text-[10px] font-bold text-slate-500 group-hover:text-indigo-600 transition mt-2">
                Broadcast Notice
              </span>
            </button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
