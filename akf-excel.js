/* Alkhidmat Islamabad — ONE Excel format for every portal (rule: SECURITY-PROTOCOL.md §10).
   Used by the Super Admin only, on the main page → Settings → Excel import & export, which picks the portal and sheets.
   Each portal describes its format in erp/site/excel-<key>.js: AKF_EXCEL_PORTALS[key] = { name, load(sb) → { sheets, save } }.
   The main page then opens the window with:
     AKF_EXCEL.open({
       portal: "Fleet & Ambulances Management",
       sheets: [{
         key: "vehicles", name: "Vehicles", about: "One row per vehicle.",
         match: "reg",                       // optional: the column that finds an existing record (that row then updates it)
         find: v => existingRecordOrNull,    // optional, with match
         findRow: data => recordOrNull,      // optional: find an existing record by other columns when match is empty
         canImport: true, canExport: true,   // from the person's ticks (Add / Edit and Export)
         rows: () => [{ reg: "LEB-1234", type: "Ambulance" }],   // current records, for "Download with current data"
         cols: [
           { k: "reg",  h: "Vehicle No", req: true, ex: "LEB-1234", note: "As on the number plate" },
           { k: "type", h: "Type", req: true, list: ["Ambulance", "Car"] },
           { k: "seats", h: "Seats", type: "int", min: 1 },     // types: text (default), number, int, date, time, yesno, email, phone
           { k: "since", h: "Registered on", type: "date" } ] }],
       save: async (sheet, rows, progress) => ({ failed: [{ row: 7, msg: "Vehicle No already used" }] }),
         // rows: [{ row, data, update }] in file order; data uses the col keys; update = find() result or null.
         // Save through the portal's normal functions so the database rules and access ticks still apply.
       onExport: what => {}                 // optional: audit line ("blank" | "data")
     })
   The file: a "Read me" sheet, then one sheet per data type (headings in row 1, * = must be filled,
   drop-down lists, a help note on every heading). Upload reads every sheet in one go, shows what will be
   added / updated and every problem with its sheet, row and column, then saves all good rows at once.
   No external library; nothing leaves the browser except through the portal's own save. */
