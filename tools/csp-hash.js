// Updates the Content-Security-Policy in index.html so that ONLY the portal's own inline scripts
// (identified by their SHA-256 hash), config.js and the two pinned CDN libraries can run.
// Any other script — including one injected through stored data — is blocked by the browser.
// Run after every change to index.html:   node tools/csp-hash.js index.html
// (The GitHub deploy workflow runs it automatically.)
const fs = require("fs"), crypto = require("crypto");
const file = process.argv[2] || "index.html";
let html = fs.readFileSync(file, "utf8");
// a page that declares its own rules (the public Career page: plain text only, inline handlers, data only to our database) is left as it is
if (/<meta name="akf-csp" content="keep-inline">/.test(html)) { console.log("CSP kept (the page's own rules): " + file); process.exit(0); }
const hashes = [];
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
  hashes.push("'sha256-" + crypto.createHash("sha256").update(m[1], "utf8").digest("base64") + "'");
}
// only the exact pinned libraries, not all of jsDelivr (which serves any package anyone publishes)
const CDN = ["@supabase/supabase-js@2.45.4", "xlsx@0.18.5", "jsqr@1.4.0", "chart.js@4.4.1"].map(p => "https://cdn.jsdelivr.net/npm/" + p + "/");
const scriptSrc = ["'self'", ...CDN, ...new Set(hashes)].join(" ");
const re = /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src )[^;"]*/;
if (!re.test(html)) { console.error("Content-Security-Policy meta tag with script-src not found in " + file); process.exit(1); }
html = html.replace(re, (_, head) => head + scriptSrc);
// deploy: data may go only to OUR database project, not to any *.supabase.co (set by the workflow from its secret)
const sb = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(process.env.SUPABASE_URL || "") ? process.env.SUPABASE_URL : "";
if (sb) html = html.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*)/, m => m.split("https://*.supabase.co").join(sb).split("wss://*.supabase.co").join(sb.replace("https://", "wss://")));
fs.writeFileSync(file, html);
console.log(`CSP updated: ${hashes.length} inline script(s) allowed by hash in ${file}`);
