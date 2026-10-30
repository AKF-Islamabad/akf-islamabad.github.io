/* Alkhidmat Islamabad — "My desk": shown on the main page and in EVERY portal (existing and future).
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
(function () {
  "use strict";
  if (window.AKF_NOTIFY) return;
  const SCRIPT = document.currentScript && document.currentScript.src;
  const BASE = new URL(".", SCRIPT || location.href).href;          // the main site folder (/ live, /portal-staging/ staging)
  const cfg = window.AKF_SUPABASE;
  if (!cfg || !window.supabase || !cfg.url) { window.AKF_NOTIFY = function () {}; return; }
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
    const p = await Notification.requestPermission();
    if (p !== "granted") { alert("Notifications are blocked for this site. Allow them in the browser's site settings (the lock icon next to the address)."); paint(); return; }
    try { await subscribe(); await sb.functions.invoke("push", { body: { action: "test" } }); ding(); }
    catch (e) { alert("Notifications could not be switched on: " + e.message); }
    paint();
  }
  // a new bell item: system notification when the page is in the background, the bell sound always
  async function notifyNow(list) {
    ding();
    if (!("Notification" in window) || Notification.permission !== "granted" || document.visibilityState === "visible") return;
    const reg = await swReady; if (!reg || !reg.active) return;
    const shown = list.length > 3 ? [{ key: "akf-many", title: `${list.length} new notifications`, body: list.slice(0, 3).map((n) => n.title).join(" · "), url: location.href }] : list;
    shown.forEach((n) => reg.active.postMessage({ type: "akf-notify", title: n.title, body: n.body || "", tag: String(n.key).slice(0, 120), url: n.url || location.href }));
  }

  // portals call this with their bell list: [{ key, title, body?, url?, pushed? }] — pushed: the server already sends it
  window.AKF_NOTIFY = function (items) {
    if (!me || !Array.isArray(items)) return;
    const k = "akf-seen-" + me.id; const seen = store.get(k, null); const first = seen === null; const s = seen || {};
    const fresh = items.filter((n) => n && n.key && !s[n.key]);
    if (!fresh.length) return;
    const now = Date.now(); fresh.forEach((n) => { s[n.key] = now; });
    const keep = Object.entries(s).sort((a, b) => b[1] - a[1]).slice(0, 400); store.set(k, Object.fromEntries(keep));
    if (first) return;                                               // the first visit on this device: no flood of old items
    const ring = fresh.filter((n) => !(n.pushed && document.visibilityState !== "visible"));
    if (ring.length) notifyNow(ring.map((n) => ({ key: n.key, title: String(n.title || "New notification").slice(0, 120), body: String(n.body || "").slice(0, 240), url: n.url })));
  };

  /* ---------- the sticky note ---------- */
  const CSS = `
.akd{position:fixed;left:16px;bottom:16px;z-index:7990;width:min(320px,calc(100vw - 32px));font:13px/1.4 Manrope,"Segoe UI",system-ui,sans-serif;color:#3B3208}
.akd-card{background:#FFF6BF;border:1px solid #EAD97A;border-radius:14px;box-shadow:0 14px 34px -14px rgba(60,50,0,.45);overflow:hidden;transform:rotate(-.6deg)}
.akd-head{display:flex;align-items:center;gap:6px;padding:9px 10px 7px 12px;background:#FCEB8C;cursor:pointer;user-select:none}
.akd-head b{flex:1;font-size:13.5px} .akd-head button{border:0;background:rgba(255,255,255,.55);border-radius:8px;width:28px;height:26px;cursor:pointer;font-size:14px;color:#5B4B00}
.akd-head button:focus-visible,.akd a:focus-visible,.akd-bell:focus-visible{outline:2px solid #0B51A7;outline-offset:1px}
.akd-body{max-height:min(46vh,380px);overflow:auto;padding:4px 12px 10px}
.akd h4{margin:10px 0 4px;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase;color:#7A6400;display:flex;justify-content:space-between}
.akd ul{list-style:none;margin:0;padding:0} .akd li{padding:4px 0;border-bottom:1px dashed #E8D77C}
.akd li a{color:inherit;text-decoration:none;display:block} .akd li a:hover{text-decoration:underline}
.akd .akd-due{font-size:11px;color:#8A7A2A} .akd .akd-late{color:#C0392B;font-weight:700}
.akd .akd-none{color:#8A7A2A;font-size:12px;padding:2px 0}
.akd-foot{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 12px;border-top:1px solid #EAD97A;background:#FFF1A6}
.akd-foot a{color:#0B51A7;font-weight:700;text-decoration:none}
.akd-bell{border:1px solid #D9C35A;background:#fff;border-radius:99px;padding:4px 10px;cursor:pointer;font-family:inherit;font-weight:600;font-size:12px;color:#3B3208}
.akd-bell.on{background:#DDF5E3;border-color:#8CCB9E}
.akd.min .akd-body,.akd.min .akd-foot{display:none} .akd.min{width:auto} .akd.min .akd-card{transform:none}
@media (max-width:720px){.akd{bottom:78px;left:10px}}
@media print{.akd{display:none}}`;
  let root = null, data = null, folded = matchMedia("(max-width: 720px)").matches;   // phones: a small pinned button, tap to open
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
      if (r.due) a.append(el("div", "akd-due" + (r.due < today() ? " akd-late" : ""), (r.due < today() ? "Overdue · " : "Due ") + fmt(r.due)));
      li.append(a); ul.append(li);
    });
    if (rows.length > 6) { const li = el("li"); const a = el("a", "", `+ ${rows.length - 6} more in Tasks`); a.href = BASE + "tasks/"; li.append(a); ul.append(li); }
    box.append(ul); return box;
  }
  function bellLabel() {
    if (!("Notification" in window) && !isIOS) return null;
    return ("Notification" in window && Notification.permission === "granted") ? ["🔔 Notifications on", true] : ["🔕 Turn on notifications", false];
  }
  function paint() {
    if (!me) { if (root) root.remove(); root = null; return; }
    if (!root) {
      const st = el("style"); st.textContent = CSS; document.head.appendChild(st);
      root = el("aside", "akd"); root.setAttribute("aria-label", "My sticky note"); document.body.appendChild(root);
    }
    root.classList.toggle("min", folded);
    const card = el("div", "akd-card");
    const head = el("div", "akd-head"); head.title = folded ? "Open my note" : "Fold the note";
    const open = data ? data.plan.length + data.todo.length + data.assigned.length : 0;
    head.append(el("b", "", folded ? `📌 My note · ${open}` : "📌 My note"));
    const tog = el("button", "", folded ? "▴" : "▾"); tog.type = "button"; tog.setAttribute("aria-label", folded ? "Open my note" : "Fold my note");
    head.append(tog); head.onclick = () => { folded = !folded; paint(); };
    const body = el("div", "akd-body");
    if (!data) body.append(el("div", "akd-none", "Loading…"));
    else if (!data.pid) body.append(el("div", "akd-none", "Your tasks appear here once you are added to Tasks & Events."));
    else {
      body.append(section("Today's plan", data.plan, "Nothing planned for today."));
      body.append(section("My to-do", data.todo, "No to-dos. Add them in Tasks → To-Do & Notes."));
      body.append(section("Assigned to me", data.assigned, "No open tasks from others."));
    }
    const foot = el("div", "akd-foot"); const go = el("a", "", "Open Tasks →"); go.href = BASE + "tasks/"; foot.append(go);
    const bl = bellLabel();
    if (bl) { const b = el("button", "akd-bell" + (bl[1] ? " on" : ""), bl[0]); b.type = "button"; b.onclick = (e) => { e.stopPropagation(); bl[1] ? sb.functions.invoke("push", { body: { action: "test" } }).then(ding) : turnOn(); }; b.title = bl[1] ? "Send a test notification" : "Get notifications on this device"; foot.append(b); }
    card.append(head, body, foot); root.replaceChildren(card);
  }

  async function load() {
    const t = today();
    const { data: who } = await sb.from("portal_rows").select("id,data").eq("collection", "users").eq("data->>email", me.email).limit(1);
    let pid = who && who[0] && who[0].id;
    if (!pid) { const r = await sb.from("portal_rows").select("id").eq("collection", "users").eq("data->>username", me.email.split("@")[0]).limit(1); pid = r.data && r.data[0] && r.data[0].id; }
    if (!pid) { data = { pid: null, plan: [], todo: [], assigned: [] }; paint(); return; }
    const [tk, nt] = await Promise.all([
      sb.from("portal_rows").select("data").eq("collection", "tasks").eq("data->>assigneeId", pid).not("data->>stage", "in", '("06","07")').limit(300),
      sb.from("portal_rows").select("data").eq("collection", "notes").eq("data->>ownerId", pid).eq("data->>kind", "todo").limit(300),
    ]);
    const tasks = (tk.data || []).map((r) => r.data).filter((x) => x && x.v === 2);
    // open: the task itself, or the To-Do & Notes section for a to-do (portal-app reads #task=)
    const row = (x) => ({ text: (x.id ? x.id + " · " : "") + String(x.title || x.text || "").slice(0, 120), due: x.plannedDate || x.due || "", open: x.title ? String(x.key || "") : "view:myspace" });
    const byDue = (a, b) => (a.due || "9999").localeCompare(b.due || "9999");
    data = {
      pid,
      plan: tasks.filter((x) => x.plannedDate && x.plannedDate <= t).map(row).sort(byDue),
      todo: (nt.data || []).map((r) => r.data).filter((x) => x && !x.done).map(row).sort(byDue),
      assigned: tasks.filter((x) => x.creatorId && x.creatorId !== pid).map(row).sort(byDue),
    };
    paint();
  }

  let saved = false;
  async function tick() {
    const { data: s } = await sb.auth.getSession().catch(() => ({ data: {} }));
    const u = s && s.session && s.session.user;
    if (!u) { me = null; paint(); return; }
    if (!me || me.id !== u.id) { me = { id: u.id, email: String(u.email || "").toLowerCase() }; data = null; paint(); }
    load().catch(() => {});
    if (!saved && canPush && Notification.permission === "granted") { saved = true; subscribe().catch(() => { saved = false; }); }
  }
  // every 5 s until someone signs in, then every 2 minutes (only while the page is on screen)
  const start = () => (document.visibilityState === "visible" ? tick() : Promise.resolve()).catch(() => {}).finally(() => setTimeout(start, me ? 120000 : 5000));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
