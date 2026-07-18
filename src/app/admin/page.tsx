"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AvatarGroup, Button, Card, ProgressCircle } from "@/components/ui";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { supabase } from "@/lib/supabase";

type Period = "today" | "week" | "month";
type ApprovalKind = "request" | "leave" | "access";
type DateRange = { start: string; end: string };
type AttendanceState = {
  id: string | null;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  isCheckedIn: boolean;
  elapsedSeconds: number;
};

type DashboardData = {
  stats: {
    totalUsers: number;
    newUsers: number;
    departments: number;
    newDepartments: number;
    totalTasks: number;
    currentTasks: number;
    previousTasks: number;
    activeProjects: number;
    newProjects: number;
    pendingApprovals: number;
    meetingsToday: number;
    storageUsed: number;
    storageLimit: number;
    teamGoalPercent: number;
  };
  organizationActivity: Array<{ date: string; label: string; count: number }>;
  departmentDistribution: Array<{ id: string; name: string; count: number; percent: number }>;
  departmentPerformance: Array<{ id: string; name: string; total: number; completed: number; percent: number }>;
  recentActivity: Array<{ id: string; title: string; detail: string; createdAt: string }>;
  upcomingMeetings: Array<{ id: string; title: string; startsAt: string; endsAt: string | null; joinUrl: string | null }>;
  pendingApprovals: Array<{ id: string; kind: ApprovalKind; title: string; person: string; priority: string; createdAt: string; href: string }>;
  storageBreakdown: Array<{ label: string; bytes: number }>;
  teamMembers: Array<{ id: string; name: string; avatarUrl: string | null; role: string }>;
};

const emptyDashboard: DashboardData = {
  stats: {
    totalUsers: 0,
    newUsers: 0,
    departments: 0,
    newDepartments: 0,
    totalTasks: 0,
    currentTasks: 0,
    previousTasks: 0,
    activeProjects: 0,
    newProjects: 0,
    pendingApprovals: 0,
    meetingsToday: 0,
    storageUsed: 0,
    storageLimit: 536870912000,
    teamGoalPercent: 0,
  },
  organizationActivity: [],
  departmentDistribution: [],
  departmentPerformance: [],
  recentActivity: [],
  upcomingMeetings: [],
  pendingApprovals: [],
  storageBreakdown: [],
  teamMembers: [],
};

const icon = (path: string, className = "h-5 w-5") => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
  </svg>
);

const icons = {
  users: "M17 20h5v-2a4 4 0 0 0-6.7-2.95M17 20H7m10 0v-2a5 5 0 0 0-.86-2.8M7 20H2v-2a4 4 0 0 1 6.7-2.95M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm8 1a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  building: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.25c0-.69.56-1.25 1.25-1.25h3.5c.69 0 1.25.56 1.25 1.25V21",
  task: "M9 5h6M9 12l2 2 4-4M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
  folder: "M3 7h5l2 2h11v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 9h18M5.25 5.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75V7.5A2.25 2.25 0 0 1 5.25 5.25Z",
  clock: "M12 6.75V12l3 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  drive: "M4.5 19.5h15m-12.9 0L12 4.5l5.4 15m-10.8 0L2.7 12.75 8.1 4.5h7.8l5.4 8.25-3.9 6.75",
  megaphone: "M10.34 15.84 9.2 19.25a1.5 1.5 0 0 1-2.85-.08L5.63 16.5M19.5 12c0 2.6.56 5.06 1.57 7.29.13.29-.08.62-.4.62H19.5a7.5 7.5 0 0 1-7.5-7.5v-.82a7.5 7.5 0 0 1 7.5-7.5h1.17c.32 0 .53.33.4.62A17.9 17.9 0 0 0 19.5 12ZM12 12H4.5a2 2 0 0 0 0 4H12",
  plusUser: "M18 9v6m3-3h-6M12 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 21a6 6 0 0 1 12 0",
  shield: "M9 12.75 11.25 15 15 9.75m-3-7.04A12 12 0 0 1 3.6 6 12 12 0 0 0 3 9.75c0 5.59 3.82 10.29 9 11.62 5.18-1.33 9-6.03 9-11.62 0-1.31-.21-2.57-.6-3.75A12 12 0 0 1 12 2.71Z",
};

