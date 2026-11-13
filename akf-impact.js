/* Programme impact in the foot line (home page #prog-foot, old main page .pf, every portal .jz-prog-foot). Loaded on every page by akf-desk.js.
   Cursor (or keyboard focus) on a programme: a card in the programme's colour flips up with its figures.
   Click: a small window with the same figures; it closes with a click on the empty side, Esc or the x.
   The figures are the published national impact figures of Alkhidmat Foundation (given 2026-11-13). No personal data. */
(function () {
  "use strict";
  if (window.AKF_IMPACT) return;
  const SEL = "#prog-foot span, .pf span, .jz-prog-foot span";
  // programme name as written in the foot line: [beneficiaries, [figure, what it counts] ...]
  const DATA = {
    "Disaster Management": ["1,577,982", ["70,150", "Volunteers"], ["120,313", "Ration packages"], ["121", "Trainings"], ["70,358", "Shelters"], ["43", "Response centers"], ["34", "Reconstruction"], ["42,233", "Hygiene kits"], ["698,791", "Others"]],
    "Health Services": ["11,470,952", ["57", "Hospitals"], ["68", "Pharmacies"], ["55", "Medical centers"], ["1,198", "Medical camps"], ["296", "Ambulances"], ["16", "Mobile health units"], ["39", "Mega labs & diagnostic centers"], ["97", "Collection centers"]],
    "Education Program": ["21,147", ["91", "Skill development centers"], ["73", "Child protection centers"], ["40", "Accelerated learning centers"], ["60", "Alkhidmat schools"], ["1,569", "Scholarships"], ["10", "Learning resource centers"]],
    "WASH": ["7,612,450", ["308", "Water filtration plants"], ["3,169", "Submersible water pumps"], ["688", "Solar submersible water pumps"], ["12,616", "Community hand pumps"], ["5,509", "Small hand pumps"], ["243", "Gravity flow water schemes"], ["3,276", "Water wells"]],
    "Orphan Care Program": ["3,411", ["195", "Clusters"], ["408", "CMCDP study centers"], ["31,967", "OFSP orphans"], ["2,144", "Orphans at Aghosh"], ["3,222", "Activities held"]],
    "Community Services": ["3,822,178", ["106,264", "Food packages"], ["280,846", "Qurbani meat packs"], ["25,922", "Winter packages"], ["1,113", "Marriage gift boxes"], ["8,323", "Wheelchairs distribution"], ["3,954", "Prisoners welfare"], ["7,990", "Diwali & Christmas gifts"], ["62", "Masajid construction & rehabilitation"]],
    "Islamic Microfinance": ["3,297", ["53", "Clusters"], ["866 million", "Loan portfolio 2012-2025"], ["97%", "Recovery rate"], ["20,890", "Beneficiaries 2012-2025"]],
    "Bano Qabil": ["87,000", ["1.2 M+", "Students registered"], ["87,000+", "Graduates"], ["120+", "IT centers"], ["45,000+", "Single session enrolment"], ["40", "Cities"], ["25", "Core courses"]]
  };
  // white text on the dark programme colours, dark text on the light ones (lime, turquoise), so the figures stay readable
  const light = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255 > 0.55; };
  console.assert(Object.keys(DATA).length === 8 && Object.values(DATA).every(d => /\d/.test(d[0]) && d.length >= 5 && d.slice(1).every(s => s.length === 2))
    && light("#a2cd44") && light("#23c2cb") && !light("#0460b3") && !light("#ff301a"), "akf-impact: 8 programmes with figures; text colour follows the programme colour");

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const st = el("style"); st.id = "akf-impact-css";
  st.textContent = "#prog-foot span,.pf span,.jz-prog-foot span{cursor:pointer}#prog-foot span:focus-visible,.pf span:focus-visible,.jz-prog-foot span:focus-visible{outline:2px solid var(--pc);outline-offset:1px}"
    + ".ip-card{box-sizing:border-box;width:min(340px,calc(100vw - 16px));padding:14px;border-radius:14px;background:var(--ib);color:var(--it);font:500 12px/1.25 Manrope,'Segoe UI',system-ui,sans-serif;box-shadow:0 14px 40px rgba(8,25,45,.35);text-align:left}"
    + ".ip-h{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:15px;font-weight:800}.ip-h img{flex:none;width:26px;height:26px;object-fit:contain;background:#fff;border-radius:7px}"
    + ".ip-g{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin:0}.ip-g div{min-width:0}.ip-g dt{font-size:19px;font-weight:800;line-height:1.1}.ip-g dd{margin:1px 0 0;font-size:10.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;opacity:.95}"
    + ".ip-b{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding:5px 12px 5px 5px;border-radius:10px;background:rgba(255,255,255,.2);font-size:21px;font-weight:800}"
    + ".ip-n{font-variant-numeric:tabular-nums}.ip-b span{padding:5px 9px;border-radius:7px;background:#fff;color:#16222e;font-size:11px;letter-spacing:.05em}"
    + ".ip-pop{position:fixed;z-index:9990;pointer-events:none;transform-origin:50% 100%;animation:ip-flip .38s cubic-bezier(.2,.8,.3,1.15) both}"
    + "@keyframes ip-flip{from{transform:perspective(700px) rotateX(-92deg);opacity:0}to{transform:perspective(700px) rotateX(0);opacity:1}}"
    + "dialog.ip-dlg{padding:0;border:0;border-radius:16px;background:transparent;overflow:visible;max-width:none}dialog.ip-dlg::backdrop{background:rgba(8,25,45,.5)}"
    + "dialog.ip-dlg[open]{animation:ip-flip .38s cubic-bezier(.2,.8,.3,1.15) both;transform-origin:50% 50%}"
    + "dialog.ip-dlg .ip-card{width:min(430px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;padding:18px}dialog.ip-dlg .ip-g dt{font-size:22px}dialog.ip-dlg .ip-g dd{font-size:11px}dialog.ip-dlg .ip-b{font-size:24px}"
    + ".ip-x{margin-left:auto;width:30px;height:30px;border:0;border-radius:99px;background:rgba(255,255,255,.22);color:inherit;font:700 18px/1 system-ui,sans-serif;cursor:pointer}"
    + "@media (prefers-reduced-motion:reduce){.ip-pop,dialog.ip-dlg[open]{animation:none}}@media print{.ip-pop,dialog.ip-dlg{display:none!important}}";
  document.head.append(st);

  const nameOf = chip => chip.textContent.trim();
  // the card: programme colour, name, each figure under the programme, beneficiaries at the foot
  function card(chip, withClose) {
    const name = nameOf(chip), d = DATA[name], pc = (chip.style.getPropertyValue("--pc") || "#0060ae").trim(), lt = light(pc);
    const c = el("div", "ip-card"); c.style.setProperty("--ib", lt ? pc : "color-mix(in srgb, " + pc + " 86%, #000)"); c.style.setProperty("--it", lt ? "#10202d" : "#fff");
    const h = el("h2", "ip-h"), src = chip.querySelector("img");
    if (src) { const i = el("img"); i.src = src.src; i.alt = ""; h.append(i); }
    h.append(name);
    if (withClose) { const x = el("button", "ip-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Close"); h.append(x); }
    const g = el("dl", "ip-g");
    d.slice(1).forEach(([n, what]) => { const w = el("div"); w.append(el("dt", "ip-n", n), el("dd", "", what)); g.append(w); });
    const b = el("div", "ip-b"); b.append(el("span", "", "BENEFICIARIES"), el("data", "ip-n", d[0]));
    c.append(h, g, b); return c;
  }
  // count-up: the figure at part e (0..1) of its way; commas, decimals and signs (+, %, million) stay as published
  const at = (s, e) => s.replace(/[\d,]+(\.\d+)?/, m => { const dec = (m.split(".")[1] || "").length, v = parseFloat(m.replace(/,/g, "")) * e; return dec ? v.toFixed(dec) : Math.round(v).toLocaleString("en-US"); });
  console.assert(Object.values(DATA).every(d => at(d[0], 1) === d[0] && d.slice(1).every(s => at(s[0], 1) === s[0])) && at("866 million", .5) === "433 million" && at("97%", 0) === "0%" && at("1.2 M+", .5) === "0.6 M+",
    "akf-impact: the count-up ends on the exact published figure");
  // every figure of a card on screen runs from 0 to its final value in about a second; no motion when the computer asks for none
  function count(c) {
    if (matchMedia("(prefers-reduced-motion:reduce)").matches) return;
    const els = [...c.querySelectorAll(".ip-n")], fin = els.map(x => x.textContent), t0 = performance.now();
    (function step(t) {
      if (!c.isConnected) return;
      const p = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - p, 3);
      els.forEach((x, i) => { x.textContent = p < 1 ? at(fin[i], e) : fin[i]; });
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  let pop, cur;
  function hide() { if (pop) pop.remove(); pop = cur = null; }
  function show(chip) {
    if (chip === cur) return;
    hide(); if (!DATA[nameOf(chip)] || document.querySelector("dialog.ip-dlg[open]")) return;
    cur = chip; pop = card(chip); pop.classList.add("ip-pop"); pop.setAttribute("role", "tooltip"); document.body.append(pop);
    const r = chip.getBoundingClientRect(), w = pop.offsetWidth;   // sits just above the programme, kept inside the screen
    pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    pop.style.bottom = (innerHeight - r.top + 8) + "px";
    count(pop);
  }
  function open(chip) {
    hide(); if (!DATA[nameOf(chip)]) return;
    const old = document.querySelector("dialog.ip-dlg"); if (old) old.remove();
    const dlg = el("dialog", "ip-dlg"); dlg.setAttribute("aria-label", nameOf(chip) + ": impact"); dlg.append(card(chip, true));
    let done = 0; const shut = () => { if (done++) return; if (dlg.open) dlg.close(); dlg.remove(); if (chip.isConnected) chip.focus(); };
    dlg.addEventListener("click", e => { if (e.target === dlg || e.target.closest(".ip-x")) shut(); });   // the empty side is the dialog itself (its backdrop)
    dlg.addEventListener("close", shut); dlg.addEventListener("cancel", shut);   // Esc
    document.body.append(dlg); dlg.showModal(); count(dlg);
  }
  const chipOf = e => e.target && e.target.closest ? e.target.closest(SEL) : null;
  document.addEventListener("mouseover", e => { const c = chipOf(e); if (c) show(c); });
  document.addEventListener("mouseout", e => { const c = chipOf(e); if (c && !c.contains(e.relatedTarget)) hide(); });
  document.addEventListener("focusin", e => { const c = chipOf(e); if (c && c.matches(":focus-visible")) show(c); });
  document.addEventListener("focusout", e => { if (chipOf(e)) hide(); });
  document.addEventListener("click", e => { const c = chipOf(e); if (c) open(c); });
  document.addEventListener("keydown", e => { const c = chipOf(e); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(c); } });
  addEventListener("scroll", hide, true);
  // the home page draws its line itself: make its programmes reachable by keyboard too
  const arm = () => document.querySelectorAll(SEL).forEach(c => { if (!c.hasAttribute("tabindex")) { c.tabIndex = 0; c.setAttribute("role", "button"); } });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arm); else arm();
  window.AKF_IMPACT = { data: DATA };
})();
