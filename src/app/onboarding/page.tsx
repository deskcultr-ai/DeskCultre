"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, type Profile } from "@/lib/session";
import { Button, Input, Card, Alert, Select } from "@/components/ui";
import { cn } from "@/lib/cn";

type Step = "name" | "who-are-you" | "choose" | "create" | "join" | "waiting-approval";

type PersonaCard = {
  id: string;
  label: string;
  description: string;
  suggestedPath: "create" | "join";
  icon: React.ReactNode;
};

const personas: PersonaCard[] = [
  {
    id: "owner",
    label: "Business Owner / Founder",
    description: "You're starting or running the company. You'll set up the workspace for your team.",
    suggestedPath: "create",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-7 w-7">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    ),
  },
  {
    id: "admin",
    label: "Admin / Manager",
    description: "You manage teams, departments, or the overall workspace configuration.",
    suggestedPath: "join",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-7 w-7">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
  {
    id: "employee",
    label: "Employee / Team Member",
    description: "You work within a team. You'll find your organization, then request access with an invite code.",
    suggestedPath: "join",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-7 w-7">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    ),
  },
  {
    id: "guest",
    label: "Guest / Viewer",
    description: "You need limited access to view specific files or projects in a workspace.",
    suggestedPath: "join",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-7 w-7">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178Z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("name");

  // Step 1: Name
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Step 2: Persona
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);

  // Step 4a: Create Org
  const [companyName, setCompanyName] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [industrySector, setIndustrySector] = useState("Technology & SaaS");

  const [inviteCode, setInviteCode] = useState("");
  const [joinStage, setJoinStage] = useState<"lookup" | "code">("lookup");
  const [orgSearch, setOrgSearch] = useState("");
  const [companyMatches, setCompanyMatches] = useState<Array<{ id: string; name: string; slug: string | null }>>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [testingRole, setTestingRole] = useState("member");
  const [availableDepartments, setAvailableDepartments] = useState<{ id: string; name: string }[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [verifiedCompany, setVerifiedCompany] = useState<string>("");
  const [codeMailStatus, setCodeMailStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [codeMailMessage, setCodeMailMessage] = useState("");

  // Waiting Approval States
  const [pendingCompany, setPendingCompany] = useState<string>("");
  const [pendingDeptName, setPendingDeptName] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activationSuccess, setActivationSuccess] = useState("");

  // 1. Core Profile check and redirect
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

    // If joined but pending admin approval, switch to Waiting Approval view
    if (me.company_id && me.status === "pending") {
      setStep("waiting-approval");

      // Fetch company name & department name to present
      const [companyRes, deptRes] = await Promise.all([
        supabase.from("companies").select("name").eq("id", me.company_id).maybeSingle(),
        me.department_id
          ? supabase.from("departments").select("name").eq("id", me.department_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (companyRes.data) {
        setPendingCompany(companyRes.data.name);
      }
      if (deptRes.data) {
        setPendingDeptName(deptRes.data.name);
      }
    } else {
      // Pre-fill name from existing profile if available
      const fullName: string = (me as unknown as Record<string, unknown>).full_name as string ?? "";
      if (fullName) {
        const parts = fullName.trim().split(" ");
        setFirstName(parts[0] ?? "");
        setLastName(parts.slice(1).join(" ") ?? "");
      }
    }

    setLoading(false);
  }, [router]);

  // 2. Watch for url activation parameters: ?action=activate&user_id=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    const userId = params.get("user_id");
    if (action === "activate" && userId) {
      async function activate() {
        setLoading(true);
        const { error } = await supabase.rpc("activate_user_via_link", { target_id: userId });
        if (error) {
          setError("Activation link failed or was already used: " + error.message);
          setLoading(false);
        } else {
          setActivationSuccess("Account successfully activated! Loading your panel...");
          // Refresh profile check to send the user to the panel immediately
          await check();
        }
      }
      activate();
    } else {
      check();
    }
  }, [check]);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    if (!firstName.trim()) return;

    setBusy(true);
    setError("");

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
      })
      .eq("id", profile?.id);

    setBusy(false);
    if (updateError) {
      console.warn("Could not save name:", updateError.message);
    }
    setStep("who-are-you");
  }

  async function createOrg(event: React.FormEvent) {
    event.preventDefault();
    if (!companyName.trim()) return;

    setBusy(true);
    setError("");

    const { error: rpcError } = await supabase.rpc("create_company", {
      company_name: companyName.trim(),
      custom_domain: customDomain.trim() || null,
      industry: industrySector || null,
    });

    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    router.replace("/admin");
  }

  async function joinOrg(event: React.FormEvent) {
    event.preventDefault();
    if (joinStage === "lookup") {
      if (!orgSearch.trim()) return;
      setBusy(true);
      setError("");
      const { data, error: searchError } = await supabase.rpc("find_company_for_join", {
        search_name: orgSearch.trim(),
      });
      setBusy(false);
      if (searchError) {
        setError(searchError.message);
        return;
      }
      const matches = (data ?? []) as Array<{ id: string; name: string; slug: string | null }>;
      setCompanyMatches(matches);
      if (matches.length === 1) {
        await selectCompany(matches[0]);
      } else if (matches.length === 0) {
        setError("No organization matched that name.");
      }
      return;
    }

    if (!inviteCode.trim() || !selectedCompanyId) return;

    setBusy(true);
    setError("");

    const trimmedCode = inviteCode.trim().toUpperCase();
    const { error: rpcError } = await supabase.rpc("join_company_with_daily_code", {
      target_company: selectedCompanyId,
      invite_code: trimmedCode,
      target_department: selectedDepartment || null,
    });

    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    // Refresh profile to trigger "waiting-approval" state display
    check();
  }

  async function selectCompany(company: { id: string; name: string }) {
    setSelectedCompanyId(company.id);
    setVerifiedCompany(company.name);
    setJoinStage("code");
    setInviteCode("");
    setError("");
    setCodeMailStatus("sending");
    setCodeMailMessage("Sending the invitation code to your email...");
    const { data, error: deptError } = await supabase.rpc("get_departments_by_company", {
      target_company: company.id,
    });
    if (!deptError && data) {
      setAvailableDepartments(data);
      setSelectedDepartment(data[0]?.id ?? "");
    } else {
      setAvailableDepartments([]);
      setSelectedDepartment("");
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setCodeMailStatus("failed");
      setCodeMailMessage("Sign in again before we can email your invitation code.");
      return;
    }

    const response = await fetch("/api/onboarding/join-code", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ companyId: company.id }),
    });
    const result = await response.json();
    if (!response.ok) {
      setCodeMailStatus("failed");
      setCodeMailMessage(result.error ?? "Could not send the invitation code email. Ask your admin for today's code.");
      return;
    }

    setCodeMailStatus("sent");
    setCodeMailMessage("Invitation code sent to your email. Paste it below to request admin approval.");
  }

  async function cancelRequest() {
    setBusy(true);
    setError("");
    const { error: cancelError } = await supabase.rpc("leave_company_for_testing");
    setBusy(false);
    if (cancelError) {
      setError(cancelError.message);
      return;
    }
    setStep("choose");
    check();
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[linear-gradient(180deg,#f7efff_0%,#f0e9ff_58%,#faeaf8_100%)] text-slate-500 font-sans">
        <div className="flex flex-col items-center gap-3">
          <span className="w-8 h-8 rounded-full border-[3px] border-indigo-600 border-t-transparent animate-spin" />
          <p className="text-sm font-semibold text-slate-600">
            {activationSuccess ? activationSuccess : "Loading your profile..."}
          </p>
        </div>
      </main>
    );
  }

  // Step progress indicator
  const steps = ["name", "who-are-you", "choose", "create-join"];
  const currentStepIdx =
    step === "name" ? 0
    : step === "who-are-you" ? 1
    : step === "choose" ? 2
    : 3;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f7efff_0%,#f0e9ff_58%,#faeaf8_100%)] px-6 py-12 text-slate-900 font-sans flex items-center justify-center">
      {/* Background blobs */}
      <div className="pointer-events-none absolute -left-36 -top-36 h-[520px] w-[520px] rounded-full bg-[#c7b6ff]/45 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-40 h-[620px] w-[620px] rounded-full bg-[#f7b8dc]/35 blur-3xl" />

      <section className="relative z-10 w-full max-w-2xl">
        {/* Header */}
        {step !== "waiting-approval" && (
          <div className="flex flex-col items-center text-center mb-8">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-4 py-1 text-xs font-bold text-indigo-600 border border-indigo-100/60 shadow-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12z" />
              </svg>
              Authenticated Successfully
            </div>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Configure Your Workspace
            </h1>
            <p className="mt-2.5 text-sm text-slate-500 leading-relaxed max-w-md">
              Let&apos;s set up your DeskCulture OS account in just a few steps.
            </p>

            {/* Progress dots */}
            <div className="flex items-center gap-2 mt-5">
              {steps.map((s, i) => (
                <div
                  key={s}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    i === currentStepIdx
                      ? "w-6 bg-indigo-600"
                      : i < currentStepIdx
                      ? "w-2 bg-indigo-400"
                      : "w-2 bg-slate-200"
                  )}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <Alert tone="danger" className="mb-6 rounded-2xl shadow-sm">
            {error}
          </Alert>
        )}

        {activationSuccess && (
          <Alert tone="success" className="mb-6 rounded-2xl shadow-sm">
            {activationSuccess}
          </Alert>
        )}

        {/* ── Step 1: Your Name ── */}
        {step === "name" && (
          <Card className="rounded-3xl border border-white/70 bg-white/80 p-8 shadow-xl backdrop-blur-xl">
            <h2 className="text-xl font-bold text-slate-900">What&apos;s your name?</h2>
            <p className="mt-1 text-sm text-slate-500">We&apos;ll use this to personalize your workspace experience.</p>
            <form onSubmit={saveName} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold text-slate-700">
                  First Name
                  <Input
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Alex"
                    className="mt-2 h-12 rounded-2xl"
                  />
                </label>
                <label className="block text-sm font-bold text-slate-700">
                  Last Name
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Johnson"
                    className="mt-2 h-12 rounded-2xl"
                  />
                </label>
              </div>
              <Button
                type="submit"
                disabled={busy || !firstName.trim()}
                className="mt-2 w-full h-12 rounded-2xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2"
              >
                {busy ? "Saving..." : "Continue"}
                {!busy && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                )}
              </Button>
            </form>
          </Card>
        )}

        {/* ── Step 2: Who Are You? ── */}
        {step === "who-are-you" && (
          <div className="w-full">
            <h2 className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">
              WHO ARE YOU?
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {personas.map((persona) => (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => setSelectedPersona(persona.id)}
                  className={cn(
                    "rounded-3xl border-2 bg-white/80 p-6 text-left shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-xl flex flex-col gap-3",
                    selectedPersona === persona.id
                      ? "border-indigo-500 ring-2 ring-indigo-200"
                      : "border-white/60 hover:border-indigo-200"
                  )}
                >
                  <div className={cn(
                    "grid h-12 w-12 place-items-center rounded-2xl",
                    selectedPersona === persona.id ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-600"
                  )}>
                    {persona.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{persona.label}</h3>
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">{persona.description}</p>
                  </div>
                  {selectedPersona === persona.id && (
                    <div className="flex items-center gap-1 text-xs font-bold text-indigo-600">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
                      </svg>
                      Selected
                    </div>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-6 flex gap-4">
              <Button
                type="button"
                variant="secondary"
                className="flex-1 h-12 rounded-2xl font-bold"
                onClick={() => setStep("name")}
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={!selectedPersona}
                className="flex-1 h-12 rounded-2xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 disabled:opacity-50"
                onClick={() => {
                  const persona = personas.find((p) => p.id === selectedPersona);
                  if (persona?.suggestedPath === "create") {
                    setTestingRole("admin");
                  } else {
                    setTestingRole(selectedPersona === "employee" ? "member" : (selectedPersona || "member"));
                  }
                  setStep("choose");
                }}
              >
                Continue
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Choose Path ── */}
        {step === "choose" && (
          <div className="w-full">
            <h2 className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-6">
              CHOOSE ONBOARDING PATH
            </h2>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Create Org */}
              <div className="rounded-3xl border border-white/60 bg-white/80 p-8 shadow-xl shadow-indigo-100/10 backdrop-blur-xl flex flex-col justify-between transition hover:-translate-y-0.5 hover:shadow-2xl">
                <div>
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 mb-6">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Create New Organization</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500">
                    Establish a brand new DeskCulture instance. You become the <span className="font-bold text-slate-700">Organization Owner</span> with full admin access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep("create")}
                  className="mt-8 inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition hover:gap-2"
                >
                  Setup Brand Instance
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>

              {/* Join Org */}
              <div className="rounded-3xl border border-white/60 bg-white/80 p-8 shadow-xl shadow-indigo-100/10 backdrop-blur-xl flex flex-col justify-between transition hover:-translate-y-0.5 hover:shadow-2xl">
                <div>
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 mb-6">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-6 w-6">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Join Existing Workspace</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500">
                    Search your organization name, then enter the code sent by Deskcultr or shared by your admin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setJoinStage("lookup");
                    setOrgSearch("");
                    setCompanyMatches([]);
                    setSelectedCompanyId("");
                    setVerifiedCompany("");
                    setInviteCode("");
                    setAvailableDepartments([]);
                    setSelectedDepartment("");
                    setCodeMailStatus("idle");
                    setCodeMailMessage("");
                    setStep("join");
                  }}
                  className="mt-8 inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition hover:gap-2"
                >
                  Find Organization
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep("who-are-you")}
              className="mt-6 mx-auto flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Back
            </button>
          </div>
        )}

        {/* ── Step 4a: Create Org Form ── */}
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

              <div className="flex items-start gap-4 rounded-2xl bg-indigo-50/70 p-4 border border-indigo-100/50">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-100 text-indigo-600 text-sm">★</span>
                <div>
                  <h4 className="font-bold text-sm text-indigo-950">Owner Status Granted</h4>
                  <p className="text-xs text-indigo-700 mt-0.5 leading-relaxed">
                    Creating an organization sets your role to <span className="font-semibold">Organization Owner</span>, unlocking full Admin, HR, Drive, Settings, and Analytics access.
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
                  {busy ? "Creating..." : "Create Organization →"}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* ── Step 4b: Join Org Form ── */}
        {step === "join" && (
          <Card className="rounded-3xl border border-white/70 bg-white/80 p-8 shadow-xl backdrop-blur-xl">
            <form onSubmit={joinOrg} className="space-y-6">
              {joinStage === "lookup" ? (
                <>
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900">Find your organization</h2>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                      Enter your organization name. Once we find it, Deskcultr will ask for the daily invitation code from your email.
                    </p>
                  </div>
                  <label className="block text-sm font-bold text-slate-700">
                    Organization Name
                    <Input
                      required
                      value={orgSearch}
                      onChange={(e) => {
                        setOrgSearch(e.target.value);
                        setCompanyMatches([]);
                      }}
                      placeholder="DeskCulture"
                      className="mt-2 h-12 rounded-2xl"
                    />
                  </label>
                  {companyMatches.length > 1 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Select matching organization</p>
                      {companyMatches.map((company) => (
                        <button
                          key={company.id}
                          type="button"
                          onClick={() => selectCompany(company)}
                          className="flex w-full items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-left text-sm font-bold text-slate-800 hover:border-indigo-300 hover:bg-indigo-50"
                        >
                          {company.name}
                          <span className="text-indigo-600">Continue</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-indigo-500">Organization found</p>
                    <h2 className="mt-1 text-xl font-extrabold text-slate-900">{verifiedCompany}</h2>
                    <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">
                      Check your mail for the invitation code. Your admin can also share today&apos;s code from Users &amp; Teams.
                    </p>
                  </div>
                  {codeMailMessage && (
                    <Alert
                      tone={codeMailStatus === "failed" ? "danger" : codeMailStatus === "sent" ? "success" : "info"}
                      className="rounded-2xl"
                    >
                      {codeMailMessage}
                    </Alert>
                  )}
                  <label className="block text-sm font-bold text-slate-700">
                    Invitation Code
                    <Input
                      required
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      placeholder="DC-7A2F-91BC"
                      className="mt-2 h-12 rounded-2xl font-mono tracking-wider"
                    />
                    <span className="text-xs text-slate-400 mt-1 block leading-relaxed font-normal">
                      Codes rotate every 24 hours. Use the latest code from your email or admin.
                    </span>
                  </label>

                  <label className="block text-sm font-bold text-slate-700">
                    Select Department
                    <Select
                      value={selectedDepartment}
                      onChange={(e) => setSelectedDepartment(e.target.value)}
                      className="mt-2 h-12 rounded-2xl"
                    >
                      <option value="">No department yet</option>
                      {availableDepartments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                </>
              )}

              <div className="flex gap-4 pt-6 border-t border-slate-100">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 h-12 rounded-2xl font-bold"
                  onClick={() => {
                    if (joinStage === "code") {
                      setJoinStage("lookup");
                      setSelectedCompanyId("");
                      setVerifiedCompany("");
                      setInviteCode("");
                      setAvailableDepartments([]);
                      setSelectedDepartment("");
                      setCodeMailStatus("idle");
                      setCodeMailMessage("");
                    } else {
                      setStep("choose");
                    }
                  }}
                  disabled={busy}
                >
                  Go Back
                </Button>
                <Button
                  type="submit"
                  className="flex-1 h-12 rounded-2xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5"
                  disabled={busy || (joinStage === "lookup" ? !orgSearch.trim() : !inviteCode.trim() || !selectedCompanyId)}
                >
                  {busy ? "Working..." : joinStage === "lookup" ? "Find Organization ->" : "Request Admin Approval ->"}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* ── Step 5: Waiting Approval Screen ── */}
        {step === "waiting-approval" && (
          <Card className="rounded-3xl border border-indigo-200/60 bg-white/90 p-8 shadow-2xl backdrop-blur-xl text-center flex flex-col items-center">
            {/* Spinning hourglass or progress loader */}
            <div className="relative flex items-center justify-center h-20 w-20 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 mb-6 animate-pulse">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-10 w-10 animate-spin">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>

            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Waiting Approval</h2>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed max-w-md">
              Hi <span className="font-semibold text-slate-800">{firstName}</span>! Your request to join{" "}
              <strong className="text-indigo-600 font-bold">{pendingCompany || "the organization"}</strong>{" "}
              {pendingDeptName && (
                <>
                  in the <strong className="text-slate-800 font-semibold">{pendingDeptName}</strong> department{" "}
                </>
              )}
              is waiting for approval.
            </p>

            <div className="mt-5 rounded-2xl bg-slate-50 border border-slate-100 p-4 w-full text-left space-y-2 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Selected Role:</span>
                <span className="font-bold capitalize text-slate-900">{profile?.role.replace("_", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span>Account Status:</span>
                <span className="rounded-full bg-warning-light px-2.5 py-0.5 text-[10px] font-bold text-warning capitalize">
                  {profile?.status}
                </span>
              </div>
            </div>

            <p className="mt-6 text-sm text-indigo-700 font-medium">
              ✉️ Check your inbox for the activation link once approved by your admin.
            </p>

            <div className="mt-8 flex gap-4 w-full border-t border-slate-100 pt-6">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={cancelRequest}
                className="flex-1 h-12 rounded-2xl font-bold border border-red-200 text-red-600 hover:bg-red-50"
              >
                Cancel Request
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={check}
                className="flex-1 h-12 rounded-2xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5 animate-bounce"
              >
                Check Approval
              </Button>
            </div>
          </Card>
        )}
      </section>
    </main>
  );
}
