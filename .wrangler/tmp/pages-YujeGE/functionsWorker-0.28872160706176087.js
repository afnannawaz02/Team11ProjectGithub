var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/stock.js
var BASE = "https://finnhub.io/api/v1";
function rangeParams(range) {
  const day = 86400;
  const to = Math.floor(Date.now() / 1e3);
  const days = range === "1W" ? 14 : range === "1M" ? 45 : 120;
  return { resolution: "D", from: to - days * day, to };
}
__name(rangeParams, "rangeParams");
async function onRequestGet({ request, env }) {
  if (!env.FINNHUB_API_KEY) {
    return Response.json({ error: "FINNHUB_API_KEY not configured." }, { status: 503 });
  }
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "quote";
  const ticker = (url.searchParams.get("ticker") || "").toUpperCase();
  const query = url.searchParams.get("query") || "";
  const range = url.searchParams.get("range") || "1M";
  const key = env.FINNHUB_API_KEY;
  try {
    let endpoint;
    if (type === "quote") {
      endpoint = `${BASE}/quote?symbol=${ticker}&token=${key}`;
    } else if (type === "candle") {
      const { resolution, from, to } = rangeParams(range);
      endpoint = `${BASE}/stock/candle?symbol=${ticker}&resolution=${resolution}&from=${from}&to=${to}&token=${key}`;
    } else if (type === "profile") {
      endpoint = `${BASE}/stock/profile2?symbol=${ticker}&token=${key}`;
    } else if (type === "search") {
      endpoint = `${BASE}/search?q=${encodeURIComponent(query)}&token=${key}`;
    } else {
      return Response.json({ error: "Unknown type." }, { status: 400 });
    }
    const r = await fetch(endpoint, { headers: { "X-Finnhub-Token": key } });
    if (!r.ok) return Response.json({ error: `Finnhub error ${r.status}` }, { status: 502 });
    const data = await r.json();
    if (data.s === "no_data") return Response.json({ error: "No data available." }, { status: 404 });
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: "Stock data fetch failed." }, { status: 500 });
  }
}
__name(onRequestGet, "onRequestGet");

