/* Jazba frame for every portal (Jazba Portal Standard §1.1). Loaded by akf-desk.js on portal pages only.
   It shows the SAME Jazba rail as the main page: Today, this person's portals, and "In this portal" — the portal's
   own menu, copied from its (now hidden) sidebar. Clicking a copied item clicks the original button, so every
   page switch, permission and count works exactly as before. Ctrl/Cmd+K opens the same search palette.
   Desktop only (≥ 821 px): on phones each portal keeps its own menu and bottom bar.
   Everything is built with textContent / cloneNode; portal links must stay on this site. */
(function () {
  "use strict";
  if (window.JAZBA_SHELL) return;
  window.JAZBA_SHELL = true;
  const SCRIPT = document.currentScript && document.currentScript.src;
  const BASE = new URL(".", SCRIPT || location.href).href;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const SVG = d => { const ns = "http://www.w3.org/2000/svg", s = document.createElementNS(ns, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(ns, "path"); p.setAttribute("d", d); s.append(p); return s; };
  const ICON = { home: "M3 11l9-8 9 8M5 10v10h14V10", search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3", spark: "M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z", dot: "M12 12h.01" };
  const safeLink = u => { try { const x = new URL(String(u || ""), BASE); return x.origin === location.origin ? x.href : null; } catch (e) { return null; } };

  /* the portal's own menu: Procurement/Store/Tasks (aside.side nav.nav) or Donor/Fleet/Assistance (#nav .nav-item) */
  const navItems = () => [...document.querySelectorAll("aside.side nav.nav > button, #sidebar #nav button.nav-item")];
  const accountItems = () => [...document.querySelectorAll("aside.side .side-user button, #sidebar [data-act=logout], #sidebar #out-btn")];
  const labelOf = b => { const l = b.querySelector(".lbl"); const c = (l || b).cloneNode(true); c.querySelectorAll(".count,.nav-ind").forEach(x => x.remove()); return c.textContent.replace(/\s+/g, " ").trim(); };
  const countOf = b => { const c = b.querySelector(".count"); return c ? c.textContent.trim() : ""; };
  // the original is re-rendered often, so find it again by its label at click time
  const proxy = (label, list) => () => { const o = list().find(b => labelOf(b) === label); if (o) o.click(); };

  let rail, mine, portalsBox, acct, portals = [];
  function build() {
    rail = el("nav", "jz-rail jz-shell-rail"); rail.setAttribute("aria-label", "Jazba"); rail.tabIndex = 0;
    const logo = el("a", "jz-rail-logo"); logo.href = BASE; logo.title = "Today";
    const img = el("img"); img.src = BASE + "icon.jpg"; img.alt = "Alkhidmat logo"; img.width = 44; img.height = 44;
    const t = el("span", "jz-rail-text"); t.append(el("b", "", "Alkhidmat Foundation Islamabad"), el("small", "", "JAZBA"));
    logo.append(img, t);
    const today = el("a", "jz-rail-link"); today.href = BASE; today.title = "Today"; today.append(SVG(ICON.home), el("span", "jz-rail-text", "Today"));
    const search = el("button", "jz-rail-link"); search.type = "button"; search.title = "Search (Ctrl K)"; search.append(SVG(ICON.search), el("span", "jz-rail-text", "Search & AI"));
    search.addEventListener("click", openPalette);
    portalsBox = el("div"); mine = el("div"); acct = el("div", "jz-shell-acct");
    rail.append(logo, today, search, portalsBox, el("div", "jz-rail-h", "In this portal"), mine, acct);
    document.body.prepend(rail);
    document.addEventListener("pointerdown", e => { if (!rail.contains(e.target) && rail.contains(document.activeElement)) document.activeElement.blur(); });
  }
  function paintMine() {
    if (!mine) return;
    // which portal family is this? Procurement/Store/Tasks render inside .shell (layer-2 skin in jazba-portals.css)
    if (!document.documentElement.dataset.jzFamily && document.querySelector(".shell")) document.documentElement.dataset.jzFamily = "app";
    // Donor/Fleet/Assistance share one design kit (#sidebar + .main)
    else if (!document.documentElement.dataset.jzFamily && document.getElementById("sidebar")) document.documentElement.dataset.jzFamily = "kit";
    mine.replaceChildren(...navItems().map(b => {
      const label = labelOf(b); if (!label) return null;
      const a = el("button", "jz-rail-link" + (b.classList.contains("active") ? " on" : "")); a.type = "button"; a.title = label;
      const ic = b.querySelector("svg"); a.append(ic ? ic.cloneNode(true) : SVG(ICON.dot), el("span", "jz-rail-text", label));
      const n = countOf(b); if (n) a.append(el("span", "jz-rail-count", n));
      if (b.classList.contains("active")) a.setAttribute("aria-current", "page");
      a.addEventListener("click", proxy(label, navItems)); return a;
    }).filter(Boolean));
    acct.replaceChildren(...accountItems().map(b => { const label = labelOf(b); if (!label) return null;
      const a = el("button", "jz-rail-link"); a.type = "button"; a.title = label; const ic = b.querySelector("svg"); a.append(ic ? ic.cloneNode(true) : SVG(ICON.dot), el("span", "jz-rail-text", label));
      a.addEventListener("click", proxy(label, accountItems)); return a; }).filter(Boolean));
  }
  function paintPortals() {
    portalsBox.replaceChildren(); if (!portals.length) return;
    portalsBox.append(el("div", "jz-rail-h", "Portals"));
    portals.forEach(p => { const href = safeLink(p.url); if (!href) return;
      const here = location.href.startsWith(href);
      const a = el("a", "jz-rail-link" + (here ? " on" : "")); a.href = href; a.title = p.name;
      const dot = el("span", "jz-rail-dot"); dot.style.background = /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : "#0060AE";
      a.append(dot, el("span", "jz-rail-text", p.name)); portalsBox.append(a);
      if (here) document.documentElement.style.setProperty("--jz-pc", dot.style.background);
    });
  }

  /* Ctrl/Cmd+K: this portal's pages, other portals, Ask Alkhidmat AI (opens the portal's own assistant) */
  function openPalette() {
    if (document.querySelector(".jz-scrim")) return;
    const back = document.activeElement;
    const items = navItems().map(b => ({ g: "In this portal", t: labelOf(b), go: proxy(labelOf(b), navItems) })).filter(i => i.t)
      .concat(portals.filter(p => safeLink(p.url)).map(p => ({ g: "Portals", t: p.name, go: () => { location.href = safeLink(p.url); } })))
      .concat([{ g: "Today", t: "Today (main page)", go: () => { location.href = BASE; } }]);
    const input = el("input"); input.type = "text"; input.placeholder = "Search pages and portals, or ask a question…"; input.setAttribute("aria-label", "Search or ask");
    const list = el("div", "jz-palette-list"); let shown = [], sel = 0;
    const scrim = el("div", "jz-scrim"); scrim.setAttribute("role", "dialog"); scrim.setAttribute("aria-modal", "true"); scrim.setAttribute("aria-label", "Search or ask Alkhidmat AI");
    const close = () => { scrim.remove(); removeEventListener("keydown", keys, true); if (back && back.focus) back.focus(); };
    const ask = q => () => { const f = document.querySelector(".kai-fab, .ai-fab"); if (!f) return; f.click();
      setTimeout(() => { const box = document.querySelector(".kai-in textarea, .ai textarea, .ai input[type=text]"); if (box && q) { box.value = q; box.dispatchEvent(new Event("input", { bubbles: true })); box.focus(); } }, 120); };
    function draw() {
      const q = input.value.trim();
      shown = items.filter(i => !q || i.t.toLowerCase().includes(q.toLowerCase())).concat([{ g: "Ask Alkhidmat AI", t: q ? `Ask: "${q}"` : "Ask Alkhidmat AI a question", ai: true, go: ask(q) }]);
      sel = Math.min(sel, shown.length - 1); list.replaceChildren(); let g = null;
      shown.forEach((it, i) => { if (it.g !== g) { g = it.g; list.append(el("div", "jz-palette-grp", g)); }
        const b = el("button", "jz-palette-opt" + (it.ai ? " ai" : "") + (i === sel ? " sel" : ""), it.t); b.type = "button"; b.tabIndex = -1;
        b.addEventListener("click", () => { close(); it.go(); }); list.append(b); });
    }
    function keys(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Tab") { e.preventDefault(); input.focus(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length; draw(); }
      else if (e.key === "Enter" && shown[sel]) { e.preventDefault(); const it = shown[sel]; close(); it.go(); }
    }
    input.addEventListener("input", () => { sel = 0; draw(); });
    scrim.addEventListener("click", e => { if (e.target === scrim) close(); });
    const box = el("div", "jz-palette"); box.append(input, list); scrim.append(box);
    document.body.append(scrim); addEventListener("keydown", keys, true); draw(); input.focus();
  }
  addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && (e.key || "").toLowerCase() === "k" && rail && innerWidth >= 821) { e.preventDefault(); openPalette(); } });

  function start() {
    build(); paintMine();
    // the portal re-renders its menu often: repaint the copy on the next frame after any change
    let raf = 0; new MutationObserver(recs => { if (recs.every(r => rail.contains(r.target) || r.target === rail)) return;   // our own repaint is not a portal change
      cancelAnimationFrame(raf); raf = requestAnimationFrame(paintMine); })
      .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    if (window.AKF_DESK && AKF_DESK.portals) AKF_DESK.portals().then(p => { portals = p || []; paintPortals(); }).catch(() => {});
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", start); else start();
})();
