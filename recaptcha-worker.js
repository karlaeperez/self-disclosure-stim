/* ------------------------------------------------------------------
 * reCAPTCHA verifier (Cloudflare Worker)
 * This file is NOT used by the study directly: copy-paste it into the
 * Cloudflare Worker editor. The secret key is stored in Cloudflare as
 * the secret RECAPTCHA_SECRET, never in this file.
 * ------------------------------------------------------------------ */

// Only the study's sites (and local testing) may use this verifier.
// voice-study.pages.dev also covers its preview/deployment addresses (e.g. abc123.voice-study.pages.dev).
// karlaeperez.github.io can be removed once GitHub Pages is turned off.
const STUDY_HOSTNAMES = ["voice-study.pages.dev", "karlaeperez.github.io"];
const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1"];

function isStudyHost(hostname) {
  return STUDY_HOSTNAMES.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

function isAllowedOrigin(origin) {
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol === "https:" && isStudyHost(hostname)) return true;
    return protocol === "http:" && LOCAL_HOSTNAMES.includes(hostname);
  } catch (err) {
    return false; // missing or malformed Origin header
  }
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = isAllowedOrigin(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : `https://${STUDY_HOSTNAMES[0]}`,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };

    // Browser "may I send this?" check before the real request
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST" || !allowed) {
      return json({ success: false, error_codes: ["not-allowed"] }, 403, cors);
    }

    let token = null;
    try {
      token = (await request.json()).token;
    } catch (err) {}
    if (!token) return json({ success: false, error_codes: ["missing-token"] }, 400, cors);

    // Ask Google whether the checkbox token is genuine
    const google = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body: new URLSearchParams({
        secret: env.RECAPTCHA_SECRET,
        response: token,
        remoteip: request.headers.get("CF-Connecting-IP") || "",
      }),
    });
    const result = await google.json();

    // Also require the checkbox to have been solved on one of the study's sites
    const solvedOn = result.hostname || "";
    const hostOk = isStudyHost(solvedOn) || LOCAL_HOSTNAMES.includes(solvedOn);
    return json(
      { success: result.success === true && hostOk, error_codes: result["error-codes"] || [] },
      200,
      cors
    );
  },
};
