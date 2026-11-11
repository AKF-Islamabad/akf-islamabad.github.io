/* Alkhidmat Foundation Islamabad — "My desk": shown on the main page and in EVERY portal (existing and future).
   1. A sticky note that is on screen on every page: my plan for today (and anything overdue), my to-dos,
      and the tasks other people assigned to me — from Tasks & Events. It can be folded down; it opens again
      on the next page.
   2. System notifications (phone and desktop) with a bell sound:
      - push: the device saves its push address (core_push_save); the server sends new tasks, comments,
        reviews and Assistance notifications even when no portal is open (011_push.sql, function "push");
      - bell items: a portal hands its bell list to AKF_NOTIFY(items) — each NEW item rings the bell
        and, when the page is in the background, shows a system notification.
   Loaded after config.js and supabase-js:  <script src="../akf-desk.js"></script>  (main page: src="akf-desk.js")
   Uses the sign-in the page already made; it never changes data. Everything is built with textContent. */
/* Photos are made smaller before upload, so nobody needs a separate compressor and the 1 GB of file space lasts:
   longest side 1600 px, JPEG. With `limit` (bytes) it keeps going smaller until the photo fits.
   Other files (PDF, Word, Excel) pass through unchanged: a browser cannot make those smaller. Never throws. */
window.AKF_shrinkImage = async function (file, maxSide = 1600, quality = 0.75, limit = Infinity) {
  try {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 300 * 1024) return file;
    const img = await createImageBitmap(file), c = document.createElement("canvas"); let blob;
    for (let i = 0; i < 8; i++) {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);   // white behind see-through PNGs
      blob = await new Promise(ok => c.toBlob(ok, "image/jpeg", quality));
      if (!blob || blob.size <= limit) break;
      maxSide *= 0.8; quality = Math.max(0.4, quality - 0.07);
    }
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch (e) { return file; }
};
(function () {
  "use strict";
  if (window.AKF_NOTIFY) return;
  const SCRIPT = document.currentScript && document.currentScript.src;
  const BASE = new URL(".", SCRIPT || location.href).href;          // the main site folder (/ live, /portal-staging/ staging)
  // "+" on the main page opens a portal with ?form=1: only the form, no portal menu or note, and a way back (asked 2026-11-10)
  if (/[?&]form=1(&|$)/.test(location.search)) {
    const H = document.documentElement; H.classList.add("akf-form-only"); H.dataset.desk = "off";
    const st = document.createElement("style");
    st.textContent = "html.akf-form-only #sidebar,html.akf-form-only #side-overlay,html.akf-form-only #bnav,html.akf-form-only header.topbar,html.akf-form-only .crumb,html.akf-form-only aside.side,html.akf-form-only .jz-shell-rail,html.akf-form-only .jz-topstrip{display:none!important}"
      + "html.akf-form-only .main{margin-left:0!important}html.akf-form-only .hr-kinds{display:none!important}html.akf-form-only body{padding-top:0!important;padding-left:0!important}"
      + ".akf-fo-bar{position:sticky;top:0;z-index:60;display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 16px;background:#fff;border-bottom:1px solid #E6EAF0;font:600 14px/1.3 Manrope,'Segoe UI',system-ui,sans-serif;color:#0B3D75}"
      + ".akf-fo-bar a{color:#0B51A7;text-decoration:none;border:1px solid #C9D6EA;border-radius:99px;padding:5px 12px}.akf-fo-bar span{flex:1}";
    document.head.append(st);
    const bar = () => {   // Procurement / Store / Tasks draw their own heading (data-form-own)
      if (H.dataset.formOwn || document.querySelector(".akf-fo-bar")) return;
      const b = document.createElement("div"); b.className = "akf-fo-bar";
      const back = document.createElement("a"); back.href = BASE + "home/"; back.textContent = "← Back to home";
      const full = document.createElement("a"); full.href = location.pathname; full.textContent = "Open the full portal";
      const gap = document.createElement("span"); gap.textContent = "New request";
      b.append(back, gap, full); document.body.prepend(b);
    };
    if (document.body) bar(); else document.addEventListener("DOMContentLoaded", bar);
  }
  // Jazba UI (the official design system) on every page, existing and future, even before sign-in
  if (!document.querySelector('link[href*="jazba.css"]')) { const jz = document.createElement("link"); jz.rel = "stylesheet"; jz.href = BASE + "jazba.css?v=6"; document.head.append(jz); }
  // Jazba charts (3D, animated, clickable) on every page, existing and future portals: akf-charts.js
  if (!window.AKF_CHARTS && !document.querySelector('script[src*="akf-charts.js"]')) { const ck = document.createElement("script"); ck.src = BASE + "akf-charts.js"; document.head.append(ck); }
  // one date style everywhere (03-Oct-2026): akf-dates.js rewrites dates as they appear on screen
  if (!window.AKF_DATES && !document.querySelector('script[src*="akf-dates.js"]')) { const dj = document.createElement("script"); dj.src = BASE + "akf-dates.js"; document.head.append(dj); }
  // the Jazba look on every portal: maps the portal's own colour/font settings (never on the main page)
  if (document.documentElement.dataset.jzPage !== "hub" && !document.querySelector('link[href*="jazba-portals.css"]')) { const jp = document.createElement("link"); jp.rel = "stylesheet"; jp.href = BASE + "jazba-portals.css?v=9"; document.head.append(jp); }
  // the same Jazba frame on every portal (Jazba Portal Standard): top strip + menu + Ctrl+K; the sticky note shows on every page
  if (document.documentElement.dataset.jzPage !== "hub" && !window.JAZBA_SHELL) {
    document.documentElement.dataset.jzShell = "on";
    const js = document.createElement("script"); js.src = BASE + "jazba-shell.js"; js.defer = true; document.head.append(js);
  }
  const cfg = window.AKF_SUPABASE;
  if (!cfg || !window.supabase || !cfg.url) { window.AKF_NOTIFY = function () {}; return; }
  // My signature on every page, main page included (draw, camera or gallery); every submit and approval needs it
  if (!window.AKF_SIGN) { const sg = document.createElement("script"); sg.src = BASE + "akf-signature.js"; sg.defer = true; document.head.append(sg); }
  // Super Admin: correct any entry (it shows nothing for anyone else; the database checks again)
  if (document.documentElement.dataset.jzPage !== "hub" && !window.AKF_SUPEREDIT) {
    const se = document.createElement("script"); se.src = BASE + "akf-superedit.js"; se.defer = true; document.head.append(se);
  }
  // the page's own client refreshes the sign-in; this one only reads it (same storage key as akf-gate.js)
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { storageKey: "akf-portals-auth", autoRefreshToken: false, detectSessionInUrl: false } });
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
                  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
  let me = null;                                                    // { id (sign-in), pid (Tasks person id) }

  /* ---------- install as an app (needed for notifications on iPhone) ---------- */
  [["manifest", "manifest.webmanifest"], ["apple-touch-icon", "icon.jpg"]].forEach(([rel, f]) => {
    if (document.querySelector(`link[rel="${rel}"]`)) return;
    const l = document.createElement("link"); l.rel = rel; l.href = BASE + f; document.head.appendChild(l);
  });

  /* ---------- bell sound ---------- */
  let ac = null;
  const unlock = () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch (_) {} };
  addEventListener("pointerdown", unlock, { once: true, capture: true });
  addEventListener("keydown", unlock, { once: true, capture: true });
  function ding() {
    if (!ac || ac.state !== "running") return;                       // browsers allow sound only after the first click on the page
    const t = ac.currentTime;
    [[880, 0], [1320, 0.16]].forEach(([f, d]) => {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.1);
      o.connect(g).connect(ac.destination); o.start(t + d); o.stop(t + d + 1.2);
    });
  }

  /* ---------- system notifications ---------- */
  const canPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const swReady = "serviceWorker" in navigator
    ? navigator.serviceWorker.register(BASE + "sw.js", { scope: BASE }).then(() => navigator.serviceWorker.ready).catch(() => null)
    : Promise.resolve(null);
  navigator.serviceWorker && navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.type === "akf-ding") ding(); });
  const b64 = (s) => { const p = (s + "===".slice((s.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(p), (c) => c.charCodeAt(0)); };

  async function subscribe() {                                       // ask once (from a click), then keep this device saved
    const reg = await swReady; if (!reg) throw new Error("This browser cannot show notifications.");
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { data, error } = await sb.functions.invoke("push", { body: { action: "key" } });
      if (error || !data || !data.key) throw new Error("The notification service is not ready yet. Try again in a minute.");
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(data.key) });
    }
    const j = sub.toJSON();
    const { error } = await sb.rpc("core_push_save", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
    if (error) throw new Error(error.message);
  }
  async function turnOn() {
    if (isIOS && !standalone) { alert("On iPhone and iPad: tap Share → \"Add to Home Screen\", open the portals from that icon, then turn notifications on there."); return; }
    if (!canPush) { alert("This browser cannot show notifications. Use Chrome, Edge, Firefox or Safari."); return; }
    unlock();
    if (Notification.permission === "denied") { allowHelp(); return; }   // the browser no longer asks: only the person can allow it again
    const p = await Notification.requestPermission();
    if (p !== "granted") { if (p === "denied") allowHelp(); paint(); enforce(true); return; }   // "default" = the question was closed: ask again next time
    enforce();   // the reminder bar goes away as soon as they are on
    try { await subscribe(); await sb.functions.invoke("push", { body: { action: "test" } }); ding(); }
    catch (e) { alert("Notifications could not be switched on: " + e.message); }
    paint();
  }
  // a site can't undo a "Block" in the browser, so show the person how to allow it, step by step
  let cssIn = false;
  function addCss() { if (cssIn) return; cssIn = true; const st = el("style"); st.textContent = CSS; document.head.appendChild(st); }
  // where to allow notifications again, for the device in hand (a site cannot undo a "Block" itself)
  function deviceSteps() {
    const ua = navigator.userAgent, host = location.host;
    if (isIOS) return ["Tap the Share button (square with an arrow) at the bottom of Safari.", "Choose \"Add to Home Screen\", then Add.", "Open the portals from that new icon and tap \"Turn on\" there."];
    if (/Android/i.test(ua) && /SamsungBrowser/i.test(ua)) return ["Tap the menu (three lines) at the bottom right → Settings.", "Sites and downloads → Notifications.", "Find " + host + " and switch it on, then come back and tap \"Check again\"."];
    if (/Android/i.test(ua)) return ["Tap the three dots ⋮ at the top right of Chrome → Settings.", "Site settings → Notifications.", "Find " + host + " under \"Blocked\" and set it to Allow, then come back and tap \"Check again\"."];
    return ["Click the icon just left of the web address (a lock or two small sliders).", "Set \"Notifications\" to \"Allow\".", "Click \"Check again\"."];
  }
  function allowHelp() {
    addCss();   // also on pages that hide the note (data-desk="off")
    const d = el("dialog", "akd-help"); d.setAttribute("aria-labelledby", "akd-help-t");
    const t = el("h2", "", isIOS && !standalone ? "Notifications on iPhone and iPad" : "How to allow notifications"); t.id = "akd-help-t";
    const steps = el("ol"); deviceSteps().forEach((x) => steps.append(el("li", "", x)));
    const again = el("button", "", "Check again"); again.type = "button"; again.onclick = () => { d.close(); enforce(true); if ("Notification" in window && Notification.permission === "default") turnOn(); };
    const ok = el("button", "akd-help-2", "Close"); ok.type = "button"; ok.onclick = () => d.close();
    d.addEventListener("close", () => d.remove());
    d.append(t, el("p", "", "It takes a few taps. Until then you still see new items in the bell and on this page."), steps, el("div", "akd-help-row"));
    d.lastChild.append(ok, again);
    document.body.appendChild(d); d.showModal(); again.focus();
  }
  /* RULE (every page, every person): notifications with sound stay ON, so no task, approval or message is missed.
     While they are off, a slim bar at the top says so, with "Turn on", "How?" (steps for this device) and "Later" (8 hours).
     It never blocks the page: the bell and the on-page alerts keep working meanwhile. It goes away by itself once they are on. */
  let gate = null, bar = null;
  function enforce(force) {
    addCss();
    const off = (x) => { if (x) x.remove(); return null; };
    if (!me) { gate = off(gate); bar = off(bar); return; }
    const iosTab = isIOS && !standalone, st = "Notification" in window ? Notification.permission : "default";
    if (!iosTab && canPush && st === "granted") { gate = off(gate); bar = off(bar); return; }
    const k = "akf-notif-later-" + me.id;
    if (!force && Date.now() < +store.get(k, 0)) { gate = off(gate); return; }   // "Later" was tapped
    const want = !canPush && !iosTab ? "none" : iosTab ? "ios" : st;
    if (gate && gate.dataset.want === want) return;
    gate = off(gate);
    const b = el("div", "akd-nb"); b.dataset.want = want; b.setAttribute("role", "status");
    const msg = want === "none" ? "This browser cannot show notifications. Open the portals in Chrome, Edge or Firefox so you never miss an approval."
      : want === "ios" ? "To get notifications on iPhone, add the portals to your Home Screen."
      : want === "denied" ? "Notifications are blocked on this device, so you may miss approvals and tasks."
      : "Turn on notifications so you never miss an approval, task or message.";
    b.append(el("span", "akd-nb-t", "🔔 " + msg));
    const btn = (txt, cls, fn) => { const x = el("button", cls, txt); x.type = "button"; x.onclick = fn; b.append(x); return x; };
    if (want === "default") btn("Turn on", "akd-nb-on", () => turnOn());
    if (want === "denied" || want === "ios") btn("How?", "akd-nb-on", () => allowHelp());
    btn("Later", "akd-nb-x", () => { store.set(k, Date.now() + 8 * 36e5); gate = off(gate); });
    document.body.prepend(b); gate = b;
  }
  // the person may allow it in the browser's settings without reloading
  try { navigator.permissions && navigator.permissions.query({ name: "notifications" }).then((p) => { p.onchange = () => enforce(); }).catch(() => {}); } catch (_) {}
  // a new bell item: system notification when the page is in the background, the bell sound always
  /* the page is open: the alert also shows ON the page (bottom right) and stays until the person closes it */
  let pops = null;
  function popUp(list) {
    addCss();
    if (!pops || !pops.isConnected) { pops = el("div", "akd-pops"); pops.setAttribute("role", "status"); pops.setAttribute("aria-live", "polite"); document.body.appendChild(pops); }
    list.slice(0, 3).forEach((n) => {
      const box = el("div", "akd-pop"), x = el("button", "akd-pop-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Close this alert");
      x.onclick = () => box.remove();
      box.append(el("b", "", "🔔 " + n.title), n.body ? el("span", "", n.body) : "", x);
      pops.prepend(box);
    });
    while (pops.children.length > 4) pops.lastChild.remove();
  }
  async function notifyNow(list) {
    ding();
    if (document.visibilityState === "visible") popUp(list);
    if (!("Notification" in window) || Notification.permission !== "granted" || document.visibilityState === "visible") return;
    const reg = await swReady; if (!reg || !reg.active) return;
    const shown = list.length > 3 ? [{ key: "akf-many", title: `${list.length} new notifications`, body: list.slice(0, 3).map((n) => n.title).join(" · "), url: location.href }] : list;
    shown.forEach((n) => reg.active.postMessage({ type: "akf-notify", title: n.title, body: n.body || "", tag: String(n.key).slice(0, 120), url: n.url || location.href }));
  }

  // portals call this with their bell list: [{ key, title, body?, url?, pushed? }] — pushed: the server already sends it
  // for the main page's bell button (My desk's note is hidden there)
  window.AKF_DESK = { turnOn: () => turnOn(), isOn: () => "Notification" in window && Notification.permission === "granted",
    portals: () => portalsOnce().then(d => d || []),   // for the Jazba rail on portals
    /* one signature per person for every portal (027_one_signature.sql): e-mail → picture, read once per page */
    signatures: () => sigP || (sigP = sb.rpc("core_signatures_all").then(r => { const m = {}; (r.data || []).forEach(x => { m[String(x.email).toLowerCase()] = x.image; }); return m; }).catch(() => { sigP = null; return {}; })),
    saveSignature: img => sb.rpc("core_signature_save", { p_image: img || "" }).then(r => { sigP = null; if (r.error) throw r.error; }) };
  let sigP = null;
  // a portal hands over its whole bell list: keep a copy for the bell on every page (036), then ring the new ones
  window.AKF_NOTIFY = function (items) {
    if (!me || !Array.isArray(items)) return;
    saveBell(items); ring(items);
  };
  function ring(items) {
    const k = "akf-seen-" + me.id; const seen = store.get(k, null); const first = seen === null; const s = seen || {};
    const fresh = items.filter((n) => n && n.key && !s[n.key]);
    if (!fresh.length) return;
    const now = Date.now(); fresh.forEach((n) => { s[n.key] = now; });
    const keep = Object.entries(s).sort((a, b) => b[1] - a[1]).slice(0, 400); store.set(k, Object.fromEntries(keep));
    if (first) return;                                               // the first visit on this device: no flood of old items
    const ring = fresh.filter((n) => !(n.pushed && document.visibilityState !== "visible"));
    if (ring.length) notifyNow(ring.map((n) => ({ key: n.key, title: String(n.title || "New notification").slice(0, 120), body: String(n.body || "").slice(0, 240), url: n.url })));
  }
  let bellSig = "", bellT = 0;
  function saveBell(items) {
    const cur = here(); if (!cur) return;                              // the main page has no bell list of its own
    const list = items.filter(n => n && n.key).slice(0, 150).map(n => ({ key: String(n.key), title: n.title || "", body: n.body || "", open: n.open || "", at: n.at ? String(n.at) : "", read: !!n.read }));
    const sig = JSON.stringify(list); if (sig === bellSig) return; bellSig = sig;
    clearTimeout(bellT); bellT = setTimeout(() => { sb.rpc("core_bell_save", { p_portal: cur, p_items: list }).then(() => loadInbox()).catch(() => { bellSig = ""; }); }, 1500);
  }

  /* ---------- one bell for every portal (035_all_notifications.sql: core_my_inbox) ----------
     The list is the same on the main page and in every portal; a click opens the portal and the record it is about.
     Items of the portal on screen ring through that portal's own AKF_NOTIFY (same keys), so nothing rings twice. */
  let inbox = [], inboxP = null, myPortals = null, panel = null;
  const here = () => { const p = location.href.startsWith(BASE) ? location.href.slice(BASE.length).split(/[/?#]/)[0] : ""; return p; };
  // the person's portals, asked once per page (the rail, the bell and the assistant all need them)
  let portalsP = null;
  function portalsOnce() { return portalsP || (portalsP = sb.rpc("core_my_portals").then(r => { if (r.error) throw r.error; return r.data || null; }).catch(() => { portalsP = null; return null; })); }
  async function loadInbox() {
    if (!me) return;
    if (!myPortals) myPortals = await portalsOnce();
    // each portal's own bell list (saved by that portal, 036) plus the live list of steps waiting for me (035)
    const [live, saved, hr] = await Promise.all([sb.rpc("core_my_inbox"), sb.rpc("core_bell_all"), sb.rpc("hr_inbox")]);   // HR keeps its own list (portals/hr.sql)
    if (live.error && saved.error) return;
    if (!hr.error && Array.isArray(hr.data)) live.data = (Array.isArray(live.data) ? live.data : []).concat(hr.data);
    const has = k => !myPortals || myPortals.some(p => p.key === k), keys = new Set(), all = [];
    (Array.isArray(saved.data) ? saved.data : []).forEach(b => (b.items || []).forEach(n => { if (n && n.key && !keys.has(n.key)) { keys.add(n.key); all.push({ ...n, portal: b.portal, at: n.at || b.at }); } }));
    (Array.isArray(live.data) ? live.data : []).forEach(n => { if (n && n.key && !keys.has(n.key)) { keys.add(n.key); all.push(n); } });
    const rd = store.get("akf-inread-" + me.id, {}), seen = new Map(), lowLive = all.some(n => /^low\|/.test(n.key));
    inbox = [];
    all.filter(n => has(n.portal)).forEach(n => {
      if (lowLive && /below minimum stock/.test(n.title || "")) return;          // the live "need restocking" item replaces the portal's copy
      const rec = /^#(track|task|req)=/.test(n.open || "") ? n.portal + n.open + "|" + kindOf(n) : "";
      const x = { ...n, read: !!(n.read || rd[n.key]) };
      if (rec && seen.has(rec)) { const y = seen.get(rec); y.read = y.read && x.read; y.keys.push(n.key); return; }
      x.keys = [n.key]; if (rec) seen.set(rec, x); inbox.push(x);
    });
    const cur = here();
    ring(inbox.filter(n => n.portal !== cur && !n.read).map(n => ({ key: n.key, title: n.title, body: n.body, url: linkOf(n) })));
    document.dispatchEvent(new CustomEvent("akf-inbox", { detail: { count: inbox.filter(n => !n.read).length } }));
    if (panel && panel.isConnected) drawPanel();
  }
  // only links inside this site: the portal's own address from core_my_portals, plus the record's page link
  function linkOf(n) {
    const p = myPortals && myPortals.find(x => x.key === n.portal);
    try { const u = new URL(p ? p.url : n.portal + "/", BASE); if (u.origin !== location.origin) return BASE;
      const h = String(n.open || ""); return u.href.split("#")[0] + (/^#[\w=:%.\-]*$/.test(h) ? h : ""); } catch (_) { return BASE; }
  }
  // news about my own work vs things only I can move forward
  function kindOf(n) { if (/^Sent back/i.test(n.title || "")) return "act";   // back with me to correct
    return /^(my|tout|tcm|trq|tdn|x)\||^hr\|(done|grant|notice|off|slip)\|/.test(n.key || "") ? "news" : "act"; }
  function markRead(list) {
    const rd = store.get("akf-inread-" + me.id, {}), t = Date.now(); list.forEach(n => (n.keys || [n.key]).forEach(k => { rd[k] = t; }));
    store.set("akf-inread-" + me.id, Object.fromEntries(Object.entries(rd).sort((a, b) => b[1] - a[1]).slice(0, 600)));
  }
  function go(n) {
    markRead([n]);
    const url = linkOf(n), same = url.split("#")[0] === location.href.split("#")[0];
    closePanel();
    // Tasks opens #task= on the spot; the other portals read the link when the page loads
    if (same) { location.hash = url.split("#")[1] || ""; if (!/#task=/.test(url)) location.reload(); } else location.href = url;
  }
  function closePanel() { if (panel) { panel.remove(); panel = null; } removeEventListener("keydown", panelKeys, true); document.removeEventListener("pointerdown", panelOut, true); }
  function panelKeys(e) { if (e.key === "Escape") { e.preventDefault(); const b = panel && panel._back; closePanel(); if (b && b.focus) b.focus(); } }
  function panelOut(e) { if (panel && !panel.contains(e.target) && !(panel._back && panel._back.contains(e.target))) closePanel(); }
  const ago = s => { const m = Math.round((Date.now() - Date.parse(s)) / 6e4); if (!isFinite(m)) return ""; if (m < 1) return "now"; if (m < 60) return m + " min"; const h = Math.round(m / 60); return h < 24 ? h + " h" : Math.round(h / 24) + " d"; };
  function drawPanel() {
    const nameOf = k => { const p = myPortals && myPortals.find(x => x.key === k); return p ? p.name : k; };
    const list = el("div", "akd-in-list"), unread = inbox.filter(n => !n.read).length;
    if (!inbox.length) list.append(el("p", "akd-in-empty", "All clear. Nothing new in any of your portals."));
    [["act", "Needs your action", "Only you can move these forward"], ["news", "Updates", "What happened to your requests and tasks"]].forEach(([k, t, sub]) => {
      const L = inbox.filter(n => kindOf(n) === k).sort((x, y) => (x.read - y.read) || String(y.at || "").localeCompare(String(x.at || "")));
      if (!L.length) return;
      const u = L.filter(n => !n.read).length, h = el("div", "akd-in-g");
      h.append(el("b", "", t), el("span", u ? "akd-in-n" : "akd-in-n0", u ? u + " new" : "seen")); h.title = sub; list.append(h);
      L.slice(0, 25).forEach(n => {
        const r = el("button", "akd-in-row" + (n.read ? " read" : "")); r.type = "button";
        r.append(el("span", "akd-in-p", nameOf(n.portal) + (n.at ? " · " + (ago(n.at) === "now" ? "just now" : ago(n.at) + " ago") : "")), el("b", "", n.title || "Notification"), n.body ? el("span", "akd-in-b", n.body) : "");
        r.onclick = () => go(n); list.append(r);
      });
      if (L.length > 25) list.append(el("p", "akd-in-more", `+${L.length - 25} more — open the portal to see them all`));
    });
    const head = el("div", "akd-in-h"); head.append(el("b", "", unread ? `${unread} new` : "Notifications"));
    if (unread) { const m = el("button", "akd-in-on", "Mark all read"); m.type = "button"; m.onclick = () => { markRead(inbox); inbox.forEach(n => { n.read = true; }); document.dispatchEvent(new CustomEvent("akf-inbox", { detail: { count: 0 } })); drawPanel(); }; head.append(m); }
    if (!("Notification" in window) || Notification.permission !== "granted") { const t = el("button", "akd-in-on", "🔕 Turn on alerts"); t.type = "button"; t.onclick = () => turnOn(); head.append(t); }
    panel.replaceChildren(head, list);
  }
  function openInbox(anchor) {
    if (panel) { closePanel(); return; }
    addCss(); panel = el("div", "akd-in"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "All notifications from every portal"); panel._back = anchor;
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
    panel.style.top = Math.round(r ? r.bottom + 8 : 70) + "px";
    document.body.append(panel); drawPanel(); addEventListener("keydown", panelKeys, true); document.addEventListener("pointerdown", panelOut, true);
    loadInbox().catch(() => {});
  }
  window.AKF_DESK.inbox = () => inbox;
  window.AKF_DESK.openInbox = openInbox;

  /* ---------- the sticky note ---------- */
  const CSS = `
.akd-in{position:fixed;right:16px;z-index:2147482500;width:min(420px,calc(100vw - 32px));max-height:min(70vh,640px);display:flex;flex-direction:column;background:#fff;color:#1d2433;border-radius:14px;box-shadow:0 20px 50px -16px rgba(15,23,42,.45);font:14px/1.4 Manrope,"Segoe UI",system-ui,sans-serif;overflow:hidden}
.akd-in-h{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #E6EAF0}.akd-in-h b{flex:1}
.akd-in-on{border:1px solid #D9C35A;background:#FFF8D6;border-radius:99px;padding:4px 10px;cursor:pointer;font:inherit;font-size:12px;font-weight:600}
.akd-in-list{overflow:auto;padding:6px}
.akd-in-row{display:grid;gap:2px;width:100%;text-align:left;border:0;background:none;padding:10px;border-radius:10px;cursor:pointer;font:inherit;color:inherit}
.akd-in-row:hover,.akd-in-row:focus-visible{background:#EEF4FC;outline:none}.akd-in-row:focus-visible{box-shadow:inset 0 0 0 2px #0B51A7}
.akd-in-p{font-size:11.5px;font-weight:700;color:#0B51A7}
.akd-in-b{color:#4a5568;font-size:13px}.akd-in-row small{color:#5b6475;font-size:11.5px}
.akd-in-empty{padding:18px;color:#4a5568;text-align:center}
.akd-in-g{display:flex;align-items:center;gap:8px;width:100%;border:0;background:#F1F5FA;border-radius:8px;padding:8px 10px;margin:8px 0 2px;font:inherit;color:#0B3D75;text-align:left}.akd-in-g b{flex:1}
.akd-in-n{background:#D23B3B;color:#fff;border-radius:99px;padding:1px 8px;font-size:12px;font-weight:700}.akd-in-n0{color:#5b6475;font-size:12px}
.akd-in-row.read b{font-weight:600;color:#5b6475}.akd-in-more{margin:2px 10px 6px;font-size:12px;color:#5b6475}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .akd-in{background:#162033;color:#E8EDF5}:root:not([data-theme="light"]) .akd-in-h{border-color:#2A3650}:root:not([data-theme="light"]) .akd-in-row:hover{background:#20304A}:root:not([data-theme="light"]) .akd-in-b,:root:not([data-theme="light"]) .akd-in-row small,:root:not([data-theme="light"]) .akd-in-empty{color:#B7C2D3}:root:not([data-theme="light"]) .akd-in-p{color:#7FB2F0}:root:not([data-theme="light"]) .akd-in-g{background:#20304A;color:#CFE0F7}}
:root[data-theme="dark"] .akd-in{background:#162033;color:#E8EDF5}:root[data-theme="dark"] .akd-in-h{border-color:#2A3650}:root[data-theme="dark"] .akd-in-row:hover{background:#20304A}:root[data-theme="dark"] .akd-in-b,:root[data-theme="dark"] .akd-in-row small,:root[data-theme="dark"] .akd-in-empty{color:#B7C2D3}:root[data-theme="dark"] .akd-in-p{color:#7FB2F0}:root[data-theme="dark"] .akd-in-g{background:#20304A;color:#CFE0F7}
.akd-help{max-width:min(440px,calc(100vw - 32px));border:0;border-radius:14px;padding:20px 22px;font:14px/1.5 Manrope,"Segoe UI",system-ui,sans-serif;color:#1d2433;background:#fff;box-shadow:0 20px 50px -20px rgba(0,0,0,.5)}
.akd-help::backdrop{background:rgba(15,23,42,.45)}
.akd-pops{position:fixed;right:16px;bottom:96px;z-index:2147482000;display:grid;gap:8px;width:min(340px,calc(100vw - 32px))}
.akd-pop{position:relative;display:grid;gap:3px;padding:12px 34px 12px 14px;border-radius:12px;background:#fff;color:#1d2433;border-left:4px solid #0b5cad;box-shadow:0 12px 32px rgba(15,23,42,.22);font:14px/1.4 Manrope,"Segoe UI",system-ui,sans-serif}
.akd-pop span{color:#4a5568;font-size:13px}
.akd-pop-x{position:absolute;top:6px;right:8px;border:0;background:none;font-size:20px;line-height:1;cursor:pointer;color:#5b6475}
.akd-gate::backdrop{background:rgba(4,20,40,.82);backdrop-filter:blur(3px)}
.akd-gate h2{color:#B42318}
.akd-nb{position:sticky;top:0;z-index:2147483000;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;padding:8px 12px;background:#FFF4E5;color:#7A3E00;border-bottom:1px solid #F5C98A;font:600 13.5px/1.35 Manrope,"Segoe UI",system-ui,sans-serif}
.akd-nb-t{flex:1 1 220px;text-align:center}.akd-nb button{border:0;border-radius:99px;padding:6px 14px;font:inherit;cursor:pointer;min-height:32px}
.akd-nb-on{background:#0B51A7;color:#fff}.akd-nb-x{background:transparent;color:#7A3E00;text-decoration:underline}
.akd-help-row{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}.akd-help .akd-help-2{background:transparent;color:#0B51A7;border:1px solid #C9D6EA}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .akd-nb{background:#3A2A12;color:#FFD9A3;border-color:#6B4A1C}:root:not([data-theme="light"]) .akd-nb-x{color:#FFD9A3}}
:root[data-theme="dark"] .akd-nb{background:#3A2A12;color:#FFD9A3;border-color:#6B4A1C}:root[data-theme="dark"] .akd-nb-x{color:#FFD9A3}
.akd-bar{position:sticky;top:0;z-index:2147483000;background:#B42318;color:#fff;padding:8px 14px;font:600 14px/1.4 Manrope,"Segoe UI",system-ui,sans-serif;text-align:center}
.akd-help h2{margin:0 0 8px;font-size:17px}.akd-help ol{margin:8px 0;padding-left:20px}.akd-help li{margin:4px 0}.akd-help .akd-help-n{color:#5b6475;font-size:13px}
.akd-help button{float:right;margin-top:6px;border:0;border-radius:8px;background:#0b5cad;color:#fff;font:600 14px Manrope,"Segoe UI",system-ui,sans-serif;padding:9px 22px;cursor:pointer}
.akd{position:fixed;left:16px;bottom:16px;z-index:7990;width:min(320px,calc(100vw - 32px));font:13px/1.4 Manrope,"Segoe UI",system-ui,sans-serif;color:#3B3208}
.akd-card{background:var(--n1);border:1px solid var(--n3);border-radius:14px;box-shadow:0 14px 34px -14px rgba(60,50,0,.45);overflow:hidden;transform:rotate(-.6deg)}
.akd-head{display:flex;align-items:center;gap:6px;padding:9px 10px 7px 12px;background:var(--n2);cursor:grab;user-select:none;touch-action:none}
.akd.drag .akd-head{cursor:grabbing} .akd.drag .akd-card{transform:none;box-shadow:0 22px 44px -14px rgba(0,0,0,.45)}
.akd-head b{flex:1;font-size:13.5px} .akd-head{gap:8px} .akd-head button{border:0;background:rgba(255,255,255,.55);border-radius:8px;min-width:32px;height:32px;cursor:pointer;font-size:14px;color:#5B4B00}
.akd-head button:focus-visible,.akd a:focus-visible,.akd-bell:focus-visible{outline:2px solid #0B51A7;outline-offset:1px}
.akd-body{max-height:min(46vh,380px);overflow:auto;padding:4px 12px 10px}
.akd h4{margin:10px 0 4px;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:#7A6400;display:flex;justify-content:space-between}
.akd ul{list-style:none;margin:0;padding:0} .akd li{padding:4px 0;border-bottom:1px dashed var(--n3)}
.akd li a{color:inherit;text-decoration:none;display:block} .akd li a:hover{text-decoration:underline}
.akd .akd-due{font-size:11px;color:#8A7A2A} .akd .akd-late{color:#C0392B;font-weight:700}
.akd .akd-none{color:#8A7A2A;font-size:12px;padding:2px 0}
.akd-foot{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 12px;border-top:1px solid var(--n3);background:var(--n2)}
.akd-week{margin:8px 0 2px} .akd-wh{display:flex;justify-content:space-between;align-items:baseline;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:#7A6400;font-weight:700}
.akd-wv{text-transform:none;letter-spacing:0;color:#3B3208;font-weight:800;font-variant-numeric:tabular-nums;transition:opacity .2s}
.akd-wbars{display:flex;align-items:flex-end;gap:6px;height:58px;margin-top:6px}
.akd-wc{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}
.akd-wc i{display:block;width:min(14px,70%);min-height:3px;border-radius:99px;background:rgba(59,50,8,.22);transition:background .3s ease-out,transform .3s ease-out;transform-origin:50% 100%}
.akd-wc span{font-size:10px;color:#8A7A2A;margin-top:3px} .akd-wc.today span{font-weight:800;color:#3B3208}
.akd-wbars.hov .akd-wc i{background:rgba(59,50,8,.1)} .akd-wbars.hov .akd-wc.nb i{background:rgba(59,50,8,.3)}
.akd-wbars.hov .akd-wc.on i{background:#3B3208;transform:scaleX(1.15)} .akd-wbars.hov .akd-wc.on span{color:#3B3208;font-weight:800}
.akd-cols{display:flex;gap:6px;align-items:center;padding:8px 0 2px;font-size:11.5px;color:#7A6400}
.akd-cols button{width:20px;height:20px;border-radius:50%;border:1px solid rgba(0,0,0,.18);cursor:pointer;padding:0}
.akd-cols button.on{outline:2px solid #3B3208;outline-offset:1px}
.akd-foot a{color:#0B51A7;font-weight:700;text-decoration:none}
.akd-bell{border:1px solid #D9C35A;background:#fff;border-radius:99px;padding:4px 10px;cursor:pointer;font-family:inherit;font-weight:600;font-size:12px;color:#3B3208}
.akd-bell.on{background:#DDF5E3;border-color:#8CCB9E}
.akd.min .akd-body,.akd.min .akd-foot{display:none} .akd.min{width:auto} .akd.min .akd-card{transform:none}
@media (max-width:720px){.akd{bottom:78px;left:10px}}
@media (min-width:821px){html[data-jz-page="hub"] .akd{left:96px}}   /* main page: clear of the left rail */
@media print{.akd{display:none}}`;
  let root = null, data = null, folded = true;   // hidden as a small pinned button until the person opens it
  // note colours [paper, header, lines]; the choice and the place on screen are remembered on this device
  const PAL = { yellow: ["#FFF6BF", "#FCEB8C", "#EAD97A"], green: ["#E3F6E8", "#C2EACF", "#9FD8B1"], blue: ["#E3EEFF", "#C9DDFF", "#9DBDF0"],
                pink: ["#FDE6EE", "#F9C9DA", "#EBA1BB"], purple: ["#EFE8FF", "#DCCEFF", "#BBA6F0"], white: ["#FFFFFF", "#EEF1F6", "#D5DBE6"] };
  let color = PAL[store.get("akf-note-color", "yellow")] ? store.get("akf-note-color", "yellow") : "yellow";
  let pos = store.get("akf-note-pos", null), moved = false;                // { x, y } from the top-left corner, or null = the corner
  function place() {                                                       // keep the whole header on screen, also after the window shrinks
    if (!root) return;
    if (!pos) { root.style.left = root.style.top = root.style.bottom = ""; return; }
    const w = root.offsetWidth, h = root.querySelector(".akd-head") ? root.querySelector(".akd-head").offsetHeight : 40;
    const x = Math.max(4, Math.min(pos.x, innerWidth - w - 4)), y = Math.max(4, Math.min(pos.y, innerHeight - h - 4));
    root.style.left = x + "px"; root.style.top = y + "px"; root.style.bottom = "auto";
  }
  addEventListener("resize", place);
  function drag(head) {
    head.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      const r = root.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top, x0 = e.clientX, y0 = e.clientY;
      moved = false; head.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;   // a short tap still opens / folds the note
        moved = true; root.classList.add("drag"); pos = { x: ev.clientX - dx, y: ev.clientY - dy }; place();
      };
      const up = () => { head.removeEventListener("pointermove", mv); root.classList.remove("drag"); if (moved) store.set("akf-note-pos", pos); };
      head.addEventListener("pointermove", mv); head.addEventListener("pointerup", up, { once: true }); head.addEventListener("pointercancel", up, { once: true });
    });
    head.addEventListener("dblclick", () => { pos = null; store.set("akf-note-pos", null); place(); });   // back to the corner
  }
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const fmt = (d) => { if (!d) return ""; const t = new Date(d + "T12:00:00"); return isNaN(t) ? d : t.toLocaleDateString(undefined, { day: "numeric", month: "short" }); };

  function section(title, rows, empty) {
    const box = document.createDocumentFragment();
    const h = el("h4"); h.append(el("span", "", title), el("span", "", String(rows.length))); box.append(h);
    if (!rows.length) { box.append(el("div", "akd-none", empty)); return box; }
    const ul = el("ul");
    rows.slice(0, 6).forEach((r) => {
      const li = el("li"); const a = el("a"); a.href = BASE + "tasks/#task=" + encodeURIComponent(r.open);
      a.append(el("span", "", r.text));
      // handed in for review: it waits on the reviewer, so it is not overdue for the person who did it
      if (r.due) { const late = !r.wait && r.due < today(); a.append(el("div", "akd-due" + (late ? " akd-late" : ""), (r.wait ? "Handed in · due " : late ? "Overdue · " : "Due ") + fmt(r.due))); }
      li.append(a); ul.append(li);
    });
    if (rows.length > 6) { const li = el("li"); const a = el("a", "", `+ ${rows.length - 6} more in Tasks`); a.href = BASE + "tasks/"; li.append(a); ul.append(li); }
    box.append(ul); return box;
  }
  // "My week": tasks I finished on each of the last 7 days; point at a day to see its number
  function week(days) {
    const box = el("div", "akd-week"), total = days.reduce((s, d) => s + d.n, 0), max = Math.max(1, ...days.map((d) => d.n));
    const sum = `${total} done this week`, wv = el("span", "akd-wv", sum);
    const hd = el("div", "akd-wh"); hd.append(el("span", "", "My week"), wv);
    const bars = el("div", "akd-wbars"); bars.setAttribute("role", "img");
    bars.setAttribute("aria-label", "Tasks done: " + days.map((d) => `${d.name} ${d.n}`).join(", "));
    const cols = days.map((d, i) => {
      const c = el("div", "akd-wc" + (i === days.length - 1 ? " today" : "")); const b = el("i"); b.style.height = Math.max(3, Math.round(d.n / max * 40)) + "px";
      c.append(b, el("span", "", d.name.charAt(0)));
      c.addEventListener("pointerenter", () => { bars.classList.add("hov"); cols.forEach((x, j) => { x.classList.toggle("on", j === i); x.classList.toggle("nb", Math.abs(j - i) === 1); });
        wv.textContent = `${d.n} done · ${d.name}`; });
      return c;
    });
    bars.addEventListener("pointerleave", () => { bars.classList.remove("hov"); cols.forEach((x) => x.classList.remove("on", "nb")); wv.textContent = sum; });
    bars.append(...cols); box.append(hd, bars); return box;
  }
  function bellLabel() {
    if (!("Notification" in window) && !isIOS) return null;
    if ("Notification" in window && Notification.permission === "denied") return ["🔕 Notifications blocked: how to allow", false];
    return ("Notification" in window && Notification.permission === "granted") ? ["🔔 Notifications on", true] : ["🔕 Turn on notifications", false];
  }
  function paint() {
    if (!me) { if (root) root.remove(); root = null; return; }
    if (document.documentElement.dataset.desk === "off") return;   // a page may opt out with data-desk="off"; bell and push keep running
    if (!root) {
      addCss();
      root = el("aside", "akd"); root.setAttribute("aria-label", "My sticky note"); document.body.appendChild(root);
    }
    root.classList.toggle("min", folded);
    PAL[color].forEach((c, i) => root.style.setProperty("--n" + (i + 1), c));
    const card = el("div", "akd-card");
    const head = el("div", "akd-head"); head.title = (folded ? "Open my note" : "Fold the note") + " · drag to move · double-click to put it back in the corner";
    const open = data ? data.plan.length + data.todo.length + data.assigned.length : 0;
    head.append(el("b", "", folded ? `📌 My note · ${open}` : "📌 My note"));
    const tog = el("button", "", folded ? "▴" : "▾"); tog.type = "button"; tog.setAttribute("aria-label", folded ? "Open my note" : "Fold my note");
    // keyboard: arrow keys on the fold button move the note
    tog.onkeydown = (e) => { const d = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[e.key]; if (!d) return; e.preventDefault();
      const r = root.getBoundingClientRect(); pos = { x: r.left + d[0], y: r.top + d[1] }; place(); store.set("akf-note-pos", pos); };
    const off = bellLabel();   // folded note: still show "turn on" until this device has notifications
    if (folded && off && !off[1]) { const b = el("button", "akd-bell", "Notification" in window && Notification.permission === "denied" ? "🔕 Blocked" : "🔕 Turn on"); b.type = "button"; b.title = "Get notifications with sound on this device"; b.onclick = (e) => { e.stopPropagation(); turnOn(); }; head.append(b); }
    head.append(tog); head.onclick = () => { if (moved) { moved = false; return; } folded = !folded; paint(); };
    drag(head);
    const body = el("div", "akd-body");
    if (!data) body.append(el("div", "akd-none", "Loading…"));
    else if (!data.pid) body.append(el("div", "akd-none", "Your tasks appear here once you are added to Tasks & Events."));
    else {
      body.append(week(data.week));
      body.append(section("Today's plan", data.plan, "Nothing planned for today."));
      body.append(section("My to-do", data.todo, "No to-dos. Add them in Tasks → To-Do & Notes."));
      body.append(section("Assigned to me", data.assigned, "No open tasks from others."));
    }
    const cols = el("div", "akd-cols"); cols.append(el("span", "", "Colour"));
    Object.keys(PAL).forEach((k) => { const b = el("button", color === k ? "on" : ""); b.type = "button"; b.style.background = PAL[k][1];
      b.setAttribute("aria-label", k + " note"); b.setAttribute("aria-pressed", String(color === k));
      b.onclick = () => { color = k; store.set("akf-note-color", k); paint(); }; cols.append(b); });
    body.append(cols);
    const foot = el("div", "akd-foot"); const go = el("a", "", "Open Tasks →"); go.href = BASE + "tasks/"; foot.append(go);
    const bl = bellLabel();
    if (bl) { const b = el("button", "akd-bell" + (bl[1] ? " on" : ""), bl[0]); b.type = "button"; b.onclick = (e) => { e.stopPropagation(); bl[1] ? sb.functions.invoke("push", { body: { action: "test" } }).then(ding) : turnOn(); }; b.title = bl[1] ? "Send a test notification" : "Get notifications on this device"; foot.append(b); }
    card.append(head, body, foot); root.replaceChildren(card); place();
  }

  async function load() {
    const t = today();
    const { data: who } = await sb.from("portal_rows").select("id,data").eq("collection", "users").eq("data->>email", me.email).limit(1);
    let pid = who && who[0] && who[0].id;
    if (!pid) { const r = await sb.from("portal_rows").select("id").eq("collection", "users").eq("data->>username", me.email.split("@")[0]).limit(1); pid = r.data && r.data[0] && r.data[0].id; }
    if (!pid) { data = { pid: null, plan: [], todo: [], assigned: [] }; paint(); return; }
    const day0 = new Date(); day0.setHours(0, 0, 0, 0); day0.setDate(day0.getDate() - 6);   // the last 7 days, today included
    const [tk, nt, dn] = await Promise.all([
      sb.from("portal_rows").select("data").eq("collection", "tasks").eq("data->>assigneeId", pid).not("data->>stage", "in", '("06","07")').limit(300),
      sb.from("portal_rows").select("data").eq("collection", "notes").eq("data->>ownerId", pid).eq("data->>kind", "todo").limit(300),
      sb.from("portal_rows").select("data").eq("collection", "tasks").eq("data->>assigneeId", pid).eq("data->>stage", "06").gte("data->>completedAt", day0.toISOString()).limit(500),
    ]);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(day0); d.setDate(d.getDate() + i); return { t: d.toDateString(), name: d.toLocaleDateString(undefined, { weekday: "short" }), n: 0 }; });
    (dn.data || []).forEach((r) => { const c = r.data && new Date(r.data.completedAt); const d = c && days.find((x) => x.t === c.toDateString()); if (d) d.n++; });
    const tasks = (tk.data || []).map((r) => r.data).filter((x) => x && x.v === 2);
    // open: the task itself, or the To-Do & Notes section for a to-do (portal-app reads #task=)
    const row = (x) => ({ text: (x.id ? x.id + " · " : "") + String(x.title || x.text || "").slice(0, 120), due: x.plannedDate || x.due || "", wait: /^0[345]$/.test(x.stage || ""), open: x.title ? String(x.key || "") : "view:myspace" });
    const byDue = (a, b) => (a.due || "9999").localeCompare(b.due || "9999");
    data = {
      pid, week: days,
      plan: tasks.filter((x) => x.plannedDate && x.plannedDate <= t).map(row).sort(byDue),
      todo: (nt.data || []).map((r) => r.data).filter((x) => x && !x.done).map(row).sort(byDue),
      assigned: tasks.filter((x) => x.creatorId && x.creatorId !== pid).map(row).sort(byDue),
    };
    paint();
  }

  /* sign-out rules for every page: a sign-in lasts at most 10 hours, and at 6 PM (Pakistan time) every sign-in made
     before 6 PM ends. Signing in again after 6 PM is allowed (10 hours from then). */
  const HOUR = 36e5;
  function signedInAt(s) {
    let t = 0;   // when THIS session signed in: the newest amr timestamp in the token (per device), else the account's last sign-in
    try { const c = JSON.parse(atob(s.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); t = Math.max(0, ...(c.amr || []).map((a) => +a.timestamp || 0)) * 1000; } catch (_) {}
    return t || Date.parse(s.user && s.user.last_sign_in_at) || 0;
  }
  function expired(s, now) {
    const t = signedInAt(s); if (!t) return false;
    const pk = new Date(now + 5 * HOUR), six = Date.UTC(pk.getUTCFullYear(), pk.getUTCMonth(), pk.getUTCDate(), 13);   // 18:00 PKT = 13:00 UTC
    return now - t > 10 * HOUR || (now >= six && t < six);
  }
  let leaving = false;
  async function signOutNow(old) {
    if (leaving) return; leaving = true;
    // a new sign-in may be landing right now (reset link, sign-in in another tab): look again, and never sign that one out
    await new Promise((r) => setTimeout(r, 2500));
    const { data: s } = await sb.auth.getSession().catch(() => ({ data: {} }));
    const cur = s && s.session;
    if (!cur || signedInAt(cur) !== signedInAt(old) || !expired(cur, Date.now())) { leaving = false; return; }
    await sb.auth.signOut({ scope: "local" }).catch(() => {}); try { localStorage.removeItem("akf-portals-auth"); } catch (_) {}
    if (document.visibilityState === "visible") alert("You have been signed out (sign-ins end at 6 PM and after 10 hours). Please sign in again.");
    location.href = BASE;
  }
  async function checkExpiry() {
    const { data: s } = await sb.auth.getSession().catch(() => ({ data: {} }));
    if (s && s.session && expired(s.session, Date.now())) { signOutNow(s.session); return true; }
    return false;
  }
  setInterval(checkExpiry, 60000);   // also in background tabs, so 6 PM is on time

  let saved = false;
  async function tick() {
    const { data: s } = await sb.auth.getSession().catch(() => ({ data: {} }));
    const u = s && s.session && s.session.user;
    if (!u) { me = null; inbox = []; paint(); enforce(); return; }
    if (expired(s.session, Date.now())) { signOutNow(s.session); return; }
    if (!me || me.id !== u.id) { me = { id: u.id, email: String(u.email || "").toLowerCase() }; data = null; paint(); }
    enforce();
    load().catch(() => {});
    loadInbox().catch(() => {});
    if (!saved && canPush && Notification.permission === "granted") { saved = true; subscribe().catch(() => { saved = false; }); }
  }
  // every 5 s until someone signs in, then every 2 minutes (only while the page is on screen)
  const start = () => (document.visibilityState === "visible" ? tick() : Promise.resolve()).catch(() => {}).finally(() => setTimeout(start, me ? 120000 : 5000));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
