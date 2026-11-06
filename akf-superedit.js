/* Super Admin: correct any entry in the portals (Fleet, Purchase, Store, Tasks, Donor, Assistance).
   Loaded by akf-desk.js on every portal page. It shows nothing unless the database says this person is the Super Admin
   with the authenticator code (core_super_edit_ok). Turn on "Edit entries", click any row, change the values, give a reason, save.
   The database does every check and writes the old and new values to the audit log (supabase/sql/040_super_edit.sql).
   Safety: everything is built with textContent; no HTML from records is ever put on the page. */
(function () {
  "use strict";
  if (window.AKF_SUPEREDIT) return; window.AKF_SUPEREDIT = true;
  const seg = (location.pathname.match(/\/(fleet|donor|assistance|procurement|store|tasks)\//) || [])[1];
  const PORTAL = { fleet: "fleet", donor: "donor", assistance: "assistance", procurement: "portal", store: "portal", tasks: "portal" }[seg];
  const cfg = window.AKF_SUPABASE;
  if (!PORTAL || !cfg || !cfg.url || !window.supabase) return;
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { storageKey: "akf-portals-auth", autoRefreshToken: false, detectSessionInUrl: false } });

  // fields that belong to the approval record: shown, never edited (the database refuses them too)
  const LOCKED = new Set(["id", "no", "key", "status", "stage", "state", "timeline", "history", "log", "logs", "trail", "approvals", "approval", "signs", "sig", "sigs",
    "signature", "signatures", "createdat", "created", "created_at", "at0", "by", "createdby", "requesterid", "email", "drvemail", "username", "password", "role",
    "erased", "verified", "verifiedby", "verifiedat", "receiptkey", "hash"]);
  const locked = k => k.startsWith("_") || LOCKED.has(k.toLowerCase());
  const LABEL = { v: "Vehicle", veh: "Vehicle", p: "Plate", m: "Model", c: "Category", odo: "Odometer", iv: "Every (KM)", ndo: "Next due odometer", w: "Workshop",
    drv: "Driver", km: "KM", dur: "Duration (minutes)", amt: "Amount", l: "Litres", pl: "Price per litre", tst: "Start time", tet: "End time", os: "Start odometer",
    oe: "End odometer", pur: "Purpose", dept: "Department", dp: "Department", from: "From", to: "To", date: "Date", type: "Type", cost: "Cost", name: "Name", n: "Name",
    qty: "Quantity", price: "Price", uom: "Unit", pd: "Pick-up date", pt: "Pick-up time", rd: "Return date", rt: "Return time", place: "Place", city: "City",
    reason: "Reason", ph: "Phone", drvph: "Driver phone", ft: "Fuel type", st: "Station", full: "Full tank", purpose: "Purpose", donor: "Donor", projectCode: "Project code",
    urgency: "Urgency", amount: "Amount", title: "Title", description: "Description", plannedDate: "Planned date", dueDate: "Due date", items: "Items" };
  const label = k => (LABEL[k] ? LABEL[k] + " (" + k + ")" : k);

  const css = (e, s) => { Object.assign(e.style, s); return e; };
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue;
      if (k === "text") e.textContent = v; else if (k === "style") css(e, v); else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "value") e.value = v; else e.setAttribute(k, v === true ? "" : v); }
    e.append(...kids.flat(9).filter(x => x != null && x !== false)); return e;
  }
  const BTN = { padding: "8px 14px", borderRadius: "10px", border: "1px solid #CBD5E1", background: "#fff", color: "#0F172A", font: "600 13px system-ui, sans-serif", cursor: "pointer" };
  const PRI = Object.assign({}, BTN, { background: "#0B4EA8", color: "#fff", border: "1px solid #0B4EA8" });
  const INP = { width: "100%", boxSizing: "border-box", padding: "7px 9px", border: "1px solid #CBD5E1", borderRadius: "8px", font: "14px system-ui, sans-serif", background: "#fff", color: "#0F172A" };
  let on = false, panel = null, fab = null, hoverEl = null;

  function toast(msg, bad) {
    const t = el("div", { role: "status", text: msg, style: { position: "fixed", left: "50%", bottom: "28px", transform: "translateX(-50%)", zIndex: 100001, maxWidth: "90vw",
      background: bad ? "#B91C1C" : "#0F766E", color: "#fff", padding: "10px 16px", borderRadius: "10px", font: "600 14px system-ui, sans-serif", boxShadow: "0 8px 24px rgba(0,0,0,.25)" } });
    document.body.append(t); setTimeout(() => t.remove(), bad ? 7000 : 3500);
  }
  const plain = e => { const m = String((e && e.message) || e || ""); return m.length < 300 && !/relation|column|syntax|function |violates/i.test(m) ? m : "That did not work. Please try again."; };

  /* ---------- the switch ---------- */
  function setOn(v) {
    on = v; fab.setAttribute("aria-pressed", String(v)); fab.textContent = v ? "✎ Editing: click a row (Esc to stop)" : "✎ Edit entries";
    css(fab, v ? { background: "#B45309", borderColor: "#B45309", color: "#fff" } : { background: "#fff", borderColor: "#B45309", color: "#B45309" });
    if (!v) mark(null);
  }
  function mark(e) {
    if (hoverEl) hoverEl.style.outline = hoverEl.dataset.akfOutline || ""; hoverEl = e;
    if (e) { e.dataset.akfOutline = e.style.outline || ""; e.style.outline = "2px dashed #B45309"; }
  }
  // the row under the pointer: a table row, or the smallest card / list item around it
  function rowOf(t) {
    if (!t || !t.closest || (panel && panel.contains(t)) || t === fab) return null;
    if (t.closest("header, nav, .jz-ts, #sidebar, .sidebar, [data-jz-shell], .akf-desk, .akf-note")) return null;
    const tr = t.closest("tr"); if (tr && tr.querySelector("td")) return tr;
    const c = t.closest("li, .hr-row, .item, .rcard, .kcard, .tk-card, .card");
    return c && c.innerText.length < 900 ? c : null;
  }
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const SKIP = /^(open|edit|view|details|print|delete|remove|tracking & details|tracking|yes|no|—|-|–|all|ok|pending|approved|rejected|returned|on duty)$/i;
  // the words of a row as they are saved: "Rs 8,850" → 8850, "06-Nov-2026" → 2026-11-06
  function tokens(row) {
    const parts = row.tagName === "TR" ? [...row.cells].map(c => c.innerText) : row.innerText.split(/\n|·|•| – /);
    const out = [];
    for (let s of parts) {
      s = String(s || "").replace(/\s+/g, " ").trim().replace(/^(Rs\.?|PKR)\s*/i, "");
      if (/^-?[\d,]+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
      const d = /^(\d{1,2})[- ]([A-Za-z]{3})[a-z]*[- ](\d{4})/.exec(s);
      if (d && MON[d[2].toLowerCase()]) s = d[3] + "-" + String(MON[d[2].toLowerCase()]).padStart(2, "0") + "-" + d[1].padStart(2, "0");
      if (s.length < 2 || s.length > 80 || SKIP.test(s) || /^[\W_]+$/.test(s)) continue;
      if (!out.includes(s)) out.push(s);
    }
    return out.slice(0, 10);
  }

  /* ---------- the panel ---------- */
  function close() { if (panel) panel.remove(); panel = null; }
  function shell(title) {
    close();
    const body = el("div", { style: { padding: "14px 16px", overflow: "auto", flex: "1" } });
    panel = el("aside", { role: "dialog", "aria-label": title, style: { position: "fixed", top: "0", right: "0", bottom: "0", width: "min(560px, 100vw)", background: "#fff", color: "#0F172A",
      zIndex: 100000, boxShadow: "-12px 0 32px rgba(0,0,0,.25)", display: "flex", flexDirection: "column", font: "14px system-ui, sans-serif" } },
      el("div", { style: { display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", borderBottom: "1px solid #E2E8F0", background: "#FFFBEB" } },
        el("b", { text: title, style: { flex: "1", fontSize: "16px" } }), el("button", { type: "button", text: "Close", style: BTN, onclick: close })), body);
    document.body.append(panel); return body;
  }
  const summary = d => Object.entries(d || {}).filter(([k, v]) => !locked(k) && v != null && typeof v !== "object" && String(v).length).slice(0, 6).map(([k, v]) => (LABEL[k] || k) + ": " + String(v).slice(0, 40)).join(" · ");

  async function find(toks, why) {
    const body = shell("Correct an entry");
    const q = el("input", { type: "search", placeholder: "Search: ID, vehicle, name, amount, date (YYYY-MM-DD)…", value: why === "search" ? toks.join(" ") : "", style: INP });
    const go = () => { const t = q.value.split(/\s+/).filter(Boolean); if (t.length) find(t, "search"); };
    q.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    body.append(el("div", { style: { display: "flex", gap: "8px", marginBottom: "10px" } }, q, el("button", { type: "button", text: "Find", style: BTN, onclick: go })));
    const list = el("div", {}, el("p", { text: "Looking for the entry…", style: { color: "#64748B" } })); body.append(list);
    if (why === "row") body.insertBefore(el("p", { text: "Matched by: " + toks.join(" · "), style: { color: "#64748B", fontSize: "12px", margin: "0 0 8px" } }), list);
    setTimeout(() => q.focus(), 50);
    const { data, error } = await sb.rpc("core_super_find", { p_portal: PORTAL, p_tokens: toks });
    list.replaceChildren();
    if (error) { list.append(el("p", { text: plain(error), style: { color: "#B91C1C" } })); return; }
    const rows = data || [];
    if (!rows.length) { list.append(el("p", { text: "No entry matched. Search with the ID or another value from the row.", style: { color: "#64748B" } })); return; }
    if (rows.length === 1 && why === "row") return edit(rows[0]);
    list.append(el("p", { text: rows.length + " entries match. Choose one:", style: { margin: "0 0 6px", fontWeight: "600" } }));
    rows.forEach(r => list.append(el("button", { type: "button", onclick: () => edit(r), style: Object.assign({}, BTN, { display: "block", width: "100%", textAlign: "left", marginBottom: "6px", fontWeight: "400" }) },
      el("b", { text: r.collection + " · " + r.id }), el("div", { text: summary(r.data), style: { color: "#475569", fontSize: "12px", marginTop: "2px" } }))));
  }

  function edit(r) {
    const body = shell("Correct · " + r.collection + " · " + r.id), d = r.data || {}, get = {};
    const field = (k, v) => {
      if (typeof v === "boolean") { const c = el("input", { type: "checkbox" }); c.checked = v; get[k] = () => c.checked; return c; }
      if (typeof v === "number") { const n = el("input", { type: "number", step: "any", value: String(v), style: INP }); get[k] = () => (n.value === "" ? v : Number(n.value)); return n; }
      const s = v == null ? "" : String(v), long = s.length > 70;
      const t = el(long ? "textarea" : "input", { value: s, maxlength: 2000, rows: long ? 3 : null, style: INP }); if (!long) t.type = "text";
      get[k] = () => (v == null && t.value === "" ? v : t.value); return t;
    };
    const form = el("div", { style: { display: "grid", gap: "10px" } }), fixed = [];
    for (const [k, v] of Object.entries(d)) {
      if (locked(k)) { if (v != null && typeof v !== "object") fixed.push((LABEL[k] || k) + ": " + String(v).slice(0, 60)); continue; }
      if (Array.isArray(v) && v.length && v.every(x => x && typeof x === "object" && !Array.isArray(x) && Object.values(x).every(y => y == null || typeof y !== "object"))) {
        const cols = Object.keys(v[0]).filter(c => v.every(x => Object.keys(x).join() === Object.keys(v[0]).join()));
        if (cols.length !== Object.keys(v[0]).length) continue;   // rows with different fields are not edited here
        const cell = v.map(x => ({}));
        const tbl = el("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "12px" } }, el("tr", {}, cols.map(c => el("th", { text: LABEL[c] || c, style: { textAlign: "left", padding: "4px" } }))),
          v.map((x, i) => el("tr", {}, cols.map(c => { const f = locked(c) || typeof x[c] === "object" ? el("span", { text: String(x[c] ?? "") }) : field(k + "." + i + "." + c, x[c]);
            if (get[k + "." + i + "." + c]) { cell[i][c] = get[k + "." + i + "." + c]; delete get[k + "." + i + "." + c]; } return el("td", { style: { padding: "3px" } }, f); }))));
        get[k] = () => v.map((x, i) => Object.assign({}, x, Object.fromEntries(Object.entries(cell[i]).map(([c, g]) => [c, g()]))));
        form.append(el("div", {}, el("div", { text: label(k), style: { fontWeight: "600", marginBottom: "4px" } }), el("div", { style: { overflowX: "auto" } }, tbl)));
        continue;
      }
      if (v != null && typeof v === "object") continue;   // groups of values are not edited here
      form.append(el("label", { style: { display: "grid", gap: "4px" } }, el("span", { text: label(k), style: { fontWeight: "600", fontSize: "13px" } }), field(k, v)));
    }
    const why = el("input", { type: "text", maxlength: 300, placeholder: "Reason for the correction (required), e.g. odometer typed wrong", style: INP });
    const save = el("button", { type: "button", text: "Save correction", style: PRI });
    save.addEventListener("click", async () => {
      const patch = {};
      for (const [k, g] of Object.entries(get)) { const nv = g(); if (JSON.stringify(nv) !== JSON.stringify(d[k])) patch[k] = nv; }
      if (!Object.keys(patch).length) return toast("Nothing has changed", true);
      if (why.value.trim().length < 5) { why.focus(); return toast("Give the reason for the correction", true); }
      save.disabled = true; save.textContent = "Saving…";
      const { data: n, error } = await sb.rpc("core_super_edit", { p_portal: PORTAL, p_collection: r.collection, p_id: r.id, p_patch: patch, p_reason: why.value.trim() });
      if (error) { toast(plain(error), true); save.disabled = false; save.textContent = "Save correction"; return; }
      toast(n + " field" + (n === 1 ? "" : "s") + " corrected and written to the audit log. Reloading…");
      close(); setTimeout(() => location.reload(), 900);
    });
    body.append(form.childNodes.length ? form : el("p", { text: "This entry has no values that can be corrected here.", style: { color: "#64748B" } }),
      fixed.length ? el("details", { style: { marginTop: "12px", color: "#475569", fontSize: "12px" } }, el("summary", { text: "Approval record (cannot be changed here)" }), el("ul", {}, fixed.map(t => el("li", { text: t })))) : null,
      el("div", { style: { display: "grid", gap: "8px", marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #E2E8F0" } }, why,
        el("div", { style: { display: "flex", gap: "8px" } }, save, el("button", { type: "button", text: "Cancel", style: BTN, onclick: close })),
        el("p", { text: "Only values change. The approval history, signatures and status stay as they are. Old and new values are kept in the audit log.", style: { color: "#64748B", fontSize: "12px", margin: "0" } })));
  }

  /* ---------- start: only for the Super Admin ---------- */
  async function start() {
    let ok = false; try { const { data } = await sb.rpc("core_super_edit_ok"); ok = data === true; } catch (e) { ok = false; }
    if (!ok) return;
    fab = el("button", { type: "button", "aria-pressed": "false", title: "Super Admin: correct any entry on this page", style: Object.assign({}, BTN, { position: "fixed", left: "16px", bottom: "92px",
      zIndex: 99990, borderColor: "#B45309", color: "#B45309", boxShadow: "0 6px 18px rgba(0,0,0,.18)" }) });
    fab.addEventListener("click", () => setOn(!on));
    const findBtn = el("button", { type: "button", text: "Find entry", title: "Super Admin: search any entry to correct", style: Object.assign({}, BTN, { position: "fixed", left: "16px", bottom: "136px", zIndex: 99990, display: "none" }), onclick: () => find([], "search") });
    document.body.append(fab, findBtn); setOn(false);
    new MutationObserver(() => { findBtn.style.display = on ? "block" : "none"; }).observe(fab, { attributes: true, attributeFilter: ["aria-pressed"] });
    document.addEventListener("mouseover", e => { if (on && !panel) mark(rowOf(e.target)); }, true);
    document.addEventListener("click", e => {
      if (!on || panel && panel.contains(e.target) || e.target === fab || e.target === findBtn) return;
      const row = rowOf(e.target); if (!row) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const t = tokens(row); if (!t.length) return toast("Nothing to match in that row. Use Find entry.", true);
      mark(null); find(t, "row");
    }, true);
    document.addEventListener("keydown", e => { if (e.key === "Escape") { if (panel) close(); else if (on) setOn(false); } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 1500)); else setTimeout(start, 1500);
})();
