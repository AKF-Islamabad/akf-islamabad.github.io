/* Alkhidmat Foundation Islamabad — main page → Settings → "Stores" (Super Admin only).
   Rename a store or add one for the Store Management portal. The short code (CS1 …) stays, because item codes carry it;
   the database moves the stock, ledger and documents of a renamed store to the new name (core_save_stores, 044).
   Loaded by the main page, which calls render(box, api) with api = { sb, el, toast, fail, q, ... }. */
(function () {
  "use strict";
  const DEF = ["CS1 Central Store 1", "CS2 Central Store 2"];
  async function render(box, api) {
    const { sb, el, toast, fail, q } = api;
    box.replaceChildren(el("p", { class: "muted small", text: "Loading the stores…" }));
    let list;
    try { const cur = (await q(sb.rpc("core_get_settings"))) || {}; list = Array.isArray(cur.stores) && cur.stores.length ? cur.stores : DEF; }
    catch (e) { box.replaceChildren(el("div", { class: "notice bad", text: "The stores could not be loaded." })); return fail(e, "Stores could not be loaded"); }
    let rows = list.map(x => ({ code: String(x).split(" ")[0], name: String(x).slice(String(x).indexOf(" ") + 1), old: true }));
    const draw = () => {
      const tb = el("div", { style: "display:grid;gap:8px" }, rows.map((r, i) => {
        const code = el("input", { class: "input", value: r.code, maxlength: 6, disabled: r.old, style: "max-width:90px", "aria-label": "Store code" });
        const name = el("input", { class: "input", value: r.name, maxlength: 80, "aria-label": "Store name" });
        code.addEventListener("input", () => { r.code = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); code.value = r.code; });
        name.addEventListener("input", () => { r.name = name.value; });
        return el("div", { class: "row", style: "gap:8px" }, code, el("div", { style: "flex:1" }, name),
          r.old ? null : el("button", { class: "btn ghost sm", type: "button", text: "Remove", onclick: () => { rows.splice(i, 1); draw(); } }));
      }));
      const add = el("button", { class: "btn ghost sm", type: "button", text: "+ Add store", onclick: () => { let n = rows.length + 1; while (rows.some(r => r.code === "CS" + n)) n++; rows.push({ code: "CS" + n, name: "", old: false }); draw(); } });
      const save = el("button", { class: "btn", type: "button", text: "Save stores", onclick: async () => {
        const out = rows.map(r => (r.code.trim().toUpperCase() + " " + r.name.replace(/\s+/g, " ").trim()));
        const codes = rows.map(r => r.code.trim().toUpperCase());
        if (rows.some((r, i) => !/^[A-Z0-9]{1,6}$/.test(codes[i]) || r.name.trim().length < 2 || /[<>"`\\]/.test(r.name) || codes.indexOf(codes[i]) !== i))
          return toast("Each store needs its own short code (like CS3) and a name of at least 2 letters, without < > \" ` or \\", true);
        save.disabled = true;
        try { await q(sb.rpc("core_save_stores", { p_list: out })); toast("Stores saved. Items and documents of a renamed store now show the new name."); rows.forEach(r => { r.old = true; }); draw(); }
        catch (e) { save.disabled = false; fail(e, "The stores were not saved"); }
      } });
      box.replaceChildren(el("div", { class: "card", style: "padding:16px;display:grid;gap:12px" },
        el("b", { text: "Stores (Store Management)" }),
        el("p", { class: "muted small", text: "Rename a store or add one. The code stays the same, because item codes carry it. A store that still holds stock cannot be removed." }),
        tb, el("div", { class: "row", style: "gap:8px" }, add, save)));
    };
    draw();
  }
  (window.AKF_SETTINGS_PANELS = window.AKF_SETTINGS_PANELS || []).push({ key: "stores", title: "Stores", icon: "grid", desc: "Store names for Store Management", render });
})();
