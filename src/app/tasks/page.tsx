"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  company_id: string;
  full_name: string | null;
  email: string;
};

type Department = {
  id: string;
  name: string;
};

type AssigneeProfile = {
  id: string;
  full_name: string | null;
  email: string;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  department_id: string | null;
  assigned_to: string | null;
  due_date: string | null;
  created_at: string;
};

const statusStyles: Record<string, string> = {
  pending: "bg-yellow-400/10 text-yellow-300",
  in_progress: "bg-cyan-400/10 text-cyan-300",
  submitted: "bg-blue-400/10 text-blue-300",
  approved: "bg-green-400/10 text-green-300",
  rejected: "bg-red-400/10 text-red-300",
  completed: "bg-emerald-400/10 text-emerald-300",
};

const priorityStyles: Record<string, string> = {
  low: "text-slate-400",
  medium: "text-cyan-300",
  high: "text-orange-300",
  urgent: "text-red-400",
};

function formatStatus(status: string) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(date: string | null) {
  if (!date) {
    return "No due date";
  }

  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function TasksPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [departmentsById, setDepartmentsById] = useState<
    Record<string, string>
  >({});
  const [assigneesById, setAssigneesById] = useState<
    Record<string, AssigneeProfile>
  >({});

  useEffect(() => {
    async function loadTasks() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        setLoading(false);
        return;
      }

      setUser(currentUser);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, company_id, full_name, email")
        .eq("id", currentUser.id)
        .single();

      if (!profileData) {
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const [tasksResult, departmentsResult, profilesResult] =
        await Promise.all([
          supabase
            .from("tasks")
            .select(
              "id, title, description, status, priority, department_id, assigned_to, due_date, created_at"
            )
            .eq("company_id", profileData.company_id)
            .order("created_at", { ascending: false }),
          supabase
            .from("departments")
            .select("id, name")
            .eq("company_id", profileData.company_id),
          supabase
            .from("profiles")
            .select("id, full_name, email")
            .eq("company_id", profileData.company_id),
        ]);

      setTasks(tasksResult.data ?? []);

      const deptMap: Record<string, string> = {};
      for (const dept of departmentsResult.data ?? []) {
        deptMap[dept.id] = dept.name;
      }
      setDepartmentsById(deptMap);

      const assigneeMap: Record<string, AssigneeProfile> = {};
      for (const assignee of profilesResult.data ?? []) {
        assigneeMap[assignee.id] = assignee;
      }
      setAssigneesById(assigneeMap);

      setLoading(false);
    }

    loadTasks();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-slate-300">Loading tasks...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 text-center shadow-2xl">
          <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>
          <h1 className="mt-3 text-2xl font-bold">Please login to continue</h1>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950"
          >
            Go to Login
          </Link>
        </section>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 text-center shadow-2xl">
          <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>
          <h1 className="mt-3 text-2xl font-bold">Profile setup pending</h1>
          <p className="mt-3 text-slate-300">Signed in as:</p>
          <p className="mt-2 font-semibold">{user.email}</p>
          <Link
            href="/dashboard"
            className="mt-6 inline-block rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white"
          >
            Back to Dashboard
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <section className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>
            <h1 className="mt-1 text-3xl font-bold">Tasks</h1>
            <p className="mt-2 text-slate-400">
              All tasks for your company workspace
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold text-white"
            >
              Dashboard
            </Link>
            <Link
              href="/tasks/new"
              className="rounded-xl bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950"
            >
              Create Task
            </Link>
          </div>
        </header>

        {tasks.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
            <h2 className="text-xl font-semibold">No tasks yet</h2>
            <p className="mt-3 text-slate-400">
              Create your first task to start tracking work across your team.
            </p>
            <Link
              href="/tasks/new"
              className="mt-6 inline-block rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950"
            >
              Create Task
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {tasks.map((task) => {
              const assignee = task.assigned_to
                ? assigneesById[task.assigned_to]
                : null;
              const departmentName = task.department_id
                ? departmentsById[task.department_id]
                : null;

              return (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="block rounded-2xl border border-white/10 bg-slate-900 p-6 transition hover:border-cyan-400/40 hover:bg-slate-800"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold">{task.title}</h2>
                      {task.description && (
                        <p className="mt-2 text-sm text-slate-400">
                          {task.description}
                        </p>
                      )}
                    </div>

                    <span
                      className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                        statusStyles[task.status] ??
                        "bg-white/10 text-slate-300"
                      }`}
                    >
                      {formatStatus(task.status)}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-slate-500">Priority</p>
                      <p
                        className={`mt-1 font-medium capitalize ${
                          priorityStyles[task.priority] ?? "text-slate-300"
                        }`}
                      >
                        {task.priority}
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-500">Department</p>
                      <p className="mt-1 font-medium text-slate-300">
                        {departmentName ?? "No department"}
                      </p>
                    </div>

                    <div>
                      <p className="text-slate-500">Assignee</p>
                      <p className="mt-1 font-medium text-slate-300">
                        {assignee
                          ? assignee.full_name || assignee.email
                          : "Unassigned"}
                      </p>
                      {assignee?.full_name && (
                        <p className="text-xs text-slate-500">
                          {assignee.email}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-slate-500">Due Date</p>
                      <p className="mt-1 font-medium text-slate-300">
                        {formatDate(task.due_date)}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
