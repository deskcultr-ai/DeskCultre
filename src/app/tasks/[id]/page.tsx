"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  company_id: string;
  full_name: string | null;
  email: string;
  role: string | null;
  can_review_tasks: boolean;
};

type Person = {
  id: string;
  full_name: string | null;
  email: string;
};

type Task = {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  department_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  approved_by: string | null;
  due_date: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  completed_at: string | null;
  created_at: string;
  task_type: string;
  brand_id: string | null;
  channel_id: string | null;
  team_id: string | null;
  start_date: string | null;
  recurrence_end_date: string | null;
  next_recurrence_on: string | null;
};

type Tag = { id: string; name: string; color: string };
type TaskFile = { id: string; file_name: string; file_url: string; file_type: string | null; signedUrl?: string };

type TaskComment = {
  id: string;
  user_id: string | null;
  comment: string;
  created_at: string;
};

type TaskApproval = {
  id: string;
  user_id: string | null;
  decision: string;
  created_at: string;
};

type TaskActivity = {
  id: string;
  user_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

type TimelineItem = {
  id: string;
  type: "comment" | "approval" | "activity";
  created_at: string;
  userName: string;
  title: string;
  body?: string;
};

const statusStyles: Record<string, string> = {
  pending: "bg-yellow-400/10 text-yellow-300",
  in_progress: "bg-cyan-400/10 text-cyan-300",
  submitted: "bg-blue-400/10 text-blue-300",
  approved: "bg-green-400/10 text-green-300",
  rejected: "bg-red-400/10 text-red-300",
  completed: "bg-emerald-400/10 text-emerald-300",
  assigned: "bg-indigo-400/10 text-indigo-300",
  waiting: "bg-amber-400/10 text-amber-300",
  blocked: "bg-orange-400/10 text-orange-300",
  under_review: "bg-blue-400/10 text-blue-300",
  rework: "bg-red-400/10 text-red-300",
  reopened: "bg-purple-400/10 text-purple-300",
};

const priorityStyles: Record<string, string> = {
  low: "bg-slate-400/10 text-slate-300",
  medium: "bg-cyan-400/10 text-cyan-300",
  high: "bg-orange-400/10 text-orange-300",
  urgent: "bg-red-400/10 text-red-300",
};

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:opacity-60";

function formatStatus(status: string) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(date: string | null) {
  if (!date) return "No due date";

  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function personName(person: Person | null) {
  if (!person) return "Unknown";
  return person.full_name || person.email;
}

function isManagerOrAdmin(role: string | null) {
  return role === "admin" || role === "owner" || role === "manager";
}

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [commentLoading, setCommentLoading] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [task, setTask] = useState<Task | null>(null);

  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const [assignee, setAssignee] = useState<Person | null>(null);
  const [creator, setCreator] = useState<Person | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [brandName, setBrandName] = useState<string | null>(null);
  const [channelName, setChannelName] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [escalationReason, setEscalationReason] = useState("");
  const [escalationSeverity, setEscalationSeverity] = useState("high");

  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [transitionComment, setTransitionComment] = useState("");

  const buildTimeline = useCallback(
    (
      commentRows: TaskComment[],
      approvalRows: TaskApproval[],
      activityRows: TaskActivity[],
      profileMap: Record<string, Person>
    ) => {
      const items: TimelineItem[] = [];

      for (const comment of commentRows) {
        items.push({
          id: `comment-${comment.id}`,
          type: "comment",
          created_at: comment.created_at,
          userName: comment.user_id
            ? personName(profileMap[comment.user_id] ?? null)
            : "Unknown",
          title: "Comment",
          body: comment.comment,
        });
      }

      for (const approval of approvalRows) {
        items.push({
          id: `approval-${approval.id}`,
          type: "approval",
          created_at: approval.created_at,
          userName: approval.user_id
            ? personName(profileMap[approval.user_id] ?? null)
            : "Unknown",
          title: `Approval: ${formatStatus(approval.decision)}`,
        });
      }

      for (const activity of activityRows) {
        items.push({
          id: `activity-${activity.id}`,
          type: "activity",
          created_at: activity.created_at,
          userName: activity.user_id
            ? personName(profileMap[activity.user_id] ?? null)
            : "Unknown",
          title: formatStatus(activity.action),
          body: activity.details ? JSON.stringify(activity.details) : undefined,
        });
      }

      items.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setTimeline(items);
    },
    []
  );

  const loadTaskData = useCallback(async () => {
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
      .select("id, company_id, full_name, email, role, can_review_tasks")
      .eq("id", currentUser.id)
      .single();

    if (!profileData) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setProfile(profileData);

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select(
        "id, company_id, title, description, status, priority, department_id, assigned_to, created_by, approved_by, due_date, submitted_at, approved_at, rejected_at, completed_at, created_at, task_type, brand_id, channel_id, team_id, start_date, recurrence_end_date, next_recurrence_on"
      )
      .eq("id", taskId)
      .single();

    if (taskError || !taskData) {
      setTask(null);
      setError(taskError?.message ?? "Task not found.");
      setLoading(false);
      return;
    }

    if (taskData.company_id !== profileData.company_id) {
      setTask(null);
      setError("You do not have access to this task.");
      setLoading(false);
      return;
    }

    setTask(taskData);

    const [departmentResult, brandResult, channelResult, teamResult] = await Promise.all([
      taskData.department_id ? supabase.from("departments").select("name").eq("id", taskData.department_id).single() : Promise.resolve({ data: null }),
      taskData.brand_id ? supabase.from("brands").select("name").eq("id", taskData.brand_id).single() : Promise.resolve({ data: null }),
      taskData.channel_id ? supabase.from("channels").select("name").eq("id", taskData.channel_id).single() : Promise.resolve({ data: null }),
      taskData.team_id ? supabase.from("teams").select("name").eq("id", taskData.team_id).single() : Promise.resolve({ data: null }),
    ]);
    setDepartmentName(departmentResult.data?.name ?? null);
    setBrandName(brandResult.data?.name ?? null);
    setChannelName(channelResult.data?.name ?? null);
    setTeamName(teamResult.data?.name ?? null);

    const { data: companyProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("company_id", profileData.company_id);

    const profileMap: Record<string, Person> = {};

    for (const companyProfile of companyProfiles ?? []) {
      profileMap[companyProfile.id] = companyProfile;
    }

    setAssignee(
      taskData.assigned_to ? profileMap[taskData.assigned_to] ?? null : null
    );

    setCreator(
      taskData.created_by ? profileMap[taskData.created_by] ?? null : null
    );

    const [commentsResult, approvalsResult, activitiesResult, tagAssignmentsResult, filesResult] =
      await Promise.all([
        supabase
          .from("task_comments")
          .select("id, user_id, comment, created_at")
          .eq("task_id", taskId)
          .order("created_at", { ascending: false }),
        supabase
          .from("task_approvals")
          .select("id, user_id, decision, created_at")
          .eq("task_id", taskId)
          .order("created_at", { ascending: false }),
        supabase
          .from("task_activity")
          .select("id, user_id, action, details, created_at")
          .eq("task_id", taskId)
          .order("created_at", { ascending: false }),
        supabase.from("task_tag_assignments").select("tag_id").eq("task_id", taskId),
        supabase.from("task_files").select("id, file_name, file_url, file_type").eq("task_id", taskId).order("created_at", { ascending: false }),
      ]);

    const tagIds = (tagAssignmentsResult.data ?? []).map((assignment) => assignment.tag_id);
    if (tagIds.length) {
      const { data: tagData } = await supabase.from("task_tags").select("id, name, color").in("id", tagIds);
      setTags(tagData ?? []);
    } else setTags([]);
    const fileRows = filesResult.data ?? [];
    const signedFiles = await Promise.all(fileRows.map(async (file) => {
      const { data } = await supabase.storage.from("task-files").createSignedUrl(file.file_url, 3600);
      return { ...file, signedUrl: data?.signedUrl };
    }));
    setFiles(signedFiles);

    buildTimeline(
      commentsResult.data ?? [],
      approvalsResult.data ?? [],
      activitiesResult.data ?? [],
      profileMap
    );

    setLoading(false);
  }, [taskId, buildTimeline]);

  useEffect(() => {
    // Data loading is intentionally client-side because the Supabase session is
    // stored in the browser; state updates happen after the async auth lookup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTaskData();
  }, [loadTaskData]);

  async function handleTransition(nextStatus: string) {
    if (!task || !user || !profile) return;
    if (!transitionComment.trim()) {
      setError("Write a transition comment before changing the status.");
      return;
    }

    setActionLoading(true);
    setError("");

    const { error: transitionError } = await supabase.rpc("transition_task", {
      target_task_id: task.id,
      next_status: nextStatus,
      transition_comment: transitionComment.trim(),
    });

    if (transitionError) {
      setError(transitionError.message);
      setActionLoading(false);
      return;
    }

    setTransitionComment("");
    setActionLoading(false);
    await loadTaskData();
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile || !task || !profile) return;
    if (selectedFile.size > 10 * 1024 * 1024) { setError("Files must be 10 MB or smaller."); return; }
    setUploading(true); setError("");
    const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${profile.company_id}/${task.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("task-files").upload(path, selectedFile, { contentType: selectedFile.type, upsert: false });
    if (uploadError) { setError(uploadError.message); setUploading(false); return; }
    const { error: registerError } = await supabase.rpc("register_task_file", {
      target_task_id: task.id, uploaded_file_name: selectedFile.name, uploaded_file_path: path, uploaded_file_type: selectedFile.type || null,
    });
    if (registerError) { await supabase.storage.from("task-files").remove([path]); setError(registerError.message); setUploading(false); return; }
    event.target.value = ""; setUploading(false); await loadTaskData();
  }

  async function handleCreateDailyOccurrence() {
    if (!task) return;
    setActionLoading(true); setError("");
    const { error: occurrenceError } = await supabase.rpc("create_next_daily_occurrence", { template_task_id: task.id });
    setActionLoading(false);
    if (occurrenceError) { setError(occurrenceError.message); return; }
    await loadTaskData();
  }

  async function handleEscalate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task || !escalationReason.trim()) return;
    setActionLoading(true); setError("");
    const { error: escalationError } = await supabase.rpc("create_task_escalation", { target_task_id: task.id, escalation_severity: escalationSeverity, escalation_reason: escalationReason.trim() });
    setActionLoading(false);
    if (escalationError) { setError(escalationError.message); return; }
    setEscalationReason(""); await loadTaskData();
  }

  async function handleAddComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!task || !user || !profile || !commentText.trim()) return;

    setCommentLoading(true);
    setError("");

    const { error: insertError } = await supabase.from("task_comments").insert({
      task_id: task.id,
      company_id: profile.company_id,
      user_id: user.id,
      comment: commentText.trim(),
    });

    if (insertError) {
      setError(insertError.message);
      setCommentLoading(false);
      return;
    }

    setCommentText("");
    setCommentLoading(false);
    await loadTaskData();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-slate-300">Loading task...</p>
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
            href="/tasks"
            className="mt-6 inline-block rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white"
          >
            Back to Tasks
          </Link>
        </section>
      </main>
    );
  }

  if (!task) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 text-center shadow-2xl">
          <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>
          <h1 className="mt-3 text-2xl font-bold">Task not found</h1>
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          <Link
            href="/tasks"
            className="mt-6 inline-block rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white"
          >
            Back to Tasks
          </Link>
        </section>
      </main>
    );
  }

  const canManage = isManagerOrAdmin(profile.role);
  const canReview = canManage || profile.can_review_tasks;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <section className="mx-auto max-w-4xl">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>
            <h1 className="mt-1 text-2xl font-bold">Task Detail</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/tasks"
              className="rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold text-white"
            >
              Back to Tasks
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold text-white"
            >
              Dashboard
            </Link>
          </div>
        </header>

        <div className="mt-8 rounded-3xl border border-white/10 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold">{task.title}</h2>
              {task.description && (
                <p className="mt-3 text-slate-400">{task.description}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  statusStyles[task.status] ?? "bg-white/10 text-slate-300"
                }`}
              >
                {formatStatus(task.status)}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                  priorityStyles[task.priority] ?? "bg-white/10 text-slate-300"
                }`}
              >
                {task.priority}
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-slate-500">Department</p>
              <p className="mt-1 font-medium">
                {departmentName ?? "No department"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Assignee</p>
              <p className="mt-1 font-medium">{personName(assignee)}</p>
            </div>
            <div>
              <p className="text-slate-500">Created By</p>
              <p className="mt-1 font-medium">{personName(creator)}</p>
            </div>
            <div>
              <p className="text-slate-500">Due Date</p>
              <p className="mt-1 font-medium">{formatDate(task.due_date)}</p>
            </div>
            <div>
              <p className="text-slate-500">Task Type</p>
              <p className="mt-1 font-medium">{formatStatus(task.task_type)}</p>
            </div>
            <div>
              <p className="text-slate-500">Brand</p>
              <p className="mt-1 font-medium">{brandName ?? "No brand"}</p>
            </div>
            <div>
              <p className="text-slate-500">Sales Channel</p>
              <p className="mt-1 font-medium">{channelName ?? "No channel"}</p>
            </div>
            <div>
              <p className="text-slate-500">Team</p>
              <p className="mt-1 font-medium">{teamName ?? "No team"}</p>
            </div>
            {task.start_date && <div><p className="text-slate-500">Start Date</p><p className="mt-1 font-medium">{formatDate(task.start_date)}</p></div>}
            {task.task_type === "daily_recurring" && <div><p className="text-slate-500">Next Occurrence</p><p className="mt-1 font-medium">{formatDate(task.next_recurrence_on)}</p></div>}
          </div>

          {tags.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{tags.map((tag) => <span key={tag.id} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: `${tag.color}22`, color: tag.color }}>{tag.name}</span>)}</div>}

          <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-400 sm:grid-cols-2">
            <p>Submitted: {formatDateTime(task.submitted_at)}</p>
            <p>Approved: {formatDateTime(task.approved_at)}</p>
            <p>Rejected: {formatDateTime(task.rejected_at)}</p>
            <p>Completed: {formatDateTime(task.completed_at)}</p>
          </div>
        </div>

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="font-semibold">Change status</h3>
          <p className="mt-1 text-sm text-slate-400">
            Every workflow change requires a written update for the audit trail.
          </p>
          <textarea
            value={transitionComment}
            onChange={(event) => setTransitionComment(event.target.value)}
            placeholder="Explain what changed, what is blocked, or why you made this decision..."
            rows={3}
            disabled={actionLoading}
            className={inputClass}
          />
          <div className="mt-4 flex flex-wrap gap-3">
          {(task.status === "pending" || task.status === "assigned" || task.status === "reopened") && (
            <button
              onClick={() => handleTransition("in_progress")}
              disabled={actionLoading || !transitionComment.trim()}
              className="rounded-xl bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
            >
              Start Task
            </button>
          )}

          {task.status === "in_progress" && (
            <>
              <button
                onClick={() => handleTransition("blocked")}
                disabled={actionLoading || !transitionComment.trim()}
                className="rounded-xl bg-orange-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Mark Blocked
              </button>
              <button
                onClick={() => handleTransition("under_review")}
                disabled={actionLoading || !transitionComment.trim()}
                className="rounded-xl bg-blue-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Submit for Review
              </button>
            </>
          )}

          {(task.status === "blocked" || task.status === "waiting" || task.status === "rework" || task.status === "rejected") && (
            <button
              onClick={() => handleTransition("in_progress")}
              disabled={actionLoading || !transitionComment.trim()}
              className="rounded-xl bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
            >
              Resume Work
            </button>
          )}

          {canReview && (task.status === "submitted" || task.status === "under_review") && (
            <>
              <button
                onClick={() => handleTransition("approved")}
                disabled={actionLoading || !transitionComment.trim()}
                className="rounded-xl bg-green-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Approve
              </button>
              <button
                onClick={() => handleTransition("rework")}
                disabled={actionLoading || !transitionComment.trim()}
                className="rounded-xl bg-red-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Reject / Rework
              </button>
            </>
          )}

          {canManage && task.status === "approved" && (
            <button
              onClick={() => handleTransition("completed")}
              disabled={actionLoading || !transitionComment.trim()}
              className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Mark Completed
            </button>
          )}

          {canManage && task.status === "completed" && (
            <button
              onClick={() => handleTransition("reopened")}
              disabled={actionLoading || !transitionComment.trim()}
              className="rounded-xl border border-cyan-400/50 px-5 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-60"
            >
              Reopen Task
            </button>
          )}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-orange-400/20 bg-orange-400/5 p-5">
          <h3 className="font-semibold text-orange-200">Escalate blocker</h3>
          <p className="mt-1 text-sm text-slate-400">Flag an important blocker to managers. An in-app notification is created for them.</p>
          <form onSubmit={handleEscalate} className="mt-3 flex flex-col gap-3 sm:flex-row">
            <select value={escalationSeverity} onChange={(event) => setEscalationSeverity(event.target.value)} disabled={actionLoading} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select>
            <input value={escalationReason} onChange={(event) => setEscalationReason(event.target.value)} required placeholder="What needs attention?" disabled={actionLoading} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white" />
            <button disabled={actionLoading} className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">Escalate</button>
          </form>
        </section>

        {canManage && task.task_type === "daily_recurring" && (
          <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <h3 className="font-semibold">Daily recurrence</h3>
            <p className="mt-1 text-sm text-slate-400">Create the next due occurrence when the daily work is ready to be assigned.</p>
            <button onClick={handleCreateDailyOccurrence} disabled={actionLoading} className="mt-4 rounded-xl border border-cyan-400/50 px-5 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-60">Create Next Occurrence</button>
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="font-semibold">Attachments</h3>
          <p className="mt-1 text-sm text-slate-400">PDF, image, Word, or spreadsheet files up to 10 MB.</p>
          <label className="mt-4 inline-flex cursor-pointer rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold text-white">
            {uploading ? "Uploading…" : "Attach File"}
            <input type="file" className="sr-only" disabled={uploading} accept="image/jpeg,image/png,application/pdf,.docx,.xlsx" onChange={handleFileUpload} />
          </label>
          {files.length > 0 ? <div className="mt-4 space-y-2">{files.map((file) => file.signedUrl ? <a key={file.id} href={file.signedUrl} target="_blank" rel="noreferrer" className="block rounded-xl bg-slate-900 px-4 py-3 text-sm text-cyan-200 hover:text-cyan-100">{file.file_name}</a> : <p key={file.id} className="rounded-xl bg-slate-900 px-4 py-3 text-sm text-slate-400">{file.file_name}</p>)}</div> : <p className="mt-4 text-sm text-slate-500">No attachments yet.</p>}
        </section>

        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

        <section className="mt-10">
          <h3 className="text-xl font-semibold">Add Comment</h3>
          <form onSubmit={handleAddComment} className="mt-4">
            <textarea
              value={commentText}
              onChange={(event) => setCommentText(event.target.value)}
              placeholder="Write an update or comment..."
              rows={3}
              disabled={commentLoading}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={commentLoading || !commentText.trim()}
              className="mt-3 rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {commentLoading ? "Adding..." : "Add Comment"}
            </button>
          </form>
        </section>

        <section className="mt-10">
          <h3 className="text-xl font-semibold">Timeline</h3>
          <p className="mt-1 text-sm text-slate-400">
            Comments, approvals, and activity for this task
          </p>

          {timeline.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-400">
              No activity yet. Start the task or add a comment.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {timeline.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-white/10 bg-slate-900 p-5"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{item.title}</p>
                      <p className="text-sm text-slate-400">
                        {item.userName} • {formatDateTime(item.created_at)}
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-xs capitalize text-slate-300">
                      {item.type}
                    </span>
                  </div>
                  {item.body && (
                    <p className="mt-3 text-sm text-slate-300">{item.body}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
