"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AttendancePanel } from "@/components/attendance-panel";
import { NotificationPanel } from "@/components/notification-panel";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  company_id: string;
};

type Company = {
  id: string;
  name: string;
};

type Department = {
  id: string;
  name: string;
  company_id: string;
};

type TaskRow = {
  status: string;
  due_date: string | null;
};

type TaskCounts = {
  total: number;
  pending: number;
  in_progress: number;
  submitted: number;
  approved: number;
  rejected: number;
  completed: number;
  overdue: number;
};

const emptyTaskCounts: TaskCounts = {
  total: 0,
  pending: 0,
  in_progress: 0,
  submitted: 0,
  approved: 0,
  rejected: 0,
  completed: 0,
  overdue: 0,
};

function countTasks(tasks: TaskRow[]): TaskCounts {
  const today = new Date().toISOString().split("T")[0];

  return {
    total: tasks.length,
    pending: tasks.filter((task) => task.status === "pending").length,
    in_progress: tasks.filter((task) => task.status === "in_progress").length,
    submitted: tasks.filter((task) => task.status === "submitted").length,
    approved: tasks.filter((task) => task.status === "approved").length,
    rejected: tasks.filter((task) => task.status === "rejected").length,
    completed: tasks.filter((task) => task.status === "completed").length,
    overdue: tasks.filter(
      (task) =>
        task.due_date &&
        task.due_date < today &&
        task.status !== "completed"
    ).length,
  };
}

const statCards = [
  { key: "total", label: "Total Tasks", color: "text-white" },
  { key: "pending", label: "Pending", color: "text-yellow-300" },
  { key: "in_progress", label: "In Progress", color: "text-cyan-300" },
  { key: "submitted", label: "Submitted", color: "text-blue-300" },
  { key: "approved", label: "Approved", color: "text-green-300" },
  { key: "rejected", label: "Rejected", color: "text-red-300" },
  { key: "completed", label: "Completed", color: "text-emerald-300" },
  { key: "overdue", label: "Overdue", color: "text-red-400" },
] as const;

function StatusCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 text-center shadow-2xl">
        <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>
        <h1 className="mt-3 text-2xl font-bold">{title}</h1>
        <div className="mt-4 text-slate-300">{children}</div>
        {action && <div className="mt-6">{action}</div>}
      </section>
    </main>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [taskCounts, setTaskCounts] = useState<TaskCounts>(emptyTaskCounts);

  useEffect(() => {
    async function loadDashboard() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(currentUser);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, company_id")
        .eq("id", currentUser.id)
        .single();

      if (!profileData) {
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const { data: companyData } = await supabase
        .from("companies")
        .select("id, name")
        .eq("id", profileData.company_id)
        .single();

      if (!companyData) {
        setLoading(false);
        return;
      }

      setCompany(companyData);

      const { data: departmentData } = await supabase
        .from("departments")
        .select("id, name, company_id")
        .eq("company_id", profileData.company_id)
        .order("name");

      setDepartments(departmentData ?? []);

      const { data: taskData } = await supabase
        .from("tasks")
        .select("status, due_date")
        .eq("company_id", profileData.company_id);

      setTaskCounts(countTasks(taskData ?? []));
      setLoading(false);
    }

    loadDashboard();
  }, []);

  async function handleSignOut() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.access_token) {
      await fetch("/api/attendance/login", { method: "POST", headers: { Authorization: `Bearer ${sessionData.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    }
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-slate-300">Loading dashboard...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <StatusCard
        title="Please login to continue"
        action={
          <Link
            href="/login"
            className="inline-block rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950"
          >
            Go to Login
          </Link>
        }
      >
        <p>Sign in to access your FlowDesk workspace dashboard.</p>
      </StatusCard>
    );
  }

  if (!profile) {
    return (
      <StatusCard
        title="Profile setup pending"
        action={
          <button
            onClick={handleSignOut}
            className="rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white"
          >
            Sign Out
          </button>
        }
      >
        <p>Signed in as:</p>
        <p className="mt-2 font-semibold text-white">{user.email}</p>
        <p className="mt-4 text-sm text-slate-400">
          Your admin needs to create your profile before you can use the
          dashboard.
        </p>
      </StatusCard>
    );
  }

  if (!company) {
    return (
      <StatusCard
        title="Company setup pending"
        action={
          <button
            onClick={handleSignOut}
            className="rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white"
          >
            Sign Out
          </button>
        }
      >
        <p>Your profile exists, but your company is not set up yet.</p>
        <p className="mt-4 text-sm text-slate-400">
          Please contact your admin to finish company setup.
        </p>
      </StatusCard>
    );
  }

  const displayName =
    profile.full_name || profile.email || user.email || "User";
  const displayEmail = profile.email || user.email || "";
  const displayRole = profile.role || "Member";

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-6 border-b border-white/10 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>
            <h1 className="mt-1 text-3xl font-bold">Dashboard</h1>
            <p className="mt-2 text-slate-300">{company.name}</p>
          </div>

          <div className="flex flex-col gap-4 sm:items-end">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="font-semibold">{displayName}</p>
              <p className="text-sm text-slate-400">{displayEmail}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-cyan-300">
                {displayRole}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:border-red-400/50 hover:text-red-300"
            >
              Sign Out
            </button>
          </div>
        </header>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/tasks/new"
            className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950"
          >
            Create Task
          </Link>
          <Link
            href="/tasks"
            className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white"
          >
            View Tasks
          </Link>
          {["admin", "owner", "manager"].includes(profile.role ?? "") && (
            <>
              <Link href="/reviews" className="rounded-xl border border-blue-400/40 px-5 py-3 text-sm font-semibold text-blue-200">Review Queue</Link>
              <Link href="/reports" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white">Workload Reports</Link>
              <Link href="/meetings" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white">Meetings</Link>
              <Link href="/settings/organization" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white">Organization Settings</Link>
              <Link href="/settings/people" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white">People & Permissions</Link>
              {profile.role === "admin" && <Link href="/settings/registrations" className="rounded-xl border border-cyan-400/40 px-5 py-3 text-sm font-semibold text-cyan-200">Registration Requests</Link>}
              {profile.role === "admin" && <Link href="/settings/audit" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white">Access Audit</Link>}
              <Link href="/attendance" className="rounded-xl border border-cyan-400/40 px-5 py-3 text-sm font-semibold text-cyan-200">Attendance</Link>
            </>
          )}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.key}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <p className="text-sm text-slate-400">{card.label}</p>
              <p className={`mt-2 text-3xl font-bold ${card.color}`}>
                {taskCounts[card.key]}
              </p>
            </div>
          ))}
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-semibold">Departments</h2>
          <p className="mt-1 text-sm text-slate-400">
            Teams in your company workspace
          </p>

          {departments.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-400">
              No departments found for this company.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {departments.map((department) => (
                <div
                  key={department.id}
                  className="rounded-2xl border border-white/10 bg-slate-900 p-5"
                >
                  <p className="text-sm text-slate-400">Department</p>
                  <h3 className="mt-2 text-lg font-semibold">
                    {department.name}
                  </h3>
                </div>
              ))}
            </div>
          )}
        </section>

        <AttendancePanel
          userId={profile.id}
          companyId={profile.company_id}
          canManage={["admin", "owner", "manager"].includes(profile.role ?? "")}
        />
        <NotificationPanel />
        <div className="mt-8"><Link href="/account" className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">Account & security</Link></div>
      </section>
    </main>
  );
}
