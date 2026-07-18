import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type InviteRequest = {
  email?: string;
  role?: "admin" | "manager" | "member" | "guest";
  departmentId?: string | null;
};

type InviteResult = {
  id: string;
  email: string;
  code: string;
  token: string;
  role: string;
  departmentId: string | null;
  expiresAt: string;
};

function appOrigin(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.CLOUDFLARE_DEPLOYMENT_URL ||
    new URL(request.url).origin
  ).replace(/\/$/, "");
}

function inviteHtml(link: string, code: string) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f3ff;font-family:Arial,Helvetica,sans-serif;color:#101936;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f6f3ff;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e1ff;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 10px;">
                <div style="font-size:22px;font-weight:800;color:#101936;">Deskcultr</div>
                <h1 style="margin:22px 0 0;font-size:26px;line-height:1.25;">You are invited to join Deskcultr</h1>
                <p style="margin:12px 0 0;font-size:15px;line-height:1.65;color:#536080;">
                  Welcome. Use the secure invite link below to create or sign in to your account, then redeem your unique code to request access to the organization.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 32px;">
                <a href="${link}" style="display:inline-block;border-radius:14px;background:#5b36f2;color:#ffffff;text-decoration:none;padding:15px 24px;font-weight:800;font-size:15px;">
                  Join organization
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;">
                <p style="margin:0;font-size:13px;color:#536080;">Redeem code</p>
                <p style="margin:8px 0 0;border:1px solid #ded8ff;background:#f8f7ff;border-radius:12px;padding:14px 16px;font-size:18px;letter-spacing:2px;font-weight:800;color:#4f46e5;">${code}</p>
                <p style="margin:16px 0 0;word-break:break-all;font-size:12px;line-height:1.6;color:#5b36f2;">${link}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization");

  if (!supabaseUrl || !supabaseAnonKey || !authorization) {
    return NextResponse.json({ error: "Invite service is not configured." }, { status: 500 });
  }

  const body = (await request.json()) as InviteRequest;
  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("create_user_invite", {
    invite_email: email,
    assigned_role: body.role ?? "member",
    target_department: body.departmentId ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const invite = data as InviteResult;
  const params = new URLSearchParams({
    invite_code: invite.code,
    invite_token: invite.token,
  });
  const link = `${appOrigin(request)}/register?${params.toString()}`;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({
      invite: { ...invite, link },
      emailSent: false,
      warning: "RESEND_API_KEY is not configured, so the invite was created but no email was sent.",
    });
  }

  const from = process.env.INVITE_FROM_EMAIL || "Deskcultr <onboarding@resend.dev>";
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: invite.email,
      subject: "Welcome to Deskcultr - your organization invite",
      html: inviteHtml(link, invite.code),
    }),
  });

  if (!emailResponse.ok) {
    const details = await emailResponse.text();
    return NextResponse.json({
      invite: { ...invite, link },
      emailSent: false,
      warning: `Invite created, but email delivery failed: ${details}`,
    });
  }

  return NextResponse.json({ invite: { ...invite, link }, emailSent: true });
}
