"use client";

import { supabase } from "@/lib/supabase";

export async function getPostAuthRedirect() {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  if (!user) return "/login";

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();

  return profile ? "/dashboard" : "/account";
}