const statTone = {
  violet: "bg-[#ece8ff] text-[#4f46e5]",
  blue: "bg-[#e9f1ff] text-[#2563eb]",
  green: "bg-[#e5f8ee] text-[#0f9f6e]",
  amber: "bg-[#fff3dc] text-[#f59e0b]",
};

const colors = ["#4f46e5", "#38bdf8", "#f59e0b", "#10b981", "#ef4444", "#94a3b8", "#8b5cf6"];

function formatBytes(bytes: number) {
  if (!bytes) return "0 GB";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function dateKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatRangeLabel(range: DateRange | null, fallback: string) {
  if (!range) return fallback;
  const formatter = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" });
  if (range.start === range.end) return formatter.format(parseDateKey(range.start));
  return `${formatter.format(parseDateKey(range.start))} - ${formatter.format(parseDateKey(range.end))}`;
}

function buildActivityPath(items: DashboardData["organizationActivity"]) {
  const safe = items.length > 0 ? items : Array.from({ length: 7 }, (_, index) => ({ date: "", label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index], count: 0 }));
  const max = Math.max(1, ...safe.map((item) => item.count));
  const points = safe.map((item, index) => {
    const x = 44 + index * (672 / Math.max(1, safe.length - 1));
    const y = 174 - (item.count / max) * 96;
    return { ...item, x, y };
  });
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const area = `${line} L${points.at(-1)?.x ?? 716} 198 L${points[0]?.x ?? 44} 198 Z`;
  return { points, line, area, peak: points.reduce((best, item) => (item.count > best.count ? item : best), points[0]) };
}

function distributionGradient(items: DashboardData["departmentDistribution"]) {
  const active = items.filter((item) => item.percent > 0);
  if (!active.length) return "#edf1f8";
  let cursor = 0;
  return `conic-gradient(${active
    .map((item, index) => {
      const end = cursor + item.percent;
      const value = `${colors[index % colors.length]} ${cursor}% ${end}%`;
      cursor = end;
      return value;
    })
    .join(", ")})`;
}

