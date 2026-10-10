// Builds two outputs from src/:
//   dist/pages/         installable app (PWA) for GitHub Pages or any static host; works offline
//   dist/lifesync.html  single-file version published as a Claude artifact
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const VERSION = JSON.parse(read("./package.json")).version;
// Signature: the owner's handwritten signature (transparent PNG used as a mask,
// so it can be gold in both themes) and the name in Cormorant Garamond
// (SIL Open Font License). Both are bundled so they work offline.
const sigFont = readFileSync(new URL("./node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2", import.meta.url));
const sigImg = readFileSync(new URL("./public/signature.png", import.meta.url));
const sigFace = (font, img) =>
  `@font-face { font-family: "Cormorant Garamond"; font-style: normal; font-weight: 600; font-display: swap; src: url(${font}) format("woff2"); }\n` +
  `.sig-mark { -webkit-mask-image: url(${img}); mask-image: url(${img}); }\n`;
const css = read("./src/styles.css");
const engine = read("./src/engine.js");
const store = read("./src/store.js");
const app = read("./src/app.js");
const help = read("./src/help.js");
const lock = read("./src/lock.js");
const access = read("./src/access.js");

// Invite-only codes come from the environment (a GitHub Actions secret). Only
// salted hashes are written into the app; the codes themselves never are.
const codes = (process.env.LIFESYNC_ACCESS_CODES || "").split(",").map((c) => c.trim().toLowerCase().replace(/\s+/g, "")).filter(Boolean);
const short = codes.filter((c) => c.length < 8);
if (short.length) console.warn(`Warning: ${short.length} access code(s) are shorter than 8 characters and easy to guess.`);
// Fixed salt: hashes stay the same across builds, so updates don't ask people
// for their code again. Removing a code from the secret is what revokes it.
const salt = process.env.LIFESYNC_ACCESS_SALT || "lifesync-invite-v1";
const accessConfig = `window.LSAccessConfig = ${JSON.stringify({ salt: codes.length ? salt : "", hashes: codes.map((c) => createHash("sha256").update(salt + ":" + c).digest("hex")) })};\n`;

// Guard: the in-app help must be updated with every release.
const helpVersion = (help.match(/version:\s*"([^"]+)"/) || [])[1];
if (helpVersion !== VERSION) {
  console.error(`\nHelp is out of date: src/help.js says version ${helpVersion}, package.json says ${VERSION}.`);
  console.error("Update the affected help sections and add a 'whatsNew' entry in src/help.js, then set its version to " + VERSION + ".\n");
  process.exit(1);
}
if (!new RegExp(`version:\\s*"${VERSION.replace(/\./g, "\\.")}",\\s*items`).test(help)) {
  console.error(`\nsrc/help.js has no 'whatsNew' entry for ${VERSION}. Add one describing what changed.\n`);
  process.exit(1);
}
const FONTS = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap";
const CDN = {
  htm: "https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.umd.js",
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
};

rmSync(new URL("./dist", import.meta.url), { recursive: true, force: true });
mkdirSync(new URL("./dist/pages/vendor", import.meta.url), { recursive: true });

// ---------- 1. artifact (single file; the host adds <html>/<head>/<body>)
const artifact = `<title>LifeSync</title>
<meta name="description" content="Plan office days, travel between Bengaluru and Hyderabad, and family time.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${sigFace("data:font/woff2;base64," + sigFont.toString("base64"), "data:image/png;base64," + sigImg.toString("base64"))}${css}
</style>
<div id="app"></div>
<script src="${CDN.htm}"></script>
<script src="${CDN.jspdf}"></script>
<script>
${engine}
</script>
<script>
${store}
</script>
<script>
${help}
</script>
<script>
${lock}
</script>
<script>
${access}
</script>
<script>
${app}
</script>
`;
writeFileSync(new URL("./dist/lifesync.html", import.meta.url), artifact);

// ---------- 2. installable app
const icon = read("./public/icon.svg");
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>LifeSync</title>
<meta name="description" content="Plan office days, travel between Bengaluru and Hyderabad, and family time.">
<meta name="theme-color" content="#f4f6f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101412" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="LifeSync">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="styles.css?v=${VERSION}">
<style>html{color-scheme:light}:root{padding-top:env(safe-area-inset-top,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
<div id="app"></div>
<script src="vendor/htm-preact.js"></script>
<script src="vendor/jspdf.umd.min.js" defer></script>
<script src="engine.js?v=${VERSION}"></script>
<script src="store.js?v=${VERSION}"></script>
<script src="help.js?v=${VERSION}"></script>
<script src="lock.js?v=${VERSION}"></script>
<script src="access-config.js?v=${VERSION}"></script>
<script src="access.js?v=${VERSION}"></script>
<script src="app.js?v=${VERSION}"></script>
<script>
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
</script>
</body>
</html>
`;
const out = (p, s) => writeFileSync(new URL("./dist/pages/" + p, import.meta.url), s);
out("index.html", page);
out("styles.css", sigFace("vendor/cormorant-600.woff2", "signature.png") + css);
writeFileSync(new URL("./dist/pages/vendor/cormorant-600.woff2", import.meta.url), sigFont);
writeFileSync(new URL("./dist/pages/signature.png", import.meta.url), sigImg);
out("engine.js", engine);
out("store.js", store);
out("app.js", app);
out("help.js", help);
out("lock.js", lock);
out("access.js", access);
out("access-config.js", accessConfig);
out("icon.svg", icon);
copyFileSync(new URL("./node_modules/htm/preact/standalone.umd.js", import.meta.url), new URL("./dist/pages/vendor/htm-preact.js", import.meta.url));
copyFileSync(new URL("./node_modules/jspdf/dist/jspdf.umd.min.js", import.meta.url), new URL("./dist/pages/vendor/jspdf.umd.min.js", import.meta.url));
for (const f of ["icon-192.png", "icon-512.png", "icon-maskable-512.png"])
  if (existsSync(new URL("./public/" + f, import.meta.url))) copyFileSync(new URL("./public/" + f, import.meta.url), new URL("./dist/pages/" + f, import.meta.url));
out(
  "manifest.webmanifest",
  JSON.stringify(
    {
      name: "LifeSync",
      short_name: "LifeSync",
      description: "Plan office days, travel between Bengaluru and Hyderabad, and family time.",
      start_url: "./",
      scope: "./",
      display: "standalone",
      background_color: "#f4f6f2",
      theme_color: "#f4f6f2",
      icons: [
        { src: "icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
      ],
    },
    null,
    2
  )
);
const files = ["./", "index.html", "styles.css", "engine.js", "store.js", "help.js", "lock.js", "access-config.js", "access.js", "app.js", "vendor/htm-preact.js", "vendor/cormorant-600.woff2", "signature.png", "vendor/jspdf.umd.min.js", "manifest.webmanifest", "icon.svg", "icon-192.png"];
out(
  "sw.js",
  `// LifeSync offline cache. Bump the version (package.json) to ship an update.
const CACHE = "lifesync-${VERSION}";
const FILES = ${JSON.stringify(files.map((f) => (/\.(css|js)$/.test(f) && !f.startsWith("vendor") ? f + "?v=" + VERSION : f)))};
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    // App files: network first so updates arrive, cache when offline.
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: false }).then((r) => r || caches.match("index.html"))));
  } else if (url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })));
  }
});
`
);
out(".nojekyll", "");
console.log("Built dist/lifesync.html and dist/pages/ (v" + VERSION + ")" + (codes.length ? ` · invite-only with ${codes.length} access code(s)` : " · open to anyone with the link"));
