import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type RequestBody = {
  companyId?: string;
};

type JoinEmailPayload = {
  inviteId: string;
  email: string;
  companyId: string;
  companyName: string;
  code: string;
  expiresAt: string;
};

async function envValue(name: string) {
  const fromProcess = process.env[name];
  if (fromProcess) return fromProcess;
  try {
    const context = await getCloudflareContext({ async: true });
    const value = context.env[name as keyof typeof context.env];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function codeHtml(payload: JoinEmailPayload) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f3ff;font-family:Arial,Helvetica,sans-serif;color:#101936;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f6f3ff;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e1ff;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:30px 32px 12px;">
                <div style="font-size:22px;font-weight:800;color:#101936;">Deskcultr</div>
                <h1 style="margin:22px 0 0;font-size:25px;line-height:1.25;">Your invitation code for ${payload.companyName}</h1>
                <p style="margin:12px 0 0;font-size:15px;line-height:1.65;color:#536080;">
                  Welcome. Enter this code on the Deskcultr join organization screen to request admin approval.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 32px 30px;">
                <p style="margin:0;font-size:13px;color:#536080;">Invitation code</p>
                <p style="margin:8px 0 0;border:1px solid #ded8ff;background:#f8f7ff;border-radius:12px;padding:15px 16px;font-size:20px;letter-spacing:2px;font-weight:800;color:#4f46e5;">${payload.code}</p>
                <p style="margin:14px 0 0;font-size:12px;color:#536080;">This code rotates every 24 hours.</p>
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
  const supabaseUrl = await envValue("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = await envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const resendKey = await envValue("RESEND_API_KEY");
  const authorization = request.headers.get("authorization");

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Join-code service is not configured." }, { status: 500 });
  }
  if (!authorization) {
    return NextResponse.json({ error: "Authorization is required." }, { status: 401 });
  }
  if (!resendKey) {
    return NextResponse.json({ error: "RESEND_API_KEY is not configured on Cloudflare." }, { status: 500 });
  }

  const body = (await request.json()) as RequestBody;
  if (!body.companyId) {
    return NextResponse.json({ error: "Organization is required." }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("get_join_org_email_payload", {
    target_company: body.companyId,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const payload = data as JoinEmailPayload;
  const from = (await envValue("INVITE_FROM_EMAIL")) || "Deskcultr <onboarding@resend.dev>";
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: payload.email,
      subject: `Your Deskcultr code for ${payload.companyName}`,
      html: codeHtml(payload),
    }),
  });

  if (!emailResponse.ok) {
    const details = await emailResponse.text();
    await supabase.rpc("mark_join_org_code_email", {
      invite_id: payload.inviteId,
      delivered: false,
      delivery_error: details,
    });
    return NextResponse.json(
      {
        error: `Resend rejected the join-code email: ${details}`,
        code: payload.code,
        expiresAt: payload.expiresAt,
      },
      { status: 502 }
    );
  }

  await supabase.rpc("mark_join_org_code_email", {
    invite_id: payload.inviteId,
    delivered: true,
    delivery_error: null,
  });

  return NextResponse.json({ emailSent: true, expiresAt: payload.expiresAt });
}
