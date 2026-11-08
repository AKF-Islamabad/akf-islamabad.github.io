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
  const ICON = { home: "M3 11l9-8 9 8M5 10v10h14V10", search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3", spark: "M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z", dot: "M12 12h.01", bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" };
  const safeLink = u => { try { const x = new URL(String(u || ""), BASE); return x.origin === location.origin ? x.href : null; } catch (e) { return null; } };

  /* the portal's own menu: Procurement/Store/Tasks (aside.side nav.nav) or Donor/Fleet/Assistance (#nav .nav-item) */
  const navItems = () => [...document.querySelectorAll("aside.side nav.nav > button, #sidebar #nav button.nav-item")];
  const accountItems = () => [...document.querySelectorAll("aside.side .side-user button, #sidebar [data-act=logout], #sidebar #out-btn")];
  const labelOf = b => { const l = b.querySelector(".lbl"); const c = (l || b).cloneNode(true); c.querySelectorAll(".count,.nav-ind").forEach(x => x.remove()); return c.textContent.replace(/\s+/g, " ").trim(); };
  const countOf = b => { const c = b.querySelector(".count"); return c ? c.textContent.trim() : ""; };
  // the original is re-rendered often, so find it again by its label at click time
  const proxy = (label, list) => () => { const o = list().find(b => labelOf(b) === label); if (o) o.click(); };

  let rail, mine, acct, railPortals, strip, stripLinks, meBox, avatar, portals = [];
  const HOME = BASE + "home/";   // the new home page (Today), the same on live and staging
  const sh = () => { if (strip) document.documentElement.style.setProperty("--jz-strip-h", strip.offsetHeight + "px"); };
  // the signed-in person, read from the portal's own account button: full name and designation / role
  const meOf = () => { const n = document.querySelector(".me-t b, #me-name"), r = document.querySelector(".me-t span, #me-role");
    return [(n && n.textContent || "").trim(), (r && r.textContent || "").trim()]; };
  const initials = n => n.split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "•";
  // Frame = the new home page's layout (2026-11-08): a blue sidebar that STAYS on screen (no auto-hide; the toggle folds it
  // to icons and is remembered, same setting as the home page) and a white top bar. Phones keep each portal's own menu.
  const folded = () => { try { return localStorage.getItem("akf-nav") === "1"; } catch (e) { return false; } };
  function build() {
    document.documentElement.classList.toggle("jzs-folded", folded());
    rail = el("nav", "jzs-rail"); rail.setAttribute("aria-label", "Jazba");
    const brand = el("a", "jzs-brand"); brand.href = HOME; brand.title = "Home";
    const bi = el("img"); bi.src = BASE + "icon.jpg"; bi.alt = ""; bi.width = 40; bi.height = 40;
    const bt = el("span", "jzs-text"); bt.append(el("b", "", "Alkhidmat"), el("small", "", "Islamabad · Jazba")); brand.append(bi, bt);
    const homeLink = el("a", "jzs-link"); homeLink.href = HOME; homeLink.title = "Home"; homeLink.append(el("span", "jzs-ic", ""), el("span", "jzs-text", "Home"));
    homeLink.firstChild.append(SVG(ICON.home));
    railPortals = el("div", "jzs-group jzs-portals"); mine = el("div", "jzs-group"); acct = el("div", "jzs-group jzs-acct");
    rail.append(brand, homeLink, el("div", "jzs-h", "Portals"), railPortals, el("div", "jzs-h", "In this portal"), mine, acct);
    // top bar, as on the home page: fold button, search, all-portal bell, my signature, who I am
    strip = el("header", "jzs-top"); strip.setAttribute("aria-label", "Jazba top bar");
    const menu = el("button", "jzs-btn jzs-fold"); menu.type = "button"; menu.append(SVG("M3 3h18v18H3zM9 3v18"));
    const syncFold = () => { const f = document.documentElement.classList.contains("jzs-folded"); menu.title = f ? "Show the menu names" : "Fold the menu to icons"; menu.setAttribute("aria-label", menu.title); menu.setAttribute("aria-pressed", String(f)); };
    menu.addEventListener("click", () => { const f = document.documentElement.classList.toggle("jzs-folded"); try { localStorage.setItem("akf-nav", f ? "1" : "0"); } catch (e) {} syncFold(); });
    syncFold();
    const find = el("button", "jzs-search"); find.type = "button"; find.setAttribute("aria-label", "Search and ask Alkhidmat AI");
    find.append(SVG(ICON.search), el("span", "", "Search pages and portals, or ask Alkhidmat AI…"), el("kbd", "", "Ctrl K")); find.addEventListener("click", openPalette);
    stripLinks = el("div", "jz-ts-portals jzs-phone-portals");   // phones: the portals in one row you swipe
    const bell = el("button", "jzs-btn jzs-bell"); bell.type = "button"; bell.title = "All notifications"; bell.setAttribute("aria-label", "All notifications from every portal");
    const badge = el("span", "jz-ts-badge"); badge.hidden = true; bell.append(SVG(ICON.bell), badge);
    bell.addEventListener("click", () => window.AKF_DESK && AKF_DESK.openInbox && AKF_DESK.openInbox(bell));
    const count = n => { badge.hidden = !n; badge.textContent = n > 99 ? "99+" : String(n); bell.setAttribute("aria-label", n + " notifications from every portal"); };
    document.addEventListener("akf-inbox", e => count(e.detail.count || 0));
    if (window.AKF_DESK && AKF_DESK.inbox) count(AKF_DESK.inbox().length);   // the list may have arrived before this bar
    const sign = el("button", "jzs-btn", "✍"); sign.type = "button"; sign.title = "My signature: add or change it"; sign.setAttribute("aria-label", "My signature");
    sign.addEventListener("click", () => { if (window.AKF_SIGN) AKF_SIGN.open(); });
    meBox = el("div", "jzs-me"); avatar = el("span", "jzs-avatar");
    strip.append(menu, find, stripLinks, el("span", "jzs-grow"), bell, sign, meBox, avatar);
    document.body.prepend(rail); document.body.prepend(strip);
    sh(); addEventListener("resize", sh);
    if (window.ResizeObserver) new ResizeObserver(sh).observe(strip);
  }
  function paintMine() {
    if (!mine) return;
    // which portal family is this? Procurement/Store/Tasks render inside .shell (layer-2 skin in jazba-portals.css)
    if (!document.documentElement.dataset.jzFamily && document.querySelector(".shell")) document.documentElement.dataset.jzFamily = "app";
    // Donor/Fleet/Assistance share one design kit (#sidebar + .main)
    else if (!document.documentElement.dataset.jzFamily && document.getElementById("sidebar")) document.documentElement.dataset.jzFamily = "kit";
    // the sign-out clock changes the page every second: rebuild only when the menu itself changed (no flicker, focus stays)
    // a portal empties its own name box for a moment while it redraws (every second with the sign-out clock): keep the last
    // known name, so the top bar does not blink (seen on phones, 7-Nov)
    let who = meOf(); if (who[0]) paintMine.who = who; else if (paintMine.who) who = paintMine.who;
    const sig = navItems().map(b => labelOf(b) + "|" + b.classList.contains("active") + "|" + countOf(b)).concat(accountItems().map(labelOf), who).join("\n");
    if (sig === paintMine.sig) return; paintMine.sig = sig;
    meBox.replaceChildren(...(who[0] ? [el("b", "", who[0]), el("small", "", who[1])] : [])); meBox.title = who.filter(Boolean).join(" · ");
    avatar.textContent = who[0] ? initials(who[0]) : ""; avatar.hidden = !who[0];
    const link = (label, ic, on, n, go) => { const a = el("button", "jzs-link" + (on ? " on" : "")); a.type = "button"; a.title = label;
      const i = el("span", "jzs-ic"); i.append(ic ? ic.cloneNode(true) : SVG(ICON.dot)); a.append(i, el("span", "jzs-text", label));
      if (n) a.append(el("span", "jzs-count", n)); if (on) a.setAttribute("aria-current", "page"); a.addEventListener("click", go); return a; };
    mine.replaceChildren(...navItems().map(b => { const label = labelOf(b); if (!label) return null;
      return link(label, b.querySelector("svg"), b.classList.contains("active"), countOf(b), proxy(label, navItems)); }).filter(Boolean));
    acct.replaceChildren(...accountItems().map(b => { const label = labelOf(b); if (!label) return null;
      return link(label, b.querySelector("svg"), false, "", proxy(label, accountItems)); }).filter(Boolean));
  }
  function paintPortals() {
    stripLinks.replaceChildren(); railPortals.replaceChildren(); if (!portals.length) return sh();
    portals.forEach(p => { const href = safeLink(p.url); if (!href) return;
      const here = location.href.startsWith(href), color = /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : "#0060AE";
      if (here) document.documentElement.style.setProperty("--jz-pc", color);
      // sidebar (desktop): coloured square with the portal's initial, the open portal is a white pill
      const r = el("a", "jzs-link" + (here ? " on" : "")); r.href = href; r.title = p.name; if (here) r.setAttribute("aria-current", "page");
      const sq = el("span", "jzs-ic jzs-sq", (p.name || "?").trim()[0]); sq.style.setProperty("--c", color);
      r.append(sq, el("span", "jzs-text", p.name)); railPortals.append(r);
      // top bar (phones): the portals in one row
      const dot = el("span", "jz-rail-dot"); dot.style.background = color;
      const s = el("a", "jz-ts-link" + (here ? " on" : "")); s.href = href; s.title = p.name; if (here) s.setAttribute("aria-current", "page");
      s.append(dot, el("span", "", p.name)); stripLinks.append(s);
      if (here) requestAnimationFrame(() => { stripLinks.scrollLeft = Math.max(0, s.offsetLeft - 40); });
    });
    sh();
  }

  /* Ctrl/Cmd+K: this portal's pages, other portals, Ask Alkhidmat AI (opens the portal's own assistant) */
  function openPalette() {
    if (document.querySelector(".jz-scrim")) return;
    const back = document.activeElement;
    const items = navItems().map(b => ({ g: "In this portal", t: labelOf(b), go: proxy(labelOf(b), navItems) })).filter(i => i.t)
      .concat(portals.filter(p => safeLink(p.url)).map(p => ({ g: "Portals", t: p.name, go: () => { location.href = safeLink(p.url); } })))
      .concat([{ g: "Today", t: "Home", go: () => { location.href = HOME; } }]);
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
    // the sign-in may still be loading on the first try: ask again a few times until the list arrives
    const load = n => window.AKF_DESK && AKF_DESK.portals && AKF_DESK.portals().then(p => { portals = p || []; paintPortals(); if (!portals.length && n) setTimeout(() => load(n - 1), 3000); })
      .catch(() => { if (n) setTimeout(() => load(n - 1), 3000); });
    load(5);
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", start); else start();
})();
