/**
 * functions/send-log.js — POST /send-log
 * Fires a test request to /chat, captures the result, and emails it via Resend.
 * Called once to prove watsonx is working.
 */

export async function onRequestPost({ request, env }) {
  const RESEND_API_KEY  = env.RESEND_API_KEY;
  const RESEND_FROM     = env.RESEND_FROM || 'noreply@team11.uk';
  const WATSONX_API_KEY    = env.WATSONX_API_KEY;
  const WATSONX_PROJECT_ID = env.WATSONX_PROJECT_ID;
  const WATSONX_REGION     = env.WATSONX_REGION  || 'us-south';
  const WATSONX_MODEL_ID   = env.WATSONX_MODEL_ID || 'ibm/granite-3-8b-instruct';

  const to = (await request.json().catch(() => ({}))).email || 'afnan.nawaz@ibm.com';

  // ── Step 1: Get IAM token ───────────────────────────────────────────────────
  let iamToken, iamStatus, iamError;
  try {
    const iamRes = await fetch('https://iam.cloud.ibm.com/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
        apikey: WATSONX_API_KEY,
      }),
    });
    iamStatus = iamRes.status;
    const iamJson = await iamRes.json();
    if (iamRes.ok) {
      iamToken = iamJson.access_token;
      iamError = null;
    } else {
      iamError = JSON.stringify(iamJson);
    }
  } catch (e) {
    iamError = e.message;
  }

  // ── Step 2: Call watsonx ────────────────────────────────────────────────────
  let wxStatus, wxReply, wxRaw, wxError;
  if (iamToken) {
    try {
      const wxRes = await fetch(
        `https://${WATSONX_REGION}.ml.cloud.ibm.com/ml/v1/text/chat?version=2024-05-01`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${iamToken}`,
          },
          body: JSON.stringify({
            model_id: WATSONX_MODEL_ID,
            project_id: WATSONX_PROJECT_ID,
            messages: [
              { role: 'system', content: 'You are Gumdrop, a financial assistant.' },
              { role: 'user',   content: 'What should I invest in first?' },
            ],
            parameters: { max_tokens: 300, temperature: 0.7 },
          }),
        }
      );
      wxStatus = wxRes.status;
      wxRaw    = await wxRes.text();
      try {
        const wxJson = JSON.parse(wxRaw);
        wxReply = wxJson.choices?.[0]?.message?.content?.trim()
          ?? wxJson.results?.[0]?.generated_text?.trim()
          ?? wxRaw.slice(0, 300);
      } catch {
        wxReply = wxRaw.slice(0, 300);
      }
      if (!wxRes.ok) wxError = wxRaw.slice(0, 500);
    } catch (e) {
      wxError = e.message;
    }
  }

  // ── Step 3: Build email ─────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const iamOk  = !!iamToken;
  const wxOk   = wxStatus === 200 && !wxError;

  const html = `
<div style="font-family:sans-serif;max-width:680px;margin:0 auto;padding:2rem;color:#1f2328;">
  <h2 style="margin:0 0 0.25rem;color:#1f2328;">Candyland Bank — Watsonx Live Log</h2>
  <p style="margin:0 0 1.5rem;color:#57606a;font-size:0.875rem;">Generated ${now}</p>

  <table style="width:100%;border-collapse:collapse;font-size:0.875rem;margin-bottom:1.5rem;">
    <tr style="background:#f7f8fa;">
      <td style="padding:0.5rem 0.75rem;font-weight:600;border:1px solid #e5e7eb;">Check</td>
      <td style="padding:0.5rem 0.75rem;font-weight:600;border:1px solid #e5e7eb;">Result</td>
      <td style="padding:0.5rem 0.75rem;font-weight:600;border:1px solid #e5e7eb;">Detail</td>
    </tr>
    <tr>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;">WATSONX_API_KEY present</td>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;color:${WATSONX_API_KEY?'#1a7f37':'#cf222e'}">${WATSONX_API_KEY ? '✅ Yes' : '❌ Missing'}</td>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;">${WATSONX_API_KEY ? 'Key loaded from Cloudflare secret' : 'Not set in Pages secrets'}</td>
    </tr>
    <tr>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;">WATSONX_PROJECT_ID present</td>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;color:${WATSONX_PROJECT_ID?'#1a7f37':'#cf222e'}">${WATSONX_PROJECT_ID ? '✅ Yes' : '❌ Missing'}</td>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;">${WATSONX_PROJECT_ID ? WATSONX_PROJECT_ID : 'Not set in Pages secrets'}</td>
    </tr>
    <tr>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;">Model</td>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;">ℹ️ ${WATSONX_MODEL_ID}</td>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;">Region: ${WATSONX_REGION}</td>
    </tr>
    <tr>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;">IBM IAM token</td>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;color:${iamOk?'#1a7f37':'#cf222e'}">${iamOk ? '✅ OK' : `❌ Failed (HTTP ${iamStatus})`}</td>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;">${iamError || 'Token obtained successfully'}</td>
    </tr>
    <tr>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;">Watsonx API call</td>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;color:${wxOk?'#1a7f37':'#cf222e'}">${wxOk ? `✅ HTTP ${wxStatus}` : `❌ HTTP ${wxStatus||'N/A'}`}</td>
      <td style="padding:0.5rem 0.75rem;border:1px solid #e5e7eb;">${wxError || 'Response received'}</td>
    </tr>
  </table>

  ${wxReply ? `
  <h3 style="margin:0 0 0.5rem;font-size:1rem;">Model Reply to "What should I invest in first?"</h3>
  <div style="background:#f7f8fa;border:1px solid #e5e7eb;border-radius:6px;padding:1rem;font-size:0.875rem;line-height:1.6;white-space:pre-wrap;">${wxReply}</div>
  ` : ''}

  ${wxError ? `
  <h3 style="margin:1rem 0 0.5rem;font-size:1rem;color:#cf222e;">Raw Error from Watsonx</h3>
  <div style="background:#fff0f0;border:1px solid #ffcdd2;border-radius:6px;padding:1rem;font-size:0.8rem;font-family:monospace;white-space:pre-wrap;">${wxError}</div>
  ` : ''}

  <p style="margin-top:2rem;font-size:0.75rem;color:#57606a;border-top:1px solid #e5e7eb;padding-top:1rem;">
    Sent from Candyland Bank · Cloudflare Pages Function · team11.uk
  </p>
</div>`;

  // ── Step 4: Send via Resend ─────────────────────────────────────────────────
  if (!RESEND_API_KEY) {
    return Response.json({ error: 'RESEND_API_KEY not set' }, { status: 503 });
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to:   [to],
      subject: `Candyland Watsonx Log — ${wxOk ? '✅ Working' : '❌ Error'} — ${now}`,
      html,
    }),
  });

  const emailBody = await emailRes.json().catch(() => ({}));

  if (!emailRes.ok) {
    return Response.json({ error: 'Resend failed', detail: emailBody }, { status: 500 });
  }

  return Response.json({
    ok: true,
    sent_to: to,
    iam_ok: iamOk,
    watsonx_ok: wxOk,
    watsonx_status: wxStatus,
    resend_id: emailBody.id,
  });
}
