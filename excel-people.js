/* Alkhidmat Foundation Islamabad — main page → Excel import & export → "People & access" (Super Admin only).
   One row per person: who they are, their approval role, and their access in EVERY portal (one column per portal).
   New people get a login with a temporary password (the account manager, Edge Function "admin-users");
   after the import a small file with their sign-in details is downloaded ONCE — hand it out privately, then delete it.
   A person already in the ERP (same login e-mail) is updated: a blank cell keeps what is saved.
   Super Admin rights are never given from Excel (only one by one on the People & access page). */
(function () {
  "use strict";
  window.AKF_EXCEL_PORTALS = window.AKF_EXCEL_PORTALS || {};
  const LEVELS = ["No access", "Viewer", "Staff", "Manager", "Admin"];
  const PRESET = { "viewer": "viewer", "staff": "staff", "manager": "manager", "admin": "admin" };
  const ROLES = [["staff", "Staff"], ["hod", "HOD (Head of Department)"], ["finance", "Sr. Manager Finance / Finance (budget approval)"], ["manager_hr", "Manager Admin & HR"],
    ["regional_manager", "Regional Manager"], ["president", "President"], ["gen_sec", "General Secretary (view only)"], ["admin_officer", "Admin Officer (procurement)"],
    ["store_officer", "Store Officer"], ["store_transport_officer", "Store & Transport Officer (both)"], ["ambulance_driver", "Ambulance Driver (fleet)"], ["transport_officer", "Transport Officer (fleet)"], ["driver", "Driver (fleet)"],
    ["front_desk", "Front Desk Officer (assistance)"], ["director", "Department Director"]];
  const low = s => String(s == null ? "" : s).trim().toLowerCase();
  const domain = () => (window.AKF_SUPABASE && window.AKF_SUPABASE.emailDomain) || "";
  const loginOf = v => { v = low(v); return v && !v.includes("@") && domain() ? v + "@" + domain() : v; };
  const csvCell = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const errText = async (error) => { try { const b = await error.context.json(); return b.error || "not saved"; } catch (e) { return (error && error.message) || "not saved"; } };

  async function load(sb) {
    const read = async (p, what) => { const { data, error } = await p; if (error) throw new Error(what + " could not be read: " + error.message); return data || []; };
    const [people, depts, mods, tabs, acc] = await Promise.all([
      read(sb.from("core_profiles").select("id,email,full_name,designation,dept,org_role,is_super,active").order("full_name"), "People"),
      read(sb.from("core_departments").select("code,name,active").order("name"), "Departments"),
      read(sb.from("core_modules").select("key,name,sort").order("sort"), "Portals"),
      read(sb.from("core_module_tabs").select("module_key,tab_key,actions,presets"), "Portal tabs"),
      read(sb.from("core_module_access").select("user_id,module_key,preset"), "Access"),
    ]);
    const byEmail = new Map(people.map(p => [low(p.email), p]));
    const deptName = new Map(depts.map(d => [d.code, d.name])), deptCode = new Map();
    depts.forEach(d => { deptCode.set(low(d.name), d.code); deptCode.set(low(d.code), d.code); });
    const roleLabel = new Map(ROLES), roleKey = new Map(); ROLES.forEach(([k, t]) => { roleKey.set(low(t), k); roleKey.set(k, k); }); roleKey.set("department director (assistance)", "director"); roleKey.set("finance department", "finance");   // older sheets
    const level = (uid, mk) => { const a = acc.find(x => x.user_id === uid && x.module_key === mk); if (!a) return "No access";
      return a.preset === "custom" ? "" : (LEVELS.find(l => low(l) === a.preset) || ""); };   // custom ticks: blank = keep them
    /* the ticks a level gives on each tab of a portal (the same as the People & access page's preset buttons) */
    const tabsFor = (mk, preset) => Object.fromEntries(tabs.filter(t => t.module_key === mk)
      .map(t => [t.tab_key, (t.presets && t.presets[preset]) || (preset === "admin" ? t.actions : [])]).filter(([, a]) => a && a.length));

    const cols = [
      { k: "name", h: "Full name", req: true, max: 120, ex: "Muhammad Ali Khan", note: "As it should appear in the ERP" },
      { k: "email", h: "Login e-mail or username", req: true, max: 120, ex: domain() ? "m.ali" : "m.ali@alkhidmatisb.org",
        note: domain() ? `Just the username (m.ali → m.ali@${domain()}) or a full e-mail. A person already in the ERP is updated, not added again` : "The person's login e-mail. A person already in the ERP is updated", aka: ["email", "username", "login"] },
      { k: "designation", h: "Designation", max: 120, ex: "Store Officer" },
      { k: "dept", h: "Department", list: depts.filter(d => d.active !== false).map(d => d.name), note: "Leave empty for none" },
      { k: "role", h: "Approval role", list: ROLES.map(r => r[1]), note: "Decides which approval steps are theirs. Empty = Staff (new people) or keep (existing)" },
      { k: "active", h: "Active", type: "yesno", note: "No = cannot sign in. Empty = Yes for new people, keep for existing" },
      // aka: a renamed portal still matches a "<key> — access" heading
      ...mods.map(m => ({ k: "m_" + m.key, h: m.name + " — access", aka: [m.key + " access"], list: LEVELS, note: "Viewer sees, Staff adds and edits, Manager also approves, Admin can do everything. Empty = no change (new people: no access)" })),
    ];
    const sheet = {
      key: "people", name: "People & access",
      about: "One row per person: details, approval role and access to every portal. New people get a login and a temporary password.",
      match: "email", find: v => byEmail.get(loginOf(v)) || null, cols,
      check: d => {
        if (!/^[^\s@<>"',;]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/.test(loginOf(d.email))) return "Login e-mail or username is not valid";
        if (d.dept && !deptCode.has(low(d.dept))) return "Department is not in the list (Portals & departments)";
        if (d.role && !roleKey.has(low(d.role))) return "Approval role is not in the list";
        return "";
      },
      rows: () => people.map(p => Object.assign({ name: p.full_name, email: p.email, designation: p.designation, dept: deptName.get(p.dept) || "",
        role: roleLabel.get(p.org_role) || "Staff", active: p.active !== false }, Object.fromEntries(mods.map(m => ["m_" + m.key, level(p.id, m.key)])))),
    };

    async function save(_sheet, rows, progress) {
      const failed = [], signin = [];
      let i = 0;
      // 4 people at a time, and each person's portals all at once (one by one was slow for big sheets)
      const one = async (r) => {
        const d = r.data, email = loginOf(d.email), dept = d.dept ? deptCode.get(low(d.dept)) : undefined, role = d.role ? roleKey.get(low(d.role)) : undefined;
        try {
          let p = byEmail.get(email);
          if (!p) {
            const { data, error } = await sb.functions.invoke("admin-users", { body: { action: "create", email, full_name: d.name, designation: d.designation || "", dept: dept || "", org_role: role || "staff" } });
            if (error) { failed.push({ row: r.row, msg: await errText(error) }); return; }
            p = { id: data.id, email, full_name: d.name, active: true }; byEmail.set(email, p);
            signin.push([d.name, email, data.temp_password || "(invitation e-mail sent)"]);
            if (d.active === false) await sb.functions.invoke("admin-users", { body: { action: "update", id: p.id, active: false } });
          } else {
            const patch = { action: "update", id: p.id, full_name: d.name };
            if (d.designation) patch.designation = d.designation;
            if (d.dept) patch.dept = dept;
            if (role) patch.org_role = role;
            if (d.active === true || d.active === false) patch.active = d.active;
            if (p.is_super) delete patch.active;   // a Super Admin is changed only on the People & access page
            const { error } = await sb.functions.invoke("admin-users", { body: patch });
            if (error) { failed.push({ row: r.row, msg: await errText(error) }); return; }
          }
          const bad = (await Promise.all(mods.filter(m => d["m_" + m.key]).map(async m => {
            const preset = PRESET[low(d["m_" + m.key])] || "";
            const { error } = await sb.rpc("core_set_access", { p_user: p.id, p_module: m.key, p_preset: preset, p_tabs: preset ? tabsFor(m.key, preset) : {} });
            return error ? `${m.name} access not saved: ${error.message}` : "";
          }))).filter(Boolean);
          if (bad.length) failed.push({ row: r.row, msg: bad.join("; ") });
        } catch (e) { failed.push({ row: r.row, msg: (e && e.message) || "not saved" }); }
        progress && progress(++i, rows.length);
      };
      const queue = rows.slice();
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => { while (queue.length) await one(queue.shift()); }));
      failed.sort((a, b) => a.row - b.row);
      /* sign-in details for the new people, downloaded once (never stored by the ERP) */
      if (signin.length) {
        const csv = "﻿" + [["Full name", "Login", "Temporary password (must be changed at first sign-in)"], ...signin].map(x => x.map(csvCell).join(",")).join("\r\n");
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        a.download = "new-staff-sign-in-" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        alert(`${signin.length} new login(s) created. Their temporary passwords were saved to "${a.download}".\n\nGive each person only their own line, in person or by phone (not in a group), then delete the file. Each one must choose a new password at first sign-in.`);
      }
      return { failed };
    }
    return { sheets: [sheet], save };
  }

  window.AKF_EXCEL_PORTALS.people = { name: "People & access (all portals)", core: true, load };
})();
