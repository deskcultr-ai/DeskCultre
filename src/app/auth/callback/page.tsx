"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getPostAuthRedirect } from "@/lib/auth-redirect";
import { supabase } from "@/lib/supabase";

type PendingRegistration = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
};

function readPendingRegistration(): PendingRegistration | null {
  const raw = window.localStorage.getItem("deskCulture.pendingRegistration");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingRegistration;
    if (!parsed.firstName || !parsed.lastName || !parsed.phoneNumber) return null;
    return parsed;
  } catch {
    return null;
  }
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    let finished = false;
    let unmounted = false;

    async function finish() {
      if (finished || unmounted) return;
      finished = true;

      const pendingRegistration = readPendingRegistration();
      if (pendingRegistration) {
        const { error: requestError } = await supabase.rpc("request_workspace_access", {
          request_first_name: pendingRegistration.firstName,
          request_last_name: pendingRegistration.lastName,
          request_phone_number: pendingRegistration.phoneNumber,
        });

        if (requestError) {
          setError(requestError.message);
          return;
        }

        window.localStorage.removeItem("deskCulture.pendingRegistration");
      }

      // getPostAuthRedirect() is the single source of truth: it resolves to
      // /onboarding, /admin or /dashboard from the profile's org + role. Only
      // honour ?next= when it's a real destination (e.g. password reset).
      const next = searchParams.get("next");
      const redirectTo = next === "/account" ? "/account" : await getPostAuthRedirect();
      router.replace(redirectTo);
    }

    // The provider can bounce back with a failure (consent denied, bad config…).
    const providerError = searchParams.get("error_description") ?? searchParams.get("error");
    if (providerError) {
      setError(providerError);
      return;
    }

    // Do NOT call exchangeCodeForSession() here. The client sets
    // detectSessionInUrl, so supabase-js already exchanges the ?code= itself on
    // init and then deletes the PKCE code verifier from storage. Exchanging a
    // second time races that and fails with "PKCE code verifier not found in
    // storage". Just wait for the session the automatic exchange establishes.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish();
    });

    // Covers the case where the exchange already completed before we subscribed.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish();
    });

    // If the automatic exchange hasn't produced a session, work out *why* rather
    // than just timing out. The usual cause is an origin mismatch: the PKCE code
    // verifier is written to localStorage on the origin where sign-in started, so
    // if Supabase redirects somewhere else (localhost vs 127.0.0.1, or a
    // different deployment) the verifier simply isn't here.
    const timer = setTimeout(() => {
      if (finished || unmounted) return;

      const hasCode = !!searchParams.get("code");
      if (!hasCode) {
        setError("No sign-in code was returned. Start the sign-in again from the login page.");
        return;
      }

      const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(/https:\/\/([^.]+)\./)?.[1];
      const verifierKey = ref ? `sb-${ref}-auth-token-code-verifier` : null;
      const hasVerifier = verifierKey ? window.localStorage.getItem(verifierKey) !== null : false;

      if (!hasVerifier) {
        setError(
          `Sign-in could not be completed on this address (${window.location.origin}). The security code ` +
            `is stored by the page that started the sign-in, and it isn't present here — so the sign-in began ` +
            `on a different address. In Supabase, set Site URL and Redirect URLs to exactly ${window.location.origin}, ` +
            `then start again from that same address.`
        );
        return;
      }

      setError("Timed out while finishing sign in. Please try again.");
    }, 8000);

    return () => {
      unmounted = true;
      clearTimeout(timer);
      subscription.subscription.unsubscribe();
    };
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f7efff_0%,#f0e9ff_58%,#faeaf8_100%)] px-6 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-[0_24px_60px_rgba(85,70,180,0.12)] backdrop-blur-xl">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#7b61ff] to-[#5d42df] font-black text-white">
          D
        </div>
        <h1 className="mt-5 text-2xl font-black tracking-tight">Finishing sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          We are confirming your Supabase session and preparing your workspace.
        </p>
        {error && (
          <>
            <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>
            <Link href="/login" className="mt-5 inline-flex text-sm font-bold text-indigo-600 hover:text-indigo-500">
              Back to sign in
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f7efff_0%,#f0e9ff_58%,#faeaf8_100%)] px-6 text-slate-900">
          <section className="w-full max-w-md rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-[0_24px_60px_rgba(85,70,180,0.12)] backdrop-blur-xl">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#7b61ff] to-[#5d42df] font-black text-white">
              D
            </div>
            <h1 className="mt-5 text-2xl font-black tracking-tight">Finishing sign in</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Preparing your workspace.</p>
          </section>
        </main>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
