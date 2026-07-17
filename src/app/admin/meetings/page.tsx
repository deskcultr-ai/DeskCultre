"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Input, Select, Alert, Modal } from "@/components/ui";

type Meeting = {
  id: string;
  title: string;
  starts_at: string;
  description: string | null;
  status: string;
  department_id: string | null;
  room_id: string | null;
  join_url: string | null;
};

type Department = {
  id: string;
  name: string;
};

type Decision = {
  id: string;
  decision: string;
  created_at: string;
};

type ActionItem = {
  id: string;
  title: string;
  due_date: string | null;
  assignee_name?: string;
};

export default function AdminMeetingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);

  // Create form states
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  
  // Selected meeting detail states
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  
  // Decision Form
  const [decisionText, setDecisionText] = useState("");
  
  // Action Item Form
  const [actionTitle, setActionTitle] = useState("");
  const [actionAssignee, setActionAssignee] = useState("");
  const [actionDueDate, setActionDueDate] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
    if (!isAdmin(me)) {
      setDenied(true);
      setLoading(false);
      return;
    }

    const [meetingsRes, deptsRes, peopleRes] = await Promise.all([
      supabase.from("meetings").select("id, title, starts_at, description, status, department_id, room_id, join_url").eq("company_id", me.company_id).order("starts_at", { ascending: false }),
      supabase.from("departments").select("id, name").eq("company_id", me.company_id).order("name"),
      supabase.from("profiles").select("id, full_name, first_name, email").eq("company_id", me.company_id).eq("status", "active"),
    ]);

    setMeetings(meetingsRes.data ?? []);
    setDepartments(deptsRes.data ?? []);
    setEmployees(
      (peopleRes.data ?? []).map((p) => ({
        id: p.id,
        name: p.full_name || p.first_name || p.email?.split("@")[0] || "Member",
      }))
    );
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const selectMeeting = async (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setError("");
    setSuccess("");

    const [decisionsRes, actionsRes] = await Promise.all([
      supabase.from("meeting_decisions").select("id, decision, created_at").eq("meeting_id", meeting.id).order("created_at", { ascending: false }),
      supabase.from("meeting_action_items").select("id, title, due_date").eq("meeting_id", meeting.id).order("created_at", { ascending: false }),
    ]);

    setDecisions(decisionsRes.data ?? []);
    setActions(actionsRes.data ?? []);
  };

  async function handleScheduleMeeting(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.company_id || !title.trim() || !startsAt) return;

    setBusy(true);
    setError("");
    setSuccess("");

    // Generate unique Jitsi room name
    const roomId = `deskculture-${profile.company_id.slice(0, 8)}-${Math.random().toString(36).substring(2, 9)}`;
    const joinUrl = `https://meet.jit.si/${roomId}`;

    const { error: insertError } = await supabase.from("meetings").insert({
      company_id: profile.company_id,
      title: title.trim(),
      description: description.trim() || null,
      starts_at: new Date(startsAt).toISOString(),
      department_id: departmentId || null,
      room_id: roomId,
      join_url: joinUrl,
      host_id: profile.id,
      status: "scheduled",
    });

    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSuccess("Meeting scheduled successfully! Send activation/join notifications.");
    setTitle("");
    setDescription("");
    setStartsAt("");
    setDepartmentId("");
    setOpen(false);
    load();
  }

  async function handleAddDecision(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMeeting || !decisionText.trim() || !profile) return;

    setBusy(true);
    const { error: decError } = await supabase.from("meeting_decisions").insert({
      meeting_id: selectedMeeting.id,
      company_id: profile.company_id,
      decision: decisionText.trim(),
      recorded_by: profile.id,
    });

    setBusy(false);
    if (decError) {
      setError(decError.message);
    } else {
      setDecisionText("");
      selectMeeting(selectedMeeting);
    }
  }

  async function handleAddActionItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMeeting || !actionTitle.trim()) return;

    setBusy(true);
    const { error: actionError } = await supabase.rpc("create_meeting_action_item", {
      target_meeting_id: selectedMeeting.id,
      action_title: actionTitle.trim(),
      action_assigned_to: actionAssignee || null,
      action_due_date: actionDueDate || null,
    });

    setBusy(false);
    if (actionError) {
      setError(actionError.message);
    } else {
      setActionTitle("");
      setActionAssignee("");
      setActionDueDate("");
      selectMeeting(selectedMeeting);
    }
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] dark:bg-slate-950 text-slate-500">Loading meetings...</main>;
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Meetings" variant="admin">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-h4 text-slate-900">Admin access required</h2>
          <p className="mt-2 text-sm text-slate-600">Your role doesn&apos;t have access to meetings management.</p>
          <Button className="mt-5" onClick={() => router.push("/dashboard")}>
            Go to my dashboard
          </Button>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      profile={profile}
      variant="admin"
      title="Meetings Manager"
      subtitle="Schedule and organize cheap, free, open video calls via Jitsi Meet, and track decisions/actions."
      actions={<Button onClick={() => setOpen(true)}>+ Schedule Meeting</Button>}
    >
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      {success && <Alert tone="success" className="mb-4">{success}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Left Side: Meetings List */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Scheduled Calls</h3>
          {meetings.length === 0 ? (
            <Card className="p-6 text-center text-sm text-slate-400">No calls scheduled yet.</Card>
          ) : (
            meetings.map((m) => (
              <div
                key={m.id}
                onClick={() => selectMeeting(m)}
                className={`cursor-pointer transition duration-150 rounded-2xl border p-4 ${selectedMeeting?.id === m.id ? "bg-indigo-50/50 border-indigo-400 dark:bg-indigo-950/20" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"}`}
              >
                <div className="flex justify-between items-start gap-2">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">{m.title}</h4>
                  <Badge tone={m.status === "scheduled" ? "warning" : "success"} className="text-[10px]">
                    {m.status}
                  </Badge>
                </div>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-2">
                  📅 {new Date(m.starts_at).toLocaleString("en-IN")}
                </p>
                {m.description && (
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2">{m.description}</p>
                )}
                {m.join_url && (
                  <a
                    href={m.join_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs text-success font-bold hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    🚀 Join Jitsi Meet →
                  </a>
                )}
              </div>
            ))
          )}
        </div>

        {/* Right Side: Meeting Detail, Decisions & Actions */}
        <div>
          {!selectedMeeting ? (
            <Card className="h-64 flex items-center justify-center text-slate-400">
              Select a call from the list to record agenda decisions and assign follow-up action items.
            </Card>
          ) : (
            <Card className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white">{selectedMeeting.title}</h2>
                  <p className="text-sm text-indigo-600 dark:text-indigo-400 font-bold mt-1">
                    {new Date(selectedMeeting.starts_at).toLocaleString("en-IN")}
                  </p>
                </div>
                {selectedMeeting.join_url && (
                  <a
                    href={selectedMeeting.join_url}
                    target="_blank"
                    rel="noreferrer"
                    className="h-11 px-5 rounded-xl bg-success text-white font-bold inline-flex items-center gap-1.5 hover:bg-success-dark transition shadow-md shadow-success-light"
                  >
                    🚀 Launch Free Video Call
                  </a>
                )}
              </div>

              {selectedMeeting.description && (
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Agenda / Notes</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {selectedMeeting.description}
                  </p>
                </div>
              )}

              <div className="grid gap-6 md:grid-cols-2 border-t border-slate-100 dark:border-slate-800 pt-6">
                {/* Decisions Section */}
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-800 dark:text-white text-sm">Meeting Decisions</h3>
                  <form onSubmit={handleAddDecision} className="space-y-2">
                    <Input
                      required
                      value={decisionText}
                      onChange={(e) => setDecisionText(e.target.value)}
                      placeholder="Add agreed decision..."
                    />
                    <Button disabled={busy || !decisionText.trim()} size="sm">
                      + Add Decision
                    </Button>
                  </form>
                  <div className="space-y-2 max-h-60 overflow-y-auto pt-2">
                    {decisions.length === 0 ? (
                      <p className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl">No decisions logged yet.</p>
                    ) : (
                      decisions.map((d) => (
                        <div key={d.id} className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-xl text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          {d.decision}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Actions Items Section */}
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-800 dark:text-white text-sm">Action Items (Linked Tasks)</h3>
                  <form onSubmit={handleAddActionItem} className="space-y-2 bg-indigo-50/50 dark:bg-slate-900 p-3 rounded-xl border border-indigo-100/50">
                    <Input
                      required
                      value={actionTitle}
                      onChange={(e) => setActionTitle(e.target.value)}
                      placeholder="Task description..."
                      className="text-xs h-9 bg-white"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={actionAssignee}
                        onChange={(e) => setActionAssignee(e.target.value)}
                        className="text-xs h-9 bg-white"
                      >
                        <option value="">Unassigned</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>{emp.name}</option>
                        ))}
                      </Select>
                      <Input
                        type="date"
                        value={actionDueDate}
                        onChange={(e) => setActionDueDate(e.target.value)}
                        className="text-xs h-9 bg-white"
                      />
                    </div>
                    <Button disabled={busy || !actionTitle.trim()} size="sm" className="w-full">
                      Assign Task
                    </Button>
                  </form>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {actions.length === 0 ? (
                      <p className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl">No action items assigned yet.</p>
                    ) : (
                      actions.map((act) => (
                        <div key={act.id} className="bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-xl text-xs text-slate-700 dark:text-slate-300 flex justify-between items-center">
                          <span>{act.title}</span>
                          {act.due_date && (
                            <span className="text-[10px] font-bold text-red-500">📅 {act.due_date}</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Schedule Call Modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Schedule Video Call"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="schedule-call" disabled={busy || !title.trim() || !startsAt}>
              {busy ? "Scheduling..." : "Schedule call"}
            </Button>
          </>
        }
      >
        <form id="schedule-call" onSubmit={handleScheduleMeeting} className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">
            Meeting Title
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Marketing Strategy call" className="mt-2" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Agenda / Description
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Review quarterly budgets..." className="mt-2" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-semibold text-slate-700">
              Starts At
              <Input type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-2" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Department Scoped
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="mt-2">
                <option value="">No department (All Org)</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </label>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
