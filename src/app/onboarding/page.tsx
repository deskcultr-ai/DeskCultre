"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, displayName, type Profile } from "@/lib/session";
import { Button, Input, Card, Alert, Select } from "@/components/ui";
import { cn } from "@/lib/cn";

type Choice = "create" | "join";
type Step = "choose" | "size" | "joinDetails";
type Dept = { id: string; name: string };
type OrgLookup = { company_id: string; company_name: string; departments: Dept[] };

const SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];

export default function OnboardingPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<Choice>("create");
  const [step, setStep] = useState<Step>("choose");

  const [companyName, setCompanyName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [size, setSize] = useState("");

  const [joinCode, setJoinCode] = useState("");
  const [org, setOrg] = useState<OrgLookup | null>(null);
  const [deptId, setDeptId] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const check = useCallback(async () => {
    const me = await getProfile();
    if (!me) {
      router.replace("/login");
      return;
    }
    if (me.company_id && me.status === "active") {
      router.replace(me.role === "admin" ? "/admin" : "/dashboard");
      return;
    }
    setProfile(me);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    check();
  }, [check]);

  async function createOrg(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("create_company", { company_name: companyName.trim() });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setCompanyId(data as string);
    setStep("size"); // ask org size before dropping them into the admin panel
  }

  async function saveSize(selected: string) {
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase
      .from("companies")
      .update({ employee_count_range: selected })
      .eq("id", companyId);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.replace("/admin");
  }

  async function lookupOrg(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("lookup_org_by_code", { code: joinCode.trim() });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if (!data) {
      setError("That join code is not valid. Check it with your admin.");
      return;
    }
    setOrg(data as OrgLookup);
    setStep("joinDetails");
  }

  async function joinOrg(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("join_company", {
      code: joinCode.trim(),
      target_department: deptId || null,
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await check(); // falls through to the waiting screen below
    setProfile((p) => (p ? { ...p, company_id: org?.company_id ?? null, status: "pending" } : p));
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading...</main>;
  }

  // Joined, waiting on an admin.
  if (profile?.company_id && profile.status === "pending") {
    return (
      <Shell>
        <Card className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-warning-light text-warning">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-7 w-7">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6.75V12l3 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </span>
          <h1 className="mt-5 text-h3 text-slate-900">Waiting for approval</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            You&apos;ve joined the organization. An admin needs to approve you and confirm your role before your
            workspace opens.
          </p>
          <Alert tone="info" className="mt-5 text-left">
            We&apos;ll open your dashboard as soon as an admin approves you. You can close this page and come back.
          </Alert>
          <div className="mt-5 flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={check}>
              Check again
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace("/");
              }}
            >
              Sign out
            </Button>
          </div>
        </Card>
      </Shell>
    );
  }

  // Step 2 of create: org size.
  if (step === "size") {
    return (
      <Shell>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Step 2 of 2</p>
          <h1 className="mt-2 text-h3 text-slate-900">How many employees do you have?</h1>
          <p className="mt-2 text-sm text-slate-600">This helps us set up sensible defaults. You can change it later.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={cn(
                  "rounded-xl border p-4 text-sm font-bold transition",
                  size === s ? "border-primary bg-primary-light text-primary" : "border-slate-200 text-slate-600 hover:border-primary/40"
                )}
              >
                {s}
              </button>
            ))}
          </div>
          {error && (
            <Alert tone="danger" className="mt-5">
              {error}
            </Alert>
          )}
          <Button size="lg" className="mt-6 w-full" disabled={!size || busy} onClick={() => saveSize(size)}>
            {busy ? "Saving..." : "Continue to admin panel"}
          </Button>
        </Card>
      </Shell>
    );
  }

  // Step 2 of join: confirm org + pick department.
  if (step === "joinDetails" && org) {
    return (
      <Shell>
        <Card>
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Step 2 of 2</p>
          <h1 className="mt-2 text-h3 text-slate-900">Join {org.company_name}</h1>
          <p className="mt-2 text-sm text-slate-600">Pick the department you work in. An admin will confirm it.</p>

          <form onSubmit={joinOrg} className="mt-6 space-y-4">
            {org.departments.length === 0 ? (
              <Alert tone="info">
                This organization hasn&apos;t created any departments yet. You can still join — an admin will assign
                yours on approval.
              </Alert>
            ) : (
              <label className="block text-sm font-semibold text-slate-700">
                Department
                <Select value={deptId} onChange={(e) => setDeptId(e.target.value)} className="mt-2">
                  <option value="">Select your department</option>
                  {org.departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setStep("choose");
                  setOrg(null);
                  setError("");
                }}
              >
                Back
              </Button>
              <Button size="lg" className="flex-1" disabled={busy}>
                {busy ? "Joining..." : "Request to join"}
              </Button>
            </div>
          </form>
        </Card>
      </Shell>
    );
  }

  // Step 1: create or join.
  return (
    <Shell>
      <Card>
        <h1 className="text-h3 text-slate-900">Welcome, {displayName(profile)}</h1>
        <p className="mt-2 text-sm text-slate-600">
          Set up your workspace to continue. Create a new organization, or join one with a code from your admin.
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-2xl bg-primary/10 p-1 text-sm font-bold">
          {(["create", "join"] as const).map((c) => (
            <button
              key={c}
              onClick={() => {
                setChoice(c);
                setError("");
              }}
              className={cn(
                "h-10 rounded-xl transition",
                choice === c ? "bg-gradient-to-r from-primary to-violet-500 text-white shadow-md" : "text-slate-500"
              )}
            >
              {c === "create" ? "Create organization" : "Join organization"}
            </button>
          ))}
        </div>

        {choice === "create" ? (
          <form onSubmit={createOrg} className="mt-6 space-y-4">
            <label className="block text-sm font-semibold text-slate-700">
              Organization name
              <Input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Inc" className="mt-2" />
            </label>
            <p className="text-xs leading-5 text-slate-500">
              You&apos;ll become the <strong>admin</strong>: create departments, assign roles and invite your team with
              a join code.
            </p>
            <Button size="lg" className="w-full" disabled={busy || !companyName.trim()}>
              {busy ? "Creating..." : "Continue"}
            </Button>
          </form>
        ) : (
          <form onSubmit={lookupOrg} className="mt-6 space-y-4">
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
              Ask your admin for the organization&apos;s join code. You&apos;ll pick your department next.
            </p>
            <Button size="lg" className="w-full" disabled={busy || !joinCode.trim()}>
              {busy ? "Checking..." : "Continue"}
            </Button>
          </form>
        )}

        {error && (
          <Alert tone="danger" className="mt-5">
            {error}
          </Alert>
        )}
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f8fafc] px-6 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[10px] bg-gradient-to-br from-primary to-violet-500 text-sm font-bold text-white">
            DC
          </div>
          <span className="text-xl font-extrabold tracking-tight text-slate-900">DeskCulture</span>
        </div>
        {children}
      </div>
    </main>
  );
}
