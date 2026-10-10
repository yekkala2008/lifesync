/*
 * LifeSync app lock.
 *
 * Uses a device passkey (WebAuthn, platform authenticator, user verification
 * required). The phone shows its own screen-lock prompt (fingerprint, face, PIN
 * or pattern); LifeSync never sees any of it, only whether the check passed.
 *
 * There is no server, so this is a local gate in front of the app, not
 * encryption of the stored data. The lock setting is kept per device (not in
 * backups), so restoring a backup on another phone doesn't lock you out.
 *
 * A recovery code is shown once when the lock is turned on; only its SHA-256
 * hash is stored. Entering it unlocks and turns the lock off.
 */
(function (root) {
  "use strict";
  const KEY = "lifesync.lock";

  const b64u = (buf) =>
    btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64u = (s) => {
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  };
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
  const normal = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  async function sha256(text) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
  }
  function recoveryCode() {
    const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
    const r = rand(16);
    let s = "";
    for (let i = 0; i < 16; i++) s += A[r[i] % A.length] + (i % 4 === 3 && i < 15 ? "-" : "");
    return s;
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function write(cfg) {
    try {
      if (cfg) localStorage.setItem(KEY, JSON.stringify(cfg));
      else localStorage.removeItem(KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Why the lock can't be used here, or "" if it can. */
  async function unsupportedReason() {
    if (root.self !== root.top) return "App lock works in the installed app, not inside Claude. Open LifeSync from its home-screen icon to turn it on.";
    if (!root.isSecureContext || !root.PublicKeyCredential || !navigator.credentials)
      return "This browser can't use your phone's screen lock. Use Chrome on Android or Safari on iPhone.";
    try {
      const ok = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!ok) return "Set up a screen lock (fingerprint, face, PIN or pattern) in your phone's settings first.";
    } catch (e) {
      return "This browser can't use your phone's screen lock.";
    }
    return "";
  }

  function friendly(e) {
    const n = e && e.name;
    if (n === "NotAllowedError") return "Unlock was cancelled or didn't match. Try again.";
    if (n === "InvalidStateError") return "A LifeSync lock already exists on this phone. Try again.";
    if (n === "SecurityError") return "Your browser blocked the screen-lock check on this page.";
    return "Your phone's screen-lock check didn't complete. Try again.";
  }

  /** Create the passkey and turn the lock on. Returns { recovery } to show once. */
  async function enable(opts) {
    opts = opts || {};
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: rand(32),
        rp: { name: "LifeSync" },
        user: { id: rand(16), name: opts.name || "LifeSync", displayName: opts.displayName || "LifeSync app lock" },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
        timeout: 60000,
        attestation: "none",
      },
    });
    if (!cred) throw new Error("No credential");
    const recovery = recoveryCode();
    const cfg = { v: 1, id: b64u(cred.rawId), relockAfter: opts.relockAfter != null ? opts.relockAfter : 60, recoveryHash: await sha256(normal(recovery)), since: new Date().toISOString() };
    if (!write(cfg)) throw new Error("Couldn't save the lock setting on this phone.");
    return { cfg, recovery };
  }

  /** Ask the phone to verify you. Resolves true, or throws with a friendly message. */
  async function unlock(cfg) {
    try {
      const a = await navigator.credentials.get({
        publicKey: {
          challenge: rand(32),
          allowCredentials: [{ type: "public-key", id: unb64u(cfg.id) }],
          userVerification: "required",
          timeout: 60000,
        },
      });
      if (!a) throw Object.assign(new Error("none"), { name: "NotAllowedError" });
      // Uncompressed check of the authenticator flags: UP (0x01) and UV (0x04).
      const flags = new Uint8Array(a.response.authenticatorData)[32];
      if (!(flags & 0x01) || !(flags & 0x04)) throw Object.assign(new Error("Not verified"), { name: "NotAllowedError" });
      return true;
    } catch (e) {
      throw new Error(friendly(e));
    }
  }

  async function checkRecovery(cfg, code) {
    return !!cfg && (await sha256(normal(code))) === cfg.recoveryHash;
  }

  root.LSLock = { read, write, enable, unlock, checkRecovery, unsupportedReason, disable: () => write(null) };
})(typeof self !== "undefined" ? self : this);
