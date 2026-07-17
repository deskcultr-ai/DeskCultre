"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getProfile, isManager, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Button, Input, Badge, Alert, Modal, AvatarGroup } from "@/components/ui";

type WorkspaceRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  taskCount: number;
  members: Array<{ name: string; src?: string }>;
};

const INITIAL_TONES = [
  "from-primary to-violet-500",
  "from-emerald-400 to-teal-500",
  "from-rose-400 to-orange-400",
  "from-blue-400 to-indigo-500",
  "from-fuchsia-400 to-purple-500",
];

export default function WorkspacesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
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

    const [wsRes, tasksRes, membersRes] = await Promise.all([
      supabase
        .from("workspaces")
        .select("id, name, description, is_active")
        .eq("company_id", me.company_id)
        .order("created_at", { ascending: false }),
      supabase.from("tasks").select("id, workspace_id").eq("company_id", me.company_id),
      supabase.from("workspace_members").select("workspace_id, profiles(full_name, first_name, email, avatar_url)"),
    ]);

    const tasks = tasksRes.data ?? [];
    type MemberJoin = {
      workspace_id: string;
      profiles: { full_name: string | null; first_name: string | null; email: string | null; avatar_url: string | null } | null;
    };
    const memberRows = (membersRes.data ?? []) as unknown as MemberJoin[];

    setWorkspaces(
      (wsRes.data ?? []).map((w) => ({
        ...w,
        taskCount: tasks.filter((t) => t.workspace_id === w.id).length,
        members: memberRows
          .filter((m) => m.workspace_id === w.id && m.profiles)
          .map((m) => ({
            name: m.profiles!.full_name || m.profiles!.first_name || m.profiles!.email?.split("@")[0] || "Member",
            src: m.profiles!.avatar_url ?? undefined,
          })),
      }))
    );
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    if (!profile?.company_id) return;
    setBusy(true);
    setError("");

    const { data, error: insertError } = await supabase
      .from("workspaces")
      .insert({
        company_id: profile.company_id,
        name: name.trim(),
        description: description.trim() || null,
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (insertError) {
      setBusy(false);
      setError(insertError.message);
      return;
    }

    // Creator joins their own workspace.
    await supabase.from("workspace_members").insert({ workspace_id: data.id, profile_id: profile.id });
    await supabase.from("activity_log").insert({
      company_id: profile.company_id,
      actor_id: profile.id,
      action: "workspace.created",
      entity_id: data.id,
      summary: `Workspace "${name.trim()}" created`,
    });

    setBusy(false);
    setOpen(false);
    setName("");
    setDescription("");
    router.push(`/workspaces/${data.id}`);
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading workspaces...</main>;
  }

  const canCreate = isManager(profile);

  return (
    <AppShell
      profile={profile}
      title="Workspaces"
      subtitle="Group tasks, files, chat and meetings by team or project."
      actions={canCreate ? <Button onClick={() => setOpen(true)}>+ New workspace</Button> : undefined}
    >
      {workspaces.length === 0 ? (
        <Card className="mx-auto max-w-lg text-center">
          <h2 className="text-h4 text-slate-900">No workspaces yet</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {canCreate
              ? "Create your first workspace to organise your team's tasks, files and meetings."
              : "You're not a member of any workspace yet. Ask a manager or admin to add you."}
          </p>
          {canCreate && (
            <Button className="mt-5" onClick={() => setOpen(true)}>
              Create workspace
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {workspaces.map((w, index) => (
            <Link key={w.id} href={`/workspaces/${w.id}`}>
              <Card hover className="h-full">
                <div className="flex items-start gap-3">
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${
                      INITIAL_TONES[index % INITIAL_TONES.length]
                    } text-base font-black text-white`}
                  >
                    {w.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-bold text-slate-900">{w.name}</h3>
                      {w.is_active && <Badge tone="success">Active</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                      {w.description || "No description"}
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between">
                  {w.members.length > 0 ? (
                    <AvatarGroup people={w.members} max={4} size="sm" />
                  ) : (
                    <span className="text-xs text-slate-400">No members</span>
                  )}
                  <span className="text-xs font-semibold text-slate-500">{w.taskCount} tasks</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New workspace"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button form="new-workspace" disabled={busy || !name.trim()}>
              {busy ? "Creating..." : "Create"}
            </Button>
          </>
        }
      >
        <form id="new-workspace" onSubmit={createWorkspace} className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">
            Name
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Marketing Workspace" className="mt-2" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Description
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="All marketing tasks, campaigns and assets."
              className="mt-2"
            />
          </label>
          {error && <Alert tone="danger">{error}</Alert>}
        </form>
      </Modal>
    </AppShell>
  );
}
