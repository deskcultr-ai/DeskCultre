"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Input, Select, Alert, Modal } from "@/components/ui";

type Announcement = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  department_id: string | null;
  author_id: string | null;
  author_name?: string;
  dept_name?: string;
};

type Department = {
  id: string;
  name: string;
};

export default function AdminAnnouncementsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [open, setOpen] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [departmentId, setDepartmentId] = useState("");

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

    const [annRes, deptsRes, authorsRes] = await Promise.all([
      supabase.from("announcements").select("id, title, body, created_at, department_id, author_id").eq("company_id", me.company_id).order("created_at", { ascending: false }),
      supabase.from("departments").select("id, name").eq("company_id", me.company_id).order("name"),
      supabase.from("profiles").select("id, full_name, first_name, email").eq("company_id", me.company_id),
    ]);

    const depts = deptsRes.data ?? [];
    const authors = authorsRes.data ?? [];

    setAnnouncements(
      (annRes.data ?? []).map((ann) => {
        const auth = authors.find((x) => x.id === ann.author_id);
        const dept = depts.find((x) => x.id === ann.department_id);
        return {
          ...ann,
          author_name: auth ? (auth.full_name || auth.first_name || auth.email?.split("@")[0]) : "Unknown Author",
          dept_name: dept ? dept.name : undefined,
        };
      })
    );
    setDepartments(depts);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.company_id || !title.trim()) return;

    setBusy(true);
    setError("");
    setSuccess("");

    const { error: insertError } = await supabase.from("announcements").insert({
      company_id: profile.company_id,
      title: title.trim(),
      body: bodyText.trim() || null,
      department_id: departmentId || null,
      author_id: profile.id,
    });

    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSuccess("Announcement broadcasted successfully!");
    setTitle("");
    setBodyText("");
    setDepartmentId("");
    setOpen(false);
    load();
  }

  async function handleDeleteAnnouncement(id: string) {
    setError("");
    setSuccess("");
    const { error: delError } = await supabase.from("announcements").delete().eq("id", id);
    if (delError) {
      setError(delError.message);
      return;
    }
    setSuccess("Announcement deleted.");
    load();
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] dark:bg-slate-950 text-slate-500">Loading announcements...</main>;
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Announcements" variant="admin">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-h4 text-slate-900">Admin access required</h2>
          <p className="mt-2 text-sm text-slate-600">Your role doesn&apos;t have access to announcements management.</p>
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
      title="Announcements Dashboard"
      subtitle="Broadcast company-wide news, safety updates, or scoped department notices."
      actions={<Button onClick={() => setOpen(true)}>+ New Announcement</Button>}
    >
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      {success && <Alert tone="success" className="mb-4">{success}</Alert>}

      <div className="space-y-6 max-w-4xl">
        {announcements.length === 0 ? (
          <Card className="p-12 text-center text-slate-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="mx-auto h-12 w-12 text-slate-300 mb-4">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.757 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
            No announcements broadcasted yet. Click &quot;New Announcement&quot; to publish.
          </Card>
        ) : (
          announcements.map((ann) => (
            <Card key={ann.id} className="relative overflow-hidden hover:border-slate-300">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">{ann.title}</h3>
                    {ann.dept_name ? (
                      <Badge tone="info" className="text-[10px] uppercase tracking-wide">
                        {ann.dept_name} Department
                      </Badge>
                    ) : (
                      <Badge tone="primary" className="text-[10px] uppercase tracking-wide">
                        Global Broadcast
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-semibold mt-1">
                    Published by {ann.author_name} · {new Date(ann.created_at).toLocaleString("en-IN")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteAnnouncement(ann.id)}
                  className="text-xs text-red-500 hover:text-red-700 font-bold shrink-0 hover:underline"
                >
                  Delete Notice
                </button>
              </div>

              {ann.body && (
                <p className="mt-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {ann.body}
                </p>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Creation Modal */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Broadcast Announcement"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="create-ann" disabled={busy || !title.trim()}>
              {busy ? "Broadcasting..." : "Broadcast Notice"}
            </Button>
          </>
        }
      >
        <form id="create-ann" onSubmit={handleCreateAnnouncement} className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">
            Notice Title
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Office closed on Monday for Maintenance" className="mt-2" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Announcement Content
            <Input value={bodyText} onChange={(e) => setBodyText(e.target.value)} placeholder="Please make sure to finish your active work by Friday..." className="mt-2" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Scope target
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="mt-2">
              <option value="">Company-wide Broadcast</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </label>
        </form>
      </Modal>
    </AppShell>
  );
}
