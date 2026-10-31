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
(function () {
  "use strict";
  if (window.AKF_NOTIFY) return;
  const SCRIPT = document.currentScript && document.currentScript.src;
  const BASE = new URL(".", SCRIPT || location.href).href;          // the main site folder (/ live, /portal-staging/ staging)
  // Jazba UI (the official design system) on every page, existing and future, even before sign-in
  if (!document.querySelector('link[href$="jazba.css"]')) { const jz = document.createElement("link"); jz.rel = "stylesheet"; jz.href = BASE + "jazba.css"; document.head.append(jz); }
  // the Jazba look on every portal: maps the portal's own colour/font settings (never on the main page)
  if (document.documentElement.dataset.jzPage !== "hub" && !document.querySelector('link[href$="jazba-portals.css"]')) { const jp = document.createElement("link"); jp.rel = "stylesheet"; jp.href = BASE + "jazba-portals.css"; document.head.append(jp); }
  // the same Jazba frame on every portal (Jazba Portal Standard): top strip + menu + Ctrl+K; the sticky note shows on every page
  if (document.documentElement.dataset.jzPage !== "hub" && !window.JAZBA_SHELL) {
    document.documentElement.dataset.jzShell = "on";
    const js = document.createElement("script"); js.src = BASE + "jazba-shell.js"; js.defer = true; document.head.append(js);
  }
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
  // for the main page's bell button (My desk's note is hidden there)
  window.AKF_DESK = { turnOn: () => turnOn(), isOn: () => "Notification" in window && Notification.permission === "granted",
    portals: () => sb.rpc("core_my_portals").then(r => r.data || []) };   // for the Jazba rail on portals
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
.akd-card{background:var(--n1);border:1px solid var(--n3);border-radius:14px;box-shadow:0 14px 34px -14px rgba(60,50,0,.45);overflow:hidden;transform:rotate(-.6deg)}
.akd-head{display:flex;align-items:center;gap:6px;padding:9px 10px 7px 12px;background:var(--n2);cursor:grab;user-select:none;touch-action:none}
.akd.drag .akd-head{cursor:grabbing} .akd.drag .akd-card{transform:none;box-shadow:0 22px 44px -14px rgba(0,0,0,.45)}
.akd-head b{flex:1;font-size:13.5px} .akd-head button{border:0;background:rgba(255,255,255,.55);border-radius:8px;width:28px;height:26px;cursor:pointer;font-size:14px;color:#5B4B00}
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
      if (r.due) a.append(el("div", "akd-due" + (r.due < today() ? " akd-late" : ""), (r.due < today() ? "Overdue · " : "Due ") + fmt(r.due)));
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
    return ("Notification" in window && Notification.permission === "granted") ? ["🔔 Notifications on", true] : ["🔕 Turn on notifications", false];
  }
  function paint() {
    if (!me) { if (root) root.remove(); root = null; return; }
    if (document.documentElement.dataset.desk === "off") return;   // a page may opt out with data-desk="off"; bell and push keep running
    if (!root) {
      const st = el("style"); st.textContent = CSS; document.head.appendChild(st);
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
    const row = (x) => ({ text: (x.id ? x.id + " · " : "") + String(x.title || x.text || "").slice(0, 120), due: x.plannedDate || x.due || "", open: x.title ? String(x.key || "") : "view:myspace" });
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
  function expired(s, now) {
    let t = 0;   // when THIS session signed in: the token's amr timestamp (per device), else the account's last sign-in
    try { const c = JSON.parse(atob(s.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); t = (((c.amr || [])[0] || {}).timestamp || 0) * 1000; } catch (_) {}
    t = t || Date.parse(s.user && s.user.last_sign_in_at) || 0; if (!t) return false;
    const pk = new Date(now + 5 * HOUR), six = Date.UTC(pk.getUTCFullYear(), pk.getUTCMonth(), pk.getUTCDate(), 13);   // 18:00 PKT = 13:00 UTC
    return now - t > 10 * HOUR || (now >= six && t < six);
  }
  let leaving = false;
  async function signOutNow() {
    if (leaving) return; leaving = true;
    await sb.auth.signOut({ scope: "local" }).catch(() => {}); try { localStorage.removeItem("akf-portals-auth"); } catch (_) {}
    if (document.visibilityState === "visible") alert("You have been signed out (sign-ins end at 6 PM and after 10 hours). Please sign in again.");
    location.href = BASE;
  }
  async function checkExpiry() {
    const { data: s } = await sb.auth.getSession().catch(() => ({ data: {} }));
    if (s && s.session && expired(s.session, Date.now())) { signOutNow(); return true; }
    return false;
  }
  setInterval(checkExpiry, 60000);   // also in background tabs, so 6 PM is on time

  let saved = false;
  async function tick() {
    const { data: s } = await sb.auth.getSession().catch(() => ({ data: {} }));
    const u = s && s.session && s.session.user;
    if (!u) { me = null; paint(); return; }
    if (expired(s.session, Date.now())) { signOutNow(); return; }
    if (!me || me.id !== u.id) { me = { id: u.id, email: String(u.email || "").toLowerCase() }; data = null; paint(); }
    load().catch(() => {});
    if (!saved && canPush && Notification.permission === "granted") { saved = true; subscribe().catch(() => { saved = false; }); }
  }
  // every 5 s until someone signs in, then every 2 minutes (only while the page is on screen)
  const start = () => (document.visibilityState === "visible" ? tick() : Promise.resolve()).catch(() => {}).finally(() => setTimeout(start, me ? 120000 : 5000));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
