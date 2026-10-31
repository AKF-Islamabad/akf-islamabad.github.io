/* Alkhidmat Foundation Islamabad — Donor Management in the one Excel format (akf-excel.js), for the main page.
   The Super Admin picks "Donor Management" on the main page → Excel import & export; the main page calls
     const book = await AKF_EXCEL_PORTALS.donor.load(sb)      // sb: supabase client, signed in
   and hands book.sheets / book.save (and book.onExport, the audit line) to AKF_EXCEL.open.
   Sheets:
     Donors     upload + download. Saved exactly as the Donor Management portal saves an imported donor:
                public.donor_rows (collection 'donors', id 'AFI-DON-YYYYMM-NNNNN' from donor_reserve('donor')),
                the same record fields, then one 'audit' row (DONORS_IMPORTED). The row rules and the
                guard trigger in erp/supabase/portals/donor.sql still decide.
     Donations  download only. A receipt has a server-checked status, lines, Finance / Store verification,
     Pledges    and printed numbers; old receipts come in only through the portal's Settings → "bring in
                the offline data" (donor_import_rows), so they are never written from here.
   Nothing personal goes into URLs or browser storage; data stays in memory while the window is open. */
(function () {
  "use strict";
  const PORTALS = window.AKF_EXCEL_PORTALS = window.AKF_EXCEL_PORTALS || {};
  if (PORTALS.donor) return;

  /* ---- the portal's own lists and helpers (same values as erp/src/donor-app.html) ---- */
  const CATEGORIES = ["Zakat", "Sadaqah", "Sadaqah Jariyah", "Atiyat (General)", "General", "Lillah", "Fitrana", "Fidya", "Kaffarah", "Qurbani", "Aqiqah", "Waqf"];
  const TITLES_NAME = ["Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "Engr.", "Haji", "M/s"];
  const CHANNELS = ["WhatsApp", "SMS", "Email", "Phone call", "Do not contact"];
  const IN_KIND = "In-kind (goods / items)", PROG_OTHER = "Other (please specify)", BANK_OTHER = "Other bank (please specify)", GENERAL = "General Fund (where most needed)";
  const pad = (n, w) => String(n).padStart(w, "0");
  const todayISO = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2); };
  const digits = s => String(s || "").replace(/\D/g, "");
  const fmtCNIC = s => { const d = digits(s).slice(0, 13); return d.length > 12 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
  const normPhone = s => { let d = digits(s); if (d.startsWith("0092")) d = "0" + d.slice(4); else if (d.startsWith("92")) d = "0" + d.slice(2); return d; };
  const fixPhone = v => { let d = normPhone(v); if (/^3\d{9}$/.test(d)) d = "0" + d; return d; };
  const validPhone = s => /^0\d{9,10}$/.test(normPhone(s));
  const fmtPhone = s => { const d = normPhone(s); if (/^03\d{9}$/.test(d)) return d.slice(0, 4) + "-" + d.slice(4); if (/^0\d{9,10}$/.test(d)) return d.slice(0, 3) + "-" + d.slice(3); return String(s || ""); };
  const isOrg = (x, m) => x.type ? x.type === "Organization" : x.title === "M/s" || !!(m && m.type === "Organization");
  const linesOf = x => Array.isArray(x.lines) && x.lines.length ? x.lines : [{ category: x.category, program: x.program, detail: typeof x.inKind === "string" ? x.inKind : "", amount: x.amount }];
  const isGoodsLine = (x, l) => x.mode === IN_KIND || l.kind === "inkind";
  const goodsTotal = x => linesOf(x).reduce((s, l) => s + (isGoodsLine(x, l) ? +l.amount || 0 : 0), 0);
  const catLabel = l => l.category === "Other" ? `Other${l.categoryOther ? ": " + l.categoryOther : ""}` : l.category || "";
  const progLabel = l => l.program === PROG_OTHER ? `Other: ${l.programOther || "unspecified"}` : l.program || "";
  const qtyText = l => l.qty ? ` × ${l.qty} ${l.unit || ""}`.trimEnd() : "";
  const bankLabel = x => x.bank === BANK_OTHER ? (x.bankOther || "Other bank") : (x.bank || "");
  const uniq = a => [...new Set(a.filter(Boolean))].join(", ");
  /* the portal's donor importer accepted these column names; they stay accepted (old template, own registers) */
  const AKA = {
    legacyId: ["Old donor ID / code", "legacyid", "olddonorid", "oldid", "donorcode", "code", "oldcode", "refno", "reference", "sno", "serialno"],
    title: ["Title (Mr. / Mrs. / Ms. / Dr. / Haji / M/s)", "title", "salutation", "prefix"],
    name: ["Full name *", "name", "fullname", "donorname", "donor", "nameofdonor", "organisation", "organization", "company"],
    father: ["Father / husband name (or contact person)", "Father / husband / contact", "father", "fathername", "fatherhusbandname", "husbandname", "so", "sowo", "fatherorhusbandname", "contactperson", "guardian"],
    type: ["Donor type (Individual / Organization)", "type", "donortype", "individualorganization", "kind"],
    cnic: ["CNIC (13 digits)", "cnic", "cnicno", "nic", "idcard", "cnicnumber", "nicno", "nationalid"],
    ntn: ["NTN / registration no. (organisations)", "ntn", "ntnno", "regno", "registrationno", "registration"],
    phone: ["Mobile *", "mobile", "phone", "cell", "mobileno", "phoneno", "contact", "contactno", "cellno", "whatsapp", "mobilenumber", "phonenumber"],
    email: ["email", "emailaddress", "mail", "emailid"],
    city: ["city", "town", "district"],
    address: ["address", "postaladdress", "homeaddress", "residence", "location"],
    preferred: ["Preferred fund (Zakat / Sadaqah / …)", "preferred", "preferredfund", "fund", "fundtype", "preferredcategory", "donationtype"],
    channel: ["Preferred contact (WhatsApp / SMS / Email / Phone call / Do not contact)", "channel", "preferredcontact", "contactpreference", "contactvia", "preferredchannel"],
    consent: ["Consent to contact (Yes / No)", "consent", "contactconsent", "agreed"],
    since: ["Donor since (date)", "since", "donorsince", "registered", "registrationdate", "joined", "joiningdate", "datejoined", "firstdonation"],
    owner: ["Assigned RMO (portal e-mail)", "owner", "rmo", "assignedrmo", "assignedto", "officer", "rmoemail", "rmoofficer"],
    notes: ["notes", "remarks", "comment", "comments"]
  };
  /* a short message for a refused row; details only in the console (SECURITY-PROTOCOL.md §5) */
  function why(e) {
    if (e && e.code === "23505") return "This Donor ID is already in the portal";
    if (e && e.code === "42501") return "Refused by the portal's rules";
    const ref = Math.random().toString(16).slice(2, 8).toUpperCase();
    console.error("[excel-donor ref " + ref + "]", e);
    return "Not saved (ref " + ref + ")";
  }

  async function readAll(sb) {
    const out = [], PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from("donor_rows").select("collection,id,data").in("collection", ["donors", "donations", "pledges", "config"]).order("collection").order("id").range(from, from + PAGE - 1);
      if (error) throw new Error("The donor records could not be read. " + why(error));
      out.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async function load(sb) {
    const [rows, meR, staffR] = await Promise.all([readAll(sb), sb.rpc("donor_me"), sb.rpc("donor_staff")]);
    const me = meR.error ? "" : String(meR.data || "");
    if (!me) throw new Error("Your portal profile was not found. Sign in again.");
    const S = { donors: [], donations: [], pledges: [], settings: {} };
    for (const r of rows) {
      if (!r || !r.data || typeof r.data !== "object") continue;
      if (r.collection === "config") { if (r.id === "settings") S.settings = r.data; }
      else S[r.collection].push(r.data);
    }
    /* the editable lists (portal Settings → Lists) replace the built-in fund types, as in the portal */
    const L = (S.settings && S.settings.lists) || {}, clean = a => Array.from(new Set((Array.isArray(a) ? a : []).map(x => String(x).trim()).filter(x => x && x.length <= 80)));
    const cats = (Array.isArray(L.categories) ? clean(L.categories) : CATEGORIES.slice()).concat("Other");
    /* RMOs and Managers RMD, worked out from the access ticks the same way as the portal (erpRoleOf) */
    const has = (t, k, a) => !!(t && t[k] && t[k].includes(a || "view"));
    const officers = new Set((staffR.error ? [] : staffR.data || []).filter(p => !p.is_super && (has(p.tabs, "team") || (!has(p.tabs, "donations", "approve") && has(p.tabs, "new", "add")))).map(p => String(p.email).toLowerCase()));
    const byId = new Map(S.donors.map(d => [String(d.id).toLowerCase(), d]));
    /* a row without Donor ID is matched the way the portal's importer matches: old ID, CNIC / NTN, or mobile + name */
    const idx = { l: new Map(), c: new Map(), n: new Map(), p: new Map() };
    const addIdx = d => { byId.set(String(d.id).toLowerCase(), d); if (d.legacyId) idx.l.set(String(d.legacyId).toLowerCase(), d); if (d.cnic) idx.c.set(digits(d.cnic), d); if (d.ntn) idx.n.set(String(d.ntn).toLowerCase(), d); if (d.phone) idx.p.set(normPhone(d.phone) + "|" + String(d.name || "").toLowerCase(), d); };
    S.donors.forEach(addIdx);
    const keysOf = (x, m) => { const org = isOrg(x, m), cn = org ? "" : digits(x.cnic), nt = org ? String(x.ntn || "").toLowerCase() : "", pn = x.phone ? fixPhone(x.phone) + "|" + String(x.name).toLowerCase() : "", lg = String(x.legacyId || "").toLowerCase(); return { org, cn, nt, pn, lg }; };
    const findOther = x => { const { cn, nt, pn, lg } = keysOf(x, null); return (lg && idx.l.get(lg)) || (cn.length === 13 && idx.c.get(cn)) || (nt && idx.n.get(nt)) || (!cn && !nt && pn && idx.p.get(pn)) || null; };
    const names = new Map(S.donors.map(d => [d.id, d.name]));
    const cnt = { donors: 0, donations: 0, pledges: 0 };

    const donors = {
      key: "donors", name: "Donors", match: "id", find: v => byId.get(String(v).toLowerCase()) || null, findRow: d => findOther(d),
      about: "One row per donor. Leave Donor ID empty for a new donor. Empty cells keep what is saved.",
      canImport: true, canExport: true,
      rows: () => { cnt.donors = S.donors.length; return S.donors.map(d => ({ id: d.id, legacyId: d.legacyId || "", title: d.title || "", name: d.name || "", father: d.father || "", type: d.type || "", cnic: d.cnic || "", ntn: d.ntn || "", phone: d.phone || "", email: d.email || "", city: d.city || "", address: d.address || "", preferred: d.preferred || "", channel: d.channel || "", consent: !!d.consent, since: d.since || "", owner: d.owner || "", notes: d.notes || "" })); },
      cols: [
        { k: "id", h: "Donor ID", max: 40, ex: "AFI-DON-202610-00012", note: "The portal number. Leave empty for a new donor. Without it, the donor is found by Old donor ID, CNIC / NTN, or mobile + name" },
        { k: "legacyId", h: "Old donor ID / code", max: 40, aka: AKA.legacyId, ex: "OLD-1024", note: "Your old number or code, to find the donor later" },
        { k: "title", h: "Title", list: TITLES_NAME.slice(), aka: AKA.title, ex: "Mr." },
        { k: "name", h: "Full name", req: true, max: 120, aka: AKA.name, ex: "Muhammad Ahmed Khan", note: "As on the CNIC" },
        { k: "father", h: "Father / husband name", max: 120, aka: AKA.father, ex: "Abdul Karim Khan", note: "For an organisation: the contact person" },
        { k: "type", h: "Donor type", list: ["Individual", "Organization"], aka: AKA.type, ex: "Individual", note: "Empty = Individual (or Organization when the title is M/s)" },
        { k: "cnic", h: "CNIC", max: 20, aka: AKA.cnic, ex: "61101-1234567-1", note: "13 digits, with or without dashes. Not used for an organisation" },
        { k: "ntn", h: "NTN / registration no.", max: 40, aka: AKA.ntn, ex: "1234567-8", note: "Only for an organisation" },
        { k: "phone", h: "Mobile", type: "phone", aka: AKA.phone, ex: "0300-1234567", note: "A new donor needs a mobile or a CNIC / NTN" },
        { k: "email", h: "E-mail", type: "email", aka: AKA.email, ex: "ahmed@example.com", note: "Used to e-mail receipts" },
        { k: "city", h: "City", max: 60, aka: AKA.city, ex: "Islamabad" },
        { k: "address", h: "Address", max: 300, aka: AKA.address, ex: "House 12, Street 5, G-9/2", note: "Printed on the receipt" },
        { k: "preferred", h: "Preferred fund", list: cats, aka: AKA.preferred, ex: "Zakat", note: "Empty = Zakat for a new donor" },
        { k: "channel", h: "Preferred contact", list: CHANNELS.slice(), aka: AKA.channel, ex: "WhatsApp" },
        { k: "consent", h: "Consent to contact", type: "yesno", aka: AKA.consent, ex: "Yes", note: "Empty = Yes for a new donor (they gave their details to Alkhidmat)" },
        { k: "since", h: "Donor since", type: "date", aka: AKA.since, ex: "15-03-2019", note: "Empty = today for a new donor" },
        { k: "owner", h: "Assigned RMO", type: "email", aka: AKA.owner, ex: "", note: "Portal e-mail of the RMO who looks after this donor" },
        { k: "notes", h: "Notes", max: 500, aka: AKA.notes, ex: "Gives Zakat every Ramadan" }
      ],
      check(d, m) {
        if (d.id && !m) return `Donor ID “${d.id}” is not in the portal. Leave Donor ID empty for a new donor`;
        if (String(d.name).length < 2 || !/[A-Za-z؀-ۿ]/.test(d.name)) return "Full name is missing";
        m = m || findOther(d);
        const org = isOrg(d, m), cn = org ? "" : digits(d.cnic);
        if (cn && cn.length !== 13) return `CNIC must have 13 digits (found ${cn.length})`;
        if (d.phone && !validPhone(fixPhone(d.phone))) return "Mobile is not a valid number (write it like 0300-1234567)";
        if (!m && !d.phone && !cn && !(org && d.ntn)) return "Give at least a mobile number or a CNIC / NTN";
        if (d.owner && !officers.has(d.owner) && !(m && String(m.owner || "").toLowerCase() === d.owner)) return `Assigned RMO “${d.owner}” is not an RMO in this portal`;
        return "";
      }
    };

    const donations = {
      key: "donations", name: "Donations", about: "Every receipt. Download only: receipts are made in the portal (New Receipt).",
      canImport: false, canExport: true,
      rows: () => {
        const list = S.donations.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))); cnt.donations = list.length;
        return list.map(x => { const ls = linesOf(x), g = goodsTotal(x); return { receipt: x.receipt || "", date: x.date || "", donorId: x.donorId || "", donor: names.get(x.donorId) || "", funds: uniq(ls.map(catLabel)), programs: uniq(ls.map(progLabel)), items: ls.filter(l => isGoodsLine(x, l)).map(l => (l.detail || "") + qtyText(l)).join(", "), cash: (+x.amount || 0) - g, goods: g, total: +x.amount || 0, mode: x.mode || "", ref: x.ref || "", bank: bankLabel(x), pledge: x.pledgeId || "", status: x.replacedBy ? "Cancelled" : x.status || "", by: x.createdBy || "", verifiedBy: x.verifiedBy || "" }; });
      },
      cols: [
        { k: "receipt", h: "Receipt" }, { k: "date", h: "Date", type: "date" }, { k: "donorId", h: "Donor ID" }, { k: "donor", h: "Donor" },
        { k: "funds", h: "Fund type(s)" }, { k: "programs", h: "Programme(s)" }, { k: "items", h: "Items (in-kind)" },
        { k: "cash", h: "Money (Rs)", type: "number" }, { k: "goods", h: "Goods value (Rs)", type: "number" }, { k: "total", h: "Total (Rs)", type: "number" },
        { k: "mode", h: "Paid by" }, { k: "ref", h: "Cheque / transaction no." }, { k: "bank", h: "Bank" }, { k: "pledge", h: "Pledge" },
        { k: "status", h: "Status" }, { k: "by", h: "Recorded by" }, { k: "verifiedBy", h: "Verified by" }
      ]
    };

    /* pledge progress the way the portal counts it (pledgeStats): verified payments are "paid" */
    const pays = {};
    S.donations.forEach(x => { if (x.pledgeId && (x.status === "Verified" || x.status === "Pending")) (pays[x.pledgeId] || (pays[x.pledgeId] = [])).push(x); });
    const pledgeState = p => {
      const ps = pays[p.id] || [], paid = ps.reduce((s, x) => s + (x.status === "Verified" ? +x.amount || 0 : 0), 0), all = ps.reduce((s, x) => s + (+x.amount || 0), 0);
      let cum = 0, next = "";
      for (const s of Array.isArray(p.schedule) ? p.schedule : []) { if (s.status === "Skipped") continue; cum += +s.amount || 0; if (!next && paid < cum && all < cum) next = s.due || ""; }
      return { paid, balance: (+p.total || 0) - paid, next };
    };
    const pledges = {
      key: "pledges", name: "Pledges", about: "Every pledge, with what is paid. Download only: pledges are made in the portal (New Receipt).",
      canImport: false, canExport: true,
      rows: () => { cnt.pledges = S.pledges.length; return S.pledges.map(p => { const st = pledgeState(p); return { id: p.id, donorId: p.donorId || "", donor: names.get(p.donorId) || "", purpose: uniq((Array.isArray(p.lines) ? p.lines : []).map(l => l.program && l.program !== GENERAL ? progLabel(l) : catLabel(l))), total: +p.total || 0, count: p.count || "", freq: p.freq || "", start: p.start || "", paid: st.paid, balance: st.balance, next: st.next, status: p.status || "", by: p.createdBy || "" }; }); },
      cols: [
        { k: "id", h: "Pledge ID" }, { k: "donorId", h: "Donor ID" }, { k: "donor", h: "Donor" }, { k: "purpose", h: "For" },
        { k: "total", h: "Pledged (Rs)", type: "number" }, { k: "count", h: "Installments", type: "int" }, { k: "freq", h: "How often" }, { k: "start", h: "First due", type: "date" },
        { k: "paid", h: "Paid (Rs)", type: "number" }, { k: "balance", h: "Balance (Rs)", type: "number" }, { k: "next", h: "Next due", type: "date" },
        { k: "status", h: "Status" }, { k: "by", h: "Recorded by" }
      ]
    };

    /* one line in the portal's audit trail (the database stamps who and when) */
    const auditLine = async (action, target, detail) => {
      const id = "A" + Date.now().toString(36) + Math.random().toString(16).slice(2, 10);
      const { error } = await sb.from("donor_rows").insert({ collection: "audit", id, data: { id, seq: 0, ts: new Date().toISOString(), user: me, role: "super", action, target: String(target).slice(0, 120), detail: String(detail).slice(0, 500) } });
      if (error) console.warn("[excel-donor audit]", error.code);
    };

    /* the fields a row sets; an empty cell sets nothing (a re-uploaded download never wipes data) */
    function fields(x, m) {
      const org = isOrg(x, m), f = {}, put = (k, v) => { if (v !== "" && v != null) f[k] = v; };
      put("legacyId", String(x.legacyId || "").slice(0, 40)); put("title", x.title); put("name", x.name); put("father", x.father); put("type", x.type);
      if (!org && digits(x.cnic)) f.cnic = fmtCNIC(x.cnic);
      if (org) put("ntn", x.ntn);
      if (x.phone) f.phone = fmtPhone(fixPhone(x.phone));
      put("email", x.email); put("city", x.city); put("address", x.address); put("preferred", x.preferred); put("channel", x.channel);
      if (x.consent === true || x.consent === false) f.consent = x.consent;
      if (x.since) f.since = x.since > todayISO() ? todayISO() : x.since;
      if (x.owner && officers.has(x.owner)) f.owner = x.owner;
      put("notes", String(x.notes || "").slice(0, 500));
      return f;
    }

    async function saveDonors(rows, progress) {
      const now = new Date().toISOString(), today = todayISO(), batch = "IMP-" + Date.now().toString(36).toUpperCase();
      const failed = [], plan = [], taken = new Map();
      for (const r of rows) {
        const x = r.data, org = isOrg(x, r.update), cn = org ? "" : digits(x.cnic), nt = org ? String(x.ntn || "").toLowerCase() : "";
        const pn = x.phone ? fixPhone(x.phone) + "|" + String(x.name).toLowerCase() : "", lg = String(x.legacyId || "").toLowerCase();
        /* no Donor ID: found the way the portal's importer finds a donor (old ID, CNIC / NTN, mobile + name), so nobody is doubled */
        const m = r.update || findOther(x);
        const keys = m ? ["d" + m.id] : [cn ? "c" + cn : nt ? "n" + nt : "p" + pn].concat(lg ? ["l" + lg] : []);
        const dup = keys.find(k => taken.has(k));
        if (dup) { failed.push({ row: r.row, msg: `Same donor as row ${taken.get(dup)} in this file` }); continue; }
        keys.forEach(k => taken.set(k, r.row));
        plan.push({ r, m, f: fields(x, m), org });
      }
      /* new donors: numbers from the server, as the portal does (donor_reserve) */
      let news = plan.filter(p => !p.m), first = 0;
      if (news.length) {
        const { data, error } = await sb.rpc("donor_reserve", { p_kind: "donor", p_count: news.length });
        if (error || !(Number(data) > 0)) { const msg = "No donor number could be reserved. " + why(error); news.forEach(p => failed.push({ row: p.r.row, msg })); news = []; }
        else first = Number(data);
      }
      const ym = today.slice(0, 4) + today.slice(5, 7);
      const ins = news.map((p, i) => {
        const f = p.f;
        return { p, rec: Object.assign({ id: `AFI-DON-${ym}-${pad(first + i, 5)}`, status: "Active", createdAt: now, createdBy: me, updatedAt: now, importBatch: batch,
          type: p.org ? "Organization" : "Individual", title: p.org ? "M/s" : "Mr.", father: "", cnic: "", ntn: "", phone: "", email: "", city: "", address: "",
          preferred: "Zakat", channel: f.phone ? "WhatsApp" : f.email ? "Email" : "Phone call", consent: true, since: today, owner: "", notes: "", legacyId: "" }, f) };
      });
      const upd = []; let same = 0;
      plan.filter(p => p.m).forEach(p => {
        const ch = Object.keys(p.f).filter(k => p.m[k] !== p.f[k]);
        if (!ch.length) { same++; return; }
        upd.push({ p, rec: Object.assign({}, p.m, p.f, { updatedAt: now, importBatch: batch }) });
      });
      let done = 0, created = 0, updated = 0;
      for (let i = 0; i < ins.length; i += 500) {
        const part = ins.slice(i, i + 500);
        const { data, error } = await sb.from("donor_rows").insert(part.map(it => ({ collection: "donors", id: it.rec.id, data: it.rec }))).select("id,data");
        if (!error) { (data || []).forEach(r => { const d = r.data; addIdx(d); S.donors.push(d); names.set(d.id, d.name); }); created += part.length; }
        else for (const it of part) {        // one by one, so each refused row gets its own reason
          const one = await sb.from("donor_rows").insert({ collection: "donors", id: it.rec.id, data: it.rec }).select("id,data").maybeSingle();
          if (one.error || !one.data) failed.push({ row: it.p.r.row, msg: why(one.error) });
          else { S.donors.push(one.data.data); addIdx(one.data.data); names.set(one.data.id, one.data.data.name); created++; }
        }
        done += part.length; progress(done);
      }
      for (let i = 0; i < upd.length; i += 6) {
        await Promise.all(upd.slice(i, i + 6).map(async it => {
          const { data, error } = await sb.from("donor_rows").update({ data: it.rec }).eq("collection", "donors").eq("id", String(it.p.m.id)).select("id,data").maybeSingle();
          if (error || !data) { failed.push({ row: it.p.r.row, msg: error ? why(error) : "Refused by the portal's rules" }); return; }
          Object.keys(it.p.m).forEach(k => { delete it.p.m[k]; }); Object.assign(it.p.m, data.data); names.set(data.id, data.data.name); updated++;
        }));
        done += Math.min(6, upd.length - i); progress(done);
      }
      await auditLine("DONORS_IMPORTED", batch, `${created} created, ${updated} updated, ${same} unchanged, ${failed.length} not saved (main page: Excel import & export)`);
      failed.sort((a, b) => a.row - b.row);
      return { failed };
    }

    return {
      sheets: [donors, donations, pledges],
      save: async (sheet, rows, progress) => sheet.key === "donors" ? saveDonors(rows, progress || (() => {})) : { failed: rows.map(r => ({ row: r.row, msg: "This sheet is download only" })) },
      onExport: async what => { if (what === "data") await auditLine("EXPORT", "Excel import & export (main page)", `${cnt.donors} donors, ${cnt.donations} receipts, ${cnt.pledges} pledges`); }
    };
  }

  PORTALS.donor = { name: "Donor Management", load };
})();
