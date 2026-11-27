/* Remarks from the President and the General Secretary on any request, in every portal.
   Loaded by akf-desk.js. A portal only puts <div data-akf-remarks="REQUEST-NUMBER"></div> in its request detail; this file fills it.
   Everyone who can open the request reads the remarks; only the President and the General Secretary get the box to add one.
   The database checks the role again and writes every remark to the audit trail (supabase/sql/058_leadership_remarks.sql).
   Safety: everything is built with textContent; no HTML from records is ever put on the page. */
(function () {
  "use strict";
  if (window.AKF_REMARKS) return; window.AKF_REMARKS = true;
  const seg = (location.pathname.match(/\/(fleet|assistance|procurement|store|tasks|hr)\//) || [])[1];
  const PORTAL = { fleet: "fleet", assistance: "assistance", hr: "hr", procurement: "portal", store: "portal", tasks: "portal" }[seg];
  const cfg = window.AKF_SUPABASE;
  if (!PORTAL || !cfg || !cfg.url || !window.supabase) return;
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { storage: (() => { try { return location.pathname.indexOf("/portal-staging/") === 0 ? sessionStorage : undefined; } catch (e) { return undefined; } })(), storageKey: "akf-portals-auth", autoRefreshToken: false, detectSessionInUrl: false } });
  const cache = new Map(), draft = new Map();   // per request number: what the database said, and text being typed (pages redraw often)
  const el = (tag, style, text) => { const e = document.createElement(tag); Object.assign(e.style, style || {}); if (text != null) e.textContent = text; return e; };
  const when = t => { const d = new Date(t); return isNaN(d) ? "" : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); };
  const LINE = "1px solid rgba(128,128,128,.35)";

  function draw(box, ref, data) {
    box.textContent = ""; delete box.dataset.akfRemarksFull;
    if (!data || (!data.rows.length && !data.canAdd)) return;   // nothing to show for most people on most requests
    box.dataset.akfRemarksFull = "1";
    const card = el("div", { border: LINE, borderRadius: "12px", padding: "12px 14px", margin: "12px 0", font: "inherit", color: "inherit", textAlign: "left" });
    card.append(el("div", { fontWeight: "700", marginBottom: "6px" }, "Remarks: President and General Secretary"));
    for (const r of data.rows) {
      const row = el("div", { padding: "8px 0", borderTop: LINE });
      row.append(el("div", { fontSize: "12px", opacity: ".75" }, r.role + " · " + r.name + " · " + when(r.at)), el("div", { whiteSpace: "pre-wrap", overflowWrap: "anywhere" }, r.body));
      card.append(row);
    }
    if (data.canAdd) {
      const ta = el("textarea", { width: "100%", boxSizing: "border-box", minHeight: "64px", marginTop: "8px", padding: "8px 10px", border: LINE, borderRadius: "8px", font: "inherit", color: "inherit", background: "transparent" });
      ta.maxLength = 1000; ta.setAttribute("aria-label", "Remarks"); ta.placeholder = "Write your remarks on this request"; ta.value = draft.get(ref) || "";
      ta.addEventListener("input", () => draft.set(ref, ta.value));
      const msg = el("span", { fontSize: "13px", marginLeft: "10px" }); msg.setAttribute("role", "status");
      const btn = el("button", { marginTop: "8px", padding: "8px 14px", borderRadius: "10px", border: "1px solid #0B4EA8", background: "#0B4EA8", color: "#fff", font: "600 13px system-ui, sans-serif", cursor: "pointer" }, "Save remarks");
      btn.type = "button";
      btn.addEventListener("click", async () => {
        const txt = ta.value.trim(); if (txt.length < 2) { msg.textContent = "Please fill the remarks."; return; }
        btn.disabled = true; msg.textContent = "Saving…";
        const { error } = await sb.rpc("core_remark_add", { p_portal: PORTAL, p_ref: ref, p_body: txt });
        if (error) { btn.disabled = false; const m = String(error.message || ""); msg.textContent = /^(Only|Please|This request)/.test(m) && m.length < 200 ? m : "Not saved. Please try again."; return; }
        draft.delete(ref); cache.delete(ref); fill(box);
      });
      card.append(ta, btn, msg);
    }
    box.append(card);
  }
  async function fill(box) {
    const ref = (box.dataset.akfRemarks || "").trim(); if (!ref || ref.length > 80) return;
    box.dataset.akfRemarksOn = ref;
    if (!cache.has(ref)) cache.set(ref, sb.rpc("core_remark_list", { p_portal: PORTAL, p_ref: ref }).then(r => (r.error || !r.data ? null : r.data)));
    const data = await cache.get(ref);
    if (!data) cache.delete(ref);   // not signed in yet, or offline: ask again at the next redraw
    if (box.isConnected && box.dataset.akfRemarks === ref) draw(box, ref, data);
  }
  const scan = () => document.querySelectorAll("[data-akf-remarks]").forEach(b => { if (b.dataset.akfRemarksOn !== b.dataset.akfRemarks || (b.dataset.akfRemarksFull && !b.firstChild)) fill(b); });   // second case: a page redraw emptied the box
  let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 80); }).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