// api/auth.js
var SESSION_TTL = 60 * 60 * 24 * 7;
async function sha256hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256hex, "sha256hex");
function randomToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(randomToken, "randomToken");
function sessionCookie(token, clear = false) {
  const val = clear ? "" : token;
  const maxAge = clear ? 0 : SESSION_TTL;
  return `cb_session=${val}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
__name(sessionCookie, "sessionCookie");
function getSessionToken(request) {
  const cookie = request.headers.get("cookie") || "";
  const match2 = cookie.match(/cb_session=([a-f0-9]{64})/);
  return match2 ? match2[1] : null;
}
__name(getSessionToken, "getSessionToken");
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}
__name(json, "json");
async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  try {
    if (action === "register" && request.method === "POST") return register(request, env);
    if (action === "login" && request.method === "POST") return loginHandler(request, env);
    if (action === "me" && request.method === "GET") return me(request, env);
    if (action === "logout" && request.method === "POST") return logoutHandler(request, env);
    if (action === "profile" && request.method === "POST") return saveProfile(request, env);
    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("auth error", err);
    return json({ error: "Internal server error" }, 500);
  }
}
__name(onRequest, "onRequest");
async function register(request, env) {
  const { username, password, email, profile } = await request.json();
  if (!username || username.length < 3) return json({ error: "Username must be at least 3 characters." }, 400);
  if (!password || password.length < 6) return json({ error: "Password must be at least 6 characters." }, 400);
  if (!email || !email.endsWith("@ibm.com")) return json({ error: "A verified @ibm.com email is required." }, 400);
  const normalEmail = email.trim().toLowerCase();
  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE LOWER(username) = ?"
  ).bind(username.toLowerCase()).first();
  if (existing) return json({ error: "That username is already taken." }, 409);
  const passwordHash = await sha256hex(password);
  const result = await env.DB.prepare(
    "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?) RETURNING id"
  ).bind(username.trim(), passwordHash, normalEmail).first();
  const userId = result.id;
  if (profile) {
    await env.DB.prepare(`
      INSERT INTO profiles (user_id, goals, risk, horizon, annual_income, monthly_savings,
        emergency_fund, current_investments, dob, marital_status, employment_status,
        credit_score, us_state, city, veteran_status, preferences)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      JSON.stringify(profile.goals ?? []),
      profile.risk ?? "",
      profile.horizon ?? "",
      profile.annualIncome ?? "",
      profile.monthlySavings ?? "",
      profile.emergencyFund ?? "",
      JSON.stringify(profile.currentInvestments ?? []),
      profile.dob ?? "",
      profile.maritalStatus ?? "",
      profile.employmentStatus ?? "",
      profile.creditScore ?? "",
      profile.usState ?? "",
      profile.city ?? "",
      profile.veteranStatus ?? "",
      JSON.stringify(profile.preferences ?? [])
    ).run();
  }
  const token = randomToken();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))'
  ).bind(token, userId).run();
  return json({ ok: true, username: username.trim() }, 201, {
    "Set-Cookie": sessionCookie(token)
  });
}
__name(register, "register");
async function loginHandler(request, env) {
  const { username, password } = await request.json();
  if (!username || !password) return json({ error: "Username and password required." }, 400);
  const user = await env.DB.prepare(
    "SELECT id, username, password_hash FROM users WHERE LOWER(username) = ?"
  ).bind(username.toLowerCase()).first();
  if (!user) return json({ error: "No account found with that username." }, 401);
  const hash = await sha256hex(password);
  if (hash !== user.password_hash) return json({ error: "Incorrect password." }, 401);
  const profileRow = await env.DB.prepare(
    "SELECT * FROM profiles WHERE user_id = ?"
  ).bind(user.id).first();
  const profile = profileRow ? {
    goals: JSON.parse(profileRow.goals || "[]"),
    risk: profileRow.risk,
    horizon: profileRow.horizon,
    annualIncome: profileRow.annual_income,
    monthlySavings: profileRow.monthly_savings,
    emergencyFund: profileRow.emergency_fund,
    currentInvestments: JSON.parse(profileRow.current_investments || "[]"),
    dob: profileRow.dob,
    maritalStatus: profileRow.marital_status,
    employmentStatus: profileRow.employment_status,
    creditScore: profileRow.credit_score,
    usState: profileRow.us_state,
    city: profileRow.city,
    veteranStatus: profileRow.veteran_status,
    preferences: JSON.parse(profileRow.preferences || "[]")
  } : null;
  const token = randomToken();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime("now", "+7 days"))'
  ).bind(token, user.id).run();
  return json({ ok: true, username: user.username, profile }, 200, {
    "Set-Cookie": sessionCookie(token)
  });
}
__name(loginHandler, "loginHandler");
async function me(request, env) {
  const token = getSessionToken(request);
  if (!token) return json({ ok: false }, 401);
  const session = await env.DB.prepare(`
    SELECT users.id, users.username
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
  `).bind(token).first();
  if (!session) return json({ ok: false }, 401);
  const profileRow = await env.DB.prepare(
    "SELECT * FROM profiles WHERE user_id = ?"
  ).bind(session.id).first();
  const profile = profileRow ? {
    goals: JSON.parse(profileRow.goals || "[]"),
    risk: profileRow.risk,
    horizon: profileRow.horizon,
    annualIncome: profileRow.annual_income,
    monthlySavings: profileRow.monthly_savings,
    emergencyFund: profileRow.emergency_fund,
    currentInvestments: JSON.parse(profileRow.current_investments || "[]"),
    dob: profileRow.dob,
    maritalStatus: profileRow.marital_status,
    employmentStatus: profileRow.employment_status,
    creditScore: profileRow.credit_score,
    usState: profileRow.us_state,
    city: profileRow.city,
    veteranStatus: profileRow.veteran_status,
    preferences: JSON.parse(profileRow.preferences || "[]")
  } : null;
  return json({ ok: true, username: session.username, profile });
}
__name(me, "me");
async function logoutHandler(request, env) {
  const token = getSessionToken(request);
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", true) });
}
__name(logoutHandler, "logoutHandler");
async function saveProfile(request, env) {
  const token = getSessionToken(request);
  if (!token) return json({ error: "Unauthorised" }, 401);
  const session = await env.DB.prepare(`
    SELECT users.id FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
  `).bind(token).first();
  if (!session) return json({ error: "Session expired" }, 401);
  const p = await request.json();
  await env.DB.prepare(`
    INSERT INTO profiles (user_id, goals, risk, horizon, annual_income, monthly_savings,
      emergency_fund, current_investments, dob, marital_status, employment_status,
      credit_score, us_state, city, veteran_status, preferences, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      goals=excluded.goals, risk=excluded.risk, horizon=excluded.horizon,
      annual_income=excluded.annual_income, monthly_savings=excluded.monthly_savings,
      emergency_fund=excluded.emergency_fund, current_investments=excluded.current_investments,
      dob=excluded.dob, marital_status=excluded.marital_status,
      employment_status=excluded.employment_status, credit_score=excluded.credit_score,
      us_state=excluded.us_state, city=excluded.city,
      veteran_status=excluded.veteran_status, preferences=excluded.preferences,
      updated_at=datetime('now')
  `).bind(
    session.id,
    JSON.stringify(p.goals ?? []),
    p.risk ?? "",
    p.horizon ?? "",
    p.annualIncome ?? "",
    p.monthlySavings ?? "",
    p.emergencyFund ?? "",
    JSON.stringify(p.currentInvestments ?? []),
    p.dob ?? "",
    p.maritalStatus ?? "",
    p.employmentStatus ?? "",
    p.creditScore ?? "",
    p.usState ?? "",
    p.city ?? "",
    p.veteranStatus ?? "",
    JSON.stringify(p.preferences ?? [])
  ).run();
  return json({ ok: true });
}
__name(saveProfile, "saveProfile");

