"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/dashboard");
        return;
      }
      setCheckingSession(false);
    }

    checkSession();
  }, [router]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage("Sending your secure sign-in link...");
    setMessageType("");

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });

    setSending(false);
    if (error) {
      setMessageType("error");
      setMessage(error.message);
      return;
    }
    setMessageType("success");
    setMessage("Check your inbox for a secure FlowDesk sign-in link.");
  }

  if (checkingSession) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">Loading FlowDesk...</main>;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="grid w-full gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>
            <h1 className="mt-3 max-w-xl text-4xl font-bold leading-tight sm:text-5xl">
              Your workday, tasks, and approvals in one place.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Sign in to manage your assignments, track attendance, collaborate on meetings, and keep work moving.
            </p>
            <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-3">
              {[
                ["Tasks", "Assigned work"],
                ["Approvals", "Clear decisions"],
                ["Attendance", "Daily visibility"],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="font-semibold text-cyan-200">{title}</p>
                  <p className="mt-1 text-xs text-slate-400">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <section className="w-full rounded-3xl border border-white/10 bg-white/10 p-7 shadow-2xl sm:p-9">
            <p className="text-sm font-semibold text-cyan-300">Welcome back</p>
            <h2 className="mt-2 text-3xl font-bold">Sign in to FlowDesk</h2>
            <p className="mt-3 text-slate-300">We will email you a secure, passwordless sign-in link.</p>
            <form onSubmit={handleLogin} className="mt-8 space-y-5">
              <label className="block text-sm font-medium text-slate-200">
                Work email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  disabled={sending}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400 disabled:opacity-60"
                />
              </label>
              <button type="submit" disabled={sending} className="w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">
                {sending ? "Sending sign-in link..." : "Email me a sign-in link"}
              </button>
            </form>
            {message && <p className={`mt-5 rounded-xl border p-3 text-sm ${messageType === "error" ? "border-red-400/30 bg-red-400/10 text-red-200" : messageType === "success" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-cyan-400/20 bg-cyan-400/5 text-cyan-100"}`}>{message}</p>}
            <p className="mt-6 text-xs leading-5 text-slate-500">Use your approved company email address. Contact your administrator if you need workspace access.</p>
          </section>
        </div>
      </section>
    </main>
  );
}
