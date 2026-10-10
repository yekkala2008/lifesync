/*
 * LifeSync invite-only access.
 *
 * The owner sets access codes as a GitHub repository secret
 * (LIFESYNC_ACCESS_CODES, comma-separated). The build stores only salted
 * SHA-256 hashes of them in access-config.js; no code appears in the app.
 * A person enters a code once per phone; it's remembered on that phone.
 * Removing a code from the secret and republishing asks that phone again.
 *
 * Honest limits: this is a "members only" door for a static site. Someone
 * technical could read the page source and get past it. For a real lock, put
 * the site behind Cloudflare Access (see README). Each person's LifeSync data
 * always stays on their own phone; nobody sees anyone else's.
 */
(function (root) {
  "use strict";
  const KEY = "lifesync.access";
  const cfg = () => root.LSAccessConfig || { hashes: [], salt: "" };
  const normal = (c) => String(c || "").trim().toLowerCase().replace(/\s+/g, "");
  async function sha256(text) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
  }
  function stored() {
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }
  /** True when this copy of the app is invite-only and this phone isn't in yet. */
  function needed() {
    if (root.self !== root.top) return false; // Claude artifact is already private
    const h = cfg().hashes || [];
    if (!h.length) return false;
    return !h.includes(stored());
  }
  async function tryCode(code) {
    const n = normal(code);
    if (n.length < 4) return false;
    const h = await sha256(cfg().salt + ":" + n);
    if (!(cfg().hashes || []).includes(h)) return false;
    try { localStorage.setItem(KEY, h); } catch (e) { /* still let them in this session */ }
    return true;
  }
  const enabled = () => (cfg().hashes || []).length > 0;
  root.LSAccess = { needed, tryCode, enabled, hashFor: async (salt, code) => sha256(salt + ":" + normal(code)) };
})(typeof self !== "undefined" ? self : this);
