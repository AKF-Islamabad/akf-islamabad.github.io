/* Alkhidmat Foundation Islamabad — one date style in the whole ERP: 03-Oct-2026 (03-Oct without a year).
   Loaded by akf-desk.js on the main page and in every portal (existing and future). It rewrites dates as they appear on
   screen, whatever made them: "3 Oct 2026", "03 Sept 2026", "3 November 2026", "Nov 3, 2026" and "03-11-2026" (Fleet).
   Only what is shown changes: saved data, form fields (inputs, text boxes) and ISO dates such as 2026-11-05 stay as
   they are, so typing shortcuts and sorting keep working. */
(function () {
  "use strict";
  if (window.AKF_DATES) return;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = m => MON.indexOf(m.slice(0, 3).replace(/^./, c => c.toUpperCase()));
  const dd = d => String(+d).padStart(2, "0");
  const M = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
  const RULES = [
    // 3 Oct 2026 · 03 Sept 2026 · 3 November 2026 · 3-Oct-2026 · 3 Oct (no year)
    [new RegExp("\\b([0-3]?\\d)[ -]" + M + "\\.?(?:[ ,-]+(\\d{4}))?(?![A-Za-z])", "g"),
      (s, d, m, y) => +d < 1 || +d > 31 ? s : dd(d) + "-" + MON[idx(m)] + (y ? "-" + y : "")],
    // Nov 3, 2026
    [new RegExp("\\b" + M + "\\.? ([0-3]?\\d),? (\\d{4})\\b", "g"), (s, m, d, y) => +d < 1 || +d > 31 ? s : dd(d) + "-" + MON[idx(m)] + "-" + y],
    // 03-11-2026 (day-month-year, as Fleet shows and stamps it)
    [/\b(0[1-9]|[12]\d|3[01])-(0[1-9]|1[0-2])-(20\d\d)\b/g, (s, d, m, y) => d + "-" + MON[m - 1] + "-" + y],
  ];
  const fix = t => RULES.reduce((s, [re, fn]) => s.replace(re, fn), t);
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|SELECT|OPTION|CODE|PRE|NOSCRIPT)$/;
  const skip = n => { for (let e = n.parentElement; e; e = e.parentElement) { if (SKIP.test(e.tagName) || e.isContentEditable) return true; } return false; };
  const HINT = /\d|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i;
  function text(n) { const v = n.data; if (!HINT.test(v) || skip(n)) return; const w = fix(v); if (w !== v) n.data = w; }
  function walk(root) {
    if (root.nodeType === 3) return text(root);
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); for (let n; (n = it.nextNode());) text(n);
    // a date in a tooltip or label reads the same way
    if (root.nodeType === 1) [root, ...root.querySelectorAll("[title],[aria-label]")].forEach(e => ["title", "aria-label"].forEach(a => { const v = e.getAttribute && e.getAttribute(a); if (v && HINT.test(v)) { const w = fix(v); if (w !== v) e.setAttribute(a, w); } }));
  }
  window.AKF_DATES = { fix };
  if (typeof document === "undefined" || !document.documentElement) return;
  const start = () => {
    walk(document.body);
    // our own change fires the observer once more; it then finds nothing left to change, so it stops
    new MutationObserver(recs => { for (const r of recs) { if (r.type === "characterData") text(r.target); else r.addedNodes.forEach(walk); } })
      .observe(document.body, { subtree: true, childList: true, characterData: true });
  };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
