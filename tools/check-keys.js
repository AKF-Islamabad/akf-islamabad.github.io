#!/usr/bin/env node
// Fails (exit 1) if a Supabase service_role key or secret key is in the code or on the live website.
//   node tools/check-keys.js                    scan every file in this repository
//   node tools/check-keys.js --live <site-url>  also fetch the live pages, their scripts and config.js
// Only the public anon / publishable key may ever reach a browser. Keys are never printed.
"use strict";
const fs = require("fs"), path = require("path");

const JWT = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const SECRET = /\bsb_secret_[A-Za-z0-9_-]{16,}/g;
const SKIP_DIRS = new Set([".git", "node_modules", "_site"]);
const problems = [];

function roleOf(jwt) {
  try { return JSON.parse(Buffer.from(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).role || ""; }
  catch { return ""; }
}

function scan(text, where) {
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(JWT)) if (roleOf(m[0]) === "service_role") problems.push(`${where}:${i + 1} contains a service_role key`);
    if (SECRET.test(line)) problems.push(`${where}:${i + 1} contains a Supabase secret key (sb_secret_…)`);
    SECRET.lastIndex = 0;
  });
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, out); }
    else if (e.isFile() && fs.statSync(p).size < 5 * 1024 * 1024) out.push(p);
  }
  return out;
}

async function get(url) {
  const r = await fetch(url, { redirect: "follow" });
  return r.ok ? r.text() : null;
}

async function live(base) {
  base = base.replace(/\/?$/, "/");
  const root = process.cwd();
  // every folder of this repository that has an index.html is a page on the website
  const pages = walk(root).filter((f) => path.basename(f) === "index.html")
    .map((f) => path.relative(root, path.dirname(f)).split(path.sep).join("/")).map((d) => (d ? d + "/" : ""));
  const seen = new Set();
  for (const page of pages) {
    const pageUrl = new URL(page, base).href;
    const html = await get(pageUrl);
    if (html === null) { console.log(`note: ${pageUrl} did not load (skipped)`); continue; }
    scan(html, pageUrl);
    const scripts = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/gi)].map((m) => new URL(m[1], pageUrl))
      .filter((u) => u.origin === new URL(base).origin).map((u) => u.href);
    for (const u of [...scripts, new URL("config.js", pageUrl).href]) {
      if (seen.has(u)) continue; seen.add(u);
      const js = await get(u);
      if (js !== null) scan(js, u);
    }
  }
  console.log(`live site: ${pages.length} page(s) and ${seen.size} script(s) checked`);
}

(async () => {
  const files = walk(process.cwd());
  for (const f of files) {
    let text; try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
    if (text.includes("\u0000")) continue; // binary
    scan(text, path.relative(process.cwd(), f));
  }
  console.log(`repository: ${files.length} file(s) checked`);
  const i = process.argv.indexOf("--live");
  if (i > 0 && process.argv[i + 1]) await live(process.argv[i + 1]);
  if (problems.length) {
    for (const p of problems) console.log(`::error::${p}`);
    console.log(`\n${problems.length} problem(s). Remove the key, then rotate it in Supabase → Project Settings → API Keys.`);
    process.exit(1);
  }
  console.log("OK: no service_role or secret key found");
})().catch((e) => { console.log(`::error::check-keys failed: ${e.message}`); process.exit(1); });
