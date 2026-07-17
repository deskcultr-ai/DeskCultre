"use client";

import { useEffect, useState } from "react";
import { getProfile, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui";

export default function ProjectsPlaceholder() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  return (
    <AppShell profile={profile} variant="admin" title="Projects" subtitle="Oversee project lifecycles.">
      <Card className="p-12 text-center text-slate-500">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Projects Portal</h3>
        <p className="mt-2 text-sm text-slate-400 max-w-sm mx-auto">Track team project timelines, task lists, and deliverables.</p>
      </Card>
    </AppShell>
  );
}
