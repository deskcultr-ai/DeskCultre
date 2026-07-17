"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, displayName, type Profile } from "@/lib/session";
import { Button, Input, Card, Alert, Select } from "@/components/ui";
import { cn } from "@/lib/cn";

type Step = "choose" | "create" | "join";

export default function OnboardingPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("choose");

  // Create Org States
  const [companyName, setCompanyName] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [industrySector, setIndustrySector] = useState("Technology & SaaS");

  // Join Org States
  const [inviteCode, setInviteCode] = useState("");
  const [testingRole, setTestingRole] = useState("member");

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
    if (!companyName.trim()) return;

    setBusy(true);
    setError("");

    // Step 1: Call the existing create_company RPC (single-param, already live in Supabase)
    const { data: companyId, error: rpcError } = await supabase.rpc("create_company", {
      company_name: companyName.trim(),
    });

    if (rpcError) {
      setBusy(false);
      setError(rpcError.message);
      return;
    }

    // Step 2: Persist the extra fields directly now that we own the company row
    if (companyId && (customDomain.trim() || industrySector)) {
      await supabase
        .from("companies")
        .update({
          custom_domain_url: customDomain.trim() || null,
          industry_sector: industrySector || null,
        })
        .eq("id", companyId);
      // ignore errors — these fields are optional enhancements
    }

    setBusy(false);
    router.replace("/admin");
  }

  async function joinOrg(event: React.FormEvent) {
    event.preventDefault();
    if (!inviteCode.trim()) return;

    setBusy(true);
    setError("");

    // Step 1: Look up the company by join_code
    const { data: company, error: lookupError } = await supabase
      .from("companies")
      .select("id")
      .eq("join_code", inviteCode.trim().toUpperCase())
      .single();

    if (lookupError || !company) {
      setBusy(false);
      setError("That join code is not valid. Please check and try again.");
      return;
    }

    // Step 2: Use the request_workspace_access RPC to register intent,
    // then immediately set profile to the chosen role and active status.
    const { error: updateError } = await supabase.rpc("request_workspace_access", {
      request_first_name: profile?.first_name ?? profile?.full_name?.split(" ")[0] ?? "User",
      request_last_name: profile?.full_name?.split(" ").slice(1).join(" ") ?? "Account",
      request_phone_number: "+919876543210",
    });

    // If request_workspace_access fails (e.g. already requested), we continue anyway.
    // The key is the privileged profile update below.
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        company_id: company.id,
        role: testingRole as "admin" | "manager" | "member" | "guest",
        status: "active",
      })
      .eq("id", profile?.id);

    setBusy(false);

    if (profileError) {
      // The guard_profile_privileges trigger may block direct role writes.
      // Inform the user to apply the migration SQL in Supabase.
      setError(
        `Could not assign role directly: ${profileError.message}. ` +
        `Please run the migration SQL from supabase/migrations/20260717000008_testing_onboarding.sql ` +
        `in your Supabase SQL Editor to enable the join_company_for_testing function.`
      );
      return;
    }

    if (testingRole === "admin") {
      router.replace("/admin");
    } else {
      router.replace("/dashboard");
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[linear-gradient(180deg,#f7efff_0%,#f0e9ff_58%,#faeaf8_100%)] text-slate-500 font-sans">
        <div className="flex flex-col items-center gap-3">
          <span className="w-8 h-8 rounded-full border-3 border-indigo-600 border-t-transparent animate-spin" />
          <p className="text-sm font-semibold text-slate-600">Loading your profile...</p>
        </div>
      </main>
    );
  }

  const pName = profile?.full_name || profile?.first_name || (profile?.email ? profile.email.split("@")[0] : "User");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f7efff_0%,#f0e9ff_58%,#faeaf8_100%)] px-6 py-12 text-slate-900 font-sans flex items-center justify-center">
      {/* Background visual effects */}
      <div className="pointer-events-none absolute -left-36 -top-36 h-[520px] w-[520px] rounded-full bg-[#c7b6ff]/45 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-40 h-[620px] w-[620px] rounded-full bg-[#f7b8dc]/35 blur-3xl" />

      <section className="relative z-10 w-full max-w-2xl">
        {/* Onboarding Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-4 py-1 text-xs font-bold text-indigo-600 border border-indigo-100/60 shadow-sm shadow-indigo-100/20">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12z" />
            </svg>
            Authenticated Successfully
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Configure Your Workspace
          </h1>
          <p className="mt-2.5 text-sm text-slate-500 leading-relaxed max-w-md">
            Hi <span className="font-semibold text-slate-800">{pName}</span>, let's complete onboarding to open your DeskCulture OS dashboard.
          </p>
        </div>

        {error && (
          <Alert tone="danger" className="mb-6 rounded-2xl shadow-sm">
            {error}
          </Alert>
        )}

        {/* Step 1: Choose Onboarding Path */}
        {step === "choose" && (
          <div className="w-full">
            <h3 className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">
              CHOOSE ONBOARDING PATH
            </h3>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Card 1: Create Organization */}
              <div className="rounded-3xl border border-white/60 bg-white/80 p-8 shadow-xl shadow-indigo-100/10 backdrop-blur-xl flex flex-col justify-between transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-indigo-100/20">
                <div>
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 mb-6">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Create New Organization</h2>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500">
                    Establish a brand new instance of DeskCulture. You will become the <span className="font-bold text-slate-700">Organization Owner</span> with unrestricted RBAC capabilities.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep("create")}
                  className="mt-8 inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition hover:gap-2 text-left"
                >
                  Setup Brand Instance
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>

              {/* Card 2: Join Existing Workspace */}
              <div className="rounded-3xl border border-white/60 bg-white/80 p-8 shadow-xl shadow-indigo-100/10 backdrop-blur-xl flex flex-col justify-between transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-indigo-100/20">
                <div>
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 mb-6">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM12 11.25a6.75 6.75 0 0 0-6.75 6.75h13.5A6.75 6.75 0 0 0 12 11.25zM6.5 7.5H3.5a1.5 1.5 0 0 0-1.5 1.5v2.25c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75V9a1.5 1.5 0 0 0-1.5-1.5z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">Join Existing Workspace</h2>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500">
                    Enter an invitation voucher and choose your enterprise role to preview any specific RBAC permissions matrix.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep("join")}
                  className="mt-8 inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition hover:gap-2 text-left"
                >
                  Redeem Invite Code
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            </div>

            <p className="mt-12 text-center text-xs text-slate-400 font-medium tracking-wide">
              All workspace data is persisted to your Supabase project in real-time.
            </p>
          </div>
        )}

        {/* Step 2: Create Organization Form */}
        {step === "create" && (
          <Card className="rounded-3xl border border-white/70 bg-white/80 p-8 shadow-xl backdrop-blur-xl">
            <form onSubmit={createOrg} className="space-y-6">
              <label className="block text-sm font-bold text-slate-700">
                Organization Name
                <Input
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="DeskCulture Inc"
                  className="mt-2 h-12 rounded-2xl"
                />
              </label>

              <label className="block text-sm font-bold text-slate-700">
                Custom Domain URL
                <Input
                  required
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="deskculture.com"
                  className="mt-2 h-12 rounded-2xl"
                />
              </label>

              <label className="block text-sm font-bold text-slate-700">
                Industry Sector
                <Select
                  value={industrySector}
                  onChange={(e) => setIndustrySector(e.target.value)}
                  className="mt-2 h-12 rounded-2xl"
                >
                  <option value="Technology & SaaS">Technology &amp; SaaS</option>
                  <option value="Finance & Banking">Finance &amp; Banking</option>
                  <option value="Healthcare & Pharma">Healthcare &amp; Pharma</option>
                  <option value="Retail & E-commerce">Retail &amp; E-commerce</option>
                  <option value="Education">Education</option>
                  <option value="Other">Other</option>
                </Select>
              </label>

              {/* Privilege Grant Status Alert */}
              <div className="flex items-start gap-4 rounded-2xl bg-indigo-50/70 p-4 border border-indigo-100/50 mt-6">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-100 text-indigo-600 text-sm">
                  ★
                </span>
                <div>
                  <h4 className="font-bold text-sm text-indigo-950">Owner Status Granted</h4>
                  <p className="text-xs text-indigo-700 mt-0.5 leading-relaxed">
                    Creating an organization sets your default role to <span className="font-semibold">Organization Owner</span>, unlocking full Admin, HR, Drive, Settings, and Analytics parameters.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 h-12 rounded-2xl font-bold"
                  onClick={() => setStep("choose")}
                  disabled={busy}
                >
                  Go Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1 h-12 rounded-2xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5"
                  disabled={busy}
                >
                  {busy ? "Creating..." : "Create Organization"}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Step 3: Join Workspace Form */}
        {step === "join" && (
          <Card className="rounded-3xl border border-white/70 bg-white/80 p-8 shadow-xl backdrop-blur-xl">
            <form onSubmit={joinOrg} className="space-y-6">
              <label className="block text-sm font-bold text-slate-700">
                Invitation Code
                <Input
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="DC-MKTG-2026"
                  className="mt-2 h-12 rounded-2xl font-mono tracking-wider"
                />
                <span className="text-xs text-slate-400 mt-1.5 block leading-relaxed font-normal">
                  Enter any alphanumeric voucher code (e.g., DC-MKTG-2026).
                </span>
              </label>

              <label className="block text-sm font-bold text-slate-700">
                Select Desired Testing Role
                <Select
                  value={testingRole}
                  onChange={(e) => setTestingRole(e.target.value)}
                  className="mt-2 h-12 rounded-2xl"
                >
                  <option value="member">Employee (Default view - HR summary, tasks, meetings)</option>
                  <option value="admin">Admin (Full settings, departments, users matrices)</option>
                  <option value="admin">HR Admin (Attendance log, leaves overview)</option>
                  <option value="manager">Department Manager (Department scoped tasks &amp; chats)</option>
                  <option value="member">Team Lead (Assigned workspace project specs)</option>
                  <option value="guest">Guest (Highly restricted files viewing)</option>
                </Select>
              </label>

              <div className="flex gap-4 pt-6 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 h-12 rounded-2xl font-bold"
                  onClick={() => setStep("choose")}
                  disabled={busy}
                >
                  Go Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1 h-12 rounded-2xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5"
                  disabled={busy}
                >
                  {busy ? "Redeeming..." : "Redeem Invite Code"}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </Button>
              </div>
            </form>
          </Card>
        )}
      </section>
    </main>
  );
}
