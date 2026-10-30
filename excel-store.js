/* Alkhidmat Islamabad — Store in the one Excel format (akf-excel.js), for the main page (Super Admin only).
   The main page calls  const book = await AKF_EXCEL_PORTALS.store.load(sb)  and hands book.sheets / book.save to AKF_EXCEL.open.
   Everything is written to public.portal_rows exactly as the Store portal writes it (erp/src/portal-app.html):
     Stock items  a row with an Item code already in the portal = A.stockItemEdit (name, unit, category, condition, minimum,
                  unit price; the store and the balance stay; 'audit' "Item edited"). A row without one = the opening-stock
                  part of A.importRegister ("Add to current stock"): findOrCreateItem → collection 'stock', id
                  AKF-ISB-<store>-<category>-2026-NNNNN; a new item's opening quantity → one 'ledger' row
                  {type:"in", ref:"AKF-OPENING-<date>"}; an item that is already there keeps its balance (minimum / price updated).
     Received     A.importRegister receipts: rows of the same date + number (or donor) = one document in collection 'docs'
                  (AKF-GRN-P-YYYY-MM-NNNN / AKF-GDN-D-YYYY-MM-NNNN, numbered in date order like the portal), one 'ledger'
                  "in" row per line, the stock balance raised. A document already in the portal (same type, date, items and
                  quantities) is skipped, so a downloaded file can be uploaded again without doubling stock.
     Issued       the same for issues: 'docs' AKF-GIN-YYYY-NNNN, 'ledger' "out" rows, balance lowered (never below 0).
   One 'audit' row per upload, as the portal writes it. RLS and the portal_guard trigger check every row.
   Downloads leave out beneficiary distributions (names of people), as they are not store issues to upload again. */
