// Updates the Content-Security-Policy in index.html so that ONLY the portal's own inline scripts
// (identified by their SHA-256 hash), config.js and the two pinned CDN libraries can run.
// Any other script — including one injected through stored data — is blocked by the browser.
// Run after every change to index.html:   node tools/csp-hash.js index.html
// (The GitHub deploy workflow runs it automatically.)
const fs = require("fs"), crypto = require("crypto");
const file = process.argv[2] || "index.html";
let html = fs.readFileSync(file, "utf8");
const hashes = [];
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
  hashes.push("'sha256-" + crypto.createHash("sha256").update(m[1], "utf8").digest("base64") + "'");
}
const scriptSrc = ["'self'", "https://cdn.jsdelivr.net", ...new Set(hashes)].join(" ");
const re = /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src )[^;"]*/;
if (!re.test(html)) { console.error("Content-Security-Policy meta tag with script-src not found in " + file); process.exit(1); }
html = html.replace(re, (_, head) => head + scriptSrc);
fs.writeFileSync(file, html);
console.log(`CSP updated: ${hashes.length} inline script(s) allowed by hash in ${file}`);
