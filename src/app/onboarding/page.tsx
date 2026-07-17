"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, displayName, type Profile } from "@/lib/session";
import { Button, Input, Card, Alert } from "@/components/ui";

type Choice = "create" | "join";

export default function OnboardingPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<Choice>("create");
  const [companyName, setCompanyName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const me = await getProfile();
      if (!me) {
        router.replace("/login");
        return;
      }
      // Already in an org and active -> nothing to do here.
      if (me.company_id && me.status === "active") {
        router.replace("/dashboard");
        return;
      }
      setProfile(me);
      setLoading(false);
    }
    load();
  }, [router]);

  async function createOrg(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("create_company", { company_name: companyName.trim() });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.replace("/admin");
  }

  async function joinOrg(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("join_company", { code: joinCode.trim() });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.replace("/dashboard");
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading...</main>;
  }

  // Joined an org but still awaiting admin approval.
  if (profile?.company_id && profile.status === "pending") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8fafc] px-6">
        <Card className="w-full max-w-md text-center">
          <h1 className="text-h3 text-slate-900">Waiting for approval</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            You&apos;ve joined the organization. An admin needs to approve you and assign your role before your
            workspace opens.
          </p>
          <Alert tone="info" className="mt-5 text-left">
            We&apos;ll let you in as soon as an admin approves the request.
          </Alert>
          <Button
            variant="ghost"
            className="mt-5 w-full"
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/");
            }}
          >
            Sign out
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f8fafc] px-6 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[10px] bg-gradient-to-br from-primary to-violet-500 text-sm font-bold text-white">
            DC
          </div>
          <span className="text-xl font-extrabold tracking-tight text-slate-900">DeskCulture</span>
        </div>

        <Card>
          <h1 className="text-h3 text-slate-900">Welcome, {displayName(profile)}</h1>
          <p className="mt-2 text-sm text-slate-600">
            Set up your workspace to continue. Create a new organization, or join one you&apos;ve been given a code for.
          </p>

          <div className="mt-6 grid grid-cols-2 rounded-2xl bg-primary/10 p-1 text-sm font-bold">
            <button
              onClick={() => {
                setChoice("create");
                setError("");
              }}
              className={`h-10 rounded-xl transition ${
                choice === "create" ? "bg-gradient-to-r from-primary to-violet-500 text-white shadow-md" : "text-slate-500"
              }`}
            >
              Create organization
            </button>
            <button
              onClick={() => {
                setChoice("join");
                setError("");
              }}
              className={`h-10 rounded-xl transition ${
                choice === "join" ? "bg-gradient-to-r from-primary to-violet-500 text-white shadow-md" : "text-slate-500"
              }`}
            >
              Join organization
            </button>
          </div>

          {choice === "create" ? (
            <form onSubmit={createOrg} className="mt-6 space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                Organization name
                <Input
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Inc"
                  className="mt-2"
                />
              </label>
              <p className="text-xs leading-5 text-slate-500">
                You&apos;ll become the <strong>admin</strong> of this organization and get a join code to invite your
                team.
              </p>
              <Button size="lg" className="w-full" disabled={busy}>
                {busy ? "Creating..." : "Create organization"}
              </Button>
            </form>
          ) : (
            <form onSubmit={joinOrg} className="mt-6 space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                Join code
                <Input
                  required
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABCD1234"
                  className="mt-2 font-mono tracking-widest"
                />
              </label>
              <p className="text-xs leading-5 text-slate-500">
                Ask your admin for the organization&apos;s join code. You&apos;ll be added as pending until they approve
                you.
              </p>
              <Button size="lg" className="w-full" disabled={busy}>
                {busy ? "Joining..." : "Join organization"}
              </Button>
            </form>
          )}

          {error && (
            <Alert tone="danger" className="mt-5">
              {error}
            </Alert>
          )}
        </Card>
      </div>
    </main>
  );
}