// chat.js
var WXO_INSTANCE_URL = "https://api.dl.watson-orchestrate.ibm.com/instances/20260716-1822-4087-90fe-3b3ba1d4cc84";
var WXO_AGENT_ID = "77dfacb4-0d9a-4cd8-bf9c-6db1c7e554aa";
var MCSP_TOKEN_URL = "https://iam.platform.saas.ibm.com/siusermgr/api/1.0/apikeys/token";
var COMPLETIONS_URL = `${WXO_INSTANCE_URL}/v1/orchestrate/${WXO_AGENT_ID}/chat/completions`;
async function getMCSPToken(apiKey) {
  const res = await fetch(MCSP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MCSP token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const token = data.token ?? data.access_token;
  if (!token) throw new Error("MCSP token response contained no token field");
  return token;
}
__name(getMCSPToken, "getMCSPToken");
function buildProfileContext(profile) {
  if (!profile || Object.keys(profile).length === 0) return null;
  const goalMap = {
    retirement: "Retirement planning",
    home: "Home purchase",
    education: "Education funding",
    wealth: "Wealth growth",
    short_term: "Short-term savings",
    long_term: "Long-term investing"
  };
  const goals = (profile.goals ?? []).map((g) => goalMap[g] || g).join(", ") || "Not specified";
  const investments = (profile.currentInvestments ?? []).join(", ") || "None listed";
  return [
    "[User financial profile for context]",
    `Goals: ${goals}`,
    `Risk tolerance: ${profile.risk || "Not specified"}`,
    `Time horizon: ${profile.horizon || "Not specified"}`,
    profile.annualIncome ? `Annual income: $${Number(profile.annualIncome).toLocaleString()}` : null,
    profile.monthlySavings ? `Monthly savings: $${Number(profile.monthlySavings).toLocaleString()}` : null,
    profile.emergencyFund ? `Emergency fund: ${profile.emergencyFund}` : null,
    investments !== "None listed" ? `Current investments: ${investments}` : null,
    profile.employmentStatus ? `Employment: ${profile.employmentStatus}` : null,
    profile.creditScore ? `Credit score band: ${profile.creditScore}` : null
  ].filter(Boolean).join("\n");
}
__name(buildProfileContext, "buildProfileContext");
async function onRequestPost({ request, env }) {
  const apiKey = env.WXO_API_KEY;
  if (!apiKey) {
    return Response.json({
      reply: "Gumdrop is not configured \u2014 missing WXO_API_KEY secret. Add it in Cloudflare Pages \u2192 Settings \u2192 Environment variables."
    });
  }
  const { messages = [], profile = {}, userMessage = "" } = await request.json().catch(() => ({}));
  if (!userMessage.trim()) {
    return Response.json({ reply: "Please send a message." });
  }
  const profileCtx = buildProfileContext(profile);
  const userContent = profileCtx ? `${profileCtx}

${userMessage}` : userMessage;
  const fullMessages = [
    // Include recent history (skip pending/system, last 10 turns)
    ...messages.filter((m) => m.sender !== "system" && !m.pending).slice(-10).map((m) => ({
      role: m.sender === "user" ? "user" : "assistant",
      content: m.text
    })),
    { role: "user", content: userContent }
  ];
  try {
    const token = await getMCSPToken(apiKey);
    const woRes = await fetch(COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ messages: fullMessages, stream: false })
    });
    if (!woRes.ok) {
      const errText = await woRes.text().catch(() => "");
      console.error(`[chat] Orchestrate error ${woRes.status}:`, errText.slice(0, 400));
      if (woRes.status === 401 || woRes.status === 403) {
        return Response.json({
          reply: "Authentication failed \u2014 check that WXO_API_KEY is correct and not expired."
        });
      }
      if (woRes.status === 404) {
        return Response.json({
          reply: `Agent not found (404). Verify agent ID ${WXO_AGENT_ID} is published in your Orchestrate instance.`
        });
      }
      return Response.json({
        reply: `Orchestrate returned an error (${woRes.status}). Check Cloudflare logs.`
      });
    }
    const data = await woRes.json();
    const reply = data.choices?.[0]?.message?.content?.trim() ?? data.reply ?? "I received a response but could not parse it. Please try again.";
    return Response.json({ reply });
  } catch (err) {
    console.error("[chat] error:", err.message);
    return Response.json({
      reply: `Error reaching Orchestrate: ${err.message.slice(0, 120)}`
    });
  }
}
__name(onRequestPost, "onRequestPost");