function StatCard({
  label,
  value,
  helper,
  tone,
  iconNode,
  href,
}: {
  label: string;
  value: number;
  helper: string;
  tone: keyof typeof statTone;
  iconNode: ReactNode;
  href: string;
}) {
  const router = useRouter();
  return (
    <button onClick={() => router.push(href)} className="text-left">
      <Card className="min-h-[126px] rounded-lg border-[#e7ebf5] p-5 shadow-[0_12px_32px_rgba(27,42,94,0.06)] transition hover:-translate-y-0.5 hover:border-[#c8c2ff] hover:shadow-[0_16px_40px_rgba(27,42,94,0.12)]">
        <div className="flex items-start justify-between gap-4">
          <span className={`grid h-12 w-12 place-items-center rounded-lg ${statTone[tone]}`}>{iconNode}</span>
          <div className="text-right">
            <p className="text-[12px] font-bold text-[#111936]">{label}</p>
            <p className="mt-2 text-[28px] font-black leading-none text-[#071035]">{value}</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-[#0f9f6e]">{helper}</span>
          <svg viewBox="0 0 60 24" className="h-6 w-16 fill-none">
            <path d="M1 15 C10 16 14 7 24 12 S42 18 59 5" stroke="#10b981" strokeWidth={2.4} strokeLinecap="round" />
          </svg>
        </div>
      </Card>
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-lg border border-dashed border-[#dfe5f2] bg-[#fbfcff] px-4 py-6 text-center text-sm font-semibold text-[#7180a6]">{message}</div>;
}

function AttendanceControl({
  attendance,
  now,
  busy,
  onCheckIn,
  onCheckOut,
}: {
  attendance: AttendanceState | null;
  now: number;
  busy: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
}) {
  const currentTime = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(now));
  const elapsed =
    attendance?.isCheckedIn && attendance.checkInAt
      ? Math.max(0, Math.floor((now - new Date(attendance.checkInAt).getTime()) / 1000))
      : attendance?.elapsedSeconds ?? 0;
  const buttonLabel = attendance?.isCheckedIn ? "Check Out" : attendance?.checkOutAt ? "Checked Out" : "Check In";

  return (
    <div className="flex min-h-12 flex-wrap items-center gap-3 rounded-lg border border-white/80 bg-white/80 px-3 py-2 shadow-ds-sm sm:px-4">
      <span className={`grid h-9 w-9 place-items-center rounded-lg ${attendance?.isCheckedIn ? "bg-[#e5f8ee] text-[#0f9f6e]" : "bg-[#ece8ff] text-[#4f46e5]"}`}>
        {icon(icons.clock, "h-4 w-4")}
      </span>
      <div className="min-w-[116px]">
        <p className="text-[11px] font-black uppercase text-[#7180a6]">{attendance?.isCheckedIn ? "Working now" : "Today"}</p>
        <p className="font-mono text-sm font-black text-[#071035]">{currentTime}</p>
      </div>
      <div className="min-w-[94px] rounded-md bg-[#f6f8ff] px-3 py-2 text-center">
        <p className="text-[10px] font-black uppercase text-[#7180a6]">Timer</p>
        <p className="font-mono text-xs font-black text-[#4f46e5]">{formatDuration(elapsed)}</p>
      </div>
      <button
        onClick={attendance?.isCheckedIn ? onCheckOut : onCheckIn}
        disabled={busy || !!attendance?.checkOutAt}
        className="h-9 rounded-lg bg-[#4f46e5] px-4 text-xs font-black text-white shadow-[0_10px_20px_rgba(79,70,229,0.22)] transition hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:bg-[#a7a1f4]"
      >
        {busy ? "Saving..." : buttonLabel}
      </button>
    </div>
  );
}

function CalendarRangeModal({
  open,
  value,
  onApply,
  onClose,
}: {
  open: boolean;
  value: DateRange | null;
  onApply: (range: DateRange | null) => void;
  onClose: () => void;
}) {
  const [viewDate, setViewDate] = useState(() => (value ? parseDateKey(value.start) : new Date()));
  const [start, setStart] = useState(value?.start ?? dateKey(new Date()));
  const [end, setEnd] = useState(value?.end ?? dateKey(new Date()));

  useEffect(() => {
    if (!open) return;
    setViewDate(value ? parseDateKey(value.start) : new Date());
    setStart(value?.start ?? dateKey(new Date()));
    setEnd(value?.end ?? value?.start ?? dateKey(new Date()));
  }, [open, value]);

  if (!open) return null;

  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const monthNames = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(2026, index, 1)));
  const startTime = parseDateKey(start).getTime();
  const endTime = parseDateKey(end).getTime();

  function selectDay(day: Date) {
    const key = dateKey(day);
    if (!start || (start && end && start !== end)) {
      setStart(key);
      setEnd(key);
      return;
    }
    if (parseDateKey(key).getTime() < parseDateKey(start).getTime()) {
      setEnd(start);
      setStart(key);
    } else {
      setEnd(key);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#071035]/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-[520px] rounded-xl border border-[#dfe5f2] bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-[#071035]">Select Date Range</h2>
            <p className="mt-1 text-sm font-semibold text-[#637091]">Choose month, year, and dates for dashboard data.</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-[#dfe4ef] text-[#637091] hover:text-[#071035]" aria-label="Close calendar">
            x
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_120px]">
          <select
            value={viewDate.getMonth()}
            onChange={(event) => setViewDate(new Date(viewDate.getFullYear(), Number(event.target.value), 1))}
            className="h-11 rounded-lg border border-[#dfe4ef] bg-white px-3 text-sm font-bold text-[#24304f]"
          >
            {monthNames.map((name, index) => <option key={name} value={index}>{name}</option>)}
          </select>
          <input
            type="number"
            value={viewDate.getFullYear()}
            onChange={(event) => setViewDate(new Date(Number(event.target.value), viewDate.getMonth(), 1))}
            className="h-11 rounded-lg border border-[#dfe4ef] bg-white px-3 text-sm font-bold text-[#24304f]"
          />
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-black uppercase text-[#7180a6]">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1">
          {days.map((day) => {
            const key = dateKey(day);
            const inMonth = day.getMonth() === viewDate.getMonth();
            const time = day.getTime();
            const selected = key === start || key === end;
            const inRange = time >= Math.min(startTime, endTime) && time <= Math.max(startTime, endTime);
            return (
              <button
                key={key}
                onClick={() => selectDay(day)}
                className={`h-10 rounded-lg text-sm font-black transition ${
                  selected
                    ? "bg-[#4f46e5] text-white shadow-[0_10px_18px_rgba(79,70,229,0.22)]"
                    : inRange
                      ? "bg-[#f0edff] text-[#4f46e5]"
                      : inMonth
                        ? "text-[#24304f] hover:bg-[#f6f8ff]"
                        : "text-[#b4bfd3] hover:bg-[#f8faff]"
                }`}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-black uppercase text-[#7180a6]">
            Start
            <input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#dfe4ef] px-3 text-sm font-bold text-[#24304f]" />
          </label>
          <label className="text-xs font-black uppercase text-[#7180a6]">
            End
            <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[#dfe4ef] px-3 text-sm font-bold text-[#24304f]" />
          </label>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button onClick={() => onApply(null)} className="h-11 rounded-lg border border-[#cfd6e8] px-5 text-sm font-black text-[#4f46e5]">Clear Range</button>
          <button onClick={onClose} className="h-11 rounded-lg border border-[#dfe4ef] px-5 text-sm font-black text-[#4b587d]">Cancel</button>
          <button
            onClick={() => onApply(parseDateKey(start).getTime() <= parseDateKey(end).getTime() ? { start, end } : { start: end, end: start })}
            className="h-11 rounded-lg bg-[#4f46e5] px-5 text-sm font-black text-white shadow-[0_12px_24px_rgba(79,70,229,0.24)]"
          >
            Apply Range
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [period, setPeriod] = useState<Period>("week");
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [approvalTab, setApprovalTab] = useState<ApprovalKind>("request");
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [attendance, setAttendance] = useState<AttendanceState | null>(null);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
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

    const { data, error: rpcError } = await supabase.rpc("get_admin_dashboard_data_range", {
      period,
      range_start_date: dateRange?.start ?? null,
      range_end_date: dateRange?.end ?? null,
    });
    if (rpcError) {
      setError(rpcError.message);
      setDashboard(emptyDashboard);
    } else {
      setDashboard({ ...emptyDashboard, ...(data as DashboardData) });
    }
    const { data: attendanceData } = await supabase.rpc("get_my_attendance_state");
    if (attendanceData) setAttendance(attendanceData as AttendanceState);
    setLoading(false);
  }, [dateRange, period, router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    ["/admin/users", "/admin/requests", "/admin/tasks", "/admin/departments", "/admin/meetings"].forEach((href) => {
      router.prefetch(href);
    });
  }, [router]);

  const activityChart = useMemo(() => buildActivityPath(dashboard.organizationActivity), [dashboard.organizationActivity]);
  const filteredApprovals = dashboard.pendingApprovals.filter((item) => item.kind === approvalTab);
  const storagePct = dashboard.stats.storageLimit > 0 ? Math.min(100, Math.round((dashboard.stats.storageUsed / dashboard.stats.storageLimit) * 100)) : 0;
  const todayLabel = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(new Date());
  const rangeLabel = formatRangeLabel(dateRange, todayLabel);
  const taskTrend =
    dashboard.stats.previousTasks > 0
      ? `${Math.round(((dashboard.stats.currentTasks - dashboard.stats.previousTasks) / dashboard.stats.previousTasks) * 100)}% ${dateRange ? "range" : period}`
      : `${dashboard.stats.currentTasks} new ${dateRange ? "range" : period}`;

  async function updateAttendance(action: "check_in" | "check_out") {
    setAttendanceBusy(true);
    setError("");
    const rpcName = action === "check_in" ? "record_attendance_check_in" : "record_attendance_check_out";
    const { data, error: attendanceError } = await supabase.rpc(rpcName);
    if (attendanceError) {
      setError(attendanceError.message);
    } else if (data) {
      setAttendance(data as AttendanceState);
    }
    setAttendanceBusy(false);
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8faff] text-sm font-semibold text-[#637091]">Loading dashboard...</main>;
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Admin Dashboard" variant="admin">
        <Card className="mx-auto max-w-md rounded-lg text-center">
          <h2 className="text-xl font-black text-[#111936]">Admin access required</h2>
          <p className="mt-2 text-sm text-[#637091]">Your account is active, but it does not have Admin controls.</p>
          <Button className="mt-5" onClick={() => router.push("/dashboard")}>Go to my dashboard</Button>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell profile={profile} variant="admin" title="" subtitle="">
      <div className="space-y-5">
        <section className="overflow-hidden rounded-lg border border-[#e7ebf5] bg-gradient-to-br from-white via-[#f9fbff] to-[#eef3ff] p-5 shadow-[0_16px_40px_rgba(27,42,94,0.06)] sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h1 className="text-[26px] font-black leading-tight text-[#071035] sm:text-[28px]">Good Morning, Admin!</h1>
              <p className="mt-1 text-sm font-semibold text-[#4b587d]">Here is the complete live overview of your organization.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => setCalendarOpen(true)} className="inline-flex min-h-12 items-center gap-3 rounded-lg border border-white/80 bg-white/75 px-4 text-left text-sm font-bold text-[#111936] shadow-ds-sm transition hover:border-[#c8c2ff] hover:bg-white">
                {icon(icons.calendar, "h-4 w-4 text-[#4f46e5]")}
                <span>{rangeLabel}</span>
              </button>
              <AttendanceControl
                attendance={attendance}
                now={now}
                busy={attendanceBusy}
                onCheckIn={() => void updateAttendance("check_in")}
                onCheckOut={() => void updateAttendance("check_out")}
              />
            </div>
          </div>
        </section>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

        <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <StatCard label="Total Users" value={dashboard.stats.totalUsers} helper={`+${dashboard.stats.newUsers} this ${dateRange ? "range" : period}`} tone="violet" iconNode={icon(icons.users)} href="/admin/users" />
          <StatCard label="Departments" value={dashboard.stats.departments} helper={dashboard.stats.newDepartments ? `+${dashboard.stats.newDepartments} this ${dateRange ? "range" : period}` : "No change"} tone="blue" iconNode={icon(icons.building)} href="/admin/departments" />
          <StatCard label="Total Tasks" value={dashboard.stats.totalTasks} helper={taskTrend} tone="green" iconNode={icon(icons.task)} href="/admin/tasks" />
          <StatCard label="Active Projects" value={dashboard.stats.activeProjects} helper={`+${dashboard.stats.newProjects} new`} tone="violet" iconNode={icon(icons.folder)} href="/admin/projects" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
          <Card className="rounded-lg border-[#e7ebf5] p-5">
            <div className="flex flex-col gap-3 border-b border-[#e9edf6] pb-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-black text-[#111936]">Organization Activity</h2>
              <div className="inline-flex rounded-lg border border-[#dfe4ef] bg-white p-1">
                {(["today", "week", "month"] as Period[]).map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      setDateRange(null);
                      setPeriod(item);
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-black capitalize ${!dateRange && period === item ? "bg-[#f0edff] text-primary" : "text-[#637091]"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="chart-3d-frame mt-5 h-[260px] overflow-hidden sm:h-[300px]">
              <svg viewBox="0 0 760 230" className="chart-3d-plane h-full w-full">
                {[28, 76, 124, 172, 220].map((y) => (
                  <line key={y} x1="44" y1={y} x2="716" y2={y} stroke="#e8edf7" strokeDasharray="3 5" />
                ))}
                <path d={activityChart.area} fill="url(#activityFill)" />
                <path d={activityChart.line} fill="none" stroke="#a5b4fc" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" opacity="0.22" />
                <path className="chart-3d-line" d={activityChart.line} fill="none" stroke="url(#activityStroke)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
                <defs>
                  <linearGradient id="activityFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="activityStroke" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#312e81" />
                    <stop offset="52%" stopColor="#4f46e5" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
                {activityChart.points.map((point) => (
                  <g key={`${point.label}-${point.x}`}>
                    <circle cx={point.x} cy={point.y} r="4" fill="#4338ca" />
                    <text x={point.x} y="218" textAnchor="middle" className="fill-[#637091] text-[12px] font-bold">{point.label}</text>
                  </g>
                ))}
                <g transform={`translate(${Math.min(610, Math.max(70, activityChart.peak.x - 58))} 48)`}>
                  <rect width="116" height="58" rx="8" fill="white" stroke="#e7ebf5" />
                  <text x="14" y="23" className="fill-[#111936] text-[12px] font-black">Peak Activity</text>
                  <text x="14" y="42" className="fill-[#4f46e5] text-[12px] font-black">{activityChart.peak.count} actions</text>
                </g>
              </svg>
            </div>
          </Card>

          <Card className="rounded-lg border-[#e7ebf5] p-5">
            <div className="flex items-center justify-between border-b border-[#e9edf6] pb-4">
              <h2 className="text-base font-black text-[#111936]">Department Distribution</h2>
              <button onClick={() => router.push("/admin/departments")} className="rounded-lg border border-[#dfe4ef] px-3 py-1.5 text-xs font-bold text-[#4b587d]">Open</button>
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-[150px_1fr] xl:grid-cols-1">
              <div className="pie-3d relative mx-auto grid h-[150px] w-[150px] place-items-center rounded-full" style={{ background: distributionGradient(dashboard.departmentDistribution) }}>
                <div className="z-10 grid h-[104px] w-[104px] place-items-center rounded-full bg-white text-center shadow-[inset_0_8px_18px_rgba(15,23,42,0.08),0_8px_20px_rgba(255,255,255,0.9)]">
                  <div>
                    <p className="text-[26px] font-black leading-none text-[#071035]">{dashboard.stats.departments}</p>
                    <p className="mt-1 text-[11px] font-bold text-[#637091]">Departments</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                {dashboard.departmentDistribution.length > 0 ? (
                  dashboard.departmentDistribution.map((item, index) => (
                    <button key={item.id} onClick={() => router.push("/admin/departments")} className="flex w-full items-center gap-3 text-left text-sm font-semibold text-[#4b587d] hover:text-primary">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="font-black text-[#111936]">{item.percent}%</span>
                    </button>
                  ))
                ) : (
                  <EmptyState message="No departments yet." />
                )}
              </div>
            </div>
          </Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr_0.75fr]">
          <Card className="rounded-lg border-[#e7ebf5] p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-black text-[#111936]">Department Performance</h2>
              <button onClick={() => router.push("/admin/reports")} className="text-xs font-black text-[#4f46e5]">View Report</button>
            </div>
            <div className="space-y-4">
              {dashboard.departmentPerformance.length > 0 ? (
                dashboard.departmentPerformance.map((dept, index) => (
                  <button key={dept.id} onClick={() => router.push("/admin/departments")} className="grid w-full grid-cols-[28px_1fr_110px_42px] items-center gap-3 text-left sm:grid-cols-[28px_1fr_140px_42px]">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#eef2ff] text-xs font-black text-[#4f46e5]">{index + 1}</span>
                    <span className="min-w-0 truncate text-sm font-bold text-[#111936]">{dept.name}</span>
                    <span className="h-2 rounded-full bg-[#edf0f7]">
                      <span className="block h-full rounded-full bg-[#4f46e5]" style={{ width: `${dept.percent}%` }} />
                    </span>
                    <span className="text-right text-sm font-black text-[#111936]">{dept.percent}%</span>
                  </button>
                ))
              ) : (
                <EmptyState message="No department task data yet." />
              )}
            </div>
          </Card>

          <Card className="rounded-lg border-[#e7ebf5] p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-black text-[#111936]">Recent Activity</h2>
              <button onClick={() => router.push("/admin/audit")} className="text-xs font-black text-[#4f46e5]">View All</button>
            </div>
            <div className="space-y-4">
              {dashboard.recentActivity.length > 0 ? (
                dashboard.recentActivity.map((item) => (
                  <button key={item.id} onClick={() => router.push("/admin/audit")} className="flex w-full items-center gap-3 text-left">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eef4ff] text-[#4f46e5]">{icon(icons.shield, "h-4 w-4")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-[#111936]">{item.title}</span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-[#7180a6]">{timeAgo(item.createdAt)}</span>
                    </span>
                  </button>
                ))
              ) : (
                <EmptyState message="No activity recorded yet." />
              )}
            </div>
          </Card>

          <Card className="rounded-lg border-[#e7ebf5] p-5">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-black text-[#111936]">Upcoming Meetings</h2>
              <button onClick={() => router.push("/admin/meetings")} className="rounded-lg bg-[#f0edff] px-3 py-1.5 text-xs font-black text-[#4f46e5]">Open</button>
            </div>
            <div className="space-y-4">
              {dashboard.upcomingMeetings.length > 0 ? (
                dashboard.upcomingMeetings.map((meeting) => {
                  const starts = new Date(meeting.startsAt);
                  const time = starts.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={meeting.id} className="rounded-lg border border-[#eef1f7] bg-[#fbfcff] p-4">
                      <p className="text-xs font-black uppercase text-[#637091]">{starts.toLocaleDateString(undefined, { month: "short", day: "2-digit" })}</p>
                      <p className="mt-2 text-sm font-black text-[#111936]">{meeting.title}</p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-[#7180a6]">{time}</p>
                        <button onClick={() => (meeting.joinUrl ? window.open(meeting.joinUrl, "_blank") : router.push("/admin/meetings"))} className="h-8 rounded-lg border border-[#dfe4ef] px-3 text-xs font-bold text-[#4f46e5]">Join</button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState message="No upcoming meetings." />
              )}
            </div>
          </Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.65fr_0.75fr]">
          <Card className="rounded-lg border-[#e7ebf5] p-5">
            <div className="border-b border-[#e9edf6] pb-4">
              <h2 className="text-base font-black text-[#111936]">Pending Approvals</h2>
              <div className="mt-4 flex flex-wrap gap-4 text-xs font-bold">
                {(["request", "leave", "access"] as ApprovalKind[]).map((item) => (
                  <button key={item} onClick={() => setApprovalTab(item)} className={approvalTab === item ? "border-b-2 border-[#4f46e5] pb-2 capitalize text-[#4f46e5]" : "pb-2 capitalize text-[#637091]"}>
                    {item}s ({dashboard.pendingApprovals.filter((approval) => approval.kind === item).length})
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {filteredApprovals.length > 0 ? (
                filteredApprovals.map((approval) => (
                  <button key={approval.id} onClick={() => router.push(approval.href)} className="grid w-full grid-cols-[18px_1fr_74px] items-center gap-3 text-left sm:grid-cols-[18px_1fr_74px_74px]">
                    <span className="h-4 w-4 rounded border border-[#cfd6e8]" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-[#111936]">{approval.title}</span>
                      <span className="block truncate text-xs font-semibold text-[#7180a6]">{approval.person}</span>
                    </span>
                    <span className="rounded-lg bg-[#fff3dc] px-2 py-1 text-center text-xs font-black text-[#f59e0b]">{approval.priority}</span>
                    <span className="hidden h-8 rounded-lg bg-[#dff7ec] text-center text-xs font-black leading-8 text-[#0f9f6e] sm:block">Review</span>
                  </button>
                ))
              ) : (
                <EmptyState message={`No pending ${approvalTab} approvals.`} />
              )}
            </div>
            <button onClick={() => router.push("/admin/requests")} className="mt-5 w-full text-center text-sm font-black text-[#4f46e5]">View All Requests</button>
          </Card>

          <Card className="rounded-lg border-[#e7ebf5] p-5">
            <div className="flex items-center justify-between border-b border-[#e9edf6] pb-4">
              <h2 className="text-base font-black text-[#111936]">Storage Usage</h2>
              <button onClick={() => router.push("/admin/drive")} className="text-xs font-black text-[#4f46e5]">Manage</button>
            </div>
            <div className="mt-5 grid place-items-center">
              <ProgressCircle
                value={storagePct}
                size={132}
                strokeWidth={11}
                label={
                  <span className="text-center">
                    <span className="block text-[24px] font-black leading-none text-[#071035]">{formatBytes(dashboard.stats.storageUsed)}</span>
                    <span className="mt-1 block text-xs font-bold text-[#637091]">of {formatBytes(dashboard.stats.storageLimit)}</span>
                    <span className="mt-1 block text-[11px] font-black text-[#4f46e5]">{storagePct}% Used</span>
                  </span>
                }
              />
            </div>
            <div className="mt-5 space-y-2 text-xs font-semibold">
              {dashboard.storageBreakdown.length > 0 ? (
                dashboard.storageBreakdown.map((item, index) => (
                  <div key={item.label} className="flex items-center gap-2 text-[#637091]">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                    <span className="flex-1">{item.label}</span>
                    <span className="font-black text-[#111936]">{formatBytes(item.bytes)}</span>
                  </div>
                ))
              ) : (
                <EmptyState message="No files tracked yet." />
              )}
            </div>
          </Card>

          <Card className="rounded-lg border-[#e7ebf5] p-5">
            <h2 className="border-b border-[#e9edf6] pb-4 text-base font-black text-[#111936]">Quick Actions</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                { label: "Add User", path: "/admin/users", icon: icons.plusUser },
                { label: "Create Task", path: "/admin/tasks", icon: icons.task },
                { label: "Send Notice", path: "/admin/announcements", icon: icons.megaphone },
                { label: "View Calendar", path: "/admin/calendar", icon: icons.calendar },
              ].map((action) => (
                <button key={action.label} onClick={() => router.push(action.path)} className="group flex min-h-[90px] flex-col items-center justify-center gap-3 rounded-lg border border-[#eef1f7] bg-[#f8faff] p-3 text-center transition hover:border-[#c9c3ff] hover:bg-[#f4f1ff]">
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-white text-[#24304f] shadow-ds-sm transition group-hover:bg-[#4f46e5] group-hover:text-white">{icon(action.icon, "h-5 w-5")}</span>
                  <span className="text-xs font-black text-[#4b587d]">{action.label}</span>
                </button>
              ))}
            </div>
            <Button className="mt-5 w-full" onClick={() => router.push("/admin/drive")}>Manage Storage</Button>
          </Card>
        </section>

        <section className="rounded-lg border border-[#e2e7f2] bg-white p-5 shadow-[0_12px_32px_rgba(27,42,94,0.05)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-[#ece8ff] text-[#4f46e5]">{icon(icons.shield)}</span>
              <div>
                <h2 className="text-base font-black text-[#111936]">{dashboard.stats.teamGoalPercent}% of tracked tasks are complete.</h2>
                <p className="mt-1 text-sm font-semibold text-[#637091]">This score updates from your company task records.</p>
              </div>
            </div>
            {dashboard.teamMembers.length > 0 ? (
              <AvatarGroup people={dashboard.teamMembers.map((member) => ({ name: member.name, src: member.avatarUrl ?? undefined }))} size="md" />
            ) : (
              <span className="text-sm font-semibold text-[#7180a6]">No active team members yet.</span>
            )}
          </div>
        </section>

        <CalendarRangeModal
          open={calendarOpen}
          value={dateRange}
          onClose={() => setCalendarOpen(false)}
          onApply={(range) => {
            setDateRange(range);
            setCalendarOpen(false);
          }}
        />
      </div>
    </AppShell>
  );
}
