/* Small motion for the whole ERP (asked 2026-11-28). Loaded on every page by akf-desk.js. Three touches, no library:
   1. BUTTON MORPH   a button that the page switches off right after its click (= it is saving) shrinks to a circle with a
                     spinner for as long as the real save takes, then opens again. A green tick shows only when the page
                     says the save worked: AKF_MOTION.done(button). Nothing is guessed, so a failed save never shows a tick.
   2. LIST CASCADE   when a screen is opened, the first 10 rows of its table or list come in one after another (70ms apart).
                     Later refreshes of the same screen (typing in a search box, live updates) do not replay it.
   3. BELL           the notification bell in the top strip swings and its count pops when the count goes up.
   Movement and fade only. Timings come from the shared values (--jz-dur-*). Nothing moves for people whose device asks
   for reduced motion. No personal data is read or stored here. */
(function () {
  "use strict";
  if (window.AKF_MOTION) return;
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  const st = document.createElement("style"); st.id = "akf-motion-css";
  st.textContent = ":root{--jz-dur-morph:270ms;--jz-dur-row:300ms;--jz-dur-stagger:70ms;--jz-dur-bell:760ms}"
    + ".jz-morph{transition:width var(--jz-dur-morph) cubic-bezier(.2,.8,.2,1),border-radius var(--jz-dur-morph),padding var(--jz-dur-morph);overflow:hidden;position:relative}"
    + ".jz-busy{width:var(--jz-busy-w,40px)!important;min-width:0!important;padding-left:0!important;padding-right:0!important;border-radius:999px!important;color:transparent!important;pointer-events:none}"
    + ".jz-busy>*{opacity:0}"
    // a neutral two-tone ring: reads on a filled button and on an outline one
    + ".jz-busy:not(.jz-done)::after{content:'';position:absolute;inset:0;margin:auto;width:18px;height:18px;border-radius:50%;border:2px solid rgba(140,150,165,.5);border-top-color:#fff;animation:jz-spin .7s linear infinite}"
    + ".jz-done{background:var(--jz-green,#15803D)!important;border-color:transparent!important}"
    + ".jz-done::after{content:'\\2713';position:absolute;inset:0;display:grid;place-items:center;color:#fff;font:800 16px/1 system-ui,sans-serif;animation:jz-pop .3s cubic-bezier(.2,.8,.3,1.4) both}"
    + "@keyframes jz-spin{to{transform:rotate(360deg)}}"
    + ".jz-row-in{animation:jz-row-in var(--jz-dur-row) ease-out both;animation-delay:calc(var(--jz-i,0)*var(--jz-dur-stagger))}"
    + "@keyframes jz-row-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}"
    + ".jz-swing{transform-origin:50% 12%;animation:jz-swing var(--jz-dur-bell) ease-out both}"
    + "@keyframes jz-swing{0%{transform:rotate(0)}18%{transform:rotate(24deg)}38%{transform:rotate(-18deg)}58%{transform:rotate(12deg)}78%{transform:rotate(-6deg)}100%{transform:rotate(0)}}"
    + ".jz-pop{animation:jz-pop .32s cubic-bezier(.2,.8,.3,1.4) both}"
    + "@keyframes jz-pop{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}"
    + "@media (prefers-reduced-motion:reduce){.jz-morph{transition:none}.jz-row-in,.jz-swing,.jz-pop{animation:none}}";
  document.head.append(st);

  /* ---------- 1. button morph ---------- */
  let clicked = null, clickedAt = 0;
  document.addEventListener("click", e => { const b = e.target && e.target.closest ? e.target.closest("button") : null; if (b) { clicked = b; clickedAt = performance.now(); } }, true);
  function busy(b) {
    if (still() || !b || b.classList.contains("jz-morph")) return;
    const r = b.getBoundingClientRect(); if (r.width < 56 || r.height < 24) return;   // already a small round button
    b.style.width = r.width + "px"; b.style.setProperty("--jz-busy-w", Math.round(r.height) + "px"); b.classList.add("jz-morph");
    void b.offsetWidth;            // the browser notes the real width first, so the next line is a morph, not a swap
    b.classList.add("jz-busy");    // set at once (not on a later frame): a save that ends very fast can then never leave the button shut
  }
  function open(b) {
    b.classList.remove("jz-busy", "jz-done");
    setTimeout(() => { b.classList.remove("jz-morph"); b.style.width = ""; b.style.removeProperty("--jz-busy-w"); }, 300);
  }
  function idle(b) {
    if (!b.classList.contains("jz-morph")) return;
    if (b.dataset.jzOk === "1") { delete b.dataset.jzOk; b.classList.add("jz-busy", "jz-done"); setTimeout(() => open(b), 650); } else open(b);
  }
  // the page calls this on a save that WORKED, before it switches the button on again
  function done(b) { if (b && b.dataset) b.dataset.jzOk = "1"; }

  /* ---------- 2. list cascade ---------- */
  let nav = performance.now();   // opening the page counts as opening a screen
  ["hashchange", "popstate"].forEach(ev => addEventListener(ev, () => { nav = performance.now(); }));
  document.addEventListener("click", e => { if (e.target && e.target.closest && e.target.closest("nav, aside, .tabs, .seg, [role=tab], .jz-topstrip, .jz-shell-rail")) nav = performance.now(); }, true);
  function cascade(root) {
    if (still() || performance.now() - nav > 900 || !root.querySelectorAll) return;
    const rows = (root.matches && root.matches("tr, .item") ? [root] : [...root.querySelectorAll("tbody > tr, .list > .item")]).filter(r => !r.dataset.jzIn).slice(0, 10);
    rows.forEach((r, i) => { r.dataset.jzIn = "1"; r.style.setProperty("--jz-i", i); r.classList.add("jz-row-in"); r.addEventListener("animationend", () => r.classList.remove("jz-row-in"), { once: true }); });
  }

  /* ---------- 3. bell ---------- */
  let lastCount = 0;
  function ring(bell) {
    if (still() || !bell) return;
    const again = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
    again(bell.querySelector("svg") || bell, "jz-swing"); again(bell.querySelector(".jz-ts-badge"), "jz-pop");
  }
  function bellCheck(node) {
    const badge = node && (node.nodeType === 3 ? node.parentElement : node); if (!badge || !badge.closest) return;
    const b = badge.closest(".jz-ts-badge"); if (!b) return;
    const n = parseInt(b.textContent, 10) || 0; if (n > lastCount) ring(b.closest(".jz-ts-bell")); lastCount = n;
  }

  /* one watcher for all three */
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === "attributes") {
        const b = m.target; if (!(b instanceof HTMLButtonElement)) continue;
        if (b.disabled) { if (b === clicked && performance.now() - clickedAt < 600) busy(b); } else idle(b);
      } else if (m.type === "characterData") bellCheck(m.target);
      else { bellCheck(m.target); m.addedNodes.forEach(n => { if (n.nodeType === 1) cascade(n); }); }
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["disabled"] });
  if (document.body) cascade(document.body);

  window.AKF_MOTION = { busy, done, ring };
})();