(function () {
  "use strict";
  if (window.AKF_EXCEL) return;
  const te = new TextEncoder(), td = new TextDecoder();
  const MAX_FILE = 15 * 1024 * 1024, MAX_ROWS = 20000, VALID_ROWS = 3000;

  /* ---------------------------------------------------------------- zip (store / deflate) */
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  async function deflateRaw(u) { if (!window.CompressionStream) return null; try { return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer()); } catch (e) { return null; } }
  async function inflateRaw(u) { return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()); }
  async function zipFiles(files, type) {
    const parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = te.encode(f.name), crc = crc32(f.data), comp = await deflateRaw(f.data), method = comp && comp.length < f.data.length ? 8 : 0, body = method ? comp : f.data;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, method, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, body.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, body);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + body.length;
    }
    const cd = central.reduce((s, u) => s + u.length, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cd, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: type || "application/zip" });
  }
  async function unzip(buf, want) {
    const u = new Uint8Array(buf), dv = new DataView(buf); let e = -1;
    for (let i = u.length - 22; i >= Math.max(0, u.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error("This is not an Excel (.xlsx) file. In Excel choose File → Save As → “Excel Workbook (.xlsx)” and try again.");
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {};
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = td.decode(u.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      if (want && !want(name)) continue;
      const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), data = u.subarray(start, start + size);
      out[name] = method === 0 ? data : method === 8 ? await inflateRaw(data) : null;
    }
    return out;
  }

  /* ---------------------------------------------------------------- reading every sheet */
  const xmlDec = s => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => { const k = e.toLowerCase(); return k === "lt" ? "<" : k === "gt" ? ">" : k === "amp" ? "&" : k === "quot" ? '"' : k === "apos" ? "'" : String.fromCodePoint(k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10)); });
  const colIdx = r => { let n = 0; for (const ch of r) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const colName = i => { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  function parseCSV(text) {
    const rows = []; let row = [], cur = "", q = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  /* → { "Sheet name": [[cell, …], …] }; numbers come back as { n } (dates, phone numbers are repaired later) */
  async function readBook(file) {
    if (file.size > MAX_FILE) throw new Error("This file is larger than 15 MB. Split it into smaller files.");
    if (/\.csv$/i.test(file.name || "") || file.type === "text/csv") return { "": parseCSV(await file.text()) };
    if (/\.xls$/i.test(file.name || "")) throw new Error("Old .xls files are not supported. In Excel choose File → Save As → “Excel Workbook (.xlsx)”.");
    const f = await unzip(await file.arrayBuffer(), n => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(n));
    const wb = f["xl/workbook.xml"] && td.decode(f["xl/workbook.xml"]), rels = f["xl/_rels/workbook.xml.rels"] && td.decode(f["xl/_rels/workbook.xml.rels"]);
    if (!wb || !rels) throw new Error("No worksheet was found in this file.");
    const ss = [];
    if (f["xl/sharedStrings.xml"]) td.decode(f["xl/sharedStrings.xml"]).replace(/<si>([\s\S]*?)<\/si>/g, (_, si) => { let t = ""; si.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (__, x) => { t += x; }); ss.push(xmlDec(t)); return ""; });
    const relOf = {}; [...rels.matchAll(/<Relationship\b[^>]*>/g)].forEach(m => { const id = (m[0].match(/\bId="([^"]+)"/) || [])[1], tg = (m[0].match(/\bTarget="([^"]+)"/) || [])[1]; if (id && tg) relOf[id] = tg.startsWith("/") ? tg.slice(1) : "xl/" + tg.replace(/^\.\//, ""); });
    const out = {};
    for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
      const name = xmlDec((m[0].match(/\bname="([^"]*)"/) || [])[1] || ""), id = (m[0].match(/\br:id="([^"]+)"/) || [])[1], path = relOf[id];
      if (!path || !f[path]) continue;
      const xml = td.decode(f[path]), rows = [], rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/g, cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
      let rm;
      while ((rm = rowRe.exec(xml))) {
        const rn = +((rm[1].match(/\br="(\d+)"/) || [])[1] || rows.length + 1);
        if (rn > MAX_ROWS + 1) break;
        const row = [], body = rm[2]; let cm; cRe.lastIndex = 0;
        while ((cm = cRe.exec(body))) {
          const a = cm[1], inner = cm[2] || "", ref = (a.match(/\br="([A-Z]+)\d+"/) || [])[1], t = (a.match(/\bt="(\w+)"/) || [])[1];
          let v = "";
          if (t === "inlineStr") { let s2 = ""; inner.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (_, x) => { s2 += x; }); v = xmlDec(s2); }
          else { const vm = inner.match(/<v>([\s\S]*?)<\/v>/); v = vm ? xmlDec(vm[1]) : ""; if (t === "s") v = ss[+v] || ""; else if (t === "b") v = v === "1" ? "Yes" : "No"; else if (!t || t === "n") v = v === "" ? "" : { n: +v }; }
          row[ref ? colIdx(ref) : row.length] = v;
        }
        rows[rn - 1] = row;
      }
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      out[name] = rows;
    }
    return out;
  }

  /* ---------------------------------------------------------------- writing the format */
  const xe = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main", R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  /* styles: 0 normal · 1 heading (must fill) · 2 heading (optional) · 3 title · 4 section band · 5 wrapped text · 6 grey note · 7 text cell (keeps 0300…) · 8 bold */
  const STYLES = H + `<styleSheet xmlns="${NS}"><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF0B3D91"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF0B3D91"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF5B6B82"/><name val="Calibri"/></font></fonts>`
    + `<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B51A7"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5E8FD2"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7EFFA"/><bgColor indexed="64"/></patternFill></fill></fills>`
    + `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
    + `<cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
    + `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`
    + `<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`
    + `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>`
    + `<xf numFmtId="0" fontId="3" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>`
    + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`
    + `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`
    + `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`
    + `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>`
    + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  function sheetXml(sh) {
    const o = [H + `<worksheet xmlns="${NS}" xmlns:r="${R}"><sheetViews><sheetView workbookViewId="0"${sh.first ? ' tabSelected="1"' : ""}>${sh.freeze ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : ""}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>`];
    if (sh.widths) o.push("<cols>" + sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${sh.colStyle && sh.colStyle[i] ? ` style="${sh.colStyle[i]}"` : ""}/>`).join("") + "</cols>");
    o.push("<sheetData>");
    sh.rows.forEach((r, ri) => {
      const st = (sh.styles && sh.styles[ri]) || [], ht = sh.heights && sh.heights[ri];
      let s = `<row r="${ri + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ""}>`;
      r.forEach((v, ci) => {
        const ref = colName(ci) + (ri + 1), sid = typeof st === "number" ? st : st[ci], sa = sid ? ` s="${sid}"` : "";
        if (v == null || v === "") { if (sid) s += `<c r="${ref}"${sa}/>`; return; }
        s += typeof v === "number" && isFinite(v) ? `<c r="${ref}"${sa}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${sa}><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
      });
      o.push(s + "</row>");
    });
    o.push("</sheetData>");
    if (sh.merges && sh.merges.length) o.push(`<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`);
    if (sh.valid && sh.valid.length) o.push(`<dataValidations count="${sh.valid.length}">${sh.valid.join("")}</dataValidations>`);
    o.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>');
    return o.join("");
  }
  async function writeBook(sheets) {
    const files = [
      ["[Content_Types].xml", H + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
      ["_rels/.rels", H + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ["xl/workbook.xml", H + `<workbook xmlns="${NS}" xmlns:r="${R}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((sh, i) => `<sheet name="${xe(sh.name.slice(0, 31))}" sheetId="${i + 1}"${sh.hidden ? ' state="hidden"' : ""} r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
      ["xl/_rels/workbook.xml.rels", H + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>`],
      ["xl/styles.xml", STYLES]
    ].concat(sheets.map((sh, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sh)]));
    return zipFiles(files.map(([name, s]) => ({ name, data: te.encode(s) })), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }
  function saveBlob(blob, name) {
    const a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------------------------------------------------------------- the format for one portal */
  const TYPE_HELP = { text: "Text", number: "A number, e.g. 2500 or 12.5", int: "A whole number, e.g. 4", date: "A date: 30-10-2026 (day-month-year) or 2026-10-30", time: "A time: 14:30", yesno: "Yes or No", email: "An e-mail address", phone: "A phone number, e.g. 03001234567" };
  const typeOf = c => c.list ? "list" : c.type || "text";
  const headOf = c => c.h + (c.req ? " *" : "");
  const sheetName = s => String(s.name).replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
  function whatToWrite(c) {
    const t = typeOf(c);
    let s = t === "list" ? "Pick one: " + c.list.join(" / ") : TYPE_HELP[t] || "Text";
    if (c.min != null) s += ` (at least ${c.min})`;
    if (c.note) s += ". " + c.note;
    return s.length > 250 ? s.slice(0, 247) + "…" : s;
  }
  function buildBook(def, withData) {
    const sheets = def.sheets.filter(s => withData ? s.canExport !== false && s.rows : s.canImport !== false || s.canExport !== false);
    const today = new Date().toISOString().slice(0, 10);
    /* Read me */
    const rm = [], st = {}, merges = [];
    const put = (row, style, merge) => { if (style != null) st[rm.length] = style; if (merge) { const [a, b] = merge === true ? ["A", "D"] : merge.split(":"); merges.push(`${a}${rm.length + 1}:${b}${rm.length + 1}`); } rm.push(row); };
    put([def.portal + " — Excel format"], 3, true);
    put(["Alkhidmat Foundation Islamabad · " + (withData ? "current data" : "blank format") + " · downloaded " + today], 6, true);
    put([""]);
    put(["How to use this file"], 4, true);
    [["1", "Fill the sheets at the bottom of this file (" + sheets.map(sheetName).join(", ") + "). You can fill only the sheets you need."],
     ["2", "Write one record per row, starting in row 2. Do not change the headings in row 1. Headings with * must be filled."],
     ["3", "Click any heading or cell to see what to write there. Where a cell shows a small arrow, pick from the list."],
     ["4", "Save the file as Excel (.xlsx). In the portal open “Excel import & export” → Choose the filled file, check the preview, then press Import."],
     ["5", "Rows with a problem are not saved. The portal shows the sheet, row and column, and gives you the rows back with a “Problem” column to fix and upload again."]].forEach(r => put([r[0], r[1]], [8, 5, 5, 5], "B:D"));
    sheets.forEach(s => {
      put([""]);
      put(["Sheet: " + sheetName(s) + (s.about ? " — " + s.about : "")], 4, true);
      if (s.match) put(["", "A row whose “" + (s.cols.find(c => c.k === s.match) || { h: s.match }).h + "” is already in the portal updates that record; otherwise a new record is added."], [0, 6, 6, 6], "B:D");
      put(["Column", "Must fill?", "What to write", "Example"], 8);
      s.cols.forEach(c => put([c.h, c.req ? "Yes" : "No", whatToWrite(c), c.ex == null ? "" : String(c.ex)], [8, 0, 5, 7]));
    });
    const out = [{ name: "Read me", first: true, rows: rm, widths: [26, 12, 70, 24], styles: st, merges }];
    /* one sheet per data type, with drop-downs from a hidden "Lists" sheet */
    const lists = [];
    sheets.forEach(s => {
      const cols = s.cols, valid = [], N = VALID_ROWS + 1;
      cols.forEach((c, i) => {
        const ref = `${colName(i)}2:${colName(i)}${N}`, t = typeOf(c);
        const prompt = `promptTitle="${xe(c.h.slice(0, 32))}" prompt="${xe(whatToWrite(c).slice(0, 250))}"`;
        if (t === "list") {
          const li = lists.length; lists.push([c.h, ...c.list]);
          valid.push(`<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Pick from the list" error="Pick one of the values in the list (click the arrow)." ${prompt} sqref="${ref}"><formula1>Lists!$${colName(li)}$2:$${colName(li)}$${c.list.length + 1}</formula1></dataValidation>`);
        } else if (t === "yesno") valid.push(`<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Yes or No" error="Write Yes or No." ${prompt} sqref="${ref}"><formula1>"Yes,No"</formula1></dataValidation>`);
        else if (t === "int" || t === "number") valid.push(`<dataValidation type="${t === "int" ? "whole" : "decimal"}" operator="greaterThanOrEqual" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorStyle="warning" errorTitle="A number" error="This column takes a number." ${prompt} sqref="${ref}"><formula1>${c.min != null ? +c.min : -999999999}</formula1></dataValidation>`);
        else valid.push(`<dataValidation allowBlank="1" showInputMessage="1" ${prompt} sqref="${ref}"/>`);
      });
      const rows = [cols.map(headOf)];
      if (withData) (s.rows() || []).forEach(rec => rows.push(cols.map(c => toCell(c, rec[c.k]))));
      out.push({ name: sheetName(s), freeze: true, rows, widths: cols.map(c => Math.min(48, Math.max(14, c.h.length + 4, c.w || 0))), colStyle: cols.map(c => ["date", "number", "int"].includes(typeOf(c)) ? 0 : 7), styles: { 0: cols.map(c => c.req ? 1 : 2) }, heights: { 0: 30 }, valid });
    });
    if (lists.length) {
      const L = [lists.map(l => l[0])], n = Math.max(...lists.map(l => l.length));
      for (let i = 1; i < n; i++) L.push(lists.map(l => l[i] == null ? "" : l[i]));
      out.push({ name: "Lists", hidden: true, rows: L });
    }
    return out;
  }
  function toCell(c, v) {
    if (v == null || v === "") return "";
    const t = typeOf(c);
    if (t === "yesno") return v === true || /^(y|yes|true|1)$/i.test(String(v)) ? "Yes" : "No";
    if (t === "number" || t === "int") return isFinite(+v) ? +v : String(v);
    if (t === "date") { const d = String(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(8, 10) + "-" + d.slice(5, 7) + "-" + d.slice(0, 4) : String(v); }
    if (Array.isArray(v)) return v.join(", ");
    return String(v);
  }

  /* ---------------------------------------------------------------- checking one value */
  const norm = s => String(s == null ? "" : s).toLowerCase().replace(/\*/g, "").replace(/[^a-z0-9؀-ۿ]+/g, "");
  const clean = s => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  function parseDate(v) {
    if (v && typeof v === "object" && "n" in v) { const n = v.n; if (n > 59 && n < 2958466) { const d = new Date(Math.round((n - 25569) * 864e5)); return d.toISOString().slice(0, 10); } return null; }
    const s = clean(v); let m;
    const ok = (y, mo, d) => { y = +y; if (y < 100) y += 2000; const dt = new Date(y, mo - 1, +d); return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === +d ? iso(dt) : null; };
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return ok(m[1], +m[2], m[3]);
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) return ok(m[3], +m[2], m[1]);
    if ((m = s.match(/^(\d{1,2})[\s-]+([a-z]{3,9})[\s,-]+(\d{2,4})$/i)) && MON[m[2].toLowerCase().slice(0, m[2].length > 3 && m[2].toLowerCase().startsWith("sept") ? 4 : 3)]) return ok(m[3], MON[m[2].toLowerCase().slice(0, 3)], m[1]);
    if ((m = s.match(/^([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/i)) && MON[m[1].toLowerCase().slice(0, 3)]) return ok(m[3], MON[m[1].toLowerCase().slice(0, 3)], m[2]);
    return null;
  }
  function check(c, raw) {
    const t = typeOf(c), isNum = raw && typeof raw === "object" && "n" in raw;
    const s = isNum ? String(raw.n) : clean(raw);
    if (s === "") return c.req ? { err: "must be filled" } : { v: t === "yesno" ? null : "" };
    switch (t) {
      case "number": case "int": {
        const n = isNum ? raw.n : Number(s.replace(/,/g, "").replace(/^(rs\.?|pkr)\s*/i, ""));
        if (!isFinite(n)) return { err: "must be a number (you wrote “" + s.slice(0, 30) + "”)" };
        if (t === "int" && !Number.isInteger(n)) return { err: "must be a whole number" };
        if (c.min != null && n < c.min) return { err: "must be at least " + c.min };
        if (c.max != null && n > c.max) return { err: "must be at most " + c.max };
        return { v: n };
      }
      case "date": { const d = parseDate(raw); return d ? { v: d } : { err: "is not a date I can read — write it like 30-10-2026" }; }
      case "time": {
        if (isNum && raw.n >= 0 && raw.n < 1) { const mins = Math.round(raw.n * 1440); return { v: String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0") }; }
        const m = s.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i); if (!m) return { err: "is not a time — write it like 14:30" };
        let h = +m[1]; if (m[3]) { if (h === 12) h = 0; if (/pm/i.test(m[3])) h += 12; }
        return h < 24 && +m[2] < 60 ? { v: String(h).padStart(2, "0") + ":" + m[2] } : { err: "is not a time — write it like 14:30" };
      }
      case "yesno": return /^(y|yes|true|1|ہاں|haan|ha)$/i.test(s) ? { v: true } : /^(n|no|false|0|نہیں|nahi)$/i.test(s) ? { v: false } : { err: "must be Yes or No" };
      case "list": { const hit = c.list.find(x => norm(x) === norm(s)); return hit != null ? { v: hit } : { err: "must be one of: " + c.list.slice(0, 12).join(", ") + (c.list.length > 12 ? "…" : "") }; }
      case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? { v: s.toLowerCase() } : { err: "is not an e-mail address" };
      case "phone": { let d = s.replace(/[^\d+]/g, ""); if (isNum && /^3\d{9}$/.test(d)) d = "0" + d; return d.replace(/\D/g, "").length >= 7 && d.length <= 16 ? { v: d } : { err: "is not a phone number" }; }
      default: {
        const max = c.max || 500;
        if (s.length > max) return { err: "is too long (" + max + " characters at most)" };
        if (c.pattern && !c.pattern.test(s)) return { err: c.patternMsg || "is not in the right form" };
        return { v: s };
      }
    }
  }
  /* the uploaded book → per sheet: rows ready, problems */
  function readAgainst(def, book) {
    const names = Object.keys(book), res = [], problems = [];
    const usable = def.sheets.filter(s => s.canImport !== false);
    usable.forEach(s => {
      let nm = names.find(n => norm(n) === norm(sheetName(s)) || norm(n) === norm(s.key));
      if (nm == null && names.length === 1 && names[0] === "" && usable.length === 1) nm = "";
      const out = { sheet: s, found: nm != null, rows: [], bad: 0, add: 0, upd: 0, file: nm };
      res.push(out);
      if (nm == null) return;
      const grid = book[nm], hi = grid.findIndex(r => r && r.some(v => v !== "" && v != null));
      if (hi < 0) return;
      const head = grid[hi].map(h => norm(h && typeof h === "object" ? h.n : h)), pos = {};
      s.cols.forEach(c => { const keys = [norm(c.h), norm(c.k), ...(c.aka || []).map(norm)]; const i = head.findIndex(h => h && keys.includes(h)); if (i >= 0) pos[c.k] = i; });
      const missing = s.cols.filter(c => c.req && pos[c.k] == null);
      if (missing.length) { out.missingCols = missing.map(c => c.h); problems.push({ sheet: sheetName(s), row: hi + 1, col: missing.map(c => c.h).join(", "), msg: "Heading not found. Download the format again and copy your rows into it." }); out.bad = 1; return; }
      const seen = new Map();
      for (let i = hi + 1; i < grid.length; i++) {
        const r = grid[i] || []; if (!r.some(v => v !== "" && v != null && !(typeof v === "string" && !v.trim()))) continue;
        const data = {}, errs = [];
        s.cols.forEach(c => { if (pos[c.k] == null) return; const k = check(c, r[pos[c.k]]); if (k.err) errs.push({ col: c.h, msg: c.h + " " + k.err }); else data[c.k] = k.v; });
        let update = null;
        if (!errs.length && s.match && data[s.match] !== "" && data[s.match] != null) {
          const key = norm(data[s.match]);
          if (seen.has(key)) errs.push({ col: (s.cols.find(c => c.k === s.match) || {}).h, msg: "the same " + (s.cols.find(c => c.k === s.match) || {}).h + " is on row " + seen.get(key) + " too" });
          else { seen.set(key, i + 1); update = s.find ? s.find(data[s.match]) || null : null; }
        }
        if (!errs.length && !update && s.findRow) update = s.findRow(data) || null;   /* matched another way (old code, CNIC …) */
        if (!errs.length && s.check) { const m = s.check(data, update); if (m) errs.push({ col: "", msg: m }); }
        const row = { row: i + 1, data, update, err: errs.map(e => e.msg).join("; "), raw: r };
        if (errs.length) { out.bad++; errs.forEach(e => problems.push({ sheet: sheetName(s), row: i + 1, col: e.col, msg: e.msg })); }
        else if (update) out.upd++; else out.add++;
        out.rows.push(row);
      }
      out.head = grid[hi]; out.headRow = hi;
    });
    return { res, problems, unknown: names.filter(n => n && !/^(read me|readme|lists|instructions|problems)$/i.test(n.trim()) && !def.sheets.some(s => norm(n) === norm(sheetName(s)) || norm(n) === norm(s.key))) };
  }

  /* ---------------------------------------------------------------- the window */
  const CSS = `
.akx-ov{position:fixed;inset:0;z-index:9300;background:rgba(5,20,52,.55);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:28px 12px;font:14.5px/1.5 "Segoe UI Variable Text","Segoe UI",Inter,system-ui,sans-serif}
.akx{width:min(980px,100%);background:var(--surface,var(--card,#fff));color:var(--ink,var(--text,#0B1B33));border:1px solid var(--border,var(--line,#E3E9F2));border-radius:22px;box-shadow:0 30px 80px -20px rgba(5,25,70,.55);overflow:hidden;animation:akxPop .35s cubic-bezier(.34,1.56,.64,1)}
@keyframes akxPop{from{opacity:0;transform:translateY(16px) scale(.97)}}
.akx-head{display:flex;align-items:center;gap:12px;padding:16px 14px 16px 20px;color:#fff;background:linear-gradient(120deg,#0B51A7 0%,#0A3F95 45%,#062E73 100%);position:relative;overflow:hidden}
.akx-head::after{content:"";position:absolute;width:200px;height:200px;right:-60px;top:-100px;border-radius:50%;background:#19C2AE;filter:blur(40px);opacity:.45;pointer-events:none}
.akx-head .ic{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:rgba(255,255,255,.16);flex:none;position:relative;z-index:1}
.akx-head .t{flex:1;min-width:0;position:relative;z-index:1}.akx-head b{display:block;font-size:17px}.akx-head small{display:block;font-size:12.5px;opacity:.85}
.akx-x{position:relative;z-index:1;width:36px;height:36px;border:0;border-radius:10px;background:transparent;color:#fff;cursor:pointer;font-size:22px;line-height:1}.akx-x:hover{background:rgba(255,255,255,.16)}
.akx-body{padding:18px 20px 22px;display:flex;flex-direction:column;gap:16px}
.akx-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.akx-step{border:1px solid var(--border,var(--line,#E3E9F2));border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px;background:var(--surface-2,var(--bg,#F6F9FD))}
.akx-step .n{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-weight:800;color:#fff;background:linear-gradient(135deg,#1A66CC,#06368A)}
.akx-step b{font-size:15px}.akx-step p{margin:0;font-size:13px;color:var(--ink-2,var(--muted,#3A4B66))}
.akx-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 16px;border-radius:12px;border:1px solid transparent;font:inherit;font-weight:700;font-size:14px;cursor:pointer;transition:transform .2s,box-shadow .2s;text-align:center}
.akx-btn:disabled{opacity:.5;cursor:not-allowed}
.akx-p{color:#fff;background:linear-gradient(135deg,#1A66CC,#0B51A7 50%,#06368A);box-shadow:0 10px 22px -12px rgba(11,81,167,.8)}.akx-p:not(:disabled):hover{transform:translateY(-1px)}
.akx-g{color:var(--ink,#0B1B33);background:var(--surface,#fff);border-color:var(--border,#D5DEEA)}.akx-g:not(:disabled):hover{border-color:#0B51A7}
.akx-drop{border:2px dashed var(--border,#C9D6E8);border-radius:14px;padding:12px;text-align:center;font-size:13px;color:var(--ink-3,#5B6B82);transition:border-color .2s,background .2s}
.akx-drop.on{border-color:#0B51A7;background:rgba(11,81,167,.06)}
.akx-sum{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.akx-card{border:1px solid var(--border,#E3E9F2);border-radius:14px;padding:12px 14px}
.akx-card b{display:block;margin-bottom:4px}.akx-chips{display:flex;flex-wrap:wrap;gap:6px}
.akx-chip{font-size:12px;font-weight:700;border-radius:99px;padding:2px 9px;background:rgba(11,81,167,.1);color:#0B51A7}
.akx-chip.ok{background:rgba(22,163,74,.12);color:#15803D}.akx-chip.bad{background:rgba(229,72,77,.12);color:#C2272D}.akx-chip.dim{background:rgba(100,116,139,.12);color:#64748B}
.akx-note{border-radius:12px;padding:10px 14px;font-size:13.5px;background:rgba(11,81,167,.08)}.akx-note.bad{background:rgba(229,72,77,.1)}.akx-note.ok{background:rgba(22,163,74,.1)}
.akx-tbl{max-height:300px;overflow:auto;border:1px solid var(--border,#E3E9F2);border-radius:12px}
.akx-tbl table{width:100%;border-collapse:collapse;font-size:13px}.akx-tbl th{position:sticky;top:0;background:var(--surface-2,#F1F5FB);text-align:left;padding:8px 10px;font-size:12px}
.akx-tbl td{padding:7px 10px;border-top:1px solid var(--border,#EEF2F8);vertical-align:top}
.akx-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:flex-end}.akx-row .grow{flex:1;min-width:180px;font-size:13px;color:var(--ink-3,#5B6B82)}
.akx-bar{height:8px;border-radius:99px;background:var(--surface-2,#E8EEF7);overflow:hidden}.akx-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#19C2AE,#0B51A7);transition:width .3s}
.akx [hidden]{display:none!important}
@media(max-width:760px){.akx-ov{padding:0;align-items:flex-end}.akx{border-radius:22px 22px 0 0;max-height:94vh;overflow:auto}.akx-steps{grid-template-columns:1fr}.akx-body{padding:16px}}
@media(prefers-reduced-motion:reduce){.akx{animation:none}}`;
  function el(tag, attrs, kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue; if (k === "text") e.textContent = v; else if (k === "on") for (const ev in v) e.addEventListener(ev, v[ev]); else e.setAttribute(k, v === true ? "" : v); }
    (kids || []).forEach(c => c != null && e.append(c));
    return e;
  }
  const SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8l8 8M16 8l-8 8"/></svg>';
  const fileBase = def => String(def.file || def.portal).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function open(def) {
    if (!def || !Array.isArray(def.sheets) || !def.sheets.length) return;
    if (!document.getElementById("akx-css")) document.head.appendChild(el("style", { id: "akx-css", text: CSS }));
    const prev = document.activeElement;
    const canIn = def.sheets.some(s => s.canImport !== false), canOut = def.sheets.some(s => s.canExport !== false && s.rows);
    const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); prev && prev.focus && prev.focus(); };
    const onKey = e => { if (e.key === "Escape" && !busy) close(); };
    let busy = false, last = null;
    const say = (kind, text) => { msg.className = "akx-note" + (kind ? " " + kind : ""); msg.textContent = text; msg.hidden = !text; };
    const run = async (fn) => { if (busy) return; busy = true; try { await fn(); } catch (e) { say("bad", (e && e.message) || "Something went wrong. Try again."); } busy = false; };

    const dl = (withData) => run(async () => {
      const blob = await writeBook(buildBook(def, withData));
      saveBlob(blob, `AKF-${fileBase(def)}-${withData ? "data-" + new Date().toISOString().slice(0, 10) : "Excel-format"}.xlsx`);
      def.onExport && def.onExport(withData ? "data" : "blank");
      say("ok", withData ? "Downloaded your current data in the Excel format. Change it and upload it again to update." : "Downloaded the Excel format. Fill it in, save it, and upload it here.");
    });
    const pick = el("input", { type: "file", accept: ".xlsx,.csv", hidden: true, on: { change: e => { const f = e.target.files[0]; e.target.value = ""; if (f) readFile(f); } } });
    const drop = el("div", { class: "akx-drop", text: "or drop the file here" });
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("on"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("on"); }));
    drop.addEventListener("drop", e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) readFile(f); });
    const names = def.sheets.filter(s => s.canImport !== false || s.canExport !== false).map(sheetName);
    const steps = el("div", { class: "akx-steps" }, [
      el("div", { class: "akx-step" }, [el("span", { class: "n", text: "1" }), el("b", { text: "Get the format" }), el("p", { text: "One Excel file with a sheet for each: " + names.join(", ") + "." }),
        el("button", { class: "akx-btn akx-p", type: "button", text: "Download Excel format", on: { click: () => dl(false) } }),
        canOut ? el("button", { class: "akx-btn akx-g", type: "button", text: "Download with current data", on: { click: () => dl(true) } }) : null]),
      el("div", { class: "akx-step" }, [el("span", { class: "n", text: "2" }), el("b", { text: "Fill it in" }), el("p", { text: "One row per record, from row 2. Headings with * must be filled. Click a heading to see what to write; pick from the arrow lists. The “Read me” sheet explains every column." })]),
      el("div", { class: "akx-step" }, [el("span", { class: "n", text: "3" }), el("b", { text: "Upload it" }), el("p", { text: canIn ? "Every sheet is read in one go. You see what will be added, updated and any problem before anything is saved." : "You can download only. Ask the Super Admin for the Add tick to upload." }),
        canIn ? el("button", { class: "akx-btn akx-p", type: "button", text: "Choose the filled file", on: { click: () => pick.click() } }) : null, canIn ? drop : null, pick])
    ]);
    const msg = el("div", { class: "akx-note", hidden: true, role: "status" });
    const preview = el("div", { hidden: true, style: "display:flex;flex-direction:column;gap:12px" });
    const body = el("div", { class: "akx-body" }, [steps, msg, preview]);
    const box = el("div", { class: "akx", role: "dialog", "aria-modal": "true", "aria-label": "Excel import and export" }, [
      el("div", { class: "akx-head" }, [(() => { const i = el("span", { class: "ic" }); i.innerHTML = SVG; return i; })(), el("div", { class: "t" }, [el("b", { text: "Excel import & export" }), el("small", { text: def.portal })]), el("button", { class: "akx-x", type: "button", "aria-label": "Close", text: "×", on: { click: () => { if (!busy) close(); } } })]),
      body]);
    const ov = el("div", { class: "akx-ov", on: { mousedown: e => { if (e.target === ov && !busy) close(); } } }, [box]);
    document.body.appendChild(ov); document.addEventListener("keydown", onKey);
    box.querySelector(".akx-x").focus();

    function readFile(f) {
      run(async () => {
        say("", "Reading " + f.name + "…"); preview.hidden = true;
        const book = await readBook(f);
        last = { file: f.name, ...readAgainst(def, book) };
        say("", ""); showPreview();
      });
    }
    function problemTable(list) {
      const t = el("table", null, [el("thead", null, [el("tr", null, ["Sheet", "Row", "Column", "Problem"].map(h => el("th", { text: h })))]), el("tbody", null, list.slice(0, 300).map(p => el("tr", null, [el("td", { text: p.sheet }), el("td", { text: String(p.row) }), el("td", { text: p.col || "" }), el("td", { text: p.msg })])))]);
      return el("div", { class: "akx-tbl" }, [t]);
    }
    function showPreview() {
      const L = last, ready = L.res.reduce((s, r) => s + r.add + r.upd, 0), found = L.res.filter(r => r.found);
      preview.replaceChildren();
      preview.append(el("div", { class: "akx-row", style: "justify-content:flex-start" }, [el("b", { text: "Check before saving · " + L.file })]));
      if (!found.length) { preview.append(el("div", { class: "akx-note bad", text: "None of this portal's sheets (" + def.sheets.filter(s => s.canImport !== false).map(sheetName).join(", ") + ") were found in this file. Download the Excel format and copy your rows into it." })); preview.hidden = false; return; }
      preview.append(el("div", { class: "akx-sum" }, L.res.map(r => el("div", { class: "akx-card" }, [el("b", { text: sheetName(r.sheet) }), el("div", { class: "akx-chips" }, r.found ? [
        r.add ? el("span", { class: "akx-chip ok", text: r.add + " new" }) : null, r.upd ? el("span", { class: "akx-chip", text: r.upd + " update" }) : null,
        r.bad ? el("span", { class: "akx-chip bad", text: r.bad + " with a problem" }) : null, !r.add && !r.upd && !r.bad ? el("span", { class: "akx-chip dim", text: "empty" }) : null] : [el("span", { class: "akx-chip dim", text: "not in the file" })])]))));
      if (L.unknown.length) preview.append(el("div", { class: "akx-note", text: "Not read (not part of this portal's format): " + L.unknown.join(", ") + "." }));
      if (L.problems.length) {
        preview.append(el("div", { class: "akx-note bad", text: L.problems.length + " problem" + (L.problems.length > 1 ? "s" : "") + " found. These rows are not saved. Fix them in Excel and upload the file again (rows already saved are recognised" + (def.sheets.some(s => s.match) ? " and updated, not doubled" : "") + ")." }));
        preview.append(problemTable(L.problems));
      }
      const bar = el("div", { class: "akx-bar", hidden: true }, [el("i")]);
      const go = el("button", { class: "akx-btn akx-p", type: "button", text: ready ? "Import " + ready + " row" + (ready > 1 ? "s" : "") : "Nothing to import", disabled: !ready, on: { click: () => doImport(bar, go) } });
      preview.append(bar, el("div", { class: "akx-row" }, [el("span", { class: "grow", text: ready ? "Saved through the portal's normal rules — the same checks as typing them in." : "" }),
        L.problems.length ? el("button", { class: "akx-btn akx-g", type: "button", text: "Download file with problems marked", on: { click: () => run(() => downloadMarked(L)) } }) : null,
        el("button", { class: "akx-btn akx-g", type: "button", text: "Choose another file", on: { click: () => pick.click() } }), go]));
      preview.hidden = false;
    }
    async function downloadMarked(L, extra) {
      const fails = extra || {};
      const sheets = [];
      L.res.forEach(r => {
        if (!r.found || !r.head) return;
        const head = [...r.head.map(h => h && typeof h === "object" ? h.n : h), "Problem"];
        const rows = r.rows.filter(x => x.err || fails[sheetName(r.sheet) + "#" + x.row]).map(x => { const a = r.sheet.cols.length ? [...Array(head.length - 1)].map((_, i) => { const v = x.raw[i]; return v && typeof v === "object" ? v.n : v == null ? "" : v; }) : []; a.push(x.err || fails[sheetName(r.sheet) + "#" + x.row]); return a; });
        if (rows.length) sheets.push({ name: sheetName(r.sheet), freeze: true, rows: [head, ...rows], widths: head.map((h, i) => i === head.length - 1 ? 60 : Math.min(40, Math.max(14, String(h || "").length + 4))), styles: { 0: head.map((h, i) => i === head.length - 1 ? 1 : 2) }, colStyle: head.map(() => 7) });
      });
      if (!sheets.length) return;
      saveBlob(await writeBook(sheets), `AKF-${fileBase(def)}-problems-${new Date().toISOString().slice(0, 10)}.xlsx`);
    }
    function doImport(bar, go) {
      run(async () => {
        go.disabled = true; bar.hidden = false; const fill = bar.firstChild;
        const work = last.res.filter(r => r.add + r.upd > 0), total = work.reduce((s, r) => s + r.add + r.upd, 0);
        let doneN = 0, saved = 0; const fails = {}, failList = [];
        for (const r of work) {
          const rows = r.rows.filter(x => !x.err).map(x => ({ row: x.row, data: x.data, update: x.update }));
          say("", "Saving " + sheetName(r.sheet) + "…");
          let res;
          try { res = await def.save(r.sheet, rows, n => { fill.style.width = Math.min(100, Math.round((doneN + n) / total * 100)) + "%"; }); }
          catch (e) { res = { failed: rows.map(x => ({ row: x.row, msg: (e && e.message) || "Not saved" })) }; }
          const failed = (res && res.failed) || [];
          failed.forEach(f => { fails[sheetName(r.sheet) + "#" + f.row] = f.msg; failList.push({ sheet: sheetName(r.sheet), row: f.row, col: "", msg: f.msg }); });
          saved += rows.length - failed.length; doneN += rows.length; fill.style.width = Math.round(doneN / total * 100) + "%";
        }
        const skipped = last.problems.length;
        preview.replaceChildren();
        preview.append(el("div", { class: "akx-note " + (failList.length || skipped ? "bad" : "ok"), text: "Done. " + saved + " row" + (saved === 1 ? "" : "s") + " saved" + (failList.length ? " · " + failList.length + " refused by the portal's rules" : "") + (skipped ? " · " + skipped + " problem" + (skipped > 1 ? "s" : "") + " in the file (not saved)" : "") + "." }));
        if (failList.length) preview.append(problemTable(failList));
        const L = last;
        preview.append(el("div", { class: "akx-row" }, [
          failList.length || skipped ? el("button", { class: "akx-btn akx-g", type: "button", text: "Download the rows not saved", on: { click: () => run(() => downloadMarked(L, fails)) } }) : null,
          el("button", { class: "akx-btn akx-g", type: "button", text: "Upload another file", on: { click: () => pick.click() } }),
          el("button", { class: "akx-btn akx-p", type: "button", text: "Close", on: { click: close } })]));
        say("", "");
        def.onDone && def.onDone({ saved, failed: failList.length });
      });
    }
  }

  window.AKF_EXCEL = Object.freeze({ open, readBook, writeBook, buildBook, check, parseDate, saveBlob });
})();
