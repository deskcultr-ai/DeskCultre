import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json({ error: "Server configuration error" }, { status: 500 });
  }

  const authenticatedClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const forwardedFor = request.headers.get("x-forwarded-for");
  const requestIp =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip");

  const { data, error } = await authenticatedClient.rpc(
    "record_attendance_login",
    {
      request_ip: requestIp,
      request_user_agent: request.headers.get("user-agent"),
    }
  );

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  return Response.json({ attendance: data });
}
