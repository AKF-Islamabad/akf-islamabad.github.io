/* Alkhidmat Foundation Islamabad — main page → Excel import & export → "Fleet & Ambulances Management" (Super Admin only).
   Registers the Fleet sheets for akf-excel.js (the one Excel format, SECURITY-PROTOCOL.md §10):
     Departments · Vehicles · Drivers · Service types · Fuel · Maintenance · Trips (old trip history)
   load(sb) reads the current records straight from public.fleet_rows (like the Fleet portal's ERP layer);
   save() writes exactly the records the Fleet portal writes (same collections, ids and fields), one row per record,
   so the database rules in erp/supabase/portals/fleet.sql (RLS + fleet_rows_guard) still check every row.
   A blank cell on an existing record keeps what is saved; a filled cell changes it. */
(function () {
  "use strict";
  const FUELS = ["Petrol", "Diesel", "CNG", "Electric"], STATUS = ["Active", "In Workshop", "Retired"], VT = ["Ambulance", "Office", "Bike"];
  const MTYPES = [{ n: "Oil Change", Ambulance: 3000, Office: 5000, Bike: 1000 }, { n: "Brakes", Ambulance: 20000, Office: 20000, Bike: 10000 },
    { n: "Tyres", Ambulance: 40000, Office: 40000, Bike: 15000 }, { n: "General Service", Ambulance: 10000, Office: 10000, Bike: 3000 }];   // the portal's defaults
  const COLS = ["vehicles", "departments", "drivers", "driverpii", "fuel", "maintenance", "trips", "config"];
  /* the database refuses < > " ' ` and \ in any fleet text: replaced by look-alikes, as the portal does */
  const MAP = { "<": "‹", ">": "›", '"': "”", "'": "’", "`": "ʼ", "\\": "/" };
  const cleanStr = s => /[<>"'`\\]/.test(s) ? s.replace(/[<>"'`\\]/g, c => MAP[c]) : s;
  const cleanDeep = (o, d = 0) => { if (!o || typeof o !== "object" || d > 8) return o; for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === "string") o[k] = cleanStr(v); else if (v && typeof v === "object") cleanDeep(v, d + 1); } return o; };
  const low = s => cleanStr(String(s == null ? "" : s)).trim().toLowerCase();
  const has = v => v !== "" && v != null;
  const clone = o => JSON.parse(JSON.stringify(o));
  const rid = () => { const a = new Uint8Array(8); crypto.getRandomValues(a); return [...a].map(x => x.toString(36).padStart(2, "0")).join("").slice(0, 12); };   // = the portal's rid()
  let last = 0;
  const nid = () => (last = Math.max(last + 1, Date.now() * 1000 + Math.floor(Math.random() * 1000)));   // the portal's numeric entry ids, never twice
  const ph92 = v => { let d = String(v || "").replace(/\D/g, ""); if (/^0\d{10}$/.test(d)) d = "92" + d.slice(1); return d; };
  const cnicFmt = v => { const d = String(v || "").replace(/\D/g, ""); return d.length === 13 ? d.slice(0, 5) + "-" + d.slice(5, 12) + "-" + d.slice(12) : ""; };
  /* Pakistan time, as the portal stamps entries */
  const PK = () => new Date(Date.now() + 5 * 36e5);
  const today = () => PK().toISOString().slice(0, 10);
  const stampNow = () => { const d = PK(), p = x => String(x).padStart(2, "0"), h = d.getUTCHours(); return p(d.getUTCDate()) + "-" + p(d.getUTCMonth() + 1) + "-" + d.getUTCFullYear() + " " + p(h % 12 || 12) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds()) + " " + (h >= 12 ? "PM" : "AM") + " PKT"; };
  const dm = (a, b) => { if (!a || !b) return 0; const [x, y] = a.split(":"), [p, q] = b.split(":"); let d = (+p * 60 + +q) - (+x * 60 + +y); if (d < 0) d += 1440; return d; };
  const NO = { type: "text", max: 17, pattern: /^\d{1,17}$/, patternMsg: "must be the number from a downloaded file (leave it empty for a new entry)" };
  const failAll = (rows, msg) => rows.map(r => ({ row: r.row, msg }));
  function plainErr(e) {
    const m = (e && e.message) || "", plain = m.length < 300 && !/relation|column|function|syntax|policy|violates|jsonb|null value/i.test(m);
    if (e && ["22023", "23514", "P0001", "42501"].includes(e.code) && plain) return m;
    if (e && (e.code === "42501" || /policy|violates row/i.test(m))) return "The database did not allow saving this row";
    if (e && e.code === "23505") return "This record is already in the portal";
    const ref = rid().slice(0, 6).toUpperCase(); console.error("[excel fleet ref " + ref + "]", e); return "Not saved (ref " + ref + ")";
  }
  const refuse = msg => Object.assign(new Error(msg), { code: "P0001" });

  async function load(sb) {
    /* ---- read: every record the import needs, 1000 at a time ---- */
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("fleet_rows").select("collection,id,data").in("collection", COLS).order("collection").order("id").range(from, from + 999);
      if (error) throw new Error("The Fleet records could not be read. Is the Fleet portal set up in the database?");
      all.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    const D = { vehicles: [], departments: [], drivers: [], fuel: [], maintenance: [], trips: [] }, pii = {}, saved = new Set();
    let mtypes = null;
    for (const r of all) {
      saved.add(r.collection + " " + r.id);
      if (D[r.collection]) D[r.collection].push(r.data || {});
      else if (r.collection === "driverpii") pii[r.id] = r.data || {};
      else if (r.collection === "config" && r.id === "mtypes" && r.data && Array.isArray(r.data.list)) mtypes = r.data.list;
    }
    D.drivers.forEach(d => { const p = pii[String(d.id)] || {}; d.lic = p.lic || ""; d.cnic = p.cnic || ""; });
    if (!mtypes) mtypes = clone(MTYPES);
    let odo = {};
    try { const { data } = await sb.rpc("fleet_odometers"); (data || []).forEach(r => { odo[r.plate] = +r.odo || 0; }); } catch (e) { odo = {}; }
    const cur = v => Math.max(+v.odo || 0, +(odo[v.p] || 0), ...D.trips.filter(t => t.v === v.p).map(t => +t.oe || 0), ...D.fuel.filter(f => f.v === v.p).map(f => +f.odo || 0));
    const veh = p => p ? D.vehicles.find(v => low(v.p) === low(p)) || null : null;
    const dept = n => n ? D.departments.find(d => low(d.n) === low(n)) || null : null;
    const byNo = arr => no => arr.find(x => String(x.id) === String(no).trim()) || null;
    const fileDept = new Set(), fileVeh = new Set(), HIT = new Map();
    const needVeh = p => veh(p) || fileVeh.has(low(p)) ? "" : "Vehicle “" + p + "” is not in the portal or in the Vehicles sheet";
    const needDept = n => !n || dept(n) || fileDept.has(low(n)) ? "" : "Department “" + n + "” is not in the portal or in the Departments sheet";
    const noFound = (d, upd, what) => has(d.id) && !upd ? what + " no. " + d.id + " is not in the portal — leave it empty to add a new one" : "";
    const vehAt = p => { const v = veh(p); if (!v) throw refuse("Vehicle “" + p + "” is not in the portal"); return v; };
    const deptName = n => { const d = dept(n); return d ? d.n : n; };
    const put = (o, d, keys) => { keys.forEach(k => { if (has(d[k])) o[k] = d[k]; }); return o; };

    /* ---- write: one record, then keep the in-memory copy in step so later sheets find it ---- */
    async function write(c, id, data) {
      cleanDeep(data);
      const k = c + " " + id, isNew = !saved.has(k);
      const q = isNew ? sb.from("fleet_rows").insert({ collection: c, id, data }) : sb.from("fleet_rows").update({ data }).eq("collection", c).eq("id", id);
      const { data: got, error } = await q.select("collection,id,data").maybeSingle();
      if (error) return plainErr(error);
      if (!got) return isNew ? "Not saved" : "The database did not allow changing this record";
      saved.add(k); keep(c, got.data); return "";
    }
    function keep(c, data) {
      data = clone(data);
      if (c === "driverpii") { const d = D.drivers.find(x => String(x.id) === String(data.id)); if (d) { d.lic = data.lic || ""; d.cnic = data.cnic || ""; } return; }
      if (c === "config") { mtypes = data.list; return; }
      const arr = D[c], i = arr.findIndex(x => String(x.id) === String(data.id));
      if (c === "drivers") { const o = i >= 0 ? arr[i] : {}; data.lic = o.lic || ""; data.cnic = o.cnic || ""; }
      if (i < 0) arr.push(data); else arr[i] = data;
    }
    const audit = (key, added, changed, bad) => { if (!(added || changed || bad)) return;
      sb.from("fleet_rows").insert({ collection: "audit", id: "A" + Date.now() + rid().slice(0, 6), data: { action: "IMPORTED", target: key, detail: "Excel import (main page): " + added + " added, " + changed + " updated" + (bad ? ", " + bad + " refused" : "") } }).then(() => {}, () => {}); };
    /* the plain sheets: prep(row) -> a message, or { c, id, data }; new rows go 100 at a time */
    async function saveRows(key, rows, progress, prep) {
      const failed = [], ins = [], upd = []; let done = 0, added = 0, changed = 0;
      const tick = n => { done += n; if (progress) progress(done); };
      for (const r of rows) {
        let p; try { p = prep(r); } catch (e) { p = plainErr(e); }
        if (typeof p === "string") { failed.push({ row: r.row, msg: p }); tick(1); continue; }
        cleanDeep(p.data); p.row = r.row; (saved.has(p.c + " " + p.id) ? upd : ins).push(p);
      }
      for (let i = 0; i < ins.length; i += 100) {
        const part = ins.slice(i, i + 100);
        const { data, error } = await sb.from("fleet_rows").insert(part.map(p => ({ collection: p.c, id: p.id, data: p.data }))).select("collection,id,data");
        if (!error && data && data.length === part.length) { data.forEach(g => { saved.add(g.collection + " " + g.id); keep(g.collection, g.data); }); added += part.length; tick(part.length); continue; }
        for (const p of part) { const m = await write(p.c, p.id, p.data).catch(plainErr); if (m) failed.push({ row: p.row, msg: m }); else added++; tick(1); }
      }
      for (let i = 0; i < upd.length; i += 6) await Promise.all(upd.slice(i, i + 6).map(async p => {
        const m = await write(p.c, p.id, p.data).catch(plainErr); if (m) failed.push({ row: p.row, msg: m }); else changed++; tick(1);
      }));
      audit(key, added, changed, failed.length);
      return failed;
    }
    const PREP = {
      departments: r => {   // { id: "D…", n, h, w, g }
        const d = r.data, o = r.update ? clone(r.update) : { id: "D" + rid(), n: d.n, h: "", w: "" };
        put(o, d, ["h", "g"]); if (has(d.w)) o.w = ph92(d.w);
        return { c: "departments", id: String(o.id), data: o };
      },
      vehicles: r => {   // { id: "V…", p, c, m, yr, ft, dp, odo, last, tank, s, docs: { reg, ins, fit, perm }, img? }
        const d = r.data, o = r.update ? clone(r.update) : { id: "V" + rid(), p: d.p, c: d.c, m: "", dp: "", odo: 0, last: 0, ft: "Petrol", s: "Active" };
        put(o, d, ["c", "m", "ft", "s"]); if (has(d.yr)) o.yr = String(d.yr); if (has(d.tank)) o.tank = d.tank;
        if (has(d.dp)) o.dp = deptName(d.dp);
        if (has(d.odo)) o.odo = Math.max(+o.odo || 0, d.odo);
        const docs = Object.assign({}, o.docs || {}); ["reg", "ins", "fit", "perm"].forEach(k => { if (has(d[k])) docs[k] = d[k]; });
        if (Object.keys(docs).length) o.docs = docs;
        return { c: "vehicles", id: String(o.id), data: o };
      },
      fuel: r => {   // numeric id; { id, date, time, late, lateMin, ent, v, c, drv, dept, l, pl, amt, odo, st, ftp, full, rcpt, ts } (+ by, ent from the database)
        const d = r.data, v = vehAt(d.v);
        const o = r.update ? clone(r.update) : { id: nid(), date: d.date, time: "", late: false, lateMin: 0, ent: stampNow(), v: v.p, c: v.c, drv: (D.drivers.find(x => x.v === v.p) || {}).n || "", dept: v.dp || "", l: 0, pl: 0, amt: 0, odo: 0, st: "", ftp: v.ft || "", full: false, rcpt: "", ts: new Date().toISOString() };
        if (r.update && low(o.v) !== low(v.p)) { o.c = v.c; o.dept = v.dp || ""; }
        o.v = v.p; put(o, d, ["date", "drv", "l", "pl", "odo", "ftp", "st", "rcpt"]); if (d.full != null) o.full = d.full;
        o.amt = has(d.amt) ? d.amt : Math.round((+o.l || 0) * (+o.pl || 0));
        return { c: "fuel", id: String(o.id), data: o };
      },
      maintenance: r => {   // numeric id; { id, v, type, date, odo, iv, ndo, nd, cost, w }
        const d = r.data, v = vehAt(d.v);
        const o = r.update ? clone(r.update) : { id: nid(), v: v.p, type: d.type, date: d.date, odo: cur(v), iv: 0, ndo: 0, nd: "", cost: 0, w: "" };
        o.v = v.p; put(o, d, ["type", "date", "odo", "nd", "cost", "w"]);
        const mt = mtypes.find(m => low(m.n) === low(o.type));
        if (has(d.iv)) o.iv = d.iv; else if (!r.update) o.iv = mt ? +mt[v.c] || 0 : 0;
        o.ndo = o.iv ? (+o.odo || 0) + o.iv : 0;
        return { c: "maintenance", id: String(o.id), data: o };
      },
      trips: r => {   // numeric id; { id, date, time, rcv, pay, opfref, late, lateMin, ent, v, c, drv, dept, from, to, pur, tst, tet, dur, os, oe, km, fuel, rem, ts } (km checked again by the database)
        const d = r.data, v = vehAt(d.v);
        const o = r.update ? clone(r.update) : { id: nid(), date: d.date, time: "", rcv: 0, pay: "", opfref: "", late: false, lateMin: 0, ent: stampNow(), v: v.p, c: v.c, drv: d.drv, dept: "", from: "", to: "", pur: "", tst: "", tet: "", dur: 0, os: 0, oe: 0, km: 0, fuel: 0, rem: "", ts: new Date().toISOString() };
        o.v = v.p; o.c = v.c; put(o, d, ["date", "tst", "tet", "drv", "from", "to", "pur", "os", "oe", "opfref", "rem"]);
        if (has(d.dept)) o.dept = deptName(d.dept);
        if (v.c === "Ambulance") { o.pay = d.pay || o.pay || "Cash"; if (has(d.rcv)) o.rcv = d.rcv; } else { o.pay = ""; o.rcv = 0; o.opfref = ""; }
        o.dur = dm(o.tst, o.tet); o.km = (+o.oe || 0) - (+o.os || 0);
        return { c: "trips", id: String(o.id), data: o };
      }
    };
    /* drivers: the public record { id: "R…", n, v, ph, lic_exp, email } in "drivers", licence no. and CNIC { id, lic, cnic } in "driverpii" */
    async function saveDrivers(rows, progress) {
      const failed = []; let added = 0, changed = 0, n = 0;
      for (const r of rows) {
        const d = r.data, t = HIT.get(d) || r.update;
        try {
          const base = t ? clone(t) : { id: "R" + rid(), n: d.n, v: "", ph: "", lic_exp: "", email: "" };
          delete base.lic; delete base.cnic;
          base.n = d.n; put(base, d, ["lic_exp"]); if (has(d.email)) base.email = d.email; if (has(d.ph)) base.ph = ph92(d.ph);
          if (has(d.v)) base.v = vehAt(d.v).p;
          const id = String(base.id), had = saved.has("drivers " + id);
          let m = await write("drivers", id, base);
          if (!m && (has(d.lic) || has(d.cnic))) {
            const me = D.drivers.find(x => String(x.id) === id) || {};
            const pm = await write("driverpii", id, { id: base.id, lic: has(d.lic) ? d.lic : me.lic || "", cnic: has(d.cnic) ? cnicFmt(d.cnic) : me.cnic || "" });
            if (pm) m = "Driver saved, but not the licence no. / CNIC: " + pm;
          }
          if (m) failed.push({ row: r.row, msg: m }); else if (had) changed++; else added++;
        } catch (e) { failed.push({ row: r.row, msg: plainErr(e) }); }
        if (progress) progress(++n);
      }
      audit("drivers", added, changed, failed.length);
      return failed;
    }
    /* service types are one setting: config / mtypes = { list: [{ n, Ambulance, Office, Bike }] } */
    async function saveMtypes(rows) {
      const list = clone(mtypes); let added = 0, changed = 0;
      for (const r of rows) {
        const d = r.data, i = list.findIndex(m => low(m.n) === low(d.n));
        const o = i >= 0 ? list[i] : { n: d.n, Ambulance: 5000, Office: 5000, Bike: 5000 };
        ["Ambulance", "Office", "Bike"].forEach(k => { if (has(d[k])) o[k] = d[k]; });
        if (i < 0) { list.push(o); added++; } else changed++;
      }
      if (list.length > 60) return failAll(rows, "At most 60 service types");
      const m = await write("config", "mtypes", { list }).catch(plainErr);
      if (m) return failAll(rows, m);
      audit("mtypes", added, changed, 0);
      return [];
    }

    const sheets = [
      { key: "departments", name: "Departments", about: "One row per department. A row with a department already in the portal updates it.",
        match: "n", find: n => dept(n),
        cols: [{ k: "n", h: "Department", req: true, max: 80, ex: "Health", aka: ["department name", "name"] },
          { k: "h", h: "Head of department", max: 80, ex: "Dr. Ahmed", aka: ["head name", "head"] },
          { k: "w", h: "Head WhatsApp", type: "phone", ex: "03001234567", aka: ["head whatsapp", "whatsapp"] },
          { k: "g", h: "WhatsApp group link", max: 200, pattern: /^https:\/\/(chat\.whatsapp\.com|wa\.me)\/[A-Za-z0-9?=&%._\/-]*$/, patternMsg: "must be a WhatsApp link like https://chat.whatsapp.com/…", ex: "https://chat.whatsapp.com/AbC123", aka: ["group link", "group"] }],
        check: d => { fileDept.add(low(d.n)); return ""; },
        rows: () => D.departments.map(d => ({ n: d.n, h: d.h, w: d.w, g: d.g })) },
      { key: "vehicles", name: "Vehicles", about: "One row per vehicle. A row with a Vehicle No already in the portal updates that vehicle.",
        match: "p", find: p => veh(p),
        cols: [{ k: "p", h: "Vehicle No", req: true, max: 30, ex: "LEB-1234", note: "Registration no. as on the number plate", aka: ["plate no", "plate", "registration no", "plate id"] },
          { k: "c", h: "Type", req: true, list: VT, note: "Office = car or van for office work" },
          { k: "m", h: "Make & model", max: 80, ex: "Toyota Hiace", aka: ["make model", "model"] },
          { k: "yr", h: "Model year", type: "int", min: 1950, max: 2100, ex: 2020, aka: ["year"] },
          { k: "ft", h: "Fuel type", list: FUELS },
          { k: "dp", h: "Department", max: 80, ex: "Health", note: "As written in the Departments sheet", aka: ["assigned department"] },
          { k: "odo", h: "Odometer (km)", type: "number", min: 0, ex: 45200, note: "Current reading. A lower number than the saved one is ignored", aka: ["current odometer", "odometer"] },
          { k: "tank", h: "Tank (litres)", type: "number", min: 0, ex: 70, aka: ["tank capacity"] },
          { k: "s", h: "Status", list: STATUS },
          { k: "reg", h: "Registration / token tax expiry", type: "date", aka: ["registration expiry"] },
          { k: "ins", h: "Insurance expiry", type: "date" },
          { k: "fit", h: "Fitness certificate expiry", type: "date", aka: ["fitness expiry"] },
          { k: "perm", h: "Route permit expiry", type: "date", aka: ["permit expiry"] }],
        check: d => { fileVeh.add(low(d.p)); return needDept(d.dp); },
        rows: () => D.vehicles.map(v => { const dc = v.docs || {}; return { p: v.p, c: v.c, m: v.m, yr: v.yr, ft: v.ft, dp: v.dp, odo: cur(v), tank: v.tank || "", s: v.s, reg: dc.reg, ins: dc.ins, fit: dc.fit, perm: dc.perm }; }) },
      { key: "drivers", name: "Drivers", about: "One row per driver (Compliance & Drivers). A row updates the driver with the same CNIC, licence no., login e-mail or name.",
        match: "n", find: n => D.drivers.find(x => low(x.n) === low(n)) || null,
        cols: [{ k: "n", h: "Driver name", req: true, max: 80, ex: "Muhammad Aslam", aka: ["name"] },
          { k: "email", h: "Portal login e-mail", type: "email", ex: "aslam@alkhidmat.org", note: "The e-mail the driver signs in with. It links the driver to the trips given to them", aka: ["login email", "email"] },
          { k: "v", h: "Vehicle No", max: 30, ex: "LEB-1234", note: "The vehicle this driver usually drives", aka: ["assigned vehicle plate", "vehicle plate", "vehicle"] },
          { k: "ph", h: "WhatsApp", type: "phone", ex: "03001234567" },
          { k: "lic_exp", h: "Licence expiry", type: "date", aka: ["license expiry"] },
          { k: "lic", h: "Licence no.", max: 30, ex: "ISB-123456", aka: ["licence no", "license no", "licence"] },
          { k: "cnic", h: "CNIC", max: 15, pattern: /^\d{5}-?\d{7}-?\d$/, patternMsg: "must be 13 digits, like 61101-1234567-1", ex: "61101-1234567-1" }],
        check: (d, upd) => {
          const cn = cnicFmt(d.cnic), byC = cn ? D.drivers.find(x => cnicFmt(x.cnic) === cn) : null;
          const byL = d.lic ? D.drivers.find(x => x.lic && low(x.lic) === low(d.lic)) : null;
          const byE = d.email ? D.drivers.find(x => x.email && low(x.email) === low(d.email)) : null;
          const hit = byC || byL || byE || upd;
          if (upd && hit !== upd) return "The name “" + d.n + "” is already used by another driver";
          if (byE && byE !== hit) return "The e-mail " + d.email + " is already used by driver " + byE.n;
          if (hit && hit !== upd) HIT.set(d, hit); else HIT.delete(d);
          return d.v ? needVeh(d.v) : "";
        },
        rows: () => D.drivers.map(d => ({ n: d.n, email: d.email, v: d.v, ph: d.ph, lic_exp: d.lic_exp, lic: d.lic, cnic: d.cnic })) },
      { key: "mtypes", name: "Service types", about: "Maintenance service types and how often each is due, in km, per vehicle type.",
        match: "n", find: n => mtypes.find(m => low(m.n) === low(n)) || null,
        cols: [{ k: "n", h: "Service", req: true, max: 60, ex: "Oil Change", aka: ["service type"] },
          { k: "Ambulance", h: "Every km (Ambulance)", type: "int", min: 0, ex: 3000, aka: ["ambulance"] },
          { k: "Office", h: "Every km (Office vehicle)", type: "int", min: 0, ex: 5000, aka: ["vehicle", "office"] },
          { k: "Bike", h: "Every km (Bike)", type: "int", min: 0, ex: 1000, aka: ["bike"] }],
        rows: () => mtypes.map(m => ({ n: m.n, Ambulance: m.Ambulance, Office: m.Office, Bike: m.Bike })) },
      { key: "fuel", name: "Fuel", about: "One row per fuel fill. Leave “Fuel entry no.” empty for a new fill; a row with a number updates that fill.",
        match: "id", find: byNo(D.fuel),
        cols: [Object.assign({ k: "id", h: "Fuel entry no.", note: "Leave empty for a new fill", aka: ["fuel id", "entry no"] }, NO),
          { k: "date", h: "Date", req: true, type: "date", ex: "30-10-2026" },
          { k: "v", h: "Vehicle No", req: true, max: 30, ex: "LEB-1234", aka: ["vehicle"] },
          { k: "drv", h: "Driver", max: 80, ex: "Muhammad Aslam" },
          { k: "l", h: "Litres", req: true, type: "number", min: 0.01, max: 2000, ex: 40 },
          { k: "pl", h: "Price per litre", req: true, type: "number", min: 0.01, max: 10000, ex: 280, aka: ["price l", "price"] },
          { k: "amt", h: "Amount (Rs)", type: "number", min: 0, max: 10000000, note: "Empty = litres × price per litre", aka: ["amount"] },
          { k: "odo", h: "Odometer (km)", req: true, type: "number", min: 1, ex: 45200, aka: ["odo"] },
          { k: "ftp", h: "Fuel type", list: FUELS, note: "Empty = the vehicle's fuel type", aka: ["type"] },
          { k: "st", h: "Fuel station", max: 80, aka: ["station"] },
          { k: "full", h: "Full tank", type: "yesno" },
          { k: "rcpt", h: "Receipt no.", max: 40, aka: ["receipt"] }],
        check: (d, upd) => noFound(d, upd, "Fuel entry") || (d.date > today() ? "The date cannot be in the future" : "") || needVeh(d.v),
        rows: () => D.fuel.map(f => ({ id: String(f.id), date: f.date, v: f.v, drv: f.drv, l: f.l, pl: f.pl, amt: f.amt, odo: f.odo, ftp: f.ftp, st: f.st, full: !!f.full, rcpt: f.rcpt })) },
      { key: "maintenance", name: "Maintenance", about: "One row per service or repair. Leave “Maintenance no.” empty for a new record.",
        match: "id", find: byNo(D.maintenance),
        cols: [Object.assign({ k: "id", h: "Maintenance no.", note: "Leave empty for a new record", aka: ["entry no"] }, NO),
          { k: "date", h: "Date", req: true, type: "date", ex: "30-10-2026" },
          { k: "v", h: "Vehicle No", req: true, max: 30, ex: "LEB-1234", aka: ["vehicle"] },
          { k: "type", h: "Service", req: true, max: 60, ex: "Oil Change", note: "A service type, e.g. " + mtypes.slice(0, 4).map(m => m.n).join(", "), aka: ["type", "service type"] },
          { k: "odo", h: "Odometer (km)", type: "number", min: 0, note: "Empty = the vehicle's latest reading", aka: ["odo"] },
          { k: "iv", h: "Next service after (km)", type: "int", min: 0, note: "Empty = from the service type", aka: ["every km"] },
          { k: "nd", h: "Next due date", type: "date" },
          { k: "cost", h: "Cost (Rs)", type: "number", min: 0, max: 100000000, aka: ["cost"] },
          { k: "w", h: "Workshop", max: 80 }],
        check: (d, upd) => noFound(d, upd, "Maintenance") || needVeh(d.v),
        rows: () => D.maintenance.map(m => ({ id: String(m.id), date: m.date, v: m.v, type: m.type, odo: m.odo, iv: m.iv, nd: m.nd, cost: m.cost, w: m.w })) },
      { key: "trips", name: "Trips", about: "Trip history (All Trips). Leave “Trip no.” empty for a new trip; a row with a number updates that trip.",
        match: "id", find: byNo(D.trips),
        cols: [Object.assign({ k: "id", h: "Trip no.", note: "Leave empty for a new trip", aka: ["trip id"] }, NO),
          { k: "date", h: "Date", req: true, type: "date", ex: "30-10-2026" },
          { k: "tst", h: "Start time", req: true, type: "time", ex: "09:00", aka: ["start"] },
          { k: "tet", h: "End time", req: true, type: "time", ex: "11:30", aka: ["end"] },
          { k: "v", h: "Vehicle No", req: true, max: 30, ex: "LEB-1234", aka: ["vehicle"] },
          { k: "drv", h: "Driver", req: true, max: 80, ex: "Muhammad Aslam" },
          { k: "dept", h: "Department", req: true, max: 80, ex: "Health", aka: ["dept"] },
          { k: "from", h: "From", req: true, max: 120 },
          { k: "to", h: "To", req: true, max: 120 },
          { k: "pur", h: "Purpose", req: true, max: 120, ex: "Patient Transport" },
          { k: "os", h: "Odometer start", req: true, type: "number", min: 0, ex: 45200, aka: ["odo start"] },
          { k: "oe", h: "Odometer end", req: true, type: "number", min: 0, ex: 45236, aka: ["odo end"] },
          { k: "pay", h: "Paid by", list: ["Cash", "OPF"], note: "Ambulance trips only", aka: ["pay"] },
          { k: "rcv", h: "Amount (Rs)", type: "number", min: 0, max: 10000000, note: "Ambulance trips only: cash received or the OPF claim", aka: ["amount"] },
          { k: "opfref", h: "OPF reference", max: 80, aka: ["opf ref"] },
          { k: "rem", h: "Remarks", max: 300 }],
        check: (d, upd) => noFound(d, upd, "Trip") || (d.date > today() ? "The trip date cannot be in the future" : "")
          || (d.oe < d.os ? "Odometer end must not be less than odometer start" : "") || (d.oe - d.os > 5000 ? "One trip can be at most 5,000 km" : "") || needVeh(d.v),
        rows: () => D.trips.map(t => ({ id: String(t.id), date: t.date, tst: t.tst, tet: t.tet, v: t.v, drv: t.drv, dept: t.dept, from: t.from, to: t.to, pur: t.pur, os: t.os, oe: t.oe,
          pay: t.c === "Ambulance" ? t.pay || "Cash" : "", rcv: t.c === "Ambulance" ? t.rcv || 0 : "", opfref: t.opfref, rem: t.rem })) }
    ];
    /* numeric ids are stored as numbers inside data (as the portal does); the row id is the same number as text */
    const numId = p => { if (["fuel", "maintenance", "trips"].includes(p.c)) p.data.id = +p.data.id; return p; };
    return {
      sheets,
      save: async (sheet, rows, progress) => ({
        failed: sheet.key === "drivers" ? await saveDrivers(rows, progress)
          : sheet.key === "mtypes" ? await saveMtypes(rows)
          : PREP[sheet.key] ? await saveRows(sheet.key, rows, progress, r => numId(PREP[sheet.key](r)))
          : failAll(rows, "This sheet cannot be imported")
      })
    };
  }

  (window.AKF_EXCEL_PORTALS = window.AKF_EXCEL_PORTALS || {}).fleet = { name: "Fleet & Ambulances Management", load };
})();
