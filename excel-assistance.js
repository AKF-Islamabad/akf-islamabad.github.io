/* Alkhidmat Islamabad — main page → Excel import & export → "Assistance Management" (Super Admin only).
   Registers the Assistance sheets for akf-excel.js (the one Excel format, SECURITY-PROTOCOL.md §10):
     Departments (import + export) · Applications (download only) · Applicant details (download only)
   Applications are DOWNLOAD ONLY: an application is numbered, routed and signed step by step by the server
   (erp/supabase/portals/assistance.sql), so old paper cases cannot be brought in as if they had been approved.
   Register them through the portal instead. The departments list lives in the settings record
   (public.assistance_rows, collection "config", id "settings"); save() writes that record exactly as the
   main page's Settings → Assistance Management does, so the database guard checks it (Super Admin only, shape).
   A blank cell on an existing department keeps what is saved; a filled cell changes it. */
(function () {
  "use strict";
  /* the database refuses < > " ' ` and \ in any assistance text: replaced by look-alikes, as the portal does */
  const MAP = { "<": "‹", ">": "›", '"': "”", "'": "’", "`": "ʼ", "\\": "/" };
  const cleanStr = s => String(s == null ? "" : s).replace(/[<>"'`\\]/g, c => MAP[c]).trim();
  const low = s => cleanStr(s).toLowerCase();
  const has = v => v !== "" && v != null;
  const STAGE = { dept: "Department review", director: "Director review", rm: "RM recommendation", president: "President approval", returned: "Returned for correction", rejected: "Rejected", closed: "Completed" };
  const stage = a => a.status === "exec" ? (a.type === "inkind" ? "Store – issue items" : "Finance – disbursement") : STAGE[a.status] || (((a.flow || []).find(s => s.key === a.status) || {}).label || a.status || "");
  const rid = () => { const a = new Uint8Array(6); crypto.getRandomValues(a); return [...a].map(x => x.toString(36).padStart(2, "0")).join("").slice(0, 8); };
  function plainErr(e) {
    const m = (e && e.message) || "", plain = m.length < 300 && !/relation|column|function|syntax|policy|violates|jsonb|null value/i.test(m);
    if (e && ["22023", "23514", "P0001", "42501"].includes(e.code) && plain) return m;
    if (e && (e.code === "42501" || /policy|violates row/i.test(m))) return "The database did not allow saving this row";
    const ref = rid().slice(0, 6).toUpperCase(); console.error("[excel assistance ref " + ref + "]", e && e.code); return "Not saved (ref " + ref + ")";
  }
  const cats = v => Array.from(new Set(String(v || "").split(/[;\n]/).map(cleanStr).filter(Boolean)));

  async function load(sb) {
    const { data: settings, error: se } = await sb.rpc("assistance_settings_public");
    if (se || !settings) throw new Error("The Assistance settings could not be read. Is Assistance Management set up in the database?");
    const { data: cd } = await sb.from("core_departments").select("code,name");
    const codes = (cd || []).map(d => d.code);
    const apps = [], pii = {};
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("assistance_rows").select("collection,id,data").in("collection", ["applications", "applicantpii"]).order("collection").order("id").range(from, from + 999);
      if (error) throw new Error("The applications could not be read.");
      (data || []).forEach(r => { if (r.collection === "applications") apps.push(r.data || {}); else pii[r.id] = r.data || {}; });
      if (!data || data.length < 1000) break;
    }
    apps.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    let depts = JSON.parse(JSON.stringify(settings.depts || []));
    const find = n => depts.find(d => low(d.n) === low(n)) || null;

    async function saveDepts(rows) {
      const failed = [], next = JSON.parse(JSON.stringify(depts));
      for (const r of rows) {
        const d = r.data, hit = next.find(x => low(x.n) === low(d.n));
        const o = hit || { n: cleanStr(d.n), code: "", director: true, cats: [] };
        if (has(d.code)) o.code = String(d.code).trim().toUpperCase();
        if (d.director != null) o.director = !!d.director;
        if (has(d.cats)) o.cats = cats(d.cats).slice(0, 40);
        if (!o.cats.length) { failed.push({ row: r.row, msg: "A new department needs at least one category" }); continue; }
        if (!hit) next.push(o);
      }
      const good = rows.filter(r => !failed.some(f => f.row === r.row));
      if (!good.length) return failed;
      const data = Object.assign({}, settings, { depts: next });
      const up = await sb.from("assistance_rows").update({ data }).eq("collection", "config").eq("id", "settings").select("id");
      let err = up.error;
      if (!err && (!up.data || !up.data.length)) err = (await sb.from("assistance_rows").insert({ collection: "config", id: "settings", data }).select("id")).error;
      if (err) return failed.concat(good.map(r => ({ row: r.row, msg: plainErr(err) })));
      // a director switched off: the cases waiting for that director move on (as on the main page's Settings)
      for (const o of next) { const was = depts.find(x => low(x.n) === low(o.n)); if (o.director === false && (!was || was.director !== false)) { const { error } = await sb.rpc("assistance_skip_director", { p_dept: o.n }); if (error) console.warn("[skip director]", error.code); } }
      depts = next; settings.depts = next;
      return failed;
    }

    const sheets = [
      { key: "departments", name: "Departments", about: "Assistance departments, their categories and whether the director is available. A row with a saved name updates it.",
        match: "n", find,
        cols: [{ k: "n", h: "Department", req: true, max: 60, ex: "Health", aka: ["name"] },
          { k: "code", h: "Main-page department code", max: 20, ex: "HEALTH", pattern: /^[A-Za-z0-9_-]{2,20}$/, patternMsg: "must be a department code from the main page, e.g. HEALTH", note: "Links the Department Head and Director (People & access → department). One of: " + codes.join(", "), aka: ["code"] },
          { k: "director", h: "Director available", type: "yesno", note: "No = the director step is skipped for this department", aka: ["director"] },
          { k: "cats", h: "Categories", max: 3000, ex: "Medical treatment; Surgery; Medicines", note: "Separate with ;  (empty = keep the saved categories)", aka: ["categories"] }],
        check: d => (has(d.code) && !codes.includes(String(d.code).toUpperCase()) ? "Department code " + d.code + " is not on the main page" : "")
          || (cats(d.cats).some(c => c.length < 2 || c.length > 80) ? "Each category is 2 to 80 characters" : ""),
        rows: () => depts.map(d => ({ n: d.n, code: d.code, director: d.director !== false, cats: (d.cats || []).join("; ") })) },
      { key: "applications", name: "Applications", about: "Download only: every application with its stage and amounts. Register new cases in the portal.", canImport: false,
        cols: [{ k: "id", h: "Tracking ID" }, { k: "name", h: "Applicant" }, { k: "department", h: "Department" }, { k: "category", h: "Category" }, { k: "type", h: "Type" },
          { k: "amount", h: "Requested (Rs)", type: "number" }, { k: "items", h: "Items requested" }, { k: "rec", h: "Recommended (Rs)", type: "number" }, { k: "approved", h: "Approved (Rs)", type: "number" },
          { k: "paid", h: "Paid (Rs)", type: "number" }, { k: "mode", h: "Payment mode" }, { k: "ref", h: "Cheque / GIN reference" }, { k: "stage", h: "Stage" },
          { k: "created", h: "Registered", type: "date" }, { k: "done", h: "Paid / issued on", type: "date" }, { k: "by", h: "Registered by" }],
        rows: () => apps.map(a => ({ id: a.id, name: a.name, department: a.department, category: a.category, type: a.type === "inkind" ? "In-kind" : "Financial",
          amount: (a.request || {}).amount, items: (a.request || {}).items, rec: (a.rm || {}).amount, approved: a.approvedAmount, paid: (a.execution || {}).amount,
          mode: (a.execution || {}).mode, ref: (a.execution || {}).ref, stage: stage(a), created: String(a.createdAt || "").slice(0, 10), done: (a.execution || {}).date, by: a.createdByName })) },
      { key: "applicants", name: "Applicant details", about: "Download only: CNIC, mobile, address, family and income. Personal data — keep the file safe and delete it after use.", canImport: false,
        cols: [{ k: "id", h: "Tracking ID" }, { k: "name", h: "Applicant" }, { k: "guardian", h: "Father / husband" }, { k: "cnic", h: "CNIC" }, { k: "phone", h: "Mobile" },
          { k: "address", h: "Address" }, { k: "members", h: "Household members", type: "int" }, { k: "housing", h: "House" }, { k: "income", h: "Monthly income (Rs)", type: "number" }, { k: "expenses", h: "Monthly expenses (Rs)", type: "number" }],
        rows: () => apps.filter(a => pii[a.id]).map(a => { const p = pii[a.id], h = p.household || {}; return { id: a.id, name: a.name, guardian: p.guardian, cnic: p.cnic, phone: p.phone, address: p.address, members: h.members, housing: h.housing, income: h.income, expenses: h.expenses }; }) }
    ];
    return {
      sheets,
      save: async (sheet, rows) => ({ failed: sheet.key === "departments" ? await saveDepts(rows) : rows.map(r => ({ row: r.row, msg: "This sheet is download only: register applications in the portal" })) })
    };
  }

  (window.AKF_EXCEL_PORTALS = window.AKF_EXCEL_PORTALS || {}).assistance = { name: "Assistance Management", load };
})();
