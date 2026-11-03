/* ------------------------------------------------------------------
 * reCAPTCHA verifier (Cloudflare Worker)
 * This file is NOT used by the study directly: copy-paste it into the
 * Cloudflare Worker editor. The secret key is stored in Cloudflare as
 * the secret RECAPTCHA_SECRET, never in this file.
 * ------------------------------------------------------------------ */

// Only the study's site (and local testing) may use this verifier
const STUDY_HOSTNAME = "karlaeperez.github.io";
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = origin === `https://${STUDY_HOSTNAME}` || LOCAL_ORIGIN.test(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : `https://${STUDY_HOSTNAME}`,
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

    // Also require the checkbox to have been solved on the study's site
    const hostOk = [STUDY_HOSTNAME, "localhost", "127.0.0.1"].includes(result.hostname);
    return json(
      { success: result.success === true && hostOk, error_codes: result["error-codes"] || [] },
      200,
      cors
    );
  },
};
