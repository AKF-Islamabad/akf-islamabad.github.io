/* My signature — on every page (main page and every portal, phones too). Loaded by akf-desk.js.
   One signature per person for the whole ERP (027_one_signature.sql); every submit and approval needs it (043).
   Add it by drawing, by taking a photo with the camera, or by choosing a picture from the gallery: the paper background is
   removed and the ink is cropped here in the browser, then saved with core_signature_save (the database checks the picture).
   Safety: built with textContent only; the picture is re-drawn on a canvas, so only clean PNG pixels are ever saved. */
(function () {
  "use strict";
  if (window.AKF_SIGN) return;
  const cfg = window.AKF_SUPABASE;
  if (!cfg || !cfg.url || !window.supabase) return;
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { storageKey: "akf-portals-auth", autoRefreshToken: false, detectSessionInUrl: false } });

  const css = (e, s) => { Object.assign(e.style, s); return e; };
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue;
      if (k === "text") e.textContent = v; else if (k === "style") css(e, v); else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
    e.append(...kids.flat(9).filter(x => x != null && x !== false)); return e;
  }
  const BTN = { padding: "10px 14px", borderRadius: "10px", border: "1px solid #CBD5E1", background: "#fff", color: "#0F172A", font: "600 14px system-ui, sans-serif", cursor: "pointer" };
  const PRI = Object.assign({}, BTN, { background: "#0B4EA8", color: "#fff", borderColor: "#0B4EA8" });
  function toast(msg, bad) {
    const t = el("div", { role: "status", text: msg, style: { position: "fixed", left: "50%", bottom: "28px", transform: "translateX(-50%)", zIndex: 100003, maxWidth: "90vw",
      background: bad ? "#B91C1C" : "#0F766E", color: "#fff", padding: "10px 16px", borderRadius: "10px", font: "600 14px system-ui, sans-serif" } });
    document.body.append(t); setTimeout(() => t.remove(), bad ? 7000 : 3500);
  }

  /* a photo of a signature on paper → transparent PNG of just the ink */
  function fromFile(file) {
    return new Promise((ok, bad) => {
      if (!file || !/^image\//i.test(file.type || "image/")) return bad(new Error("Choose a photo (JPG or PNG) of the signature"));
      const url = URL.createObjectURL(file), img = new Image();
      img.onerror = () => { URL.revokeObjectURL(url); bad(new Error("That picture could not be opened. Take the photo again.")); };
      img.onload = () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, 1400 / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
        const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img, 0, 0, w, h); const d = x.getImageData(0, 0, w, h), p = d.data;
        // paper brightness = a high percentile of the picture; ink = clearly darker than the paper
        const lum = new Float32Array(w * h); const hist = new Uint32Array(256);
        for (let i = 0, j = 0; i < p.length; i += 4, j++) { const L = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; lum[j] = L; hist[L | 0]++; }
        let acc = 0, paper = 255; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= w * h * 0.3) { paper = v; break; } }
        const cut = paper * 0.62; let minX = w, minY = h, maxX = -1, maxY = -1, ink = 0;
        for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const j = y * w + xx, i = j * 4, L = lum[j];
          if (L < cut) { const a = Math.min(255, Math.round((cut - L) / cut * 255 * 2.2)); p[i] = 17; p[i + 1] = 24; p[i + 2] = 39; p[i + 3] = a; ink++;
            if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (y < minY) minY = y; if (y > maxY) maxY = y; }
          else p[i + 3] = 0; }
        if (ink < 40 || maxX - minX < 20) return bad(new Error("No signature found. Sign with a dark pen on white paper, use good light and fill the photo with the signature."));
        if (ink > w * h * 0.35) return bad(new Error("The photo is too dark. Use plain white paper and good light."));
        x.putImageData(d, 0, 0);
        ok(trim(c, minX, minY, maxX, maxY));
      };
      img.src = url;
    });
  }
  // crop to the ink (with a margin), at most 600 × 220, as PNG
  function trim(c, minX, minY, maxX, maxY) {
    const m = 8; minX = Math.max(0, minX - m); minY = Math.max(0, minY - m); maxX = Math.min(c.width - 1, maxX + m); maxY = Math.min(c.height - 1, maxY + m);
    const sw = maxX - minX + 1, sh = maxY - minY + 1, k = Math.min(1, 600 / sw, 220 / sh);
    const o = document.createElement("canvas"); o.width = Math.max(1, Math.round(sw * k)); o.height = Math.max(1, Math.round(sh * k));
    o.getContext("2d").drawImage(c, minX, minY, sw, sh, 0, 0, o.width, o.height);
    return o.toDataURL("image/png");
  }
  function inkBox(c) {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 20) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    return maxX < 0 ? null : [minX, minY, maxX, maxY];
  }

  /* ---------- the dialog ---------- */
  let have = null, chip = null;
  function open() {
    let img = null;
    const shade = el("div", { style: { position: "fixed", inset: "0", background: "rgba(15,23,42,.55)", zIndex: 100002, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px" } });
    const box = el("div", { role: "dialog", "aria-label": "My signature", style: { background: "#fff", color: "#0F172A", borderRadius: "16px", width: "min(640px, 100%)", maxHeight: "94vh", overflow: "auto",
      padding: "16px", font: "14px system-ui, sans-serif", boxShadow: "0 20px 50px rgba(0,0,0,.35)" } });
    const close = () => shade.remove();
    shade.addEventListener("click", e => { if (e.target === shade) close(); });
    const preview = el("div", { style: { minHeight: "90px", border: "1px solid #E2E8F0", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFC", marginTop: "8px" } },
      el("span", { text: "No signature chosen yet", style: { color: "#94A3B8" } }));
    const show = d => { img = d; preview.replaceChildren(el("img", { src: d, alt: "Signature preview", style: { maxWidth: "100%", maxHeight: "140px" } })); save.disabled = false; };
    // draw
    const pad = el("canvas", { width: "600", height: "200", "aria-label": "Draw your signature here", style: { width: "100%", height: "200px", border: "2px dashed #94A3B8", borderRadius: "12px", touchAction: "none", background: "#fff" } });
    const g = pad.getContext("2d"); g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#111827";
    let drawing = false; const pt = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
    pad.addEventListener("pointerdown", e => { drawing = true; pad.setPointerCapture(e.pointerId); const [x, y] = pt(e); g.beginPath(); g.moveTo(x, y); });
    pad.addEventListener("pointermove", e => { if (!drawing) return; const [x, y] = pt(e); g.lineTo(x, y); g.stroke(); });
    const end = () => { if (!drawing) return; drawing = false; const b = inkBox(pad); if (b) show(trim(pad, ...b)); };
    pad.addEventListener("pointerup", end); pad.addEventListener("pointercancel", end);
    // camera and gallery: two inputs (capture opens the camera on phones; without it the phone offers the gallery)
    const cam = el("input", { type: "file", accept: "image/*", capture: "environment", style: { display: "none" } });
    const gal = el("input", { type: "file", accept: "image/*", style: { display: "none" } });
    const pick = async e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
      try { show(await fromFile(f)); g.clearRect(0, 0, pad.width, pad.height); } catch (er) { toast(er.message, true); } };
    cam.addEventListener("change", pick); gal.addEventListener("change", pick);
    const save = el("button", { type: "button", text: "Save my signature", style: PRI, disabled: true });
    save.addEventListener("click", async () => {
      if (!img) return; if (img.length > 380000) return toast("The signature picture is too large. Crop the photo closer to the signature.", true);
      save.disabled = true; save.textContent = "Saving…";
      const { error } = await sb.rpc("core_signature_save", { p_image: img });
      if (error) { toast(String(error.message || "Not saved").slice(0, 200), true); save.disabled = false; save.textContent = "Save my signature"; return; }
      have = true; if (chip) { chip.remove(); chip = null; } close(); toast("Signature saved. It is used on every request and approval in every portal.");
      try { document.dispatchEvent(new CustomEvent("akf-signature-saved")); } catch (e) { }
    });
    box.append(
      el("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" } }, el("b", { text: "✍ My signature", style: { fontSize: "17px", flex: "1" } }),
        el("button", { type: "button", text: "Close", style: BTN, onclick: close })),
      el("p", { text: "Needed for every request and approval in every portal. Draw it below, or take a photo of your signature on white paper, or choose one from your gallery.", style: { margin: "0 0 10px", color: "#475569" } }),
      el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" } },
        el("button", { type: "button", text: "📷 Take photo (camera)", style: BTN, onclick: () => cam.click() }),
        el("button", { type: "button", text: "🖼 Choose from gallery", style: BTN, onclick: () => gal.click() }), cam, gal),
      el("div", { text: "Or draw it here with your finger or mouse:", style: { fontWeight: "600", margin: "4px 0" } }), pad,
      el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" } }, el("b", { text: "Preview", style: { fontSize: "13px" } }),
        el("button", { type: "button", text: "Clear", style: Object.assign({}, BTN, { padding: "6px 10px" }), onclick: () => { g.clearRect(0, 0, pad.width, pad.height); img = null; save.disabled = true;
          preview.replaceChildren(el("span", { text: "No signature chosen yet", style: { color: "#94A3B8" } })); } })), preview,
      el("div", { style: { display: "flex", gap: "8px", marginTop: "12px" } }, save));
    shade.append(box); document.body.append(shade);
  }

  /* ---------- the small button on every page ---------- */
  function paint() {
    if (!chip) return;
    chip.textContent = have ? "✍ Signature" : "✍ Add your signature";
    css(chip, have ? { background: "#fff", color: "#0F172A", borderColor: "#CBD5E1" } : { background: "#B45309", color: "#fff", borderColor: "#B45309" });
    chip.title = have ? "Change your signature" : "Add your signature: every request and approval needs it";
  }
  async function start() {
    const { data: s } = await sb.auth.getSession(); if (!s || !s.session) return;   // signed-in pages only
    try { const { data, error } = await sb.rpc("core_has_signature"); if (error) return; have = data === true; } catch (e) { return; }
    if (have) return;   // already added: the button stays hidden; change it with ✍ on the main page or in a portal's own signature screen
    chip = el("button", { type: "button", style: Object.assign({}, BTN, { position: "fixed", left: "16px", bottom: "136px", zIndex: 7000, padding: "7px 12px", fontSize: "13px", boxShadow: "0 6px 18px rgba(0,0,0,.15)" }), onclick: open });
    document.body.append(chip); paint();
  }
  window.AKF_SIGN = { open, fromFile };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(start, 1200)); else setTimeout(start, 1200);
})();
