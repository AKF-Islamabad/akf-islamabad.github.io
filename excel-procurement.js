/* Alkhidmat Foundation Islamabad — Procurement in the one Excel format (akf-excel.js), for the main page (Super Admin only).
   The main page calls  const book = await AKF_EXCEL_PORTALS.procurement.load(sb)  and hands book.sheets / book.save to AKF_EXCEL.open.
   Sheets:
     Vendors       upload + download. Written exactly as the portal's A.saveVendor writes them: public.portal_rows,
                   collection 'vendors', id = the vendor id ('V-001' …), data = the vendor record; plus one 'audit' row
                   ("Vendor added" / "Vendor updated"). A row updates the vendor with the same name, or else the same NTN.
     Budget lines  upload + download. As A.saveBudget: collection 'budgets', id = project code (data.id = code too),
                   plus an 'audit' row ("Budget line created" / "Budget revised  old → new").
   Users are not here: people are managed on the main page.
   Every write goes to portal_rows, so RLS and the portal_guard trigger still check it. Nothing goes into URLs or browser storage. */
(function () {
  "use strict";
  const PORTALS = window.AKF_EXCEL_PORTALS = window.AKF_EXCEL_PORTALS || {};
  if (PORTALS.procurement) return;

  /* ---- shared with erp/src/portal-app.html (same values) ---- */
  const CATS = ["MED", "FOOD", "NFI", "OFF", "IT", "OTHER"];
  const DEPTS = ["Orphan Care", "Health", "Education", "Disaster", "WASH", "Mawakhat", "Community Service", "Finance", "Admin", "IT", "Media", "Volunteer", "Fundraising", "Qurbani", "Ramadan", "OTHER"];
  const DONORS = ["Orphan Health", "Disaster", "Education", "General Fund", "OTHER"];
  const pad = (n, l = 4) => String(n).padStart(l, "0");
  const nowISO = () => new Date().toISOString();
  const uid = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
  const pkr = n => "PKR " + new Intl.NumberFormat("en-US").format(Math.round(Number(n) || 0));
  const rowKey = (col, item) => { if (!item.id) item.id = col === "budgets" && item.code ? item.code : uid(); return String(item.id); };

  /* ---- the portal's database layer (DB.load / DB.save in portal-app.html), for a few collections ---- */
  async function readRows(sb, cols) {
    let all = [];
    for (let from = 0; ; from += 1000) {
      const r = await sb.from("portal_rows").select("collection,id,data,created_at").in("collection", cols)
        .order("created_at", { ascending: true }).order("collection", { ascending: true }).order("id", { ascending: true }).range(from, from + 999);
      if (r.error) throw r.error;
      all = all.concat(r.data || []);
      if (!r.data || r.data.length < 1000) break;
    }
    const st = { settings: {} }; cols.forEach(c => { if (c !== "settings") st[c] = []; });
    all.forEach(r => { if (r.collection === "settings") st.settings = r.data || {}; else if (st[r.collection] && r.data) st[r.collection].push(r.data); });
    return st;
  }
  async function whoAmI(sb) {
    const { data, error } = await sb.rpc("portal_me");
    if (error) throw error;
    if (!data || !data._id) throw new Error("Your login has no active profile in the Procurement portal, so nothing can be saved. Open the portal once, or check your profile there.");
    return data;
  }
  const snap = (d, cols) => { const m = {}; cols.forEach(c => { m[c] = new Map((d[c] || []).map(i => [rowKey(c, i), JSON.stringify(i)])); }); return m; };
  /* like DB.save: only what changed; a new row whose id someone else used meanwhile stops the save instead of overwriting it */
  async function write(sb, before, d, cols) {
    const ups = [], fresh = {};
    cols.forEach(c => (d[c] || []).forEach(i => { const k = rowKey(c, i), j = JSON.stringify(i); if (before[c].get(k) !== j) { ups.push({ collection: c, id: k, data: i }); if (!before[c].has(k)) (fresh[c] = fresh[c] || []).push(k); } }));
    for (const c of Object.keys(fresh)) for (let i = 0; i < fresh[c].length; i += 200) {
      const r = await sb.from("portal_rows").select("id").eq("collection", c).in("id", fresh[c].slice(i, i + 200));
      if (r.error) throw r.error;
      if ((r.data || []).length) throw new Error("Someone added records in the portal at the same moment. Nothing was saved — upload the file again.");
    }
    if (ups.length) { const { error } = await sb.from("portal_rows").upsert(ups, { onConflict: "collection,id" }); if (error) throw error; }
    return ups.length;
  }
  const plain = e => { const m = String((e && e.message) || ""); return m && m.length < 220 ? m : "Not saved on the server. Try again."; };
  const audit = (d, me, doc, action, comment, dept) => d.audit.unshift({ id: uid(), at: nowISO(), doc, action, comment: comment || "", dept: dept || me.dept || "", by: me.name || "", role: me.role || "", uid: me._id, desig: me.designation || "" });
  const lc = s => String(s == null ? "" : s).trim().toLowerCase();

  /* ---- sheets ---- */
  const VENDOR_COLS = [
    { k: "name", h: "Vendor name", req: true, ex: "Al-Shifa Traders", note: "A row with a vendor name (or NTN) already in the portal updates that vendor" },
    { k: "ntn", h: "NTN", req: true, ex: "1234567-8", pattern: /^\d{7}-\d$/, patternMsg: "must look like 1234567-8", aka: ["ntnno"] },
    { k: "contact", h: "Contact", ex: "0300-1234567", note: "Phone number" },
    { k: "bank", h: "Bank & account", ex: "HBL 1234-5678-9012", aka: ["bankaccount"] },
    { k: "type", h: "Supplies", list: ["Goods", "Services"], ex: "Goods", note: "Empty: Goods", aka: ["suppliesgoodsservices"] },
    { k: "filer", h: "FBR status", list: ["Filer", "Non-Filer"], ex: "Filer", note: "Decides the tax held back (WHT). Empty: Filer", aka: ["fbrstatusfilernonfiler"] },
    { k: "gst", h: "GST registered", type: "yesno", ex: "Yes", note: "Yes = GST is added when a quotation leaves tax out. Empty: Yes", aka: ["gstregisteredyesno"] },
    { k: "category", h: "Category", list: CATS, ex: "MED", note: "Empty: OTHER" },
    { k: "cheque", h: "Cheque copy received", type: "yesno", ex: "Yes", note: "Empty: No", aka: ["chequecopyreceivedyesno"] },
    { k: "address", h: "Address", ex: "Blue Area, Islamabad" },
    { k: "email", h: "E-mail", type: "email", ex: "sales@example.com" }];
  const BUDGET_COLS = [
    { k: "code", h: "Project code", req: true, ex: "DIS-2026-FLD-02", note: "A code already in the portal updates that budget line" },
    { k: "dept", h: "Department", list: DEPTS, ex: "Health", note: "Empty: Admin" },
    { k: "donor", h: "Donor", list: DONORS, ex: "Disaster", note: "Empty: General Fund" },
    { k: "allocated", h: "Allocated (PKR)", req: true, type: "number", min: 1, ex: 500000, aka: ["allocated"] },
    { k: "note", h: "Note", ex: "Flood response phase 2" }];
  const vendorRow = v => ({ name: v.name, ntn: v.ntn, contact: v.contact, bank: v.bank, type: v.type, filer: v.filer === false ? "Non-Filer" : "Filer", gst: v.gstRegistered !== false, category: v.category, cheque: !!v.cheque, address: v.address, email: v.email });
  /* the record the portal keeps; an update keeps every field the file does not have */
  function vendorRec(x, base) {
    const d = x.data, has = k => k in d && d[k] !== "" && d[k] != null, o = base ? { ...base } : { name: "", ntn: "", bank: "", contact: "", type: "Goods", filer: true, gstRegistered: true, cheque: false, category: "OTHER", rating: 3, address: "", email: "" };
    o.name = d.name; o.ntn = d.ntn;
    ["contact", "bank", "address", "email"].forEach(k => { if (k in d) o[k] = d[k] || (base ? "" : o[k]); });
    if (has("type")) o.type = d.type;
    if (has("filer")) o.filer = d.filer !== "Non-Filer";
    if (has("gst")) o.gstRegistered = d.gst !== false;
    if (has("category")) o.category = d.category;
    if (has("cheque")) o.cheque = !!d.cheque;
    return o;
  }

  PORTALS.procurement = {
    name: "Procurement",
    async load(sb) {
      const S = await readRows(sb, ["vendors", "budgets"]);
      const findVendor = (st, name, ntn) => st.vendors.find(v => lc(v.name) === lc(name)) || (ntn ? st.vendors.find(v => v.ntn && v.ntn === ntn) : null) || null;
      const findBudget = (st, code) => st.budgets.find(b => b.code === String(code || "").toUpperCase().trim()) || null;
      const sheets = [
        { key: "vendors", name: "Vendors", about: "One row per supplier or service provider.", match: "name",
          find: v => findVendor(S, v), rows: () => S.vendors.map(vendorRow), cols: VENDOR_COLS },
        { key: "budgets", name: "Budget lines", about: "One row per project code. Requests draw from these lines.", match: "code",
          find: v => findBudget(S, v), rows: () => S.budgets.map(b => ({ code: b.code, dept: b.dept, donor: b.donor, allocated: b.allocated, note: b.note })), cols: BUDGET_COLS }];
      async function save(sheet, rows, progress) {
        const me = await whoAmI(sb);
        const cols = sheet.key === "vendors" ? ["vendors", "audit"] : ["budgets", "audit"];
        const d = await readRows(sb, [sheet.key]); d.audit = [];
        const before = snap(d, cols), failed = [], done = [];
        rows.forEach(x => {
          try {
            if (sheet.key === "vendors") {
              const ex = findVendor(d, x.data.name, x.data.ntn), v = vendorRec(x, ex);
              if (ex) { if (JSON.stringify(ex) === JSON.stringify(v)) return; Object.assign(ex, v); audit(d, me, ex.id, "Vendor updated", v.name); }
              else {
                const n = Math.max(d.vendors.length, ...d.vendors.map(z => +(/^V-(\d+)$/.exec(z.id || "") || [0, 0])[1])) + 1;
                const id = "V-" + pad(n, 3); d.vendors.push({ ...v, id, rating: v.rating || 3 }); audit(d, me, id, "Vendor added", v.name);
              }
            } else {
              const D = x.data, code = String(D.code).toUpperCase().trim(), ex = findBudget(d, code);
              const b = { ...(ex || {}), code, dept: D.dept || (ex && ex.dept) || "Admin", donor: D.donor || (ex && ex.donor) || "General Fund", allocated: Number(D.allocated) || 0, note: "note" in D ? D.note || "" : (ex && ex.note) || "" };
              if (ex) { if (JSON.stringify(ex) === JSON.stringify(b)) return; audit(d, me, code, "Budget revised", `${pkr(ex.allocated)} → ${pkr(b.allocated)}`); Object.assign(ex, b); }
              else { d.budgets.push(b); audit(d, me, code, "Budget line created", pkr(b.allocated)); }
            }
            done.push(x.row);
          } catch (e) { failed.push({ row: x.row, msg: plain(e) }); }
        });
        progress(Math.round(rows.length / 2));
        try { await write(sb, before, d, cols); }
        catch (e) { return { failed: failed.concat(done.map(row => ({ row, msg: plain(e) }))) }; }
        Object.assign(S, await readRows(sb, ["vendors", "budgets"]));
        progress(rows.length);
        return { failed };
      }
      return { sheets, save };
    }
  };
  PORTALS.procurement._test = { VENDOR_COLS, BUDGET_COLS, vendorRec };
})();
