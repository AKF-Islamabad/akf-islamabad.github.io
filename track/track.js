/* Track my donation (no sign-in): asks the database function donor_public_track (045) with a receipt number and the
   donor's mobile number, then shows their receipts, totals and pledges. Everything goes on the page as text (textContent). */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const cfg = window.AKF_SUPABASE || {};
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    e.append(...kids.flat(9).filter(x => x != null && x !== false)); return e;
  }
  const rs = n => "Rs " + Math.round(+n || 0).toLocaleString("en-PK");
  const dmy = s => { const d = new Date(String(s || "") + "T00:00:00"); return isNaN(d) ? String(s || "") : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); };
  // a receipt link may carry the number: /track/#RCT-2026-000123
  const fromHash = decodeURIComponent((location.hash || "").slice(1)); if (/^RCT-\d{4}-\d{1,8}$/i.test(fromHash)) $("rc").value = fromHash.toUpperCase();

  async function go() {
    const rc = $("rc").value.trim().toUpperCase(), ph = $("ph").value.trim(), msg = $("msg"), b = $("go");
    msg.className = "small"; msg.textContent = "";
    if (!/^RCT-\d{4}-\d{1,8}$/.test(rc.replace(/\s/g, ""))) { msg.className = "small err"; msg.textContent = "Enter the receipt number like RCT-2026-000123"; return; }
    if (ph.replace(/\D/g, "").length < 10) { msg.className = "small err"; msg.textContent = "Enter your 11-digit mobile number"; return; }
    if (!cfg.url || !cfg.anonKey) { msg.className = "small err"; msg.textContent = "This page is not set up yet. Please call our office."; return; }
    b.disabled = true; msg.textContent = "Looking up…";
    let d;
    try {
      const r = await fetch(cfg.url.replace(/\/$/, "") + "/rest/v1/rpc/donor_public_track", { method: "POST",
        headers: { apikey: cfg.anonKey, Authorization: "Bearer " + cfg.anonKey, "Content-Type": "application/json" }, body: JSON.stringify({ p_receipt: rc, p_phone: ph }) });
      d = await r.json();
    } catch (e) { d = null; }
    b.disabled = false;
    if (!d || d.ok !== true) { msg.className = "small err"; msg.textContent = (d && typeof d.why === "string" ? d.why : "The service is busy. Please try again in a minute."); $("out").hidden = true; return; }
    msg.textContent = ""; show(d);
  }

  function show(d) {
    const out = $("out"); out.hidden = false;
    const recs = d.receipts || [], years = Object.entries(d.byYear || {}).sort((a, b) => b[0].localeCompare(a[0])), progs = Object.entries(d.byProgram || {}).sort((a, b) => b[1] - a[1]);
    const ch = el("div");
    if (window.AKF_CHARTS) ch.innerHTML = AKF_CHARTS.bars({ id: "trk-prog", items: progs.map(([k, v]) => ({ key: k, label: k, value: +v })), empty: "No donations yet" });
    out.replaceChildren(
      el("div", { class: "card" },
        el("div", { class: "row", style: "justify-content:space-between" }, el("div", {}, el("div", { class: "small muted", text: d.org || "Alkhidmat Foundation Islamabad" }),
          el("b", { style: "font-size:20px", text: "Donation statement · " + (d.donor && d.donor.name || "Donor") }),
          el("div", { class: "small muted", text: [d.donor && d.donor.city, d.donor && d.donor.since ? "donor since " + dmy(d.donor.since) : "", "as of " + d.asOf].filter(Boolean).join(" · ") })),
          el("div", { class: "row noprint" }, el("button", { type: "button", class: "ghost", text: "Print / save as PDF", onclick: () => print() }),
            el("button", { type: "button", class: "ghost", text: "New search", onclick: () => { $("out").hidden = true; $("ph").value = ""; scrollTo(0, 0); } }))),
        el("div", { class: "kpis", style: "margin-top:12px" },
          el("div", { class: "kpi" }, el("span", { class: "small muted", text: "Total donated" }), el("b", { text: rs(d.total) }), el("span", { class: "small muted", text: recs.length + " receipt" + (recs.length === 1 ? "" : "s") })),
          el("div", { class: "kpi" }, el("span", { class: "small muted", text: "Verified by Finance" }), el("b", { text: rs(d.verified) })),
          el("div", { class: "kpi" }, el("span", { class: "small muted", text: "This year" }), el("b", { text: rs((d.byYear || {})[String(new Date().getFullYear())] || 0) })))),
      el("div", { class: "card" }, el("b", { text: "Where your donations go (by programme)" }), el("div", { style: "margin-top:8px" }, ch),
        years.length ? el("div", { class: "small muted", style: "margin-top:8px", text: "By year: " + years.map(([y, t]) => y + " " + rs(t)).join(" · ") }) : null),
      (d.pledges || []).length ? el("div", { class: "card" }, el("b", { text: "My pledges" }), el("div", { class: "tbl" }, el("table", {},
        el("tr", {}, ["Pledged", "Paid so far", "Remaining", "Next due", "Status"].map(t => el("th", { text: t }))),
        d.pledges.map(p => el("tr", {}, el("td", { text: rs(p.total) + (p.count ? " · " + p.count + " " + (p.freq || "") : "") }), el("td", { text: rs(p.paid) }),
          el("td", { text: rs(Math.max(0, (+p.total || 0) - (+p.paid || 0))) }), el("td", { text: p.next ? dmy(p.next) : "—" }), el("td", { text: p.status || "" })))))) : null,
      el("div", { class: "card" }, el("b", { text: "My receipts" }), el("div", { class: "tbl" }, el("table", {},
        el("tr", {}, ["Date", "Receipt", "For", "Amount", "Status"].map(t => el("th", { text: t }))),
        recs.map(x => el("tr", {}, el("td", { text: dmy(x.date) }), el("td", { text: x.receipt }),
          el("td", {}, (x.lines || []).map(l => el("div", { class: "small", text: [l.category, l.program, l.qty ? l.qty + " " + (l.unit || "") : "", l.detail].filter(Boolean).join(" · ") + (l.amount ? " — " + rs(l.amount) : "") }))),
          el("td", { text: rs(x.amount) }), el("td", {}, el("span", { class: "tag " + (/Verified/.test(x.status) ? "ok" : "wait"), text: x.status }))))))),
      el("p", { class: "small muted", text: "JazakAllah khair for your support. For a correction or a tax certificate, call our office with your receipt number." }));
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  $("go").addEventListener("click", go);
  ["rc", "ph"].forEach(id => $(id).addEventListener("keydown", e => { if (e.key === "Enter") go(); }));
  try { document.documentElement.dataset.theme = localStorage.getItem("akf-theme") || ""; } catch (e) { }
})();
