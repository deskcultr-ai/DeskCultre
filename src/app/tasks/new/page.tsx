"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  company_id: string;
  full_name: string | null;
  email: string;
  role: string | null;
};

type Department = {
  id: string;
  name: string;
};

type Assignee = {
  id: string;
  full_name: string | null;
  email: string;
};

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:opacity-60";

export default function NewTaskPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    async function loadFormData() {
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
        .select("id, company_id, full_name, email, role")
        .eq("id", currentUser.id)
        .single();

      if (!profileData) {
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const { data: departmentData } = await supabase
        .from("departments")
        .select("id, name")
        .eq("company_id", profileData.company_id)
        .order("name");

      setDepartments(departmentData ?? []);

      const { data: assigneeData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("company_id", profileData.company_id)
        .eq("is_active", true)
        .order("full_name");

      setAssignees(assigneeData ?? []);
      setLoading(false);
    }

    loadFormData();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || !profile) {
      return;
    }

    setSubmitting(true);
    setError("");

    const { error: insertError } = await supabase.from("tasks").insert({
      company_id: profile.company_id,
      title: title.trim(),
      description: description.trim() || null,
      department_id: departmentId || null,
      assigned_to: assignedTo || null,
      priority,
      due_date: dueDate || null,
      created_by: user.id,
      status: "pending",
    });

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/tasks");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-slate-300">Loading form...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 text-center shadow-2xl">
          <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>
          <h1 className="mt-3 text-2xl font-bold">Please login to continue</h1>
          <p className="mt-3 text-slate-300">
            Sign in to create tasks for your company.
          </p>
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
          <p className="mt-4 text-sm text-slate-400">
            Your admin needs to create your profile before you can create
            tasks.
          </p>
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
      <section className="mx-auto max-w-2xl">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>
            <h1 className="mt-1 text-3xl font-bold">Create Task</h1>
            <p className="mt-2 text-slate-400">
              Add a new task for your company workspace.
            </p>
          </div>
          <Link
            href="/tasks"
            className="rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold text-white"
          >
            Back to Tasks
          </Link>
        </header>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <label className="text-sm text-slate-300">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Prepare monthly sales report"
              disabled={submitting}
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-sm text-slate-300">Description</label>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add task details, instructions, or notes..."
              rows={4}
              disabled={submitting}
              className={inputClass}
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="text-sm text-slate-300">Department</label>
              <select
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                disabled={submitting}
                className={inputClass}
              >
                <option value="">No department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-slate-300">Assignee</label>
              <select
                value={assignedTo}
                onChange={(event) => setAssignedTo(event.target.value)}
                disabled={submitting}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {assignees.map((assignee) => (
                  <option key={assignee.id} value={assignee.id}>
                    {assignee.full_name || assignee.email}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="text-sm text-slate-300">Priority</label>
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                disabled={submitting}
                className={inputClass}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-slate-300">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={submitting}
                className={inputClass}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {submitting ? "Creating task..." : "Create Task"}
          </button>
        </form>
      </section>
    </main>
  );
}
