import { supabase } from "@/lib/supabase";

export type Profile = {
  id: string;
  company_id: string | null;
  department_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  role: "super_admin" | "admin" | "manager" | "member" | "guest";
  status: "pending" | "active" | "suspended";
};

const PROFILE_COLUMNS =
  "id, company_id, department_id, email, first_name, last_name, full_name, avatar_url, job_title, role, status";

/** Current signed-in profile, or null when signed out / no profile row. */
export async function getProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", auth.user.id)
    .maybeSingle();
  return (data as Profile) ?? null;
}

export function isManager(profile: Profile | null): boolean {
  return !!profile && ["super_admin", "admin", "manager"].includes(profile.role);
}

export function isAdmin(profile: Profile | null): boolean {
  return !!profile && ["super_admin", "admin"].includes(profile.role);
}

export function displayName(profile: Profile | null): string {
  if (!profile) return "there";
  return profile.first_name || profile.full_name || profile.email?.split("@")[0] || "there";
}