// debug.js
async function onRequestGet2({ env }) {
  return Response.json({
    RESEND_API_KEY: !!env.RESEND_API_KEY,
    RESEND_FROM: env.RESEND_FROM || "(not set)",
    ALLOWED_EMAIL_DOMAIN: env.ALLOWED_EMAIL_DOMAIN || "(not set)",
    OTP_STORE_bound: !!env.OTP_STORE,
    DB_bound: !!env.DB,
    WO_USERNAME: !!env.WO_USERNAME,
    WO_PASSWORD: !!env.WO_PASSWORD
  });
}
__name(onRequestGet2, "onRequestGet");

// send-otp.js
function generateOTP() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(1e5 + arr[0] % 9e5);
}
__name(generateOTP, "generateOTP");
async function onRequestPost2({ request, env }) {
  const { email = "" } = await request.json().catch(() => ({}));
  const normalised = email.trim().toLowerCase();
  const domain = env.ALLOWED_EMAIL_DOMAIN || "ibm.com";
  if (domain !== "." && !normalised.endsWith(`@${domain}`)) {
    return Response.json({ error: `Only @${domain} addresses are allowed.` }, { status: 403 });
  }
  if (!env.RESEND_API_KEY) {
    return Response.json({ error: "Email service not configured." }, { status: 503 });
  }
  const code = generateOTP();
  const expiresAt = Date.now() + 10 * 60 * 1e3;
  await env.OTP_STORE.put(normalised, JSON.stringify({ code, expiresAt }), { expirationTtl: 600 });
  const from = env.RESEND_FROM || "noreply@team11.uk";
  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from,
      to: [normalised],
      subject: "Your Candyland Bank access code",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem;">
          <h2 style="margin:0 0 0.5rem;">Your access code</h2>
          <p style="color:#555;margin:0 0 1.5rem;">Use the code below to access Candyland Bank. It expires in 10 minutes.</p>
          <div style="font-size:2.5rem;font-weight:700;letter-spacing:0.15em;color:#cc0000;margin-bottom:1.5rem;">${code}</div>
          <p style="color:#999;font-size:0.8rem;">If you didn't request this, ignore this email.</p>
        </div>
      `
    })
  });
  const resendBody = await emailRes.text();
  if (!emailRes.ok) {
    console.error("Resend error:", emailRes.status, resendBody);
    let detail = resendBody;
    try {
      detail = JSON.parse(resendBody)?.message || resendBody;
    } catch {
    }
    return Response.json({ error: `Failed to send email: ${detail}` }, { status: 500 });
  }
  return Response.json({ ok: true });
}
__name(onRequestPost2, "onRequestPost");

// verify-otp.js
async function onRequestPost3({ request, env }) {
  const { email = "", code = "" } = await request.json().catch(() => ({}));
  const normalised = email.trim().toLowerCase();
  const raw = await env.OTP_STORE.get(normalised);
  if (!raw) {
    return Response.json({ error: "No code found for this email. Request a new one." }, { status: 400 });
  }
  const entry = JSON.parse(raw);
  if (Date.now() > entry.expiresAt) {
    await env.OTP_STORE.delete(normalised);
    return Response.json({ error: "Code expired. Request a new one." }, { status: 400 });
  }
  if (entry.code !== code.trim()) {
    return Response.json({ error: "Incorrect code. Try again." }, { status: 400 });
  }
  await env.OTP_STORE.delete(normalised);
  return Response.json({ ok: true });
}
__name(onRequestPost3, "onRequestPost");

// ../.wrangler/tmp/pages-YujeGE/functionsRoutes-0.5762458853171892.mjs
var routes = [
  {
    routePath: "/api/stock",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/auth",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest]
  },
  {
    routePath: "/chat",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/debug",
    mountPath: "/",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/send-otp",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/verify-otp",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  }
];

// ../node_modules/.pnpm/path-to-regexp@6.3.0/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/.pnpm/wrangler@4.110.0/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
