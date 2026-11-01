/* Alkhidmat Foundation Islamabad — Jazba charts: ONE chart kit for every portal (main page, every portal, future portals).
   Loaded by akf-desk.js on every page (the main page loads it itself). No library, no framework.
     AKF_CHARTS.bars({ id, items: [{ key, label, value, color?, note? }], money?, empty? })   → HTML string
     AKF_CHARTS.donut({ id, items: [...same...], center?, money?, empty? })                   → HTML string
   Put the string in the page (innerHTML or a template). Every bar / slice is clickable (mouse, touch, Enter / Space):
   it fires a "akf-chart-pick" event that bubbles up from the chart, detail = { chart: id, key, label, value }.
   The portal listens once:  document.addEventListener("akf-chart-pick", e => { if (e.detail.chart === "x") … });
   Looks: 3D depth, draws itself in, the slice / bar you point at lifts and the rest fade. Reduced motion = no animation.
   Labels are escaped here, colours must be #hex or var(--name), values are numbers: chart data cannot inject markup. */
(function () {
  "use strict";
  if (window.AKF_CHARTS) return;
  const PAL = ["#0A74C9", "#F59323", "#16A34A", "#7C3AED", "#DC2626", "#0891B2", "#CA8A04", "#DB2777", "#4F46E5", "#65A30D"];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const col = (c, i) => (typeof c === "string" && (/^#[0-9a-f]{3,8}$/i.test(c) || /^var\(--[a-z0-9-]{1,40}\)$/i.test(c))) ? c : PAL[i % PAL.length];
  const num = v => (isFinite(+v) ? +v : 0);
  const fmt = (v, money) => (money ? "Rs " : "") + Math.round(v).toLocaleString("en-PK");
  const clean = items => (Array.isArray(items) ? items : []).slice(0, 40).map((x, i) => ({ key: String(x.key == null ? x.label : x.key).slice(0, 120), label: String(x.label == null ? x.key : x.label).slice(0, 80),
    value: Math.max(0, num(x.value)), color: col(x.color, i), note: x.note ? String(x.note).slice(0, 80) : "" }));
  const cid = id => String(id || "chart").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "chart";
  const empty = (o) => `<div class="akc-empty">${esc(o.empty || "No data yet.")}</div>`;
  const pick = (x, money) => `data-akc-key="${esc(x.key)}" data-akc-label="${esc(x.label)}" data-akc-value="${x.value}" tabindex="0" role="button" aria-label="${esc(x.label)}: ${esc(fmt(x.value, money))}. Open"`;

  function bars(o) {
    const items = clean(o.items); if (!items.length || !items.some(x => x.value)) return empty(o);
    const max = Math.max(1, ...items.map(x => x.value));
    return `<div class="akc akc-bars" data-akc="${cid(o.id)}">${items.map((x, i) =>
      `<div class="akc-row" ${pick(x, o.money)} style="--c:${x.color};--w:${(x.value / max * 100).toFixed(2)}%;--i:${i}">
        <span class="akc-l">${esc(x.label)}${x.note ? `<small>${esc(x.note)}</small>` : ""}</span>
        <span class="akc-track"><i class="akc-bar"></i></span><b class="akc-v">${esc(fmt(x.value, o.money))}</b></div>`).join("")}</div>`;
  }

  function donut(o) {
    const items = clean(o.items).filter(x => x.value > 0); if (!items.length) return empty(o);
    const total = items.reduce((s, x) => s + x.value, 0), R = 42, C = 2 * Math.PI * R; let acc = 0;
    const segs = items.map((x, i) => { const len = x.value / total * C, gap = items.length > 1 ? Math.min(2, len * .3) : 0;
      const s = `<circle class="akc-seg" ${pick(x, o.money)} cx="60" cy="60" r="${R}" stroke="${x.color}" style="--i:${i};--len:${(len - gap).toFixed(2)};--c:${x.color}"
        stroke-dasharray="${(len - gap).toFixed(2)} ${(C - len + gap).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"><title>${esc(x.label)}: ${esc(fmt(x.value, o.money))}</title></circle>`;
      acc += len; return s; }).join("");
    const center = esc(o.center || "Total");
    return `<div class="akc akc-donut" data-akc="${cid(o.id)}"><div class="akc-ring">
      <svg viewBox="0 0 120 120" aria-hidden="false"><circle class="akc-depth" cx="60" cy="66" r="${R}"/><circle class="akc-base" cx="60" cy="60" r="${R}"/><g transform="rotate(-90 60 60)">${segs}</g></svg>
      <div class="akc-mid" data-akc-total="${esc(fmt(total, o.money))}" data-akc-center="${center}"><b>${esc(fmt(total, o.money))}</b><span>${center}</span></div></div>
      <div class="akc-legend">${items.map(x => `<div class="akc-li" ${pick(x, o.money)} style="--c:${x.color}"><i></i><span>${esc(x.label)}</span><b>${esc(fmt(x.value, o.money))}</b><small>${Math.round(x.value / total * 100)}%</small></div>`).join("")}</div></div>`;
  }

  /* one set of listeners for every chart on the page, now and later (charts are often re-drawn) */
  const host = t => t && t.closest && t.closest("[data-akc-key]");
  function hover(t, on) {
    const chart = t.closest("[data-akc]"); if (!chart) return;
    const key = t.getAttribute("data-akc-key");
    chart.classList.toggle("akc-hov", on);
    chart.querySelectorAll("[data-akc-key]").forEach(x => x.classList.toggle("akc-on", on && x.getAttribute("data-akc-key") === key));
    const mid = chart.querySelector(".akc-mid");
    if (mid) { const b = mid.querySelector("b"), s = mid.querySelector("span");
      b.textContent = on ? (t.getAttribute("aria-label") || "").replace(/^.*: /, "").replace(/\. Open$/, "") : mid.dataset.akcTotal;
      s.textContent = on ? t.getAttribute("data-akc-label") : mid.dataset.akcCenter; }
  }
  function fire(t) {
    const chart = t.closest("[data-akc]");
    t.dispatchEvent(new CustomEvent("akf-chart-pick", { bubbles: true, detail: { chart: chart ? chart.getAttribute("data-akc") : "", key: t.getAttribute("data-akc-key"),
      label: t.getAttribute("data-akc-label"), value: num(t.getAttribute("data-akc-value")) } }));
  }
  document.addEventListener("pointerover", e => { const t = host(e.target); if (t) hover(t, true); });
  document.addEventListener("pointerout", e => { const t = host(e.target); if (t && !t.contains(e.relatedTarget)) hover(t, false); });
  document.addEventListener("focusin", e => { const t = host(e.target); if (t) hover(t, true); });
  document.addEventListener("focusout", e => { const t = host(e.target); if (t) hover(t, false); });
  document.addEventListener("click", e => { const t = host(e.target); if (t) fire(t); });
  document.addEventListener("keydown", e => { const t = host(e.target); if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fire(t); } });

  const CSS = `
.akc{--akc-ink:var(--jz-ink,#0F1B2D);--akc-muted:var(--jz-faint,#6B7A90);--akc-line:var(--jz-line,#E3E8F0);font-family:inherit;color:var(--akc-ink)}
.akc [data-akc-key]{cursor:pointer;outline:none}
.akc-empty{padding:18px;text-align:center;color:var(--jz-faint,#6B7A90);font-size:13px}
.akc-bars{display:grid;gap:10px;perspective:700px}
.akc-row{display:grid;grid-template-columns:minmax(90px,32%) 1fr auto;align-items:center;gap:12px;padding:6px 8px;border-radius:10px;transition:transform .25s cubic-bezier(.2,.8,.2,1),opacity .2s,background .2s;transform-style:preserve-3d}
.akc-l{font-size:13px;font-weight:600;line-height:1.25;overflow:hidden;text-overflow:ellipsis}
.akc-l small{display:block;font-weight:500;color:var(--akc-muted);font-size:11.5px}
.akc-track{position:relative;height:16px;border-radius:6px;background:color-mix(in srgb,var(--akc-line) 70%,transparent)}
.akc-bar{position:absolute;inset:0 auto 0 0;width:var(--w);border-radius:6px;transform-origin:left;
  background:linear-gradient(180deg,color-mix(in srgb,var(--c) 70%,#fff) 0%,var(--c) 45%,color-mix(in srgb,var(--c) 78%,#000) 100%);
  box-shadow:0 4px 0 color-mix(in srgb,var(--c) 60%,#000),0 8px 14px -4px color-mix(in srgb,var(--c) 55%,transparent);animation:akcGrow .9s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * 70ms)}
.akc-bar::after{content:"";position:absolute;inset:2px 6px auto 6px;height:4px;border-radius:4px;background:rgba(255,255,255,.45)}
.akc-v{font-size:13px;font-variant-numeric:tabular-nums;min-width:28px;text-align:right}
.akc-hov .akc-row:not(.akc-on){opacity:.45}
.akc-row.akc-on{background:color-mix(in srgb,var(--c) 9%,transparent);transform:translateZ(18px) rotateX(8deg)}
.akc-row:focus-visible{box-shadow:0 0 0 2px var(--c)}
.akc-donut{display:flex;flex-wrap:wrap;align-items:center;gap:18px}
.akc-ring{position:relative;width:170px;flex:none;perspective:600px}
.akc-ring svg{width:100%;display:block;transform:rotateX(22deg);transform-origin:50% 60%;transition:transform .5s cubic-bezier(.2,.8,.2,1);overflow:visible}
.akc-donut:hover .akc-ring svg{transform:rotateX(10deg) rotateZ(-4deg)}
.akc-depth{fill:none;stroke:rgba(4,37,68,.22);stroke-width:16;filter:blur(1.5px)}
.akc-base{fill:none;stroke:color-mix(in srgb,var(--akc-line) 80%,transparent);stroke-width:16}
.akc-seg{fill:none;stroke-width:16;stroke-linecap:butt;transition:stroke-width .2s,opacity .2s,filter .2s;animation:akcDraw 1s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * 90ms);
  filter:drop-shadow(0 3px 0 color-mix(in srgb,var(--c) 55%,#000))}
.akc-hov .akc-seg:not(.akc-on){opacity:.35}
.akc-seg.akc-on{stroke-width:21}
.akc-mid{position:absolute;inset:0;display:grid;place-content:center;text-align:center;pointer-events:none;padding-bottom:4px}
.akc-mid b{font-size:19px;line-height:1.1;font-variant-numeric:tabular-nums}
.akc-mid span{font-size:11.5px;color:var(--akc-muted);max-width:96px;line-height:1.2}
.akc-legend{flex:1;min-width:180px;display:grid;gap:4px}
.akc-li{display:grid;grid-template-columns:12px 1fr auto 38px;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;font-size:13px;transition:background .2s,opacity .2s,transform .2s}
.akc-li i{width:12px;height:12px;border-radius:4px;background:var(--c);box-shadow:0 2px 0 color-mix(in srgb,var(--c) 60%,#000)}
.akc-li small{color:var(--akc-muted);text-align:right}
.akc-hov .akc-li:not(.akc-on){opacity:.45}
.akc-li.akc-on{background:color-mix(in srgb,var(--c) 10%,transparent);transform:translateX(4px)}
.akc-li:focus-visible{box-shadow:0 0 0 2px var(--c)}
@keyframes akcGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes akcDraw{from{stroke-dasharray:0 999}}
/* (canvas charts only rise in: a tilt would shift where Chart.js thinks the pointer is) */
/* the same 3D motion for the charts the portals already draw themselves (Procurement / Store / Tasks, Donor, Fleet) */
svg.chart,svg.donut,svg.tk-chart,canvas[id^="g"]{transition:transform .45s cubic-bezier(.2,.8,.2,1),filter .3s;transform:perspective(900px) rotateX(0);filter:drop-shadow(0 10px 14px rgba(4,37,68,.12));animation:akcRise .7s cubic-bezier(.2,.8,.2,1) both}
svg.chart:hover,svg.donut:hover,svg.tk-chart:hover{transform:perspective(900px) rotateX(6deg) translateY(-3px);filter:drop-shadow(0 16px 22px rgba(4,37,68,.2))}
@keyframes akcRise{from{opacity:0;transform:perspective(900px) rotateX(18deg) translateY(14px)}}
@media (prefers-reduced-motion:reduce){.akc *,svg.chart,svg.donut,svg.tk-chart,canvas[id^="g"]{animation:none!important;transition:none!important}.akc-row.akc-on{transform:none}}
@media (max-width:560px){.akc-ring{width:140px}.akc-row{grid-template-columns:minmax(70px,36%) 1fr auto;gap:8px}}`;
  const st = document.createElement("style"); st.id = "akf-charts-css"; st.textContent = CSS; document.head.appendChild(st);

  window.AKF_CHARTS = { bars, donut, PAL };
})();
