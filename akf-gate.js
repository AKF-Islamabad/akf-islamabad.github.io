/* Alkhidmat Islamabad — portal gate (shared by every portal).
   Served once from the main site (https://akf-islamabad.github.io/akf-gate.js). Every portal loads it with
   <script src="../akf-gate.js"></script> (relative, so the same files work on staging) after
   config.js and supabase-js, then calls:

     const ctx = await AKF_GATE("fleet");        // the portal's key
     ctx.tabs                                     // [{ tab_key, name, description, actions:[…] }] — only tabs this person was given
     ctx.can("trips", "approve")                  // true / false — use to show or hide buttons
     ctx.sb, ctx.profile, ctx.role                // database client, the person, preset label

   No sign-in → sent to the main page. No access → a "no access" screen.
   This only decides what the page SHOWS; the database rules (core_can) are what protect the data. */
(function () {
  "use strict";
  const HOME = new URL("../", location.href).href;   // the main page is one folder up: / on live, /portal-staging/ on staging
  function screen(title, text) {
    document.body.replaceChildren();
    const box = document.createElement("div");
    box.style.cssText = "min-height:100vh;display:grid;place-items:center;padding:24px;font:15px/1.5 system-ui,sans-serif;background:#F3F5FA;color:#0F1B3D";
    const card = document.createElement("div");
    card.style.cssText = "max-width:420px;background:#fff;border:1px solid #E2E7F1;border-radius:14px;padding:28px;text-align:center;display:grid;gap:12px";
    const h = document.createElement("h2"); h.textContent = title; h.style.margin = "0";
    const p = document.createElement("p"); p.textContent = text; p.style.cssText = "margin:0;color:#5A6684";
    const a = document.createElement("a"); a.href = HOME; a.textContent = "Back to all portals";
    a.style.cssText = "display:inline-block;margin-top:6px;background:#0B51A7;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700";
    card.append(h, p, a); box.append(card); document.body.append(box);
  }
  window.AKF_GATE = async function (moduleKey) {
    const cfg = window.AKF_SUPABASE;
    if (!cfg || !cfg.url || !cfg.anonKey || typeof supabase === "undefined") { screen("Setup needed", "This portal's config.js is missing."); throw new Error("config"); }
    const sb = supabase.createClient(cfg.url, cfg.anonKey);   // same project = the sign-in from the main page is reused
    const { data } = await sb.auth.getSession();
    if (!data.session) { location.replace(HOME); throw new Error("signed out"); }
    sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") location.replace(HOME); });
    const [{ data: profile }, { data: role }, { data: tabs }] = await Promise.all([
      sb.from("core_profiles").select("id,email,full_name,designation,dept,is_super,must_change_password").eq("id", data.session.user.id).maybeSingle(),
      sb.rpc("core_module_role", { p_module: moduleKey }),
      sb.rpc("core_my_tabs", { p_module: moduleKey }),
    ]);
    if (!profile) { screen("No access", "Your account is not active. Ask the Super Admin."); throw new Error("no profile"); }
    if (profile.must_change_password) { location.replace(HOME); throw new Error("password"); }
    if (!role) { screen("No access to this portal", "Ask the Super Admin to give you access on the main page."); throw new Error("no access"); }
    const rights = {}; (tabs || []).forEach(t => { rights[t.tab_key] = t.actions || []; });
    return { sb, profile, role, tabs: tabs || [], can: (tab, action) => (rights[tab] || []).includes(action || "view") };
  };

  /* Free plan has 1 GB for files: shrink photos before upload (max 1600 px, JPEG). Other files pass through. */
  window.AKF_shrinkImage = async function (file, maxSide = 1600, quality = 0.75) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 300 * 1024) return file;
    const img = await createImageBitmap(file);
    const k = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(ok => c.toBlob(ok, "image/jpeg", quality));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  };
})();
