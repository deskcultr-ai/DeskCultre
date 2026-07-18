"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Alert, Badge, Card } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { displayName, getProfile, type Profile } from "@/lib/session";

type DashboardTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  departmentName: string | null;
  dueDate: string | null;
  createdAt: string;
};
type DashboardRequest = {
  id: string;
  title: string;
  status: string;
  priority: string;
  toDepartmentName: string | null;
  createdAt: string;
};
type Department = {
  id: string;
  name: string;
  description: string | null;
  bio: string | null;
  memberCount: number;
};
type DashboardData = {
  stats: {
    myTasks: number;
    completedTasks: number;
    myRequests: number;
    departmentMessages: number;
  };
  tasks: DashboardTask[];
  requests: DashboardRequest[];
  departments: Department[];
};

const emptyData: DashboardData = {
  stats: { myTasks: 0, completedTasks: 0, myRequests: 0, departmentMessages: 0 },
  tasks: [],
  requests: [],
  departments: [],
};

const priorityTone: Record<string, "danger" | "warning" | "success" | "neutral"> = {
  urgent: "danger",
  high: "danger",
  medium: "warning",
  low: "success",
};

function dateLabel(value: string | null) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statIcon(path: string) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

export default function EmployeeDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_employee_dashboard_data");
    if (rpcError) {
      setError(rpcError.message);
      setData(emptyData);
    } else {
      setData({ ...emptyData, ...(rpcData as DashboardData) });
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    ["/chats", "/tasks", "/requests"].forEach((href) => router.prefetch(href));
  }, [router]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  }, []);

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading employee dashboard...</main>;
  }

  return (
    <AppShell
      profile={profile}
      title={`${greeting}, ${displayName(profile)}!`}
      subtitle="Stay productive and keep your tasks moving forward."
      actions={
        <span className="hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 sm:inline">
          {new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        </span>
      }
    >
      <div className="space-y-6">
        {error && <Alert tone="danger" onClose={() => setError("")}>{error}</Alert>}

        <section className="rounded-[28px] border border-[#dbe3ff] bg-[linear-gradient(135deg,#eef2ff_0%,#f8fbff_58%,#ffffff_100%)] p-5 shadow-[0_20px_60px_rgba(79,70,229,0.10)] sm:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-[#071035] sm:text-3xl">{greeting}, {displayName(profile)}!</h2>
              <p className="mt-2 text-sm font-semibold text-[#526184]">Your personal workspace is ready.</p>
            </div>
            <Link href="/tasks" className="inline-flex h-10 items-center justify-center rounded-lg bg-[#5b36f2] px-4 text-sm font-black text-white shadow-[0_12px_28px_rgba(91,54,242,0.24)]">
              View Tasks
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="My Tasks" value={data.stats.myTasks} helper="Open work" tone="bg-[#ece8ff] text-[#4f46e5]" icon={statIcon("M9 12.75 11.25 15 15 9.75M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z")} href="/tasks" />
          <Stat label="Completed" value={data.stats.completedTasks} helper="Finished tasks" tone="bg-[#e8f8ef] text-[#08764f]" icon={statIcon("M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z")} href="/tasks" />
          <Stat label="Requests" value={data.stats.myRequests} helper="Created by you" tone="bg-[#fff4df] text-[#a54f00]" icon={statIcon("M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859")} href="/requests" />
          <Stat label="Messages" value={data.stats.departmentMessages} helper="Last 24 hours" tone="bg-[#eaf1ff] text-[#2458d3]" icon={statIcon("M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163")} href="/chats" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.3fr_0.9fr]">
          <Card className="rounded-xl border-[#dfe6f3] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-black text-[#071035]">My Tasks</h3>
              <Link href="/tasks" className="text-sm font-black text-[#5b36f2]">View all</Link>
            </div>
            <div className="space-y-3">
              {data.tasks.length === 0 && <Empty message="No open tasks assigned to you." />}
              {data.tasks.map((task) => (
                <Link key={task.id} href="/tasks" className="block rounded-lg border border-[#edf0f7] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#c9c2ff] hover:shadow-[0_16px_36px_rgba(40,55,105,0.10)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-[#071035]">{task.title}</p>
                      <p className="mt-1 text-xs font-semibold text-[#526184]">{task.departmentName ?? "General"} - {dateLabel(task.dueDate)}</p>
                    </div>
                    <Badge tone={priorityTone[task.priority] ?? "neutral"} className="capitalize">{task.priority}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="rounded-xl border-[#dfe6f3] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-black text-[#071035]">Requests</h3>
              <Link href="/requests" className="text-sm font-black text-[#5b36f2]">New request</Link>
            </div>
            <div className="space-y-3">
              {data.requests.length === 0 && <Empty message="No requests created yet." />}
              {data.requests.map((request) => (
                <Link key={request.id} href="/requests" className="block rounded-lg border border-[#edf0f7] bg-white p-4 hover:bg-[#fbfcff]">
                  <p className="font-black text-[#071035]">{request.title}</p>
                  <p className="mt-1 text-xs font-semibold text-[#526184]">{request.toDepartmentName ?? "Any department"}</p>
                  <Badge tone={request.status === "completed" ? "success" : request.status === "rejected" ? "danger" : "warning"} className="mt-3 capitalize">{request.status.replace("_", " ")}</Badge>
                </Link>
              ))}
            </div>
          </Card>
        </section>

        <Card className="rounded-xl border-[#dfe6f3] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-black text-[#071035]">Department Channels</h3>
            <Link href="/chats" className="text-sm font-black text-[#5b36f2]">Open chats</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.departments.map((department) => (
              <Link key={department.id} href="/chats" className="rounded-lg border border-[#edf0f7] bg-[#fbfcff] p-4 transition hover:border-[#c9c2ff]">
                <p className="font-black text-[#071035]">{department.name}</p>
                <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-[#526184]">{department.bio || department.description || "Department discussion channel."}</p>
                <p className="mt-3 text-xs font-black text-[#5b36f2]">{department.memberCount} members</p>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, helper, tone, icon, href }: { label: string; value: number; helper: string; tone: string; icon: React.ReactNode; href: string }) {
  return (
    <Link href={href}>
      <Card className="min-h-[132px] rounded-xl border-[#dfe6f3] p-5 transition hover:-translate-y-0.5 hover:border-[#bdb5ff] hover:shadow-[0_18px_42px_rgba(40,55,105,0.12)]">
        <div className="flex items-start justify-between gap-4">
          <span className={`grid h-12 w-12 place-items-center rounded-lg ${tone}`}>{icon}</span>
          <span className="text-right">
            <span className="block text-[12px] font-black uppercase tracking-wide text-[#526184]">{label}</span>
            <span className="mt-2 block text-[30px] font-black leading-none text-[#071035]">{value}</span>
          </span>
        </div>
        <p className="mt-5 text-xs font-black text-[#08764f]">{helper}</p>
      </Card>
    </Link>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="rounded-lg border border-dashed border-[#dfe6f3] p-5 text-center text-sm font-bold text-[#526184]">{message}</p>;
}
