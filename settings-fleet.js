/* Alkhidmat Islamabad — main page → Settings → "Fleet & Ambulances" (Super Admin only).
   The Fleet portal has no settings page of its own (house rule: one Settings place). Its settings are kept in the
   portal's own table (public.fleet_rows, collection "config", id "settings") so that drivers and other fleet-only
   staff can read them; only the Super Admin may change them (checked by erp/supabase/portals/fleet.sql).
   The approval path of a vehicle request is set under Settings → Approval matrix → Fleet ("minimum" = trip days).
   Loaded by the main page, which calls render(box, api) with api = { sb, el, icon, toast, fail, q, showLoader, hideLoader, saveGlobal }. */
(function () {
  "use strict";
  const DEF = {
    noticeDays: 2, lateMin: 120, fp: { Petrol: 280, Diesel: 290, CNG: 0, Electric: 0 },
    purposes: ["Patient Transport", "Dead Body", "Official Duty", "Meeting", "Delivery", "Donation Collection", "Inspection", "Office Supplies Purchase", "Bank Work", "Document Collection/Submission", "Vehicle Maintenance", "Emergency Duty", "Other"],
    programs: ["Administration", "Finance", "Bano Qabil", "Education", "Alkhidmat Micro Finance", "Community Services", "WASH", "Orphan Care", "Volunteer Management", "RMD", "Other"],
    checklist: ["Engine Oil", "Brake Fluid", "Coolant", "Tire Pressure & Condition", "Lights", "Horn", "Battery", "Fuel Level", "First Aid Kit", "Fire Extinguisher", "Vehicle Cleanliness", "Documents (Registration, License)"]
  };
  const FUELS = ["Petrol", "Diesel", "CNG", "Electric"];
  /* the database refuses < > " ' ` and \ in any fleet text, so they are replaced by look-alikes here */
  const MAP = { "<": "‹", ">": "›", '"': "”", "'": "’", "`": "ʼ", "\\": "/" };
  const clean = s => String(s == null ? "" : s).replace(/[<>"'`\\]/g, c => MAP[c]).trim();
  const lines = t => Array.from(new Set(String(t || "").split(/\r?\n/).map(clean).filter(Boolean)));

  async function render(box, api) {
    const { sb, el, toast, fail, q } = api;
    box.replaceChildren(el("p", { class: "muted small", text: "Loading the fleet settings…" }));
    let cur;
    try {
      const row = await q(sb.from("fleet_rows").select("data").eq("collection", "config").eq("id", "settings").maybeSingle());
      cur = Object.assign({}, DEF, (row && row.data) || {});
    } catch (e) {
      box.replaceChildren(el("p", { class: "muted", text: "The Fleet & Ambulances portal is not set up in the database yet. Publish it first (AKF-PORTALS.cmd → 2  Publish changes)." }));
      return;
    }
    const field = (label, input, hint) => el("div", { class: "field" }, el("label", { text: label }), input, hint ? el("div", { class: "hint", text: hint }) : null);
    const num = (v, min, max) => { const i = el("input", { class: "input", type: "number", min: String(min), max: String(max), step: "1" }); i.value = String(v); return i; };
    const area = (arr) => { const t = el("textarea", { class: "textarea", rows: "7" }); t.value = (arr || []).join("\n"); return t; };
    const notice = num(cur.noticeDays, 0, 30), late = num(cur.lateMin, 10, 10080);
    const fp = {}; FUELS.forEach(f => { fp[f] = el("input", { class: "input", type: "number", min: "0", max: "10000", step: "0.1" }); fp[f].value = String((cur.fp && cur.fp[f]) || 0); });
    const purposes = area(cur.purposes), programs = area(cur.programs), checklist = area(cur.checklist);
    const save = el("button", { class: "btn btn-primary", type: "button", text: "Save fleet settings" });
    const reset = el("button", { class: "btn btn-ghost", type: "button", text: "Restore defaults" });
    box.replaceChildren(
      el("p", { class: "muted small", text: "Used by Fleet & Ambulances Management. Who approves a vehicle request (and from how many days a longer trip needs an extra approval) is set under Approval matrix → Fleet. People, approval roles (HOD, Transport Officer, Driver …) and tab ticks are set under People & access." }),
      el("div", { class: "grid-2" },
        field("Vehicle requests: days of notice", notice, "A request must be made at least this many days before the visit (ADM-011: 2)."),
        field("Trip log: late entry after (minutes)", late, "A trip entered this long after it ended is marked LATE ENTRY.")),
      el("div", { class: "grid-2" }, ...FUELS.map(f => field("Default price per litre — " + f + " (Rs)", fp[f], f === "Petrol" ? "Fills the fuel forms; 0 = use the last entry." : null))),
      field("Trip purposes (one per line)", purposes, "\"Other\" is always added at the end."),
      field("Programs on the requisition form (one per line)", programs),
      field("Daily vehicle checklist items (one per line)", checklist, "Drivers mark each item OK / NOT OK / N/A every morning; a NOT OK item blocks the vehicle."),
      el("div", { class: "actions" }, save, reset));
    reset.addEventListener("click", () => {
      notice.value = String(DEF.noticeDays); late.value = String(DEF.lateMin); FUELS.forEach(f => { fp[f].value = String(DEF.fp[f]); });
      purposes.value = DEF.purposes.join("\n"); programs.value = DEF.programs.join("\n"); checklist.value = DEF.checklist.join("\n");
      toast("Defaults filled in — press Save to keep them.");
    });
    save.addEventListener("click", async () => {
      const n = parseInt(notice.value, 10), l = parseInt(late.value, 10);
      if (!(n >= 0 && n <= 30)) { toast("Days of notice: 0 to 30.", "error"); return; }
      if (!(l >= 10 && l <= 10080)) { toast("Late entry: 10 to 10,080 minutes.", "error"); return; }
      const prices = {}; for (const f of FUELS) { const v = +fp[f].value; if (!(v >= 0 && v <= 10000)) { toast("Fuel price for " + f + " is not valid.", "error"); return; } prices[f] = Math.round(v * 100) / 100; }
      const P = lines(purposes.value), G = lines(programs.value), C = lines(checklist.value);
      if (!P.length || !G.length || !C.length) { toast("Keep at least one purpose, one program and one checklist item.", "error"); return; }
      if ([...P, ...G, ...C].some(x => x.length > 80) || P.length > 60 || G.length > 60 || C.length > 40) { toast("Each line can have at most 80 characters (at most 60 lines, 40 checklist items).", "error"); return; }
      const data = { noticeDays: n, lateMin: l, fp: prices, purposes: [...P.filter(x => x !== "Other"), "Other"], programs: [...G.filter(x => x !== "Other"), "Other"], checklist: C };
      save.disabled = true;
      try {
        const up = await q(sb.from("fleet_rows").update({ data }).eq("collection", "config").eq("id", "settings").select("id"));
        if (!up || !up.length) await q(sb.from("fleet_rows").insert({ collection: "config", id: "settings", data }).select("id"));
        await sb.from("fleet_rows").insert({ collection: "audit", id: "A" + Date.now() + Math.random().toString(36).slice(2, 8), data: { action: "SETTINGS_UPDATED", target: "fleet settings", detail: "notice " + n + " days, late after " + l + " min, " + P.length + " purposes, " + G.length + " programs, " + C.length + " checklist items" } });
        toast("Fleet settings saved. Open Fleet pages pick them up on their next refresh.", "success");
      } catch (e) { fail(e, "The fleet settings were not saved"); }
      finally { save.disabled = false; }
    });
  }

  window.AKF_SETTINGS_PANELS = (window.AKF_SETTINGS_PANELS || []).concat([{
    key: "fleet", title: "Fleet & Ambulances", icon: "truck",
    desc: "Days of notice for vehicle requests, late-entry time, fuel prices, trip purposes, programs and the daily checklist",
    render
  }]);
})();
