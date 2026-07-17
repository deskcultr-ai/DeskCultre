"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getPostAuthRedirect } from "@/lib/auth-redirect";
import { supabase } from "@/lib/supabase";

export type AuthMode = "login" | "register";

const input =
  "mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60";

type AuthPanelProps = {
  initialMode?: AuthMode;
};

export default function AuthPanel({ initialMode = "login" }: AuthPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function switchMode(next: AuthMode) {
    setMode(next);
    setMessage("");
    setError("");
  }

  async function signInWithGoogle() {
    setError("");
    setMessage("");

    if (mode === "register") {
      const normalizedPhone = phone.replace(/[\s()-]/g, "");
      if (!firstName.trim() || !lastName.trim()) {
        setError("Enter your first and last name before continuing with Google.");
        return;
      }
      if (!/^\+[1-9][0-9]{7,14}$/.test(normalizedPhone)) {
        setError("Use an international phone number, for example +919876543210.");
        return;
      }
      window.localStorage.setItem(
        "deskCulture.pendingRegistration",
        JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phoneNumber: normalizedPhone,
        })
      );
    }

    setGoogleBusy(true);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (oauthError) {
      setGoogleBusy(false);
      setError("Unable to start Google sign-in. Try again or use email.");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setBusy(true);

    if (mode === "login") {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError) {
        setBusy(false);
        setError("Unable to sign in. Check your email and password.");
        return;
      }
      router.replace(await getPostAuthRedirect());
      return;
    }

    const normalizedPhone = phone.replace(/[\s()-]/g, "");
    if (!/^\+[1-9][0-9]{7,14}$/.test(normalizedPhone)) {
      setBusy(false);
      setError("Use an international phone number, for example +919876543210.");
      return;
    }
    if (password.length < 10) {
      setBusy(false);
      setError("Use a password with at least 10 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setBusy(false);
      setError("Passwords do not match.");
      return;
    }

    const { data, error: signupError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          registration_type: "workspace_join_request",
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone_number: normalizedPhone,
        },
      },
    });

    setBusy(false);
    if (signupError) {
      setError(signupError.message);
      return;
    }

    setMessage(
      data.user && !data.session
        ? "Check your email to verify your account. An admin will review your registration after verification."
        : "Your registration request is pending admin approval."
    );
  }

  return (
    <section className="w-full rounded-3xl border border-white/70 bg-white/82 p-7 shadow-[0_24px_60px_rgba(85,70,180,0.10)] backdrop-blur-xl sm:p-8">
      <div className="grid grid-cols-2 rounded-2xl bg-indigo-500/10 p-1 text-sm font-bold">
        <button
          type="button"
          onClick={() => switchMode("login")}
          className={`h-10 rounded-xl transition ${mode === "login" ? "bg-gradient-to-r from-indigo-600 to-violet-500 text-white shadow-md" : "text-slate-500"}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchMode("register")}
          className={`h-10 rounded-xl transition ${mode === "register" ? "bg-gradient-to-r from-indigo-600 to-violet-500 text-white shadow-md" : "text-slate-500"}`}
        >
          Register
        </button>
      </div>

      <h1 className="mt-7 text-2xl font-extrabold tracking-tight text-slate-950">
        {mode === "login" ? "Welcome back" : "Request workspace access"}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {mode === "login"
          ? "Sign in to your DeskCulture workspace."
          : "Register with any email. An admin assigns your workspace role and permissions."}
      </p>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={googleBusy}
        className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path
            fill="#4285F4"
            d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.58-5.17 3.58-8.87Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.73-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
          />
          <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.6H1.27a12 12 0 0 0 0 10.8l4-3.11Z" />
          <path
            fill="#EA4335"
            d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.6l4 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
          />
        </svg>
        {googleBusy ? "Redirecting..." : "Continue with Google"}
      </button>

      <div className="my-5 flex items-center gap-4 text-xs uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or continue with email
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "register" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                First name
                <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={input} />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Last name
                <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className={input} />
              </label>
            </div>
            <label className="block text-sm font-semibold text-slate-700">
              Phone number
              <input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919876543210" className={input} />
            </label>
          </>
        )}

        <label className="block text-sm font-semibold text-slate-700">
          Email address
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className={input}
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Password
          <input
            type="password"
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
        </label>
        {mode === "register" && (
          <label className="block text-sm font-semibold text-slate-700">
            Confirm password
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={input}
            />
          </label>
        )}

        {mode === "login" && (
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-slate-600">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded accent-indigo-600" />
              Remember me
            </label>
            <Link href="/reset-password" className="font-semibold text-indigo-600 hover:text-indigo-500">
              Forgot your password?
            </Link>
          </div>
        )}

        <button
          disabled={busy}
          className="h-14 w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-500 text-sm font-extrabold text-white shadow-[0_16px_30px_rgba(99,102,241,0.24)] transition hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account request"}
        </button>
      </form>

      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

      <div className="mt-6 text-center text-sm text-slate-500">
        {mode === "login" ? (
          <>
            New here?{" "}
            <button type="button" onClick={() => switchMode("register")} className="font-bold text-indigo-600 hover:text-indigo-500">
              Register for access
            </button>
          </>
        ) : (
          <>
            Already registered?{" "}
            <button type="button" onClick={() => switchMode("login")} className="font-bold text-indigo-600 hover:text-indigo-500">
              Sign in
            </button>
          </>
        )}
      </div>

      <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-500">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-3.5 w-3.5 shrink-0">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75M6 10.5h12a1.5 1.5 0 0 1 1.5 1.5v7.5A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5V12A1.5 1.5 0 0 1 6 10.5Z"
          />
        </svg>
        Your data is secure and encrypted.
      </div>
    </section>
  );
}