(function () {
  "use strict";
  const PORTALS = window.AKF_EXCEL_PORTALS = window.AKF_EXCEL_PORTALS || {};
  if (PORTALS.store) return;

  /* ---- same values and helpers as erp/src/portal-app.html ---- */
  const YEAR = 2026;   // the portal's own numbering year for item codes (const YEAR in portal-app.html)
  const STORES = ["CS1 Central Store 1", "CS2 Central Store 2"];
  const CONDITIONS = ["New", "Used – good", "Used – needs repair", "Damaged / not working"];
  const pad = (n, l = 4) => String(n).padStart(l, "0");
  const nowISO = () => new Date().toISOString();
  const uid = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
  const KEY_FIELD = { assets: "tag" };
  const rowKey = (col, item) => { const k = KEY_FIELD[col] || "id"; if (!item[k]) item[k] = uid(); return String(item[k]); };
  const itemKey = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const condOf = s => (s && s.condition) || "New";
  const dedupeCI = a => { const seen = new Set(); return a.filter(x => { const k = String(x).toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; }); };
  const localDay = iso => new Date(iso).toLocaleDateString("en-CA");
  const today = () => localDay(nowISO());
  const atOfDate = date => !date || date === nowISO().slice(0, 10) ? nowISO() : new Date(date + "T12:00:00").toISOString();
  function normCondition(text, name) {
    const t = String(text || "").trim(), probe = t || String(name || "");
    if (/damag|not\s*work|broken|scrap|expired/i.test(probe)) return CONDITIONS[3];
    if (/repair/i.test(probe)) return CONDITIONS[2];
    if (/\bused\b|\bold\b|second|refurb/i.test(probe)) return CONDITIONS[1];
    if (/\bnew\b|unused|fresh/i.test(probe) || !t) return "New";
    return t;
  }
  function nextNumber(st, prefix, width = 4) {
    const re = new RegExp("^" + prefix.replace(/[-]/g, "\\-") + "(\\d+)$"); let max = 0;
    const scan = id => { const m = re.exec(id); if (m) max = Math.max(max, Number(m[1])); };
    st.requests.forEach(r => scan(r.id)); st.docs.forEach(d => scan(d.id)); st.assets.forEach(x => scan(x.tag)); st.beneficiaries.forEach(x => scan(x.id));
    st.invoices.forEach(x => scan(x.id)); st.rfqs.forEach(r => scan(r.id)); st.pos.forEach(p => scan(p.id)); st.stock.forEach(s => scan(s.id));
    st.docs.forEach(d => { if (d.gatePass) scan(d.gatePass); });
    return prefix + pad(max + 1, width);
  }
  function findOrCreateItem(d, { name, category, uom, price, store, rack, bin, expiry, batch, min, condition }) {
    store = store || STORES[0]; name = String(name || "").replace(/\s+/g, " ").trim();
    const same = x => (itemKey(x.name) === itemKey(name) || (x.aliases || []).some(a => itemKey(a) === itemKey(name))) && x.store === store;
    let s = condition ? d.stock.find(x => same(x) && condOf(x) === condition) : (d.stock.find(x => same(x) && condOf(x) === "New") || d.stock.find(same));
    if (!s) {
      const cat = String(category || "OTHER").toUpperCase().replace(/[^A-Z0-9]/g, "") || "OTHER", code = store.split(" ")[0];
      s = { id: nextNumber(d, `AKF-ISB-${code}-${cat}-${YEAR}-`, 5), name, category: cat, uom: uom || "Pcs", qty: 0, price: Number(price) || 0, store, rack: rack || "", bin: bin || "", expiry: expiry || "", batch: batch || "", min: Number(min) || 0, condition: condition || normCondition("", name) };
      d.stock.push(s);
    }
    return s;
  }
  function autoDocId(d, type, date, given) {
    if (given && new RegExp(`^AKF-${type}-\\d{4}-`).test(given) && !d.docs.some(x => x.id === given)) return given;
    return nextNumber(d, type === "GIN" ? `AKF-GIN-${date.slice(0, 4)}-` : `AKF-${type}-${date.slice(0, 4)}-${date.slice(5, 7)}-`);
  }
  function groupMoves(rows, keyOf) { const m = new Map(); rows.forEach(r => { const k = keyOf(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return [...m.values()].sort((a, b) => a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[0].row - b[0].row); }
  const recvKey = (r, defaultType) => [r.type || defaultType, r.date, r.no || r.from].join("|"), issKey = r => [r.date, r.no || "", r.to].join("|");
  const fyStart = () => { const d = new Date(); return (d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1) + "-07-01"; };
  const movementKind = l => /^AKF-(OPENING|EXCEL-IMPORT)|^EXCEL-IMPORT/.test(l.ref) ? "opening" : l.type === "in" ? (/^AKF-GRN-P/.test(l.ref) ? "p" : /^AKF-(GDN-D|GRN-D)/.test(l.ref) ? "d" : "adj") : (/^AKF-(GIN|GDN|BEN)/.test(l.ref) ? "issued" : "adj");

  /* A.importRegister of portal-app.html, "Add to current stock" (replace is never done from here) */
  function importRegister(d, me, { items, received, issued, store, openingDate, defaultType }) {
    const res = { items: 0, received: 0, issued: 0, skipped: 0 };
    const fresh = new Set(), openAt = atOfDate(openingDate);
    items.forEach(it => { const before = d.stock.length; const s = findOrCreateItem(d, { ...it, store: it.store || store }); if (d.stock.length > before) fresh.add(s.id);
      if (it.min) s.min = it.min; if (it.price) s.price = it.price;
      if (it.opening > 0 && fresh.has(s.id)) { s.qty += it.opening; d.ledger.unshift({ id: uid(), at: openAt, itemId: s.id, type: "in", qty: it.opening, ref: "AKF-OPENING-" + openingDate, note: "Opening stock (stock register import)" }); }
      res.items++; });
    const sig = (type, date, lines) => [type, date, lines.map(l => itemKey(l.item || l.name) + ":" + l.qty).sort().join(",")].join("|");
    const have = new Set(d.docs.filter(x => x.lines).map(x => sig(x.type === "GRN-D" ? "GDN-D" : x.type, localDay(x.at), x.lines)));
    const excelRef = no => no && !/^AKF-/.test(no) ? "Excel no. " + no : "";
    groupMoves(received, r => recvKey(r, defaultType)).forEach(g => { const f = g[0], type = f.type || defaultType;
      if (have.has(sig(type, f.date, g))) { res.skipped += g.length; return; }
      const id = autoDocId(d, type, f.date, f.no); const at = atOfDate(f.date); let amount = 0;
      const lines = g.map(r => { const s = findOrCreateItem(d, { name: r.name, store: r.store || store, condition: r.condition || undefined }); s.qty += r.qty; amount += r.qty * (s.price || 0);
        d.ledger.unshift({ id: uid(), at, itemId: s.id, type: "in", qty: r.qty, ref: id, note: (type === "GRN-P" ? "Purchase · " : "Donation in kind · ") + (r.from || "—") + (r.purpose ? " · " + r.purpose : "") }); res.received++;
        return { item: s.name, qty: r.qty, uom: s.uom, price: s.price || 0, condition: condOf(s) }; });
      d.docs.unshift({ id, type, title: type === "GRN-P" ? "Goods Received Note (purchase)" : "Goods Donation Note (donation in kind)", at, by: me.name, byId: me._id, amount, ref: excelRef(f.no), from: g.map(r => r.from).find(Boolean) || "", purpose: [...new Set(g.map(r => r.purpose).filter(Boolean))].join(" · "), store: f.store || store, lines, note: "Imported from stock register (Excel)" }); });
    groupMoves(issued, issKey).forEach(g => { const f = g[0];
      if (have.has(sig("GIN", f.date, g))) { res.skipped += g.length; return; }
      const id = autoDocId(d, "GIN", f.date, f.no); const at = atOfDate(f.date); let amount = 0;
      const lines = g.map(r => { const s = findOrCreateItem(d, { name: r.name, store: r.store || store, condition: r.condition || undefined }); s.qty -= r.qty; amount += r.qty * (s.price || 0);
        d.ledger.unshift({ id: uid(), at, itemId: s.id, type: "out", qty: r.qty, ref: id, note: "Issued to " + (r.to || "—") + (r.purpose ? " · " + r.purpose : "") }); res.issued++;
        return { item: s.name, qty: r.qty, uom: s.uom, price: s.price || 0, condition: condOf(s) }; });
      d.docs.unshift({ id, type: "GIN", title: "Goods Issuance Note", at, by: me.name, byId: me._id, amount, ref: excelRef(f.no), store: f.store || store, lines, to: f.to || "", purpose: [...new Set(g.map(r => r.purpose).filter(Boolean))].join(" · "), note: "Imported from stock register (Excel)" }); });
    d.stock.forEach(s => { if (s.qty < 0) s.qty = 0; });
    audit(d, me, "EXCEL-IMPORT", "Stock register imported", `${res.items} items · ${res.received} received rows · ${res.issued} issued rows${res.skipped ? ` · ${res.skipped} already imported, skipped` : ""}`);
    return res;
  }
  /* A.stockItemEdit of portal-app.html (makeStoreItemActions) */
  function stockItemEdit(d, me, id, f) {
    const s = d.stock.find(x => x.id === id); if (!s) throw new Error("This item is no longer in the portal.");
    const name = String(f.name || "").replace(/\s+/g, " ").trim(); if (!name) throw new Error("Write the item name (particular).");
    const uom = String(f.uom || "").trim(); if (!uom) throw new Error("Write the unit.");
    const condition = String(f.condition || "").trim() || "New", store = s.store;
    const clash = d.stock.find(x => x.id !== id && itemKey(x.name) === itemKey(name) && x.store === store && condOf(x) === condition);
    if (clash) throw new Error(`“${name}” (${condition}) already exists in ${store.split(" ")[0]} as ${clash.id}. Use that line, or choose another name or condition.`);
    const num = (v, l) => { const n = Number(v || 0); if (isNaN(n) || n < 0) throw new Error(`${l} must be zero or more.`); return n; };
    const c = { name, uom, condition, store, category: String(f.category || "OTHER").toUpperCase().replace(/[^A-Z0-9]/g, "") || "OTHER", min: num(f.min, "Minimum level"), price: num(f.price, "Unit price"), rack: String(f.rack || "").trim(), bin: String(f.bin || "").trim(), expiry: f.expiry || "" };
    const labels = { name: "Name", condition: "Condition", uom: "Unit", category: "Category", min: "Minimum", price: "Unit price", rack: "Rack", bin: "Bin", expiry: "Expiry" };
    const diffs = Object.keys(labels).filter(k => String(s[k] ?? "") !== String(c[k] ?? "")).map(k => `${labels[k]}: ${s[k] || "—"} → ${c[k] || "—"}`);
    if (!diffs.length) return 0;
    if (itemKey(c.name) !== itemKey(s.name)) s.aliases = dedupeCI([...(s.aliases || []), s.name]).filter(a => itemKey(a) !== itemKey(c.name));
    Object.keys(labels).forEach(k => { s[k] = c[k]; });
    d.audit.unshift({ id: uid(), at: nowISO(), doc: s.id, action: "Item edited", comment: diffs.join(" · "), dept: "Admin", by: me.name || "", role: me.role || "", uid: me._id, desig: me.designation || "" });
    return diffs.length;
  }
  const audit = (d, me, doc, action, comment) => d.audit.unshift({ id: uid(), at: nowISO(), doc, action, comment: comment || "", dept: me.dept || "", by: me.name || "", role: me.role || "", uid: me._id, desig: me.designation || "" });

  /* ---- database layer (DB.load / DB.save of portal-app.html) ---- */
  const READ = ["stock", "ledger", "docs", "requests", "rfqs", "pos", "assets", "beneficiaries", "invoices", "vendors"], WRITE = ["stock", "ledger", "docs", "audit"];
  async function readRows(sb, cols) {
    let all = [];
    for (let from = 0; ; from += 1000) {
      const r = await sb.from("portal_rows").select("collection,id,data,created_at").in("collection", cols)
        .order("created_at", { ascending: true }).order("collection", { ascending: true }).order("id", { ascending: true }).range(from, from + 999);
      if (r.error) throw r.error;
      all = all.concat(r.data || []);
      if (!r.data || r.data.length < 1000) break;
    }
    const st = {}; cols.forEach(c => { st[c] = []; }); st.audit = [];
    all.forEach(r => { if (st[r.collection] && r.data) st[r.collection].push(r.data); });
    ["ledger", "docs"].forEach(c => st[c].sort((a, b) => (a.at || "") < (b.at || "") ? 1 : -1));
    st.docs.forEach(x => { if (x.type === "GRN-D") { x.type = "GDN-D"; x.title = "Goods Donation Note (donation in kind)"; } else if (x.type === "GDN") x.type = "GIN"; });   // migrateStockDocs
    return st;
  }
  async function whoAmI(sb) {
    const { data, error } = await sb.rpc("portal_me");
    if (error) throw error;
    if (!data || !data._id) throw new Error("Your login has no active profile in the Store portal, so nothing can be saved.");
    return data;
  }
  const snap = (d, cols) => { const m = {}; cols.forEach(c => { m[c] = new Map((d[c] || []).map(i => [rowKey(c, i), JSON.stringify(i)])); }); return m; };
  async function write(sb, before, d, cols) {
    const ups = [], fresh = {};
    cols.forEach(c => (d[c] || []).forEach(i => { const k = rowKey(c, i), j = JSON.stringify(i); if (before[c].get(k) !== j) { ups.push({ collection: c, id: k, data: i }); if (!before[c].has(k)) (fresh[c] = fresh[c] || []).push(k); } }));
    for (const c of Object.keys(fresh)) for (let i = 0; i < fresh[c].length; i += 200) {
      const r = await sb.from("portal_rows").select("id").eq("collection", c).in("id", fresh[c].slice(i, i + 200));
      if (r.error) throw r.error;
      if ((r.data || []).length) throw new Error("Someone saved store records in the portal at the same moment. Nothing was saved — upload the file again.");
    }
    if (ups.length) { const { error } = await sb.from("portal_rows").upsert(ups, { onConflict: "collection,id" }); if (error) throw error; }
    return ups.length;
  }
  const plain = e => { const m = String((e && e.message) || ""); return m && m.length < 220 ? m : "Not saved on the server. Try again."; };

  /* ---- sheets ---- */
  const ITEM_COLS = [
    { k: "id", h: "Item code", ex: "", note: "Leave empty for a new item. Downloaded rows have it: then the row changes that item (name, unit, category, condition, minimum, price)", aka: ["code", "itemid"] },
    { k: "category", h: "Category", ex: "MED", note: "e.g. MED, FOOD, NFI, OFF, IT or OTHER. Empty: OTHER" },
    { k: "name", h: "Particular", req: true, ex: "Wheel chair", note: "The item name", aka: ["particulars", "item", "itemname"] },
    { k: "uom", h: "Unit", ex: "Pcs", note: "Empty: Pcs", aka: ["units", "uom"] },
    { k: "opening", h: "Opening stock", type: "number", min: 0, ex: 10, note: "Only for a new item. Later receipts and issues change the balance", aka: ["openingqty", "opening"] },
    { k: "min", h: "Minimum level", type: "number", min: 0, ex: 2, aka: ["minimumlevelofstock", "minimum"] },
    { k: "price", h: "Unit price (PKR)", type: "number", min: 0, ex: 15000, aka: ["each", "unitprice", "rate"] },
    { k: "condition", h: "Condition", list: CONDITIONS, ex: "New", note: "Empty: read from the name, otherwise New" },
    { k: "store", h: "Store", list: STORES, ex: STORES[0], note: "Only for a new item. Empty: " + STORES[0] },
    { k: "openDate", h: "Opening date", type: "date", ex: "01-07-2026", note: "Date of the opening stock. Empty: start of this fiscal year (1 July)" },
    { k: "bal", h: "Balance now", type: "number", note: "Filled in downloads only. The portal works it out; what you write here is not used" }];
  const RECV_COLS = [
    { k: "date", h: "Date", req: true, type: "date", ex: "15-08-2026" },
    { k: "no", h: "GRN / GDN no.", ex: "", note: "Optional. Rows with the same date and number become one document. The portal gives its own number", aka: ["grn", "gdn", "no", "docno"] },
    { k: "name", h: "Particular", req: true, ex: "Wheel chair", note: "Write it as on the Stock items sheet", aka: ["particulars", "item"] },
    { k: "qty", h: "Quantity", req: true, type: "number", min: 0, ex: 5, aka: ["receivedqty", "qty"] },
    { k: "from", h: "Donor / supplier", ex: "Mr. Ahmed", aka: ["donorsupplier", "donor", "supplier"] },
    { k: "purpose", h: "Purpose", ex: "Flood relief" },
    { k: "type", h: "Type", req: true, list: ["GRN-P", "GDN-D"], ex: "GDN-D", note: "GRN-P = bought · GDN-D = donated (in kind)", aka: ["typegrnpgdnd"] },
    { k: "condition", h: "Condition", list: CONDITIONS, note: "Empty: the item's New line" },
    { k: "store", h: "Store", list: STORES, note: "Empty: " + STORES[0] }];
  const ISS_COLS = [
    { k: "date", h: "Date", req: true, type: "date", ex: "20-08-2026" },
    { k: "no", h: "GIN no.", ex: "", note: "Optional. Rows with the same date, number and receiver become one document. The portal gives its own number", aka: ["gin", "gdn", "no", "docno"] },
    { k: "name", h: "Particular", req: true, ex: "Wheel chair", note: "Write it as on the Stock items sheet", aka: ["particulars", "item"] },
    { k: "qty", h: "Quantity", req: true, type: "number", min: 0, ex: 2, aka: ["issuedqty", "qty"] },
    { k: "to", h: "Issued to", req: true, ex: "Health department", aka: ["issuedto"] },
    { k: "purpose", h: "Purpose", ex: "Camp at Bhara Kahu" },
    { k: "condition", h: "Condition", list: CONDITIONS, note: "Empty: the item's New line" },
    { k: "store", h: "Store", list: STORES, note: "Empty: " + STORES[0] }];
  const moveCheck = x => x.qty > 0 ? x.date > today() ? "The date is in the future" : "" : "Quantity must be more than 0";

  function movementRows(st, kind) {
    const posted = new Set(st.ledger.map(l => l.ref));
    const vendorOf = d => { const po = st.pos.find(p => p.id === d.ref); return po ? (st.vendors.find(v => v.id === po.vendorId) || {}).name || "" : ""; };
    const reqOf = id => st.requests.find(r => r.id === id);
    return st.docs.filter(d => posted.has(d.id) && Array.isArray(d.lines) && (kind === "received" ? ["GRN-P", "GDN-D"].includes(d.type) : d.type === "GIN" && !/placed in store/i.test(d.title || "")))
      .flatMap(d => d.lines.map(l => { const r = reqOf(d.ref);
        return kind === "received"
          ? { date: localDay(d.at), no: d.id, name: l.item, qty: l.qty, from: d.from || vendorOf(d) || String(d.ref || "").replace(/^Donor: /, ""), purpose: d.purpose || (r ? r.purpose : ""), type: d.type, condition: l.condition || "", store: d.store || "" }
          : { date: localDay(d.at), no: d.id, name: l.item, qty: l.qty, to: d.to || (r ? r.dept : ""), purpose: d.purpose || (r ? r.purpose : ""), condition: l.condition || "", store: d.store || "" }; }))
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }

  PORTALS.store = {
    name: "Store",
    async load(sb) {
      const S = await readRows(sb, READ);
      const openingOf = id => S.ledger.filter(l => l.itemId === id && movementKind(l) === "opening").reduce((a, l) => a + (l.type === "in" ? 1 : -1) * (Number(l.qty) || 0), 0);
      const sheets = [
        { key: "items", name: "Stock items", about: "One row per item line (the same item in another condition or store is its own line).", match: "id",
          find: v => S.stock.find(s => s.id === String(v || "").trim().toUpperCase()) || null,
          check: (x, upd) => x.id && !upd ? "No item with this Item code in the portal. Leave Item code empty for a new item" : "",
          rows: () => S.stock.map(s => ({ id: s.id, category: s.category, name: s.name, uom: s.uom, opening: openingOf(s.id), min: s.min || 0, price: s.price || 0, condition: condOf(s), store: s.store, openDate: "", bal: s.qty })),
          cols: ITEM_COLS },
        { key: "received", name: "Received", about: "Stock that came in: bought (GRN-P) or donated (GDN-D).", check: moveCheck, rows: () => movementRows(S, "received"), cols: RECV_COLS },
        { key: "issued", name: "Issued", about: "Stock that went out of the store (GIN).", check: moveCheck, rows: () => movementRows(S, "issued"), cols: ISS_COLS }];
      async function save(sheet, rows, progress) {
        const me = await whoAmI(sb);
        const d = await readRows(sb, READ), before = snap(d, WRITE), failed = [], done = [];
        const store = STORES[0];
        if (sheet.key === "items") {
          const add = new Map();
          rows.forEach(x => { const D = x.data;
            try {
              if (x.update) {
                const s = d.stock.find(z => z.id === x.update.id); if (!s) throw new Error("This item is no longer in the portal.");
                const pick = (k, v) => k in D && D[k] !== "" && D[k] != null ? D[k] : v;
                stockItemEdit(d, me, s.id, { ...s, name: D.name, uom: pick("uom", s.uom), category: pick("category", s.category), condition: pick("condition", condOf(s)), min: pick("min", s.min), price: pick("price", s.price) });
              } else {
                const od = D.openDate || fyStart(); if (!add.has(od)) add.set(od, []);
                add.get(od).push({ row: x.row, name: D.name, category: D.category || "", uom: D.uom || "", opening: Number(D.opening) || 0, min: Number(D.min) || 0, price: Number(D.price) || 0, store: D.store || "", condition: D.condition ? D.condition : normCondition("", D.name) });
              }
              done.push(x.row);
            } catch (e) { failed.push({ row: x.row, msg: plain(e) }); }
          });
          add.forEach((items, od) => importRegister(d, me, { items, received: [], issued: [], store, openingDate: od, defaultType: "GDN-D" }));
        } else {
          const list = rows.map(x => { const D = x.data; done.push(x.row);
            return { row: x.row, date: D.date, no: D.no || "", name: String(D.name).replace(/\s+/g, " ").trim(), qty: Number(D.qty), party: sheet.key === "received" ? D.from || "" : D.to || "", from: D.from || "", to: D.to || "", purpose: D.purpose || "", type: D.type || "", store: D.store || "", condition: D.condition || "" }; });
          importRegister(d, me, { items: [], received: sheet.key === "received" ? list : [], issued: sheet.key === "issued" ? list : [], store, openingDate: fyStart(), defaultType: "GDN-D" });
        }
        progress(Math.round(rows.length / 2));
        try { await write(sb, before, d, WRITE); }
        catch (e) { return { failed: failed.concat(done.map(row => ({ row, msg: plain(e) }))) }; }
        Object.assign(S, await readRows(sb, READ));
        progress(rows.length);
        return { failed };
      }
      return { sheets, save };
    }
  };
  PORTALS.store._test = { ITEM_COLS, RECV_COLS, ISS_COLS, importRegister, stockItemEdit, movementRows, readRows };
})();
