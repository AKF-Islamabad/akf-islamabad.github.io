/* Alkhidmat Foundation Islamabad — main page → Settings → "Assistance Management" (Super Admin only).
   The Assistance portal has no settings page of its own (house rule: one Settings place). Its settings are kept in the
   portal's own table (public.assistance_rows, collection "config", id "settings") so that every Assistance user can
   read them; only the Super Admin may change them (checked by erp/supabase/portals/assistance.sql, which also checks
   the shape of what is saved). Who approves an application is set under Settings → Approval matrix → Assistance.
   Loaded by the main page, which calls render(box, api) with api = { sb, el, icon, toast, fail, q, showLoader, hideLoader, saveGlobal }. */
(function () {
  "use strict";
  const SLA = [["dept", "Department review (Department Head)"], ["director", "Director review"], ["rm", "RM recommendation"], ["president", "President approval"],
    ["exec", "Finance payment / Store issue"], ["returned", "Returned to Front Desk for correction"], ["other", "Any extra approval step of the matrix"]];
  const EVENTS = [
    ["submitted", "Application registered", "Front Desk submits a new application", false, true],
    ["assigned", "Case arrives in an inbox", "A case moves to the next person", true, false],
    ["returned", "Returned for correction", "An approver sends a case back", true, true],
    ["approved", "Approved by President", "The President approves", true, true],
    ["rejected", "Rejected", "An approver rejects a case", true, true],
    ["completed", "Assistance delivered", "Finance or Store closes the case", true, true],
    ["overdue", "Past the time limit", "A case stays at one stage longer than allowed", true, false]];
  const PLACEHOLDERS = "{name} {id} {department} {stage} {amountText} {reason} {days} {limit} {helpline}";
  /* the database refuses < > " ' ` and \ in any assistance text, so they are replaced by look-alikes here */
  const MAP = { "<": "‹", ">": "›", '"': "”", "'": "’", "`": "ʼ", "\\": "/" };
  const clean = s => String(s == null ? "" : s).replace(/[<>"'`\\]/g, c => MAP[c]).trim();
  const lines = t => Array.from(new Set(String(t || "").split(/\r?\n|;/).map(clean).filter(Boolean)));

  async function render(box, api) {
    const { sb, el, toast, fail, q } = api;
    box.replaceChildren(el("p", { class: "muted small", text: "Loading the assistance settings…" }));
    let cur, depts = [];
    try {
      cur = await q(sb.rpc("assistance_settings_public"));
      if (!cur) throw new Error("no settings");
      depts = await q(sb.from("core_departments").select("code,name").order("name"));
    } catch (e) {
      box.replaceChildren(el("p", { class: "muted", text: "Assistance Management is not set up in the database yet. Publish it first (AKF-PORTALS.cmd → 2  Publish changes)." }));
      return;
    }
    const card = (title, sub, ...kids) => el("div", { class: "card", style: "padding:16px;display:grid;gap:12px" }, el("h3", { style: "margin:0;font-size:16px", text: title }), sub ? el("p", { class: "small muted", text: sub }) : null, ...kids);
    const lab = (label, input) => el("label", { class: "f" }, label, input);
    const inp = (v, max, extra) => el("input", Object.assign({ class: "input", value: String(v == null ? "" : v), maxlength: max || 120 }, extra || {}));
    const area = (v, rows, max) => { const t = el("textarea", { class: "input", rows: rows || 3, maxlength: max || 400, style: "resize:vertical;font:inherit" }); t.value = v || ""; return t; };
    const chk = on => { const c = el("input", { type: "checkbox" }); c.checked = !!on; return c; };
    const codeSel = v => { const s = el("select", { class: "input", "aria-label": "Main-page department" }, el("option", { value: "", text: "— not linked —" }), depts.map(d => el("option", { value: d.code, text: d.name + " (" + d.code + ")" }))); s.value = v || ""; return s; };

    // 1. departments and categories, director availability
    const D = (cur.depts || []).map(d => ({ n: d.n, code: d.code || "", director: d.director !== false, cats: (d.cats || []).join("\n") }));
    const wasOn = Object.fromEntries(D.map(d => [d.n, d.director]));
    const rows = el("tbody");
    const drawDepts = () => rows.replaceChildren(...D.map((d, i) => {
      const n = inp(d.n, 60, { "aria-label": "Department" }); n.addEventListener("input", () => { d.n = n.value; });
      const code = codeSel(d.code); code.addEventListener("change", () => { d.code = code.value; });
      const dir = chk(d.director); dir.addEventListener("change", () => { d.director = dir.checked; });
      const cats = area(d.cats, 4, 3000); cats.setAttribute("aria-label", "Categories, one per line"); cats.addEventListener("input", () => { d.cats = cats.value; });
      const rm = el("button", { class: "btn ghost sm", type: "button", text: "Remove", onclick: () => { if (confirm("Remove the department " + (d.n || "") + "? Existing applications keep their department.")) { D.splice(i, 1); drawDepts(); } } });
      return el("tr", {}, el("td", {}, n), el("td", {}, code), el("td", {}, el("label", { class: "row small" }, dir, "Available")), el("td", { style: "min-width:220px" }, cats), el("td", {}, rm));
    }));
    drawDepts();
    const addDept = el("button", { class: "btn ghost sm", type: "button", text: "Add a department", onclick: () => { D.push({ n: "", code: "", director: true, cats: "" }); drawDepts(); } });

    // 2. time limits
    const S = Object.assign({}, cur.sla || {});
    const slaIn = {}; SLA.forEach(([k]) => { slaIn[k] = inp(S[k] == null ? 3 : S[k], 2, { type: "number", min: 1, max: 60 }); });

    // 3. messages
    const T = JSON.parse(JSON.stringify(cur.templates || {}));
    const tplBox = el("div", { style: "display:grid;gap:14px" }, EVENTS.map(([k, l, when, staff, sms]) => {
      const t = T[k] = T[k] || {};
      const chan = (kind, label) => {
        const on = chk(t[kind + "On"]), txt = area(t[kind], 2, 400);
        on.addEventListener("change", () => { t[kind + "On"] = on.checked; }); txt.addEventListener("input", () => { t[kind] = txt.value; });
        return el("div", { style: "display:grid;gap:6px" }, el("label", { class: "row small" }, on, label), txt);
      };
      return el("div", { style: "border-top:1px solid var(--line);padding-top:12px;display:grid;gap:8px" }, el("b", { text: l }), el("span", { class: "small muted", text: when }),
        el("div", { class: "grid2" }, staff ? chan("staff", "Staff notification (bell) on") : el("span"), sms ? chan("sms", "Message to the applicant on") : el("span")));
    }));
    const helpline = inp(cur.helpline, 40);

    // 4. documents, payment modes, funds
    const slots = area((cur.docSlots || []).map(s => [s.l, s.req ? "required" : "optional", s.hint || ""].join(" | ")).join("\n"), 4, 2000);
    const pay = area((cur.payModes || []).join("\n"), 5, 500), funds = area((cur.funds || []).join("\n"), 4, 500);

    const save = el("button", { class: "btn", type: "button", text: "Save assistance settings" });
    box.replaceChildren(
      el("p", { class: "muted small", text: "Used by Assistance Management. Who approves an application (and from which amount an extra approval is needed) is set under Approval matrix → Assistance. People, approval roles (Front Desk Officer, HOD = Department Head, Department Director, Regional Manager, President, Finance, Store Officer) and tab ticks are set under People & access." }),
      card("Departments and categories", "Link each department to a main-page department: its Department Head and Director (People & access → department) then see its cases. A department whose director is unavailable skips the director step; cases waiting for that director move on when you save.",
        el("div", { class: "tblwrap" }, el("table", {}, el("thead", {}, el("tr", {}, ["Department", "Main-page department", "Director", "Categories (one per line)", ""].map(t => el("th", { text: t })))), rows)), el("div", { class: "row" }, addDept)),
      card("Time limits", "Days allowed at each stage. A case that stays longer is shown as overdue and its owner gets an alert.",
        el("div", { class: "grid2" }, SLA.map(([k, l]) => lab(l + " (days)", slaIn[k])))),
      card("Notification messages", "Placeholders: " + PLACEHOLDERS + ". There is no SMS service: messages to applicants appear in the portal under Messages to applicants, and staff send them by phone.",
        lab("Helpline number used in messages", helpline), tplBox),
      card("Documents, payment modes and funds", "Document slots: one per line as  name | required or optional | hint. The signed paper form is usually the only required document. Files are PDF, JPG or PNG up to 5 MB.",
        lab("Document slots on the application form", slots), el("div", { class: "grid2" }, lab("Payment modes (one per line)", pay), lab("Funds (one per line)", funds))),
      el("div", { class: "row" }, save));

    save.addEventListener("click", async () => {
      const outDepts = D.map(d => ({ n: clean(d.n), code: d.code || "", director: !!d.director, cats: lines(d.cats).slice(0, 40) }));
      if (!outDepts.length || outDepts.some(d => d.n.length < 2 || d.n.length > 60 || !d.cats.length)) return toast("Every department needs a name and at least one category", true);
      if (new Set(outDepts.map(d => d.n.toLowerCase())).size !== outDepts.length) return toast("Two departments have the same name", true);
      if (outDepts.some(d => d.cats.some(c => c.length < 2 || c.length > 80))) return toast("Each category is 2 to 80 characters", true);
      const sla = {}; for (const [k, l] of SLA) { const v = parseInt(slaIn[k].value, 10); if (!(v >= 1 && v <= 60)) return toast(l + ": 1 to 60 days", true); sla[k] = v; }
      const templates = {}; for (const [k] of EVENTS) { const t = T[k] || {}, o = {}; ["staffOn", "smsOn"].forEach(x => { if (x in t) o[x] = !!t[x]; }); ["staff", "sms"].forEach(x => { if (x in t) o[x] = clean(t[x]).slice(0, 400); }); templates[k] = o; }
      // a slot keeps its key when its name is unchanged (saved documents point to the key); new slots get doc1, doc2 …
      const oldKey = Object.fromEntries((cur.docSlots || []).map(s => [String(s.l).toLowerCase(), s.k])), used = new Set();
      const docSlots = lines(slots.value.replace(/;/g, ",")).map(l => { const [name, req, hint] = l.split("|").map(x => clean(x));
        let k = oldKey[String(name).toLowerCase()]; if (!k || used.has(k)) { let i = 1; while (used.has("doc" + i) || Object.values(oldKey).includes("doc" + i) && oldKey[String(name).toLowerCase()] !== "doc" + i) i++; k = "doc" + i; }
        used.add(k); return { k, l: name, req: /^req/i.test(req || ""), hint: (hint || "").slice(0, 120) }; });
      if (!docSlots.length || docSlots.length > 10 || docSlots.some(s => s.l.length < 2 || s.l.length > 60)) return toast("Keep 1 to 10 document slots, each with a name", true);
      const payModes = lines(pay.value), fundList = lines(funds.value);
      if (!payModes.length || payModes.length > 10 || payModes.some(x => x.length < 2 || x.length > 40)) return toast("Keep 1 to 10 payment modes", true);
      if (fundList.length > 20) return toast("Keep at most 20 funds", true);
      const data = { depts: outDepts, sla, templates, helpline: clean(helpline.value).slice(0, 40), docSlots, payModes, funds: fundList };
      save.disabled = true;
      try {
        const up = await q(sb.from("assistance_rows").update({ data }).eq("collection", "config").eq("id", "settings").select("id"));
        if (!up || !up.length) await q(sb.from("assistance_rows").insert({ collection: "config", id: "settings", data }).select("id"));
        let moved = 0;
        for (const d of outDepts) if (!d.director && wasOn[d.n] !== false) { moved += (await q(sb.rpc("assistance_skip_director", { p_dept: d.n }))) || 0; wasOn[d.n] = false; }
        outDepts.forEach(d => { wasOn[d.n] = d.director; });
        await sb.from("assistance_rows").insert({ collection: "audit", id: "A" + Date.now() + Math.random().toString(36).slice(2, 8), data: { action: "SETTINGS_UPDATED", target: "assistance settings", detail: outDepts.length + " departments, " + docSlots.length + " document slots, " + payModes.length + " payment modes" } });
        toast("Assistance settings saved" + (moved ? " · " + moved + " case(s) waiting for an unavailable director moved on" : "") + ". Open Assistance pages pick them up on their next refresh.");
      } catch (e) { fail(e, "The assistance settings were not saved"); }
      finally { save.disabled = false; }
    });
  }

  window.AKF_SETTINGS_PANELS = (window.AKF_SETTINGS_PANELS || []).concat([{
    key: "assistance", title: "Assistance Management", icon: "helping",
    desc: "Departments & categories, director availability, time limits, messages, documents, payment modes",
    render
  }]);
})();
