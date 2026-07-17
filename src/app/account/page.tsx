"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, displayName, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Button, Input, Alert, Badge, Avatar } from "@/components/ui";

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const me = await getProfile();
    if (!me) {
      router.replace("/login");
      return;
    }
    setProfile(me);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 10) {
      setError("Use a password with at least 10 characters.");
      return;
    }

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPassword("");
    setMessage("Password updated.");
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading account...</main>;
  }

  const inOrg = !!profile?.company_id && profile.status === "active";

  return (
    <AppShell profile={profile} title="Account & access" subtitle="Your profile and sign-in security.">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h3 className="text-h4 text-slate-900">Profile</h3>
          <div className="mt-5 flex items-center gap-4">
            <Avatar name={displayName(profile)} src={profile?.avatar_url ?? undefined} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-bold text-slate-900">
                {profile?.full_name || displayName(profile)}
              </p>
              <p className="truncate text-sm text-slate-500">{profile?.email}</p>
            </div>
          </div>
          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Role</dt>
              <dd>
                <Badge tone="primary" className="capitalize">
                  {profile?.role.replace("_", " ")}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Status</dt>
              <dd>
                <Badge tone={profile?.status === "active" ? "success" : "warning"} className="capitalize">
                  {profile?.status}
                </Badge>
              </dd>
            </div>
          </dl>

          {!inOrg && (
            <>
              <Alert tone="info" className="mt-5">
                You&apos;re not in an organization yet.
              </Alert>
              <Button className="mt-4 w-full" onClick={() => router.push("/onboarding")}>
                Set up your workspace
              </Button>
            </>
          )}
        </Card>

        <Card>
          <h3 className="text-h4 text-slate-900">Password security</h3>
          <p className="mt-2 text-sm text-slate-600">Use a unique password of at least 10 characters.</p>
          <form onSubmit={updatePassword} className="mt-5 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              New password
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2"
              />
            </label>
            <Button disabled={busy || !password} className="w-full">
              {busy ? "Saving..." : "Update password"}
            </Button>
          </form>
          {message && (
            <Alert tone="success" className="mt-4">
              {message}
            </Alert>
          )}
          {error && (
            <Alert tone="danger" className="mt-4">
              {error}
            </Alert>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
