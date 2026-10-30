/* Alkhidmat Islamabad — Tasks & Events in the one Excel format (akf-excel.js), for the main page (Super Admin only).
   The main page calls  const book = await AKF_EXCEL_PORTALS.tasks.load(sb)  and hands book.sheets / book.save to AKF_EXCEL.open.
   Written to public.portal_rows exactly as the Tasks & Events portal writes them (erp/src/portal-app.html, makeTaskActions):
     Tasks   collection 'tasks', id = the task's random key, data = the task (v:2, id AK-NNN, stage "01".."07", activity …).
             A row with a Task no. already in the portal = tSave (with a status change = tMove's rules: dependencies, closers and
             approvers from the approval matrix; a repeating task that becomes Done creates its next occurrence). Otherwise tCreate.
             'audit' rows "Task created" / "Task done" … as the portal writes them.
     Events  collection 'events', id = the event's random key; a new event is a draft (eCreate), an Event no. already in the
             portal updates it (eSave). The checklist and the approvals are not in the file and stay as they are.
   The Super Admin acts as the Regional Manager in Tasks (TASK_ADMIN), as in the portal. People are found by login e-mail,
   username or full name. RLS and the portal_guard trigger check every row. Nothing goes into URLs or browser storage. */
(function () {
  "use strict";
  const PORTALS = window.AKF_EXCEL_PORTALS = window.AKF_EXCEL_PORTALS || {};
  if (PORTALS.tasks) return;

  /* ---- same values and helpers as erp/src/portal-app.html ---- */
  const TASK_DEPTS_DEFAULT = [
    { id: "01", code: "REG", name: "Regional Office" }, { id: "02", code: "FIN", name: "Finance" }, { id: "03", code: "ADMIN", name: "Administration" },
    { id: "04", code: "RMD", name: "Resource Mobilization" }, { id: "05", code: "EDU", name: "Education" }, { id: "06", code: "AKIM", name: "Al-Khidmat Health (AKIM)" },
    { id: "07", code: "BANO", name: "Bano Qabil" }, { id: "08", code: "ORPHAN", name: "Orphan Care" }, { id: "09", code: "VOL", name: "Volunteers" },
    { id: "10", code: "WASH", name: "Clean Water (WASH)" }, { id: "11", code: "MOWAKHAT", name: "Mowakhat (Interest-free loans)" }];
  const TASK_STAGES_DEFAULT = [{ id: "01", name: "New" }, { id: "02", name: "In progress" }, { id: "03", name: "Ready for review" }, { id: "04", name: "Waiting HOD" }, { id: "05", name: "Approved" }, { id: "06", name: "Done" }, { id: "07", name: "Cancelled" }];
  const TPRI_LIST = ["Urgent", "High", "Medium", "Low"];
  const TREC = { none: "Does not repeat", daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
  const EVENT_TYPES = ["Seminar", "Conference", "Roundtable", "Training", "Meeting", "Reception", "Other"];
  const TASK_ADMIN = ["super", "regional_manager"];
  const TASK_ROLES = { RM: 1, HOD: 1, MA: 1, HR: 1, Staff: 1, President: 1, GS: 1 };
  const PORTAL_TO_TASK_DEPT = { "Health": "06", "Education": "05", "Orphan Care": "08", "WASH": "10", "Mawakhat": "11", "Finance": "02", "Admin": "03", "Volunteer": "09", "Fundraising": "04", "Qurbani": "04", "Ramadan": "04" };
  const T_MX_BUILTIN = { approvers: ["RM", "HOD", "MA", "HR"], closers: ["assigner", "RM", "HOD", "MA", "HR"], selfNeedsApproval: true };
  const T_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n, l = 4) => String(n).padStart(l, "0");
  const nowISO = () => new Date().toISOString();
  const uid = () => Math.random().toString(36).slice(2, 8);
  const newKey = () => uid() + uid() + Date.now().toString(36);
  const tISO = d => d.getFullYear() + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2);
  const tToday = () => tISO(new Date());
  function tDate(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); if (!m) return null; const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null; }
  function tAddDays(s, n) { const d = tDate(s) || new Date(); d.setDate(d.getDate() + n); return tISO(d); }
  function tAddMonths(s, n, day) { const d = tDate(s) || new Date(); const want = day || d.getDate(); const x = new Date(d.getFullYear(), d.getMonth() + n, 1); const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); x.setDate(Math.min(want, last)); return tISO(x); }
  const tFmtLong = iso => { const d = tDate(iso); return d ? `${d.getDate()} ${T_MONTHS[d.getMonth()]} ${d.getFullYear()}` : iso || "—"; };
  function tParseMin(v) { const s = String(v == null ? "" : v).trim().toLowerCase(); if (!s) return 0; if (/^\d+(\.\d+)?$/.test(s)) return Math.round(+s);
    let tot = 0, ok = false; const rest = s.replace(/(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m)\b/g, (_, n, u) => { ok = true; tot += u[0] === "d" ? n * 480 : u[0] === "h" ? n * 60 : +n; return ""; });
    return ok && !rest.trim() ? Math.round(tot) : NaN; }
  const tMin = m => { m = Math.round(m || 0); if (!m) return ""; const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`; };
  const tRole = u => { if (!u) return "Staff"; if (TASK_ADMIN.includes(u.role) || u.taskAdmin) return "RM"; if (u.taskRole && TASK_ROLES[u.taskRole]) return u.taskRole;
    return u.role === "hod" ? "HOD" : u.role === "manager_hr" ? "MA" : u.role === "president" ? "President" : u.role === "gen_sec" ? "GS" : "Staff"; };
  const tUDept = u => (u && (u.taskDept || PORTAL_TO_TASK_DEPT[u.dept])) || "01";
  const tNum = t => +(String(t.id || "").replace(/\D/g, "")) || 0;
  const tOpen = t => t.stage !== "06" && t.stage !== "07";
  const lc = s => String(s == null ? "" : s).trim().toLowerCase();

  /* ---- database layer (DB.load / DB.save of portal-app.html) ---- */
  const KEY_FIELD = { tasks: "key", events: "key" };
  const rowKey = (col, item) => { const k = KEY_FIELD[col] || "id"; if (!item[k]) item[k] = uid(); return String(item[k]); };
  const READ = ["users", "tasks", "events", "settings"], WRITE = ["tasks", "events", "audit"];
  async function readRows(sb) {
    let all = [];
    for (let from = 0; ; from += 1000) {
      const r = await sb.from("portal_rows").select("collection,id,data,created_at").in("collection", READ)
        .order("created_at", { ascending: true }).order("collection", { ascending: true }).order("id", { ascending: true }).range(from, from + 999);
      if (r.error) throw r.error;
      all = all.concat(r.data || []);
      if (!r.data || r.data.length < 1000) break;
    }
    const st = { users: [], tasks: [], events: [], audit: [], settings: {} };
    all.forEach(r => { if (r.collection === "settings") { if (r.id === "global") st.settings = r.data || {}; } else if (st[r.collection] && r.data) st[r.collection].push(r.data); });
    st.tasks.sort((a, b) => (a.createdAt || "") < (b.createdAt || "") ? 1 : -1);
    return st;
  }
  async function whoAmI(sb) {
    const { data, error } = await sb.rpc("portal_me");
    if (error) throw error;
    if (!data || !data._id) throw new Error("Your login has no active profile in the Tasks & Events portal, so nothing can be saved.");
    return { ...data, id: data._id };
  }
  const snap = (d, cols) => { const m = {}; cols.forEach(c => { m[c] = new Map((d[c] || []).map(i => [rowKey(c, i), JSON.stringify(i)])); }); return m; };
  async function write(sb, before, d, cols) {
    const ups = [], fresh = {};
    cols.forEach(c => (d[c] || []).forEach(i => { const k = rowKey(c, i), j = JSON.stringify(i); if (before[c].get(k) !== j) { ups.push({ collection: c, id: k, data: i }); if (!before[c].has(k)) (fresh[c] = fresh[c] || []).push(k); } }));
    for (const c of Object.keys(fresh)) for (let i = 0; i < fresh[c].length; i += 200) {
      const r = await sb.from("portal_rows").select("id").eq("collection", c).in("id", fresh[c].slice(i, i + 200));
      if (r.error) throw r.error;
      if ((r.data || []).length) throw new Error("Someone saved the same records in the portal at the same moment. Nothing was saved — upload the file again.");
    }
    if (ups.length) { const { error } = await sb.from("portal_rows").upsert(ups, { onConflict: "collection,id" }); if (error) throw error; }
    return ups.length;
  }
  const plain = e => { const m = String((e && e.message) || ""); return m && m.length < 220 ? m : "Not saved on the server. Try again."; };
  const fail = m => { throw new Error(m); };

  /* the task rules of portal-app.html for the person saving (the Super Admin = RM) */
  function rules(d, u) {
    const depts = (d.settings && d.settings.taskDepts) || TASK_DEPTS_DEFAULT, stages = (d.settings && d.settings.taskStages) || TASK_STAGES_DEFAULT;
    let mx = T_MX_BUILTIN; try { const m = window.AKF_MATRIX && window.AKF_MATRIX.get && window.AKF_MATRIX.get(d.settings || {}); const t = m && m.tasks; if (t) mx = { approvers: Array.isArray(t.approvers) ? t.approvers : T_MX_BUILTIN.approvers, closers: Array.isArray(t.closers) ? t.closers : T_MX_BUILTIN.closers, selfNeedsApproval: t.selfNeedsApproval !== false }; } catch (e) { mx = T_MX_BUILTIN; }
    const dept = id => depts.find(x => x.id === id) || { id, name: "Unknown department" };
    const stage = id => stages.find(x => x.id === id) || { id, name: id };
    const user = id => d.users.find(x => x.id === id);
    const name = id => { const x = user(id); return x ? x.name : "Unassigned"; };
    const r = tRole(u), T_MGR = ["HOD", "MA", "HR"];
    const inScope = t => ["RM", "GS", "President"].includes(r) || (["MA", "HR"].includes(r) && !!t.eventId) || t.dept === tUDept(u);
    const canEdit = t => { if (["President", "GS"].includes(r)) return false; if (r === "RM") return true; if (["MA", "HR"].includes(r) && t.eventId) return true; if (T_MGR.includes(r)) return t.dept === tUDept(u) || t.creatorId === u.id || t.assigneeId === u.id; return t.assigneeId === u.id || t.creatorId === u.id; };
    const canClose = t => { const C = mx.closers; if (r === "RM" && C.includes("RM")) return true; if (t.assigneeId === u.id) return t.creatorId === u.id && !mx.selfNeedsApproval && C.includes("assigner"); if (C.includes("assigner") && t.creatorId === u.id) return true; return C.includes(r) && inScope(t); };
    const canApprove = t => mx.approvers.includes(r) && (r === "RM" || (inScope(t) && t.assigneeId !== u.id));
    const assignable = (deptId, eventId) => { const act = d.users.filter(x => x.active !== false && !x.erased);
      if (r === "RM" || (eventId && ["MA", "HR"].includes(r))) return act.filter(x => tRole(x) !== "President");
      if (T_MGR.includes(r)) return act.filter(x => (tUDept(x) === deptId || x.id === u.id) && !["President", "GS"].includes(tRole(x)));
      return act.filter(x => x.id === u.id); };
    const moveError = (t, to) => {
      if (!canEdit(t)) return "You can't change this task.";
      const selfClose = (to === "06" || to === "07") && t.creatorId === t.assigneeId && t.creatorId === u.id && canClose(t);
      if (t.assigneeId === u.id && r !== "RM" && !selfClose && (!["01", "02", "03"].includes(to) || !["01", "02", "03"].includes(t.stage))) return `As the person doing this task you can move it up to “${stage("03").name}”.`;
      if ((to === "06" || to === "07") && !canClose(t)) return "You can't close this task.";
      if (to === "05" && !canApprove(t)) return "You can't approve this task.";
      if (to === "06") { const b = (t.dependencies || []).map(k => d.tasks.find(x => x.key === k)).filter(x => x && tOpen(x)); if (b.length) return `Blocked: finish ${b.map(x => x.id).join(", ")} first.`; }
      return null; };
    return { depts, stages, dept, stage, user, name, r, canEdit, assignable, moveError };
  }

  /* makeTaskActions of portal-app.html: tCreate / tSave / tMove (with the next occurrence) / eCreate / eSave, on the in-memory state d */
  function taskOps(d, u) {
    const R = rules(d, u);
    const act = (t, text) => { t.activity = t.activity || []; t.activity.push({ at: nowISO(), uid: u.id, by: u.name, text }); if (t.activity.length > 200) t.activity.shift(); t.updatedAt = nowISO(); };
    const audit = (t, action, comment) => d.audit.unshift({ id: uid(), at: nowISO(), doc: t.id, action, comment: comment || t.title, dept: R.dept(t.dept).name, by: u.name, role: u.role, uid: u.id, desig: u.designation || "" });
    const nextNo = () => "AK-" + (Math.max(100, ...d.tasks.map(tNum)) + 1);
    const spawn = t => {
      if (!t.recurring || t.recurring === "none" || t.spawnedNext) return null;
      const next = t.recurring === "daily" ? tAddDays(t.plannedDate, 1) : t.recurring === "weekly" ? tAddDays(t.plannedDate, 7) : tAddMonths(t.plannedDate, 1, t.repeatDay);
      const n = { ...JSON.parse(JSON.stringify(t)), key: newKey(), id: nextNo(), stage: "01", plannedDate: next, startDate: "", timeLogged: 0, timeLog: [], attachments: [], comments: [], activity: [], rating: null, ratedBy: "", completedAt: "", spawnedNext: false, repeatOf: t.id, eventId: null, checkItem: null,
        subtasks: (t.subtasks || []).map(s => ({ id: uid(), title: s.title, done: false })), createdAt: nowISO(), updatedAt: nowISO() };
      act(n, `created automatically as the next ${t.recurring} occurrence of ${t.id}`); d.tasks.unshift(n); t.spawnedNext = true; return n; };
    const doMove = (t, to) => {
      const e = R.moveError(t, to); if (e) fail(e);
      const from = R.stage(t.stage).name; t.stage = to; act(t, `moved from ${from} to ${R.stage(to).name}`);
      if (to === "06") { t.completedAt = nowISO(); audit(t, "Task done"); return spawn(t); }
      t.completedAt = ""; if (to === "05" || to === "07") audit(t, `Task ${R.stage(to).name.toLowerCase()}`); };
    const clean = f => {
      const title = String(f.title || "").trim(); if (!title) fail("Give the task a title.");
      if (!R.depts.some(x => x.id === f.dept)) fail("Choose a department — every task needs one.");
      if (!f.assigneeId || !R.user(f.assigneeId)) fail("Choose who this task is assigned to.");
      if (!tDate(f.plannedDate)) fail("Choose a valid planned date.");
      if (f.startDate && !tDate(f.startDate)) fail("The start date is not a valid date.");
      if (f.startDate && f.startDate > f.plannedDate) fail("The start date is after the due date.");
      const est = typeof f.estimate === "number" ? f.estimate : tParseMin(f.estimate); if (isNaN(est)) fail("Write the estimate like 45m, 2h or 1h 30m.");
      return { title: title.slice(0, 200), description: String(f.description || "").slice(0, 5000), dept: f.dept, assigneeId: f.assigneeId, plannedDate: f.plannedDate, startDate: f.startDate || "",
        priority: TPRI_LIST.includes(f.priority) ? f.priority : "Medium", tags: (f.tags || []).slice(0, 20), estimate: Math.max(0, est), recurring: TREC[f.recurring] ? f.recurring : "none",
        subtasks: f.subtasks || [], dependencies: f.dependencies || [], customFields: (f.customFields || []).filter(x => x && x.k), repeatDay: (tDate(f.plannedDate) || new Date()).getDate(),
        eventId: f.eventId && d.events.some(e => e.key === f.eventId) ? f.eventId : null, checkItem: f.eventId ? f.checkItem || null : null }; };
    const assignErr = c => `${R.name(c.assigneeId)} cannot be given tasks in ${R.dept(c.dept).name}.`;
    return {
      R,
      tCreate(f) {
        if (["President", "GS"].includes(R.r)) fail("Your role can view tasks but not create them.");
        const c = clean(f);
        if (!R.assignable(c.dept, c.eventId).some(x => x.id === c.assigneeId)) fail(assignErr(c));
        const t = { key: newKey(), v: 2, id: nextNo(), ...c, stage: "01", creatorId: u.id, timeLogged: 0, timeLog: [], attachments: [], comments: [], activity: [], rating: null, completedAt: "", createdAt: nowISO(), updatedAt: nowISO() };
        act(t, "created this task"); if (t.assigneeId !== u.id) act(t, `assigned to ${R.name(t.assigneeId)}`);
        d.tasks.unshift(t); audit(t, "Task created", `${t.title} → ${R.name(t.assigneeId)}`); return t; },
      tSave(t, f) {
        if (!R.canEdit(t)) fail("You can't edit this task.");
        const c = clean(f);
        if (c.dept !== t.dept && !["RM", "MA", "HR"].includes(R.r)) fail("Only the Regional Manager, Manager Admin or HR can move a task to another department.");
        if (c.assigneeId !== t.assigneeId && !R.assignable(c.dept, c.eventId).some(x => x.id === c.assigneeId)) fail(assignErr(c));
        const changes = [];
        if (c.assigneeId !== t.assigneeId) changes.push(`reassigned to ${R.name(c.assigneeId)}`);
        if (c.plannedDate !== t.plannedDate) changes.push(`moved the planned date to ${tFmtLong(c.plannedDate)}`);
        if (c.priority !== t.priority) changes.push(`set priority to ${c.priority}`);
        if (c.title !== t.title) changes.push("renamed the task");
        if (c.dept !== t.dept) changes.push(`moved to ${R.dept(c.dept).name}`);
        const moving = !!f.stage && f.stage !== t.stage; if (moving) doMove(t, f.stage);
        Object.assign(t, c); changes.forEach(x => act(t, x)); if (!changes.length && !moving) act(t, "updated details"); },
      tMove(t, to) { if (t.stage !== to) doMove(t, to); },
      eCreate(f) {
        if (!["RM", "MA", "HR", "HOD"].includes(R.r)) fail("Your role cannot create events.");
        const e = { key: newKey(), id: "EV-" + (Math.max(0, ...d.events.map(x => +(String(x.id).replace(/\D/g, "")) || 0)) + 1), ...f, coordinator: f.coordinator || u.id, status: "draft", approvals: {}, createdBy: u.id, createdAt: nowISO(), updatedAt: nowISO() };
        d.events.push(e); d.audit.unshift({ id: uid(), at: nowISO(), doc: e.id, action: "Event created", comment: e.title, dept: R.dept(tUDept(u)).name, by: u.name, role: u.role, uid: u.id, desig: u.designation || "" }); return e; },
      eSave(e, f) { if (!["RM", "MA", "HR"].includes(R.r) && !(R.r === "HOD" && (e.createdBy === u.id || e.coordinator === u.id))) fail("You can't edit this event."); Object.assign(e, f); e.updatedAt = nowISO(); }
    };
  }
  /* evClean of portal-app.html, for the fields in the file (the checklist is kept as it is) */
  function evClean(f) {
    const title = String(f.title || "").trim(); if (!title) fail("Give the event a title.");
    if (!tDate(f.date)) fail("Choose the event date."); if (!String(f.venue || "").trim()) fail("Enter the venue.");
    const types = (f.types || []).filter(t => EVENT_TYPES.includes(t)); if (!types.length) fail("Write at least one event type.");
    const otherType = types.includes("Other") ? String(f.otherType || "").trim().slice(0, 60) : "";
    const c = { title: title.slice(0, 200), date: f.date, time: /^\d{2}:\d{2}$/.test(f.time || "") ? f.time : "10:00", venue: String(f.venue).trim().slice(0, 200), types, otherType,
      expected: f.expected === "" || f.expected == null ? "" : Math.max(0, Number(f.expected) || 0), coordinator: f.coordinator || "", topic: String(f.topic || "").slice(0, 500), collab: String(f.collab || "").slice(0, 200),
      additional: String(f.additional || "").slice(0, 5000), checklist: f.checklist || {} };
    const lab = c.types.map(x => x === "Other" && c.otherType ? c.otherType : x); c.type = lab.length ? lab.join(", ") : "—";
    return c;
  }

  /* people: login e-mail, username or full name */
  const personKey = u => u ? (u.email || u.username || u.name || "") : "";
  function findPerson(users, v) {
    const s = lc(v); if (!s) return {};
    const act = users.filter(u => u.active !== false && !u.erased);
    const hit = act.filter(u => [u.email, u.username].some(x => x && lc(x) === s)); if (hit.length === 1) return { u: hit[0] };
    const byName = act.filter(u => lc(u.name) === s); if (byName.length === 1) return { u: byName[0] };
    return { err: byName.length > 1 ? `More than one person is called “${v}”. Write their login e-mail instead` : `No active person “${v}” in the portal. Write their login e-mail or full name` };
  }
  const parseTypes = s => { const parts = String(s || "").split(/[,;\/]+/).map(x => x.trim()).filter(Boolean); const out = [], bad = [];
    parts.forEach(p => { const hit = EVENT_TYPES.find(t => lc(t) === lc(p)); if (hit) { if (!out.includes(hit)) out.push(hit); } else bad.push(p); }); return { out, bad }; };

  PORTALS.tasks = {
    name: "Tasks & Events",
    async load(sb) {
      const S = await readRows(sb);
      const R0 = () => rules(S, { role: "super", id: "" });
      const depts = R0().depts, stages = R0().stages;
      const TASK_COLS = [
        { k: "id", h: "Task no.", ex: "", note: "Leave empty for a new task. Downloaded rows have it: then the row changes that task", aka: ["taskno", "taskid", "no"] },
        { k: "title", h: "Title", req: true, ex: "Prepare the monthly report", max: 200 },
        { k: "dept", h: "Department", req: true, list: depts.map(x => x.name), ex: depts[0] && depts[0].name },
        { k: "assignee", h: "Assigned to", req: true, ex: "ali.khan@alkhidmatisb.org", note: "Login e-mail (best), username or full name of the person", aka: ["assignee", "assignedto", "person"] },
        { k: "plannedDate", h: "Due date", req: true, type: "date", ex: "30-11-2026", aka: ["plannedate", "planneddate", "due"] },
        { k: "startDate", h: "Start date", type: "date" },
        { k: "priority", h: "Priority", list: TPRI_LIST, ex: "Medium", note: "Empty: Medium" },
        { k: "stage", h: "Status", list: stages.map(x => x.name), ex: stages[0] && stages[0].name, note: "Empty: New for a new task; unchanged for an existing one. The portal's rules decide who may approve or close", aka: ["stage"] },
        { k: "estimate", h: "Time needed", ex: "2h", note: "e.g. 45m, 2h or 1h 30m", aka: ["estimate"] },
        { k: "recurring", h: "Repeats", list: Object.values(TREC), ex: TREC.none, note: "Empty: does not repeat", aka: ["repeat", "recurring"] },
        { k: "tags", h: "Tags", note: "Separate with commas" },
        { k: "event", h: "Event no.", ex: "", note: "Optional: the event (EV-…) this task belongs to", aka: ["eventid", "event"] },
        { k: "description", h: "Description", max: 5000 }];
      const EVENT_COLS = [
        { k: "id", h: "Event no.", ex: "", note: "Leave empty for a new event (saved as a draft). Downloaded rows have it: then the row changes that event", aka: ["eventno", "eventid", "no"] },
        { k: "title", h: "Title", req: true, ex: "Donor appreciation dinner", max: 200 },
        { k: "date", h: "Date", req: true, type: "date", ex: "15-12-2026" },
        { k: "time", h: "Time", type: "time", ex: "18:00", note: "Empty: 10:00" },
        { k: "venue", h: "Venue", req: true, ex: "Regional office hall", max: 200 },
        { k: "types", h: "Type", req: true, ex: "Seminar", note: "One or more of " + EVENT_TYPES.join(", ") + " — separate with commas", aka: ["type", "eventtype"] },
        { k: "otherType", h: "Other type", note: "When Type includes Other" },
        { k: "expected", h: "Expected people", type: "int", min: 0, aka: ["expected"] },
        { k: "coordinator", h: "Coordinator", note: "Login e-mail, username or full name. Empty: you" },
        { k: "topic", h: "Topic", max: 500 },
        { k: "collab", h: "In collaboration with", max: 200, aka: ["collab", "collaboration"] },
        { k: "additional", h: "Other details", max: 5000, aka: ["additional"] }];
      const findTask = v => S.tasks.find(t => t.v === 2 && lc(t.id) === lc(v)) || null;
      const findEvent = v => S.events.find(e => lc(e.id) === lc(v)) || null;
      const sheets = [
        { key: "tasks", name: "Tasks", about: "One row per task.", match: "id", find: findTask, cols: TASK_COLS,
          check: (x, upd) => x.id && !upd ? "No task with this Task no. Leave it empty for a new task" : findPerson(S.users, x.assignee).err || (x.event && !findEvent(x.event) ? `No event ${x.event} in the portal` : "") || (x.estimate && isNaN(tParseMin(x.estimate)) ? "Write Time needed like 45m, 2h or 1h 30m" : ""),
          rows: () => { const R = R0(); return S.tasks.filter(t => t.v === 2).map(t => { const ev = t.eventId && S.events.find(e => e.key === t.eventId);
            return { id: t.id, title: t.title, dept: R.dept(t.dept).name, assignee: personKey(R.user(t.assigneeId)), plannedDate: t.plannedDate, startDate: t.startDate || "", priority: t.priority, stage: R.stage(t.stage).name, estimate: tMin(t.estimate), recurring: TREC[t.recurring] || TREC.none, tags: (t.tags || []).join(", "), event: ev ? ev.id : "", description: t.description || "" }; }); } },
        { key: "events", name: "Events", about: "One row per event (seminar, training, meeting …).", match: "id", find: findEvent, cols: EVENT_COLS,
          check: (x, upd) => { if (x.id && !upd) return "No event with this Event no. Leave it empty for a new event"; const p = parseTypes(x.types); if (p.bad.length) return `Type “${p.bad[0]}” is not one of: ${EVENT_TYPES.join(", ")}`; if (!p.out.length) return "Write at least one event type"; return x.coordinator ? findPerson(S.users, x.coordinator).err || "" : ""; },
          rows: () => S.events.map(e => ({ id: e.id, title: e.title, date: e.date, time: e.time, venue: e.venue, types: (e.types || []).join(", "), otherType: e.otherType || "", expected: e.expected, coordinator: personKey(S.users.find(u => u.id === e.coordinator)), topic: e.topic || "", collab: e.collab || "", additional: e.additional || "" })) }];

      async function save(sheet, rows, progress) {
        const me = await whoAmI(sb);
        const d = await readRows(sb), before = snap(d, WRITE), failed = [], done = [];
        const O = taskOps(d, me), R = O.R;
        rows.forEach(x => {
          const D = x.data, has = k => k in D;
          try {
            if (sheet.key === "tasks") {
              const t = x.update ? d.tasks.find(z => z.key === x.update.key) : null; if (x.update && !t) fail("This task is no longer in the portal.");
              const p = findPerson(d.users, D.assignee); if (p.err) fail(p.err);
              const dep = R.depts.find(z => z.name === D.dept); if (!dep) fail("Unknown department.");
              const st = D.stage ? R.stages.find(z => z.name === D.stage) : null;
              let eventId = t ? t.eventId : null; if (has("event")) { if (D.event) { const ev = d.events.find(e => lc(e.id) === lc(D.event)); if (!ev) fail(`No event ${D.event} in the portal.`); eventId = ev.key; } else eventId = null; }
              const pick = (k, v) => has(k) ? D[k] : v;
              const f = { ...(t || {}), title: D.title, dept: dep.id, assigneeId: p.u.id, plannedDate: D.plannedDate, startDate: pick("startDate", t ? t.startDate : ""),
                priority: D.priority || (t ? t.priority : "Medium"), estimate: has("estimate") ? (D.estimate || 0) : (t ? t.estimate : 0),
                recurring: has("recurring") ? (Object.keys(TREC).find(k => TREC[k] === D.recurring) || "none") : (t ? t.recurring : "none"),
                tags: has("tags") ? String(D.tags || "").split(",").map(s => s.trim()).filter(Boolean) : (t ? t.tags || [] : []),
                description: pick("description", t ? t.description : ""), eventId, checkItem: t && eventId === t.eventId ? t.checkItem : null };
              if (t) {
                f.stage = st ? st.id : t.stage;
                const same = ["title", "description", "dept", "assigneeId", "plannedDate", "startDate", "priority", "recurring", "eventId", "stage"].every(k => String(f[k] ?? "") === String(t[k] ?? ""))
                  && String(f.tags) === String(t.tags || []) && Number(typeof f.estimate === "number" ? f.estimate : tParseMin(f.estimate)) === Number(t.estimate || 0);
                if (!same) O.tSave(t, f);
              } else {
                /* every check runs before anything changes, so a refused row leaves no trace */
                if (st && st.id !== "01") { const m = R.moveError({ ...f, stage: "01", creatorId: me.id, dependencies: [] }, st.id); if (m) fail(m); }
                const n = O.tCreate(f); if (st && st.id !== "01") O.tMove(n, st.id);
              }
            } else {
              const e = x.update ? d.events.find(z => z.key === x.update.key) : null; if (x.update && !e) fail("This event is no longer in the portal.");
              let coordinator = e ? e.coordinator : ""; if (has("coordinator") && D.coordinator) { const p = findPerson(d.users, D.coordinator); if (p.err) fail(p.err); coordinator = p.u.id; }
              const pick = (k, v) => has(k) ? D[k] : v;
              const c = evClean({ ...(e || {}), title: D.title, date: D.date, time: pick("time", e ? e.time : ""), venue: D.venue, types: parseTypes(D.types).out, otherType: pick("otherType", e ? e.otherType : ""),
                expected: pick("expected", e ? e.expected : ""), coordinator, topic: pick("topic", e ? e.topic : ""), collab: pick("collab", e ? e.collab : ""), additional: pick("additional", e ? e.additional : ""), checklist: e ? e.checklist : {} });
              if (e) { if (Object.keys(c).some(k => JSON.stringify(c[k]) !== JSON.stringify(e[k]))) O.eSave(e, c); }
              else O.eCreate(c);
            }
            done.push(x.row);
          } catch (err) {
            failed.push({ row: x.row, msg: plain(err) });
          }
        });
        progress(Math.round(rows.length / 2));
        try { await write(sb, before, d, WRITE); }
        catch (e) { return { failed: failed.concat(done.map(row => ({ row, msg: plain(e) }))) }; }
        Object.assign(S, await readRows(sb));
        progress(rows.length);
        return { failed };
      }
      return { sheets, save };
    }
  };
  PORTALS.tasks._test = { evClean, findPerson, parseTypes, taskOps, rules };
})();
