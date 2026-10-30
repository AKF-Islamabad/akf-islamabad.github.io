/* Alkhidmat portals — service worker: shows system notifications on phones and computers, also when no portal is open.
   Registered by akf-push.js. It caches nothing: every page still loads fresh from the website. */
"use strict";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

function show(n) {
  return self.registration.showNotification(String(n.title || "Alkhidmat portals").slice(0, 120), {
    body: String(n.body || "").slice(0, 240),
    tag: String(n.tag || "") || undefined,
    renotify: !!n.tag,                       // a repeat of the same item rings again
    icon: "icon.jpg", badge: "icon.jpg",
    data: { url: n.url || self.registration.scope },
  });
}

self.addEventListener("push", (e) => {
  let n = {};
  try { n = e.data ? e.data.json() : {}; } catch (_) { n = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(show(n));
});

// the open portal asks for a notification of a new bell item (works on phones, where pages cannot use new Notification())
self.addEventListener("message", (e) => { if (e.data && e.data.type === "akf-notify") e.waitUntil(show(e.data)); });

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || self.registration.scope, self.registration.scope).href;
  if (!url.startsWith(self.registration.scope)) return;      // only pages of this website
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const same = list.find((c) => c.url.split("#")[0] === url.split("#")[0]);
    return same ? same.focus() : self.clients.openWindow(url);
  }));
});
