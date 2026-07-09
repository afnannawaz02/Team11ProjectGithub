/**
 * functions/verify-otp.js — Cloudflare Pages Function
 * POST /verify-otp
 *
 * Env bindings required:
 *   OTP_STORE — KV namespace binding
 */

export async function onRequestPost({ request, env }) {
  const { email = '', code = '' } = await request.json().catch(() => ({}));
  const normalised = email.trim().toLowerCase();

  const raw = await env.OTP_STORE.get(normalised);
  if (!raw) {
    return Response.json({ error: 'No code found for this email. Request a new one.' }, { status: 400 });
  }

  const entry = JSON.parse(raw);

  if (Date.now() > entry.expiresAt) {
    await env.OTP_STORE.delete(normalised);
    return Response.json({ error: 'Code expired. Request a new one.' }, { status: 400 });
  }

  if (entry.code !== code.trim()) {
    return Response.json({ error: 'Incorrect code. Try again.' }, { status: 400 });
  }

  // Single-use — delete after successful verify
  await env.OTP_STORE.delete(normalised);
  return Response.json({ ok: true });
}
