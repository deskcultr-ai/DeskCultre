"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, displayName, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Alert } from "@/components/ui";

type Task = { id: string; title: string; status: string; priority: string; due_date: string | null };
type Meeting = { id: string; title: string; starts_at: string };
type Announcement = { id: string; title: string; body: string | null };
type Request = { id: string; title: string; status: string };
type DriveFile = { id: string; name: string; size_bytes: number };
type Attendance = { id: string; check_in_at: string | null; check_out_at: string | null; status: string };

function fmtBytes(bytes: number) {
  if (!bytes) return "0 KB";
  const mb = bytes / 1024 ** 2;
  return mb < 1 ? `${Math.round(bytes / 1024)} KB` : `${mb.toFixed(1)} MB`;
}

function dueLabel(due: string | null) {
  if (!due) return null;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (due < today) return { text: "Overdue", tone: "danger" as const };
  if (due === today) return { text: "Due Today", tone: "danger" as const };
  if (due === tomorrow) return { text: "Due Tomorrow", tone: "warning" as const };
  return {
    text: new Date(due).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    tone: "neutral" as const,
  };
}

export default function EmployeeDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const me = await getProfile();
    if (!me) {
      router.replace("/");
      return;
    }
    setProfile(me);

    if (!me.company_id) {
      setLoading(false);
      return;
    }

    const companyId = me.company_id;
    const workDate = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();

    const [tasksRes, meetingsRes, annRes, reqRes, filesRes, attRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, status, priority, due_date")
        .eq("company_id", companyId)
        .eq("assignee_id", me.id)
        .not("status", "in", "(completed,cancelled)")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(5),
      supabase
        .from("meetings")
        .select("id, title, starts_at")
        .eq("company_id", companyId)
        .gte("starts_at", nowIso)
        .order("starts_at")
        .limit(3),
      supabase
        .from("announcements")
        .select("id, title, body")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("requests")
        .select("id, title, status")
        .eq("company_id", companyId)
        .in("status", ["pending", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("drive_files")
        .select("id, name, size_bytes")
        .eq("company_id", companyId)
        .eq("is_trashed", false)
        .order("updated_at", { ascending: false })
        .limit(3),
      supabase
        .from("attendance_sessions")
        .select("id, check_in_at, check_out_at, status")
        .eq("profile_id", me.id)
        .eq("work_date", workDate)
        .maybeSingle(),
    ]);

    setTasks(tasksRes.data ?? []);
    setMeetings(meetingsRes.data ?? []);
    setAnnouncements(annRes.data ?? []);
    setRequests(reqRes.data ?? []);
    setFiles(filesRes.data ?? []);
    setAttendance(attRes.data ?? null);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function checkIn() {
    if (!profile?.company_id) return;
    setBusy(true);
    await supabase.from("attendance_sessions").upsert(
      {
        company_id: profile.company_id,
        profile_id: profile.id,
        work_date: new Date().toISOString().slice(0, 10),
        check_in_at: new Date().toISOString(),
        status: "present",
      },
      { onConflict: "profile_id,work_date" }
    );
    await load();
    setBusy(false);
  }

  async function checkOut() {
    if (!attendance) return;
    setBusy(true);
    await supabase
      .from("attendance_sessions")
      .update({ check_out_at: new Date().toISOString() })
      .eq("id", attendance.id);
    await load();
    setBusy(false);
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">
        Loading your workspace...
      </main>
    );
  }

  if (!profile?.company_id) {
    return (
      <AppShell profile={profile} title="Dashboard">
        <Card className="mx-auto max-w-lg">
          <h2 className="text-h4 text-slate-900">Waiting for approval</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Your account isn&apos;t assigned to a company yet. An admin needs to approve your registration before your
            workspace appears here.
          </p>
          <Alert tone="info" className="mt-4">
            Status: <strong className="capitalize">{profile?.status}</strong>
          </Alert>
        </Card>
      </AppShell>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";

  return (
    <AppShell
      profile={profile}
      title={`${greeting}, ${displayName(profile)}! 👋`}
      subtitle="Here's what's happening in your workspace today."
      actions={
        <span className="hidden rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 sm:inline">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      }
    >
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-h4 text-slate-900">My Tasks</h3>
            <span className="text-xs text-slate-400">{tasks.length} open</span>
          </div>
          {tasks.length === 0 ? (
            <Empty message="No open tasks assigned to you." />
          ) : (
            <ul className="mt-4 space-y-2">
              {tasks.map((t) => {
                const due = dueLabel(t.due_date);
                return (
                  <li key={t.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-light text-primary">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75 11.25 15 15 9.75" />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{t.title}</p>
                      <p className="text-xs capitalize text-slate-500">
                        {t.status.replace("_", " ")} · {t.priority} priority
                      </p>
                    </div>
                    {due && <Badge tone={due.tone}>{due.text}</Badge>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="text-h4 text-slate-900">My Attendance</h3>
          {attendance?.check_in_at ? (
            <>
              <Alert tone={attendance.check_out_at ? "info" : "success"} className="mt-4">
                {attendance.check_out_at ? "Checked out for today." : "You're all set for today! 🎉"}
              </Alert>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Check-in</p>
                  <p className="font-bold text-slate-900">
                    {new Date(attendance.check_in_at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Status</p>
                  <Badge tone="success" className="capitalize">
                    {attendance.status}
                  </Badge>
                </div>
              </div>
              {!attendance.check_out_at && (
                <Button variant="secondary" className="mt-5 w-full" onClick={checkOut} disabled={busy}>
                  {busy ? "Saving..." : "Check out"}
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-slate-600">You haven&apos;t checked in today.</p>
              <Button className="mt-4 w-full" onClick={checkIn} disabled={busy}>
                {busy ? "Saving..." : "Check in"}
              </Button>
            </>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
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
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="m15.75 10.5 4.72-2.36a.75.75 0 0 1 1.03.67v9.38a.75.75 0 0 1-1.03.67l-4.72-2.36M4.5 6.75h9a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5h-9a1.5 1.5 0 0 1-1.5-1.5v-7.5a1.5 1.5 0 0 1 1.5-1.5Z"
                        />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{m.title}</p>
                      <p className="text-xs text-slate-500">
                        {d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="text-h4 text-slate-900">Department Updates</h3>
          {announcements.length === 0 ? (
            <Empty message="No announcements yet." />
          ) : (
            <ul className="mt-4 space-y-3">
              {announcements.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-100 p-3">
                  <p className="text-sm font-bold text-slate-900">{a.title}</p>
                  {a.body && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{a.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="text-h4 text-slate-900">Pending Requests</h3>
          {requests.length === 0 ? (
            <Empty message="No pending requests." />
          ) : (
            <ul className="mt-4 space-y-3">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{r.title}</p>
                  </div>
                  <Badge tone={r.status === "pending" ? "warning" : "info"} className="capitalize">
                    {r.status.replace("_", " ")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h3 className="text-h4 text-slate-900">Recent Files</h3>
        {files.length === 0 ? (
          <Empty message="No files in Drive yet." />
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-info-light text-info">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25M6.75 12h10.5"
                    />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{f.name}</p>
                  <p className="text-xs text-slate-400">{fmtBytes(f.size_bytes)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="mt-6 rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-400">{message}</p>;
}
