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
};

type TaskComment = {
  id: string;
  user_id: string;
  comment: string;
  created_at: string;
};

type TaskApproval = {
  id: string;
  user_id: string;
  decision: string;
  created_at: string;
};

type TaskActivity = {
  id: string;
  user_id: string;
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
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function personName(person: Person | null) {
  if (!person) {
    return "Unknown";
  }

  return person.full_name || person.email;
}

function isManagerOrAdmin(role: string | null) {
  return role === "admin" || role === "manager";
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
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");

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
          userName: personName(profileMap[comment.user_id] ?? null),
          title: "Comment",
          body: comment.comment,
        });
      }

      for (const approval of approvalRows) {
        items.push({
          id: `approval-${approval.id}`,
          type: "approval",
          created_at: approval.created_at,
          userName: personName(profileMap[approval.user_id] ?? null),
          title: `Approval: ${formatStatus(approval.decision)}`,
        });
      }

      for (const activity of activityRows) {
        const detailText = activity.details
          ? JSON.stringify(activity.details)
          : undefined;

        items.push({
          id: `activity-${activity.id}`,
          type: "activity",
          created_at: activity.created_at,
          userName: personName(profileMap[activity.user_id] ?? null),
          title: formatStatus(activity.action),
          body: detailText,
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
    setError("");

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
      .select("id, company_id, full_name, email, role")
      .eq("id", currentUser.id)
      .single();

    if (!profileData) {
      setLoading(false);
      return;
    }

    setProfile(profileData);

    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select(
        "id, company_id, title, description, status, priority, department_id, assigned_to, created_by, approved_by, due_date, submitted_at, approved_at, rejected_at, completed_at, created_at"
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

    if (taskData.department_id) {
      const { data: departmentData } = await supabase
        .from("departments")
        .select("name")
        .eq("id", taskData.department_id)
        .single();

      setDepartmentName(departmentData?.name ?? null);
    } else {
      setDepartmentName(null);
    }

    const profileIds = [
      taskData.assigned_to,
      taskData.created_by,
      taskData.approved_by,
    ].filter((id): id is string => Boolean(id));

    const { data: companyProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("company_id", profileData.company_id);

    const profileMap: Record<string, Person> = {};
    for (const companyProfile of companyProfiles ?? []) {
      profileMap[companyProfile.id] = companyProfile;
    }

    setAssignee(
      taskData.assigned_to ? (profileMap[taskData.assigned_to] ?? null) : null
    );
    setCreator(
      taskData.created_by ? (profileMap[taskData.created_by] ?? null) : null
    );

    const [commentsResult, approvalsResult, activitiesResult] =
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
      ]);

    const commentRows = commentsResult.data ?? [];
    const approvalRows = approvalsResult.data ?? [];
    const activityRows = activitiesResult.data ?? [];

    setComments(commentRows);
    setApprovals(approvalRows);
    setActivities(activityRows);
    buildTimeline(commentRows, approvalRows, activityRows, profileMap);
    setLoading(false);
  }, [taskId, buildTimeline]);

  useEffect(() => {
    loadTaskData();
  }, [loadTaskData]);

  async function logActivity(
    action: string,
    details: Record<string, unknown>
  ) {
    if (!profile || !task || !user) {
      return;
    }

    await supabase.from("task_activity").insert({
      company_id: profile.company_id,
      task_id: task.id,
      user_id: user.id,
      action,
      details,
    });
  }

  async function insertApproval(decision: string) {
    if (!profile || !task || !user) {
      return;
    }

    await supabase.from("task_approvals").insert({
      company_id: profile.company_id,
      task_id: task.id,
      user_id: user.id,
      decision,
    });
  }

  async function handleStartTask() {
    if (!task || !user || !profile) {
      return;
    }

    setActionLoading(true);
    setError("");

    const { error: updateError } = await supabase
      .from("tasks")
      .update({ status: "in_progress" })
      .eq("id", task.id);

    if (updateError) {
      setError(updateError.message);
      setActionLoading(false);
      return;
    }

    await logActivity("start_task", {
      from: task.status,
      to: "in_progress",
    });

    setActionLoading(false);
    await loadTaskData();
  }

  async function handleSubmitForApproval() {
    if (!task || !user || !profile) {
      return;
    }

    setActionLoading(true);
    setError("");

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("tasks")
      .update({ status: "submitted", submitted_at: now })
      .eq("id", task.id);

    if (updateError) {
      setError(updateError.message);
      setActionLoading(false);
      return;
    }

    await insertApproval("submitted");
    await logActivity("submit_for_approval", {
      from: task.status,
      to: "submitted",
    });

    setActionLoading(false);
    await loadTaskData();
  }

  async function handleApprove() {
    if (!task || !user || !profile) {
      return;
    }

    setActionLoading(true);
    setError("");

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("tasks")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: now,
      })
      .eq("id", task.id);

    if (updateError) {
      setError(updateError.message);
      setActionLoading(false);
      return;
    }

    await insertApproval("approved");
    await logActivity("approve_task", {
      from: task.status,
      to: "approved",
    });

    setActionLoading(false);
    await loadTaskData();
  }

  async function handleReject() {
    if (!task || !user || !profile) {
      return;
    }

    setActionLoading(true);
    setError("");

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("tasks")
      .update({ status: "rejected", rejected_at: now })
      .eq("id", task.id);

    if (updateError) {
      setError(updateError.message);
      setActionLoading(false);
      return;
    }

    await insertApproval("rejected");
    await logActivity("reject_task", {
      from: task.status,
      to: "rejected",
    });

    setActionLoading(false);
    await loadTaskData();
  }

  async function handleMarkCompleted() {
    if (!task || !user || !profile) {
      return;
    }

    setActionLoading(true);
    setError("");

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("tasks")
      .update({ status: "completed", completed_at: now })
      .eq("id", task.id);

    if (updateError) {
      setError(updateError.message);
      setActionLoading(false);
      return;
    }

    await logActivity("mark_completed", {
      from: task.status,
      to: "completed",
    });

    setActionLoading(false);
    await loadTaskData();
  }

  async function handleAddComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!task || !user || !profile || !commentText.trim()) {
      return;
    }

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
          </div>

          <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-400 sm:grid-cols-2">
            <p>Submitted: {formatDateTime(task.submitted_at)}</p>
            <p>Approved: {formatDateTime(task.approved_at)}</p>
            <p>Rejected: {formatDateTime(task.rejected_at)}</p>
            <p>Completed: {formatDateTime(task.completed_at)}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {task.status === "pending" && (
            <button
              onClick={handleStartTask}
              disabled={actionLoading}
              className="rounded-xl bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
            >
              Start Task
            </button>
          )}

          {(task.status === "in_progress" || task.status === "rejected") && (
            <button
              onClick={handleSubmitForApproval}
              disabled={actionLoading}
              className="rounded-xl bg-blue-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Submit for Approval
            </button>
          )}

          {canManage && task.status === "submitted" && (
            <>
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="rounded-xl bg-green-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Approve
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading}
                className="rounded-xl bg-red-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Reject / Rework
              </button>
            </>
          )}

          {canManage && task.status === "approved" && (
            <button
              onClick={handleMarkCompleted}
              disabled={actionLoading}
              className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Mark Completed
            </button>
          )}
        </div>

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
                        {item.userName} •{" "}
                        {formatDateTime(item.created_at)}
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
