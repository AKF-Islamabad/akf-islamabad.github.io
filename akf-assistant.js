/* Alkhidmat Islamabad — Alkhidmat AI: the AI assistant that EVERY portal must have (rule: SECURITY-PROTOCOL.md §9).
   Served once from the main site, like akf-gate.js. A portal loads it with
     <script src="../akf-assistant.js"></script>        (the main page: src="akf-assistant.js")
   and, after sign-in, starts it once:
     AKF_ASSISTANT({ sb, portal: "Fleet & Ambulance", user: "Ayesha",
                     context: () => "short summary of what this person sees (no names, CNIC, phones)",
                     hints: ["What needs my attention?", "Explain the approval steps"],
                     local: q => null })    // optional: an offline answer when the AI is not switched on
   Questions go to the Edge Function "ai-chat", which holds the Google Gemini key on the server.
   No message limit in the portal. The chat is kept in this tab only (never saved). */
(function () {
  "use strict";
  if (window.AKF_ASSISTANT) return;
  const CSS = `
.kai-fab{position:fixed;right:20px;bottom:20px;z-index:8000;display:flex;align-items:center;gap:9px;height:52px;padding:0 20px 0 16px;border:0;border-radius:99px;cursor:pointer;color:#fff;font:700 14.5px/1 "Segoe UI Variable Text","Segoe UI",Inter,system-ui,sans-serif;
  background:linear-gradient(135deg,#1A66CC 0%,#0B51A7 45%,#06368A 100%);box-shadow:0 14px 30px -10px rgba(11,81,167,.7);transition:transform .3s cubic-bezier(.34,1.56,.64,1),box-shadow .3s}
.kai-fab:hover{transform:translateY(-2px) scale(1.03)} .kai-fab svg{width:20px;height:20px}
.kai-fab::after{content:"";position:absolute;inset:-4px;border-radius:inherit;border:2px solid rgba(25,194,174,.55);animation:kaiPulse 2.6s ease-out infinite;pointer-events:none}
@keyframes kaiPulse{0%{transform:scale(.92);opacity:1}100%{transform:scale(1.25);opacity:0}}
.kai-panel{position:fixed;right:20px;bottom:20px;z-index:8001;width:min(430px,calc(100vw - 24px));height:min(640px,calc(100vh - 40px));display:flex;flex-direction:column;overflow:hidden;
  border-radius:22px;background:var(--card,var(--surface,#fff));color:var(--ink,var(--text,#0B1B33));border:1px solid var(--line,var(--border,#E3E9F2));box-shadow:0 30px 80px -20px rgba(5,25,70,.55);animation:kaiPop .35s cubic-bezier(.34,1.56,.64,1);
  font:14.5px/1.5 "Segoe UI Variable Text","Segoe UI",Inter,system-ui,sans-serif}
@keyframes kaiPop{from{opacity:0;transform:translateY(16px) scale(.96)}}
.kai-head{display:flex;align-items:center;gap:10px;padding:14px 12px 14px 16px;color:#fff;background:linear-gradient(120deg,#0B51A7 0%,#0A3F95 45%,#062E73 100%);position:relative;overflow:hidden}
.kai-head::after{content:"";position:absolute;width:180px;height:180px;right:-50px;top:-90px;border-radius:50%;background:#19C2AE;filter:blur(36px);opacity:.5;pointer-events:none}
.kai-head .ic{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.16);flex:none;position:relative;z-index:1}
.kai-head .t{flex:1;min-width:0;position:relative;z-index:1} .kai-head b{display:block;font-size:16px;letter-spacing:-.01em} .kai-head small{display:block;font-size:12px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kai-head button{position:relative;z-index:1;width:34px;height:34px;border:0;border-radius:10px;background:transparent;color:#fff;cursor:pointer;display:grid;place-items:center} .kai-head button:hover{background:rgba(255,255,255,.16)}
.kai-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:var(--bg,#F3F6FB)}
.kai-msg{max-width:90%;padding:10px 13px;border-radius:14px;overflow-wrap:anywhere;animation:kaiIn .3s ease both}
@keyframes kaiIn{from{opacity:0;transform:translateY(6px)}}
.kai-msg.bot{align-self:flex-start;background:var(--card,var(--surface,#fff));border:1px solid var(--line,var(--border,#E3E9F2));border-bottom-left-radius:5px}
.kai-msg.me{align-self:flex-end;color:#fff;background:linear-gradient(135deg,#1A66CC,#0B51A7);border-bottom-right-radius:5px}
.kai-msg ul{margin:4px 0;padding-left:18px} .kai-msg li{margin:2px 0} .kai-msg p{margin:0 0 6px} .kai-msg p:last-child{margin:0}
.kai-msg code{font:12.5px ui-monospace,Consolas,monospace;background:rgba(11,81,167,.08);padding:1px 5px;border-radius:5px}
.kai-msg.note{align-self:stretch;max-width:none;font-size:13px;color:var(--muted,#3A4B66);background:color-mix(in srgb,#E7A93B 14%,transparent);border:1px solid color-mix(in srgb,#E7A93B 40%,transparent)}
.kai-dots{display:inline-flex;gap:4px} .kai-dots i{width:7px;height:7px;border-radius:50%;background:#8797AF;animation:kaiDot 1s infinite} .kai-dots i:nth-child(2){animation-delay:.15s} .kai-dots i:nth-child(3){animation-delay:.3s}
@keyframes kaiDot{0%,80%,100%{opacity:.3}40%{opacity:1}}
.kai-chips{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;padding:8px 14px 2px;background:var(--card,var(--surface,#fff));border-top:1px solid var(--line,var(--border,#E3E9F2))}
.kai-chips[hidden]{display:none!important} .kai-chips button{flex:none;width:auto;white-space:nowrap;margin:0;line-height:1.3;border:1px solid var(--line,var(--border,#CDD7E5));background:var(--card,var(--surface,#fff));color:inherit;border-radius:99px;padding:6px 11px;font:inherit;font-size:12.5px;cursor:pointer} .kai-chips button:hover{border-color:#1A66CC;color:#0B51A7}
.kai-in{display:flex;gap:8px;padding:10px 14px 6px;background:var(--card,var(--surface,#fff))}
.kai-in textarea{flex:1;resize:none;height:46px;max-height:140px;overflow-y:hidden;border:1px solid var(--line,var(--border,#CDD7E5));border-radius:12px;padding:12px;font:inherit;background:var(--card,var(--surface,#fff));color:inherit}
.kai-in textarea:focus{outline:none;border-color:#1A66CC;box-shadow:0 0 0 4px rgba(26,102,204,.16)}
.kai-in button{width:46px;height:46px;border:0;border-radius:12px;color:#fff;cursor:pointer;background:linear-gradient(135deg,#1A66CC,#0B51A7);display:grid;place-items:center} .kai-in button:disabled{opacity:.5;cursor:default}
.kai-setup{margin-top:8px;border:0;border-radius:10px;padding:7px 12px;font:inherit;font-size:13px;font-weight:700;color:#fff;cursor:pointer;background:linear-gradient(135deg,#1A66CC,#0B51A7)}
.kai-foot{padding:0 14px 10px;font-size:11.5px;color:var(--faint,#6B7A93);background:var(--card,var(--surface,#fff))}
@media (max-width:640px){ .kai-fab{right:14px;bottom:76px;width:54px;padding:0;justify-content:center} .kai-fab span{display:none} .kai-panel{right:8px;left:8px;bottom:8px;width:auto;height:calc(100vh - 16px);border-radius:18px} }
.kai-portals{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px} .kai-portals button{border:1px solid var(--line,var(--border,#CDD7E5));background:var(--card,var(--surface,#fff));color:#0B51A7;border-radius:99px;padding:6px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer} .kai-portals button:hover{border-color:#1A66CC;background:rgba(26,102,204,.06)}
.kai-fab[hidden],.kai-panel[hidden]{display:none!important}
@media print{ .kai-fab,.kai-panel{display:none!important} }
@media (prefers-reduced-motion: reduce){ .kai-fab::after,.kai-panel,.kai-msg{animation:none!important} }`;
  const NS = "http://www.w3.org/2000/svg";
  const ICON = { spark: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z", x: "M18 6L6 18M6 6l12 12", send: "M22 2L11 13M22 2l-7 20-4-9-9-4z", undo: "M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" };
  const svg = n => { const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor"); s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round"); s.setAttribute("width", "18"); s.setAttribute("height", "18"); s.setAttribute("aria-hidden", "true"); const p = document.createElementNS(NS, "path"); p.setAttribute("d", ICON[n]); s.append(p); return s; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  /* safe formatting: the answer is shown as text; only **bold**, `code` and "- " lists are turned into elements */
  function inline(parent, line) {
    for (const part of String(line).split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
      if (!part) continue;
      if (/^\*\*[^*]+\*\*$/.test(part)) parent.append(el("b", "", part.slice(2, -2)));
      else if (/^`[^`]+`$/.test(part)) parent.append(el("code", "", part.slice(1, -1)));
      else parent.append(document.createTextNode(part));
    }
  }
  function format(text) {
    const box = el("div"); let ul = null;
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.replace(/^#{1,6}\s+/, "");
      if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) { if (!ul) { ul = el("ul"); box.append(ul); } const li = el("li"); inline(li, line.replace(/^\s*([-*•]|\d+[.)])\s+/, "")); ul.append(li); continue; }
      ul = null; if (!line.trim()) continue;
      const p = el("p"); if (/^#{1,6}\s/.test(raw)) { const b = el("b"); inline(b, line); p.append(b); } else inline(p, line); box.append(p);
    }
    return box;
  }
  window.AKF_ASSISTANT = function (o) {
    o = o || {};
    if (document.querySelector(".kai-fab")) return;
    const st = document.createElement("style"); st.textContent = CSS; document.head.append(st);
    const portal = o.portal || "Alkhidmat Islamabad portals", hints = o.hints || ["What can I do in this portal?", "What needs my attention?", "Explain the approval steps"];
    const history = [];   // this tab only, never saved
    const fab = el("button", "kai-fab"); fab.type = "button"; fab.setAttribute("aria-label", "Open Alkhidmat AI assistant"); fab.append(svg("spark"), el("span", "", "Ask Alkhidmat AI"));
    let panel = null, log, input, sendBtn, chips, busy = false;
    const add = (who, text, cls) => { const m = el("div", "kai-msg " + (cls || (who === "me" ? "me" : "bot"))); if (who === "me") m.textContent = text; else m.append(format(text)); log.append(m); log.scrollTop = log.scrollHeight; return m; };
    /* the portal guide: the person's portals and tabs, straight from the database (instant, no AI and no key needed) */
    let guideP = null;
    const loadGuide = () => guideP || (guideP = (async () => {
      if (!o.sb || !o.sb.rpc) return [];
      const { data } = await o.sb.rpc("core_my_portals");
      return Promise.all((data || []).map(async p => { const t = await o.sb.rpc("core_my_tabs", { p_module: p.key }); return { name: p.name, description: p.description || "", tabs: t.data || [] }; }));
    })().catch(() => { guideP = null; return []; }));
    const ACT = { view: "see", add: "add", edit: "edit", delete: "delete", approve: "approve", export: "export" };
    const portalText = p => `**${p.name}**${p.description ? " — " + p.description : ""}\n` + (p.tabs.length
      ? "Your tabs:\n" + p.tabs.map(t => `- **${t.name}**${t.description ? " — " + t.description : ""}${(t.actions || []).length ? " (you can " + t.actions.map(a => ACT[a] || a).join(", ") + ")" : ""}`).join("\n")
      : "You have no tabs here yet. Ask the Super Admin for access.");
    /* typed question without the AI: the tabs whose name or description share words with it */
    const STOP = new Set("the how what where which can for and does this that with who when you are tab tabs portal portals do i my me is to in of a an".split(" "));
    const fromGuide = (g, q) => {
      const w = (String(q).toLowerCase().match(/[a-z0-9؀-ۿ]{3,}/g) || []).filter(x => !STOP.has(x)); if (!w.length) return "";
      const hits = [];
      g.forEach(p => p.tabs.forEach(t => { const txt = (p.name + " " + t.name + " " + (t.description || "")).toLowerCase(); const n = w.filter(x => txt.includes(x) || txt.includes(x.replace(/s$/, ""))).length; if (n) hits.push([n, `- **${p.name} → ${t.name}**${t.description ? " — " + t.description : ""}`]); }));
      return hits.sort((a, b) => b[0] - a[0]).slice(0, 4).map(h => h[1]).join("\n");
    };
    const welcome = () => {
      const m = add("bot", `Assalam o Alaikum${o.user ? " " + o.user : ""}! I'm **Alkhidmat AI**. Tap a portal to see what you can do there, or type a question about the ERP portals.`);
      loadGuide().then(g => { if (!g.length) return; const row = el("div", "kai-portals");
        g.forEach(p => { const b = el("button", "", p.name); b.type = "button"; b.addEventListener("click", () => { add("me", p.name); add("bot", portalText(p)); }); row.append(b); });
        m.append(row); log.scrollTop = log.scrollHeight; });
    };
    async function ask(text) {
      const q = String(text || input.value).trim(); if (!q || busy) return;
      input.value = ""; input.style.height = "46px"; if (chips) chips.hidden = true; add("me", q); busy = true; sendBtn.disabled = true;
      const wait = el("div", "kai-msg bot"); const d = el("span", "kai-dots"); d.append(el("i"), el("i"), el("i")); wait.append(d); log.append(wait); log.scrollTop = log.scrollHeight;
      let answer = null, note = null, off = false;
      try {
        if (!o.sb || !o.sb.functions) throw { code: "offline" };
        let ctx = ""; try { ctx = typeof o.context === "function" ? String(o.context() || "") : String(o.context || ""); } catch (e) { ctx = ""; }
        const { data, error } = await o.sb.functions.invoke("ai-chat", { body: { portal, question: q, history: history.slice(-10), context: ctx.slice(0, 10000) } });
        if (error) { let b = {}; try { b = await error.context.json(); } catch (e) { } throw { code: b.code || "", message: b.error || "", ref: b.ref || "" }; }
        answer = (data && data.answer) || "";
      } catch (e) {
        const local = typeof o.local === "function" ? (() => { try { return o.local(q); } catch (x) { return null; } })() : null;
        const why = e && e.code === "not_configured" ? (e.message || "The AI assistant is not switched on yet.") : e && e.code === "offline" ? "" : (e && e.message) || "The AI service could not be reached. Please try again.";
        const g = local ? "" : fromGuide(await loadGuide(), q);
        if (local) { answer = local; if (why) note = why + " Meanwhile, this answer comes from the portal's own data."; }
        else if (g) { answer = "From the portal guide:\n" + g; if (why) note = why; }
        else answer = why || "The AI assistant is not available here.";
        if (e && e.ref && e.code !== "not_configured") note = (note ? note + " " : "") + `(ref ${e.ref})`;
        off = e && e.code === "not_configured";
      }
      wait.remove(); const m = add("bot", answer); if (note) add("bot", note, "note");
      /* the Super Admin can switch it on straight away (the page passes onSetup only for the Super Admin) */
      if (off && typeof o.onSetup === "function") { const b = el("button", "kai-setup", "Open AI settings"); b.type = "button"; b.addEventListener("click", () => { panel.hidden = true; fab.hidden = false; o.onSetup(); }); m.append(b); }
      history.push({ role: "user", text: q }, { role: "assistant", text: answer });
      busy = false; sendBtn.disabled = false; input.focus();
    }
    function open() {
      if (panel) { panel.hidden = false; fab.hidden = true; input.focus(); return; }
      panel = el("section", "kai-panel"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Alkhidmat AI assistant");
      const head = el("div", "kai-head"), ic = el("span", "ic"); ic.append(svg("spark"));
      const t = el("div", "t"); t.append(el("b", "", "Alkhidmat AI"), el("small", "", `${portal} · help with the ERP portals`));
      const clear = el("button"); clear.type = "button"; clear.title = "New chat"; clear.setAttribute("aria-label", "Start a new chat"); clear.append(svg("undo"));
      const close = el("button"); close.type = "button"; close.title = "Close"; close.setAttribute("aria-label", "Close the assistant"); close.append(svg("x"));
      head.append(ic, t, clear, close);
      log = el("div", "kai-log"); log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite");
      chips = el("div", "kai-chips"); hints.slice(0, 6).forEach(h => { const b = el("button", "", h); b.type = "button"; b.addEventListener("click", () => ask(h)); chips.append(b); });
      const form = el("form", "kai-in"); input = el("textarea"); input.rows = 1; input.maxLength = 6000; input.placeholder = "Ask about any portal…"; input.setAttribute("aria-label", "Your question");
      sendBtn = el("button"); sendBtn.type = "submit"; sendBtn.setAttribute("aria-label", "Send"); sendBtn.append(svg("send")); form.append(input, sendBtn);
      const foot = el("div", "kai-foot", "Answers can be wrong: check important figures. Don't type passwords, CNIC or bank numbers.");
      panel.append(head, log, chips, form, foot); document.body.append(panel);
      form.addEventListener("submit", e => { e.preventDefault(); ask(); });
      input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } });
      input.addEventListener("input", () => { input.style.height = "46px"; input.style.height = Math.min(140, input.scrollHeight) + "px"; });
      clear.addEventListener("click", () => { history.length = 0; log.replaceChildren(); chips.hidden = false; welcome(); });
      close.addEventListener("click", () => { panel.hidden = true; fab.hidden = false; fab.focus(); });
      panel.addEventListener("keydown", e => { if (e.key === "Escape") close.click(); });
      welcome(); fab.hidden = true; input.focus();
    }
    fab.addEventListener("click", open);
    document.body.append(fab);
    return { open, ask };
  };
})();
