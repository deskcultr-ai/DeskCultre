"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isManager, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Avatar, AvatarGroup, Alert, Modal, Select } from "@/components/ui";

type Workspace = { id: string; name: string; description: string | null; is_active: boolean };
type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  assignee_id: string | null;
};
type FileRow = { id: string; name: string; size_bytes: number; updated_at: string };
type Meeting = { id: string; title: string; starts_at: string };
type Member = { id: string; name: string; src?: string };
type Pinned = { id: string; body: string | null; created_at: string; sender: string };

const STATUS_TONE: Record<string, "primary" | "success" | "warning" | "danger" | "neutral"> = {
  in_progress: "primary",
  completed: "success",
  review: "warning",
  overdue: "danger",
  todo: "neutral",
  on_hold: "neutral",
  cancelled: "neutral",
};

function fmtBytes(b: number) {
  if (!b) return "0 KB";
  const mb = b / 1024 ** 2;
  return mb < 1 ? `${Math.round(b / 1024)} KB` : `${mb.toFixed(1)} MB`;
}

function dueLabel(due: string | null) {
  if (!due) return { text: "No due date", tone: "neutral" as const };
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (due < today) return { text: "Overdue", tone: "danger" as const };
  if (due === today) return { text: "Due Today", tone: "danger" as const };
  if (due === tomorrow) return { text: "Due Tomorrow", tone: "warning" as const };
  return { text: new Date(due).toLocaleDateString(undefined, { month: "short", day: "numeric" }), tone: "neutral" as const };
}

const TABS = ["Overview", "Tasks", "Files", "Chat", "Meetings", "Calendar", "Notes", "Approvals", "Activity"];

