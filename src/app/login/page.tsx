"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage("Sending secure login link...");
    setMessageType("");

    const redirectTo = `${window.location.origin}/dashboard`;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    setSending(false);

    if (error) {
      setMessageType("error");
      setMessage(error.message);
      return;
    }

    setMessageType("success");
    setMessage("Login link sent. Please check your email.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 shadow-2xl">
        <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>

        <h1 className="mt-3 text-3xl font-bold">Login to your workspace</h1>

        <p className="mt-3 text-slate-300">
          Enter your email and we will send you a secure login link.
        </p>

        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <div>
            <label className="text-sm text-slate-300">Email address</label>
            <input
              type="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={sending}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400 disabled:opacity-60"
            />
          </div>

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? "Sending..." : "Send login link"}
          </button>
        </form>

        {message && (
          <p
            className={`mt-5 text-sm ${
              messageType === "error"
                ? "text-red-300"
                : messageType === "success"
                  ? "text-green-300"
                  : "text-cyan-200"
            }`}
          >
            {message}
          </p>
        )}

        <Link
          href="/"
          className="mt-6 inline-block text-sm text-slate-400 hover:text-cyan-300"
        >
          ← Back to home
        </Link>
      </section>
    </main>
  );
}
