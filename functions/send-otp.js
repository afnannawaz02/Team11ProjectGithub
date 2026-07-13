/**
 * functions/send-otp.js — Cloudflare Pages Function
 * POST /send-otp
 *
 * Env bindings required (set in Cloudflare Pages → Settings → Environment variables):
 *   RESEND_API_KEY        — Resend API key
 *   RESEND_FROM           — Verified sender address (e.g. noreply@yourdomain.com)
 *   ALLOWED_EMAIL_DOMAIN  — e.g. ibm.com
 *   OTP_STORE             — KV namespace binding
 */

function generateOTP() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

export async function onRequestPost({ request, env }) {
  const { email = '' } = await request.json().catch(() => ({}));
  const normalised = email.trim().toLowerCase();
  const domain = env.ALLOWED_EMAIL_DOMAIN || 'ibm.com';

  if (domain !== '.' && !normalised.endsWith(`@${domain}`)) {
    return Response.json({ error: `Only @${domain} addresses are allowed.` }, { status: 403 });
  }

  if (!env.RESEND_API_KEY) {
    return Response.json({ error: 'Email service not configured.' }, { status: 503 });
  }

  const code      = generateOTP();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  // Store in KV with a 10-minute TTL
  await env.OTP_STORE.put(normalised, JSON.stringify({ code, expiresAt }), { expirationTtl: 600 });

  const from = env.RESEND_FROM || 'noreply@team11.uk';

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from,
      to:      [normalised],
      subject: 'Your Candyland Bank access code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;">
          <h2 style="margin:0 0 0.5rem;">Your access code</h2>
          <p style="color:#555;margin:0 0 1.5rem;">Use the code below to access Candyland Bank. It expires in 10 minutes.</p>
          <div style="font-size:2.5rem;font-weight:700;letter-spacing:0.15em;color:#cc0000;margin-bottom:1.5rem;">${code}</div>
          <p style="color:#999;font-size:0.8rem;">If you didn't request this, ignore this email.</p>
        </div>
      `,
    }),
  });

  const resendBody = await emailRes.text();

  if (!emailRes.ok) {
    console.error('Resend error:', emailRes.status, resendBody);
    // Return the actual Resend error so we can diagnose it in the UI
    let detail = resendBody;
    try { detail = JSON.parse(resendBody)?.message || resendBody; } catch {}
    return Response.json({ error: `Failed to send email: ${detail}` }, { status: 500 });
  }

  return Response.json({ ok: true });
}