export default function WorkspaceDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pinned, setPinned] = useState<Pinned[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [candidates, setCandidates] = useState<Member[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const me = await getProfile();
    if (!me) {
      router.replace("/login");
      return;
    }
    if (!me.company_id || me.status !== "active") {
      router.replace("/onboarding");
      return;
    }
    setProfile(me);

    const { data: ws } = await supabase
      .from("workspaces")
      .select("id, name, description, is_active")
      .eq("id", workspaceId)
      .maybeSingle();

    if (!ws) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setWorkspace(ws);

    const [tasksRes, filesRes, meetingsRes, membersRes, channelsRes, peopleRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, assignee_id")
        .eq("workspace_id", workspaceId)
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("drive_files")
        .select("id, name, size_bytes, updated_at")
        .eq("workspace_id", workspaceId)
        .eq("is_trashed", false)
        .order("updated_at", { ascending: false })
        .limit(4),
      supabase
        .from("meetings")
        .select("id, title, starts_at")
        .eq("workspace_id", workspaceId)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(3),
      supabase
        .from("workspace_members")
        .select("profile_id, profiles(id, full_name, first_name, email, avatar_url)")
        .eq("workspace_id", workspaceId),
      supabase.from("chat_channels").select("id").eq("workspace_id", workspaceId),
      supabase
        .from("profiles")
        .select("id, full_name, first_name, email, avatar_url")
        .eq("company_id", me.company_id)
        .eq("status", "active"),
    ]);

    type PJoin = {
      profile_id: string;
      profiles: { id: string; full_name: string | null; first_name: string | null; email: string | null; avatar_url: string | null } | null;
    };
    const memberRows = (membersRes.data ?? []) as unknown as PJoin[];
    const mapped: Member[] = memberRows
      .filter((m) => m.profiles)
      .map((m) => ({
        id: m.profiles!.id,
        name: m.profiles!.full_name || m.profiles!.first_name || m.profiles!.email?.split("@")[0] || "Member",
        src: m.profiles!.avatar_url ?? undefined,
      }));
    setMembers(mapped);

    const memberIds = new Set(mapped.map((m) => m.id));
    setCandidates(
      (peopleRes.data ?? [])
        .filter((p) => !memberIds.has(p.id))
        .map((p) => ({
          id: p.id,
          name: p.full_name || p.first_name || p.email?.split("@")[0] || "Member",
          src: p.avatar_url ?? undefined,
        }))
    );

    setTasks(tasksRes.data ?? []);
    setFiles(filesRes.data ?? []);
    setMeetings(meetingsRes.data ?? []);

    // Pinned messages live on chat_messages within this workspace's channels.
    const channelIds = (channelsRes.data ?? []).map((c) => c.id);
    if (channelIds.length) {
      const { data: pins } = await supabase
        .from("chat_messages")
        .select("id, body, created_at, profiles(full_name, first_name, email)")
        .in("channel_id", channelIds)
        .eq("is_pinned", true)
        .order("created_at", { ascending: false })
        .limit(3);
      type PinJoin = {
        id: string;
        body: string | null;
        created_at: string;
        profiles: { full_name: string | null; first_name: string | null; email: string | null } | null;
      };
      setPinned(
        ((pins ?? []) as unknown as PinJoin[]).map((p) => ({
          id: p.id,
          body: p.body,
          created_at: p.created_at,
          sender: p.profiles?.full_name || p.profiles?.first_name || p.profiles?.email?.split("@")[0] || "Someone",
        }))
      );
    } else {
      setPinned([]);
    }

    setLoading(false);
  }, [router, workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    if (!pick) return;
    setBusy(true);
    setError("");
    const { error: insertError } = await supabase
      .from("workspace_members")
      .insert({ workspace_id: workspaceId, profile_id: pick });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setInviteOpen(false);
    setPick("");
    load();
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading workspace...</main>;
  }

  if (notFound) {
    return (
      <AppShell profile={profile} title="Workspace">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-h4 text-slate-900">Workspace not found</h2>
          <p className="mt-2 text-sm text-slate-600">
            It may have been deleted, or you don&apos;t have access to it.
          </p>
          <Button className="mt-5" onClick={() => router.push("/workspaces")}>
            Back to workspaces
          </Button>
        </Card>
      </AppShell>
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const completed = tasks.filter((t) => t.status === "completed");
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const upcoming = tasks.filter((t) => t.due_date && t.due_date >= todayIso && t.due_date <= weekAhead && t.status !== "completed");
  const overdue = tasks.filter((t) => t.due_date && t.due_date < todayIso && t.status !== "completed");
  const memberById = new Map(members.map((m) => [m.id, m]));

  return (
    <AppShell profile={profile} title={workspace!.name} subtitle={workspace!.description ?? undefined}>
      {/* Workspace header */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-lg font-black text-white">
            {workspace!.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-h3 text-slate-900">{workspace!.name}</h2>
              <Badge tone="neutral">{members.length} Members</Badge>
              {workspace!.is_active && <Badge tone="success">Active</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-600">{workspace!.description || "No description"}</p>
          </div>
        </div>

        {/* Tabs — only Overview is built today; the rest are separate pages still to come. */}
        <div className="mt-6 flex flex-wrap items-center gap-6 border-b border-slate-200">
          {TABS.map((t) => (
            <span
              key={t}
              className={
                t === "Overview"
                  ? "-mb-px border-b-2 border-primary pb-3 text-sm font-semibold text-primary"
                  : "-mb-px cursor-not-allowed border-b-2 border-transparent pb-3 text-sm font-semibold text-slate-300"
              }
              title={t === "Overview" ? undefined : "Not built yet"}
            >
              {t}
            </span>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {/* Overview stats */}
          <Card>
            <h3 className="text-h4 text-slate-900">Workspace Overview</h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Tasks" value={tasks.length} note={`${inProgress.length} In Progress`} tone="bg-primary-light text-primary" />
              <Stat label="Completed" value={completed.length} note="All time" tone="bg-success-light text-success" />
              <Stat label="Upcoming" value={upcoming.length} note="Due This Week" tone="bg-warning-light text-warning" />
              <Stat label="Overdue" value={overdue.length} note={overdue.length ? "Needs Attention" : "All clear"} tone="bg-danger-light text-danger" />
            </div>
          </Card>

          {/* Recent tasks */}
          <Card>
            <h3 className="text-h4 text-slate-900">Recent Tasks</h3>
            {tasks.length === 0 ? (
              <Empty message="No tasks in this workspace yet." />
            ) : (
              <ul className="mt-4 divide-y divide-slate-50">
                {tasks.slice(0, 5).map((t) => {
                  const due = dueLabel(t.due_date);
                  const assignee = t.assignee_id ? memberById.get(t.assignee_id) : undefined;
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-3">
                      <span className="h-8 w-1 shrink-0 rounded-full bg-primary/30" />
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{t.title}</p>
                      {assignee && <Avatar name={assignee.name} src={assignee.src} size="sm" />}
                      <span className={`w-28 text-right text-xs font-semibold ${due.tone === "danger" ? "text-danger" : "text-slate-500"}`}>
                        {due.text}
                      </span>
                      <Badge tone={STATUS_TONE[t.status] ?? "neutral"} className="capitalize">
                        {t.status.replace("_", " ")}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Recent files */}
          <Card>
            <h3 className="text-h4 text-slate-900">Recent Files</h3>
            {files.length === 0 ? (
              <Empty message="No files in this workspace yet." />
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {files.map((f) => (
                  <div key={f.id} className="rounded-lg border border-slate-100 p-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-info-light text-info">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
                      </svg>
                    </span>
                    <p className="mt-3 truncate text-sm font-semibold text-slate-900">{f.name}</p>
                    <p className="mt-1 text-xs text-slate-400">{fmtBytes(f.size_bytes)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right rail */}
        <div className="space-y-6">
          <Card>
            <h3 className="text-h4 text-slate-900">About This Workspace</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {workspace!.description || "No description has been added for this workspace yet."}
            </p>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h3 className="text-h4 text-slate-900">Workspace Members</h3>
              <span className="text-xs text-slate-400">{members.length}</span>
            </div>
            {members.length === 0 ? (
              <Empty message="No members yet." />
            ) : (
              <div className="mt-4">
                <AvatarGroup people={members} max={6} />
              </div>
            )}
            {isManager(profile) && (
              <Button variant="secondary" className="mt-4 w-full" onClick={() => setInviteOpen(true)}>
                Add members
              </Button>
            )}
          </Card>

          <Card>
            <h3 className="text-h4 text-slate-900">Pinned Messages</h3>
            {pinned.length === 0 ? (
              <Empty message="No pinned messages." />
            ) : (
              <ul className="mt-4 space-y-3">
                {pinned.map((p) => (
                  <li key={p.id} className="rounded-lg border border-slate-100 p-3">
                    <p className="text-xs font-bold text-slate-900">{p.sender}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{p.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

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
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-light text-primary">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25" />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">{m.title}</p>
                        <p className="text-xs text-slate-500">
                          {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·{" "}
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
      </div>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Add members"
        footer={
          <>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button form="add-member" disabled={busy || !pick}>
              {busy ? "Adding..." : "Add"}
            </Button>
          </>
        }
      >
        <form id="add-member" onSubmit={addMember} className="space-y-4">
          {candidates.length === 0 ? (
            <Alert tone="info">Everyone in your organization is already a member of this workspace.</Alert>
          ) : (
            <label className="block text-sm font-semibold text-slate-700">
              Person
              <Select value={pick} onChange={(e) => setPick(e.target.value)} className="mt-2">
                <option value="">Select someone</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
        </form>
      </Modal>
    </AppShell>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: number; note: string; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-100 p-4">
      <span className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </span>
      <p className="mt-3 text-h2 text-slate-900">{value}</p>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-[11px] text-slate-400">{note}</p>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="mt-4 rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-400">{message}</p>;
}
