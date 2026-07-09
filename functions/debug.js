/**
 * functions/debug.js — temporary diagnostic endpoint
 * GET /debug — returns which env vars and bindings are present (no secret values)
 * DELETE THIS FILE before going public.
 */
export async function onRequestGet({ env }) {
  return Response.json({
    RESEND_API_KEY:       !!env.RESEND_API_KEY,
    RESEND_FROM:          env.RESEND_FROM || '(not set)',
    ALLOWED_EMAIL_DOMAIN: env.ALLOWED_EMAIL_DOMAIN || '(not set)',
    OTP_STORE_bound:      !!env.OTP_STORE,
    WATSONX_API_KEY:      !!env.WATSONX_API_KEY,
    WATSONX_PROJECT_ID:   !!env.WATSONX_PROJECT_ID,
  });
}
