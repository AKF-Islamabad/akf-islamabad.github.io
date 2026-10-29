/* Alkhidmat Islamabad — APPROVAL MATRIX for every portal (one definition, used by the main page and every portal).
   The Super Admin edits it on the main page → Settings → Approval matrix. It is saved in the shared settings record
   (portal_rows: collection "settings", id "global", key "approvalMatrix"); the database checks it on every step
   (erp/supabase/sql/005_approval_matrix.sql and erp/supabase/portals/donor.sql).
   Load with <script src="../akf-matrix.js"></script> (main page: akf-matrix.js), then:
     AKF_MATRIX.get(settings)                    → the full matrix (saved values over the defaults below)
     AKF_MATRIX.steps(settings, "procurement", total) → the steps a request of that amount goes through, in order
   A new portal adds its own block here (see "donor" for a portal whose approvers are access-grid ticks). */
(function () {
  "use strict";
  const ROLES = [["hod", "Head of Department (HOD)"], ["finance", "Finance"], ["manager_hr", "Manager Admin & HR"], ["regional_manager", "Regional Manager"], ["president", "President"],
    ["gen_sec", "General Secretary"], ["admin_officer", "Admin Officer"], ["store_officer", "Store Officer"]];
  const TASK_ROLES = [["RM", "Regional Manager"], ["HOD", "Head of Department"], ["MA", "Manager Admin"], ["HR", "HR Manager"], ["GS", "General Secretary"], ["President", "President"], ["Staff", "Staff"]];
  /* step: key · label (what it is called) · who (shown to people) · owner (who may do it) · kind: "fixed" = part of the
     process (cannot be switched off or moved) / "approval" = an approval the Super Admin may switch off, move, rename,
     give to another role or limit to large amounts · on · minAmount (PKR, 0 = every request) · hours (time limit, 0 = general) */
  const S = (key, label, who, owner, kind, extra) => Object.assign({ key, label, who, owner, kind, on: true, minAmount: 0, hours: 0 }, extra || {});
  const DEFAULTS = {
    v: 1,
    procurement: { steps: [
      S("submitted", "Requested", "HOD (Requester)", "hod", "fixed"),
      S("budget", "Budget approved", "Finance Department", "finance", "approval"),
      S("rec_hr", "Recommended", "Manager Admin & HR", "manager_hr", "approval"),
      S("rec_rm", "Recommended", "Regional Manager", "regional_manager", "approval"),
      S("approved", "Approved", "President", "president", "approval", { final: true }),
      S("rfq", "Quotations", "Admin Officer", "admin_officer", "fixed"),
      S("committee", "Committee decision", "Purchase Committee", "manager_hr", "fixed"),
      S("po", "PO issued", "Admin Officer", "admin_officer", "fixed"),
      S("grn", "Received (GRN-P)", "Store Officer", "store_officer", "fixed"),
      S("issued", "Issued (GIN)", "Store Officer", "store_officer", "fixed"),
      S("closed", "Received by HOD", "HOD (Requester)", "hod", "fixed")] },
    store: { steps: [
      S("submitted", "Requested", "HOD (Requester)", "hod", "fixed"),
      S("checked", "Items confirmed", "Store Officer", "store_officer", "approval"),
      S("rec_hr", "Recommended", "Manager Admin & HR", "manager_hr", "approval"),
      S("rec_rm", "Recommended", "Regional Manager", "regional_manager", "approval"),
      S("approved", "Approved", "President", "president", "approval", { final: true }),
      S("issued", "Issued (GIN)", "Store Officer", "store_officer", "fixed"),
      S("closed", "Received by HOD", "HOD (Requester)", "hod", "fixed")] },
    tasks: {
      approvers: ["RM", "HOD", "MA", "HR"],                 // who may approve a task waiting for approval (stage 04) and rate it
      closers: ["assigner", "RM", "HOD", "MA", "HR"],       // who may close a task ("assigner" = the person who assigned it)
      selfNeedsApproval: true,                              // a task you assigned to yourself is closed by an approver, not by you
      events: [
        { key: "requested", label: "Requested by", who: "Department Head", roles: ["HOD", "MA", "HR", "RM"], kind: "fixed", on: true },
        { key: "recommended", label: "Recommended by", who: "Manager Admin", roles: ["MA", "RM"], kind: "approval", on: true },
        { key: "endorsed", label: "Recommended by", who: "Regional Manager", roles: ["RM"], kind: "approval", on: true },
        { key: "approved", label: "Approved by", who: "GS / President", roles: ["GS", "President"], kind: "approval", on: true, final: true }] },
    /* Donor Management: approvers are ticks in People & access ("tab:action") */
    donor: { steps: [
      { key: "record", label: "Receipt recorded", who: "RMO / Manager RMD", tick: "new:add", kind: "fixed", on: true, minAmount: 0 },
      { key: "money", label: "Money verified", who: "Finance", tick: "donations:approve", kind: "fixed", on: true, minAmount: 0 },
      { key: "goods", label: "Goods received (GDN-D)", who: "Store Officer (Store portal)", tick: "store:store:add", kind: "fixed", on: true, minAmount: 0 }],
      corrections: { tick: "corrections:approve", who: "Finance" } }
  };
  const DONOR_TICKS = [["donations:approve", "Donations → Approve (Finance)"], ["team:edit", "RMD Team → Edit (Manager RMD)"], ["corrections:approve", "Corrections → Approve"], ["reports:export", "Reports → Export"], ["donations:delete", "Donations → Delete"]];
  const clone = o => JSON.parse(JSON.stringify(o));
  const num = v => (isFinite(+v) && +v > 0 ? Math.round(+v) : 0);
  /* saved steps over the defaults: fixed steps always present and in their place; unknown roles fall back to the default */
  function mergeSteps(def, saved, roleOk, afterKey) {
    if (!Array.isArray(saved) || !saved.length) return clone(def);
    const byKey = Object.fromEntries(saved.filter(s => s && s.key).map(s => [s.key, s]));
    const appr = saved.filter(s => s && (/^x_[a-z0-9_]{2,24}$/.test(s.key) || def.some(d => d.key === s.key && d.kind === "approval")));
    const out = []; let placed = false;
    for (const d of def) {
      if (d.kind === "approval") {
        if (!placed) { for (const s of appr) { const base = def.find(x => x.key === s.key) || { kind: "approval", owner: def.find(x => x.kind === "approval").owner };
            out.push(Object.assign(clone(base), { key: s.key, label: String(s.label || base.label || "Approval").slice(0, 60), who: String(s.who || base.who || "").slice(0, 60),
              owner: roleOk(s.owner) ? s.owner : base.owner, kind: "approval", on: base.final ? true : s.on !== false, minAmount: base.final ? 0 : num(s.minAmount), hours: num(s.hours) }, s.roles ? { roles: s.roles } : {}, s.tick ? { tick: s.tick } : {})); }
          def.filter(x => x.kind === "approval" && !appr.some(s => s.key === x.key)).forEach(x => out.push(Object.assign(clone(x), { on: !!x.final })));   // a built-in step missing from the save is off
          placed = true; }
        continue;
      }
      const s = byKey[d.key] || {};
      out.push(Object.assign(clone(d), { label: String(s.label || d.label).slice(0, 60), who: String(s.who || d.who).slice(0, 60), hours: num(s.hours) }));
      // a portal without built-in approval steps (Donor Management) gets its extra approvals right after this step
      if (!placed && afterKey === d.key) { appr.forEach(s => out.push({ key: s.key, label: String(s.label || "Approval").slice(0, 60), who: String(s.who || "").slice(0, 60), tick: s.tick, kind: "approval", on: s.on !== false, minAmount: num(s.minAmount), hours: num(s.hours) })); placed = true; }
    }
    return out;
  }
  function get(settings) {
    const m = (settings && settings.approvalMatrix) || {}, R = ROLES.map(r => r[0]), TR = TASK_ROLES.map(r => r[0]);
    const roleOk = r => R.includes(r), tasks = Object.assign(clone(DEFAULTS.tasks), m.tasks || {});
    tasks.approvers = (Array.isArray(tasks.approvers) ? tasks.approvers : DEFAULTS.tasks.approvers).filter(r => TR.includes(r));
    tasks.closers = (Array.isArray(tasks.closers) ? tasks.closers : DEFAULTS.tasks.closers).filter(r => r === "assigner" || TR.includes(r));
    tasks.selfNeedsApproval = tasks.selfNeedsApproval !== false;
    tasks.events = DEFAULTS.tasks.events.map(d => { const s = ((m.tasks && m.tasks.events) || []).find(x => x && x.key === d.key) || {};
      return Object.assign(clone(d), { label: String(s.label || d.label).slice(0, 60), who: String(s.who || d.who).slice(0, 60),
        roles: Array.isArray(s.roles) && s.roles.filter(r => TR.includes(r)).length ? s.roles.filter(r => TR.includes(r)) : d.roles, on: d.kind === "fixed" || d.final ? true : s.on !== false }); });
    const donor = { steps: mergeSteps(DEFAULTS.donor.steps, m.donor && m.donor.steps, () => false, "money").map(s => s.kind === "approval" ? Object.assign(s, { tick: DONOR_TICKS.some(t => t[0] === s.tick) ? s.tick : "team:edit", owner: undefined }) : s),
      corrections: { tick: DONOR_TICKS.some(t => t[0] === (m.donor && m.donor.corrections && m.donor.corrections.tick)) ? m.donor.corrections.tick : DEFAULTS.donor.corrections.tick, who: String((m.donor && m.donor.corrections && m.donor.corrections.who) || DEFAULTS.donor.corrections.who).slice(0, 60) } };
    return { v: 1, procurement: { steps: mergeSteps(DEFAULTS.procurement.steps, m.procurement && m.procurement.steps, roleOk) },
      store: { steps: mergeSteps(DEFAULTS.store.steps, m.store && m.store.steps, roleOk) }, tasks, donor };
  }
  /* the steps a request of this amount goes through (switched-off steps and steps for larger amounts are left out) */
  function steps(settings, portal, total) {
    const all = get(settings)[portal]; if (!all || !all.steps) return [];
    return all.steps.filter(s => s.kind === "fixed" || (s.on && (!s.minAmount || (+total || 0) >= s.minAmount)));
  }
  window.AKF_MATRIX = { DEFAULTS: clone(DEFAULTS), ROLES, TASK_ROLES, DONOR_TICKS, get, steps };
})();
