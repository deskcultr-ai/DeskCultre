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
  can_create_tasks: boolean;
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

type OrganizationItem = { id: string; name: string };
type Team = OrganizationItem & { department_id: string | null };
type Tag = OrganizationItem & { color: string };

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
  const [brands, setBrands] = useState<OrganizationItem[]>([]);
  const [channels, setChannels] = useState<OrganizationItem[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState("medium");
  const [taskType, setTaskType] = useState("one_time");
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [brandId, setBrandId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

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
        .select("id, company_id, full_name, email, role, can_create_tasks")
        .eq("id", currentUser.id)
        .single();

      if (!profileData) {
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const [departmentResult, assigneeResult, brandResult, channelResult, teamResult, tagResult] = await Promise.all([
        supabase.from("departments").select("id, name").eq("company_id", profileData.company_id).order("name"),
        supabase.from("profiles").select("id, full_name, email").eq("company_id", profileData.company_id).eq("is_active", true).order("full_name"),
        supabase.from("brands").select("id, name").order("name"),
        supabase.from("channels").select("id, name").eq("company_id", profileData.company_id).eq("is_active", true).order("name"),
        supabase.from("teams").select("id, name, department_id").eq("company_id", profileData.company_id).eq("is_active", true).order("name"),
        supabase.from("task_tags").select("id, name, color").eq("company_id", profileData.company_id).order("name"),
      ]);
      setDepartments(departmentResult.data ?? []);
      setAssignees(assigneeResult.data ?? []);
      setBrands(brandResult.data ?? []); setChannels(channelResult.data ?? []); setTeams(teamResult.data ?? []); setTags(tagResult.data ?? []);
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

    const { error: insertError } = await supabase.rpc("create_task_secure_v2", {
      task_title: title.trim(),
      task_description: description.trim(),
      task_department_id: departmentId || null,
      task_assigned_to: assignedTo || null,
      task_priority: priority,
      task_due_date: dueDate || null,
      requested_task_type: taskType,
      task_brand_id: brandId || null,
      task_channel_id: channelId || null,
      task_team_id: teamId || null,
      requested_start_date: startDate || null,
      requested_recurrence_end_date: recurrenceEndDate || null,
      requested_tag_ids: selectedTagIds,
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

  const canCreateTask =
    ["admin", "owner", "manager"].includes(profile.role ?? "") ||
    profile.can_create_tasks;

  if (!canCreateTask) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 text-center shadow-2xl">
          <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>
          <h1 className="mt-3 text-2xl font-bold">Task creation is restricted</h1>
          <p className="mt-3 text-slate-300">
            A manager can enable task creation for your profile. You can still work on tasks assigned to you.
          </p>
          <Link href="/tasks" className="mt-6 inline-block rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white">
            Back to Tasks
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

          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <label className="text-sm text-slate-300">Brand</label>
              <select value={brandId} onChange={(event) => setBrandId(event.target.value)} disabled={submitting} className={inputClass}>
                <option value="">No brand</option>
                {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-300">Sales Channel</label>
              <select value={channelId} onChange={(event) => setChannelId(event.target.value)} disabled={submitting} className={inputClass}>
                <option value="">No channel</option>
                {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-300">Team</label>
              <select value={teamId} onChange={(event) => setTeamId(event.target.value)} disabled={submitting} className={inputClass}>
                <option value="">No team</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="text-sm text-slate-300">Task Type</label>
              <select
                value={taskType}
                onChange={(event) => setTaskType(event.target.value)}
                disabled={submitting}
                className={inputClass}
              >
                <option value="one_time">One-time</option>
                <option value="daily_recurring">Daily recurring</option>
                <option value="continuous">Continuous multi-day</option>
              </select>
            </div>
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
            <div>
              <label className="text-sm text-slate-300">Start Date</label>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={submitting} className={inputClass} />
            </div>
            {taskType === "daily_recurring" && (
              <div>
                <label className="text-sm text-slate-300">Repeat Until</label>
                <input type="date" value={recurrenceEndDate} onChange={(event) => setRecurrenceEndDate(event.target.value)} disabled={submitting} className={inputClass} />
              </div>
            )}
          </div>

          <fieldset>
            <legend className="text-sm text-slate-300">Tags</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.length === 0 ? <p className="text-sm text-slate-500">Create tags in Organization Settings to use them here.</p> : tags.map((tag) => (
                <label key={tag.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-slate-900 px-3 py-2 text-sm">
                  <input type="checkbox" checked={selectedTagIds.includes(tag.id)} onChange={() => setSelectedTagIds((current) => current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id])} disabled={submitting} />
                  {tag.name}
                </label>
              ))}
            </div>
          </fieldset>

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
