"use client";

import { useEffect, useState } from "react";
import { getProfile, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";

export default function DrivePlaceholder() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  return (
    <AppShell profile={profile} variant="admin" title="Drive" subtitle="Store and share company files.">
      <Card className="p-12 text-center text-slate-500">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Drive Portal</h3>
        <p className="mt-2 text-sm text-slate-400 max-w-sm mx-auto">Upload documents, sheets, and presentations with folder security settings.</p>
      </Card>
    </AppShell>
  );
}
