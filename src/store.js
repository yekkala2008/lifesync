/*
 * LifeSync storage.
 *
 * One interface, two backends:
 *  - Claude artifact: the private per-person `db` capability (synced across
 *    your devices, survives app updates).
 *  - Installed app (GitHub Pages / any host): the browser's localStorage on
 *    this device, plus JSON backup/restore.
 *
 * State is saved as a few documents (one per key) so no single write is large.
 */
(function (root) {
  "use strict";
  const KEYS = ["prefs", "policies", "counting", "calendar", "family", "journeys", "attendance", "plans", "meta"];
  const LS_PREFIX = "lifesync.v1.";

  function localBackend() {
    return {
      kind: "device",
      label: "Saved on this device",
      async load() {
        const out = {};
        for (const k of KEYS) {
          try {
            const raw = localStorage.getItem(LS_PREFIX + k);
            if (raw) out[k] = JSON.parse(raw).v;
          } catch (e) {
            /* storage blocked: start empty */
          }
        }
        return out;
      },
      async save(key, value) {
        localStorage.setItem(LS_PREFIX + key, JSON.stringify({ v: value }));
      },
    };
  }

  async function claudeBackend() {
    if (!root.claude || typeof root.claude.use !== "function") return null;
    try {
      const [db, user] = await Promise.all([root.claude.use("db"), root.claude.use("user")]);
      if (!db || !user) return null;
      const id = await user.id();
      if (!id) return null;
      const base = `data/users/${id}/lifesync`;
      return {
        kind: "cloud",
        label: "Saved to your Claude account",
        async load() {
          const out = {};
          await Promise.all(
            KEYS.map(async (k) => {
              const snap = await db.doc(`${base}/${k}`).get();
              if (snap.exists) out[k] = snap.data().v;
            })
          );
          return out;
        },
        async save(key, value) {
          await db.doc(`${base}/${key}`).set({ v: value });
        },
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Debounced, per-key saver. `onStatus` receives "saving" | "saved" | error text.
   */
  async function openStore(onStatus) {
    const backend = (await claudeBackend()) || localBackend();
    const timers = {};
    const pending = {};
    function flush(key) {
      const value = pending[key];
      delete pending[key];
      onStatus && onStatus("saving");
      return backend
        .save(key, value)
        .then(() => onStatus && !Object.keys(pending).length && onStatus("saved"))
        .catch((e) => onStatus && onStatus(`Could not save (${(e && (e.code || e.message)) || "unknown error"}). Your last change is kept on screen; try again.`));
    }
    return {
      kind: backend.kind,
      label: backend.label,
      load: () => backend.load(),
      save(key, value) {
        pending[key] = value;
        clearTimeout(timers[key]);
        timers[key] = setTimeout(() => flush(key), 400);
      },
      saveNow(key, value) {
        pending[key] = value;
        clearTimeout(timers[key]);
        return flush(key);
      },
      KEYS,
    };
  }

  root.LSStore = { openStore, KEYS };
})(typeof self !== "undefined" ? self : this);
