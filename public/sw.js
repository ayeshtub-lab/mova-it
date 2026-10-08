// Zawmo's service worker (registered for every visitor by src/app/AppShell.tsx). Pages are never
// cached — they always come fresh from the server. It does three things only:
//  • notifications (push, and opening the right page when one is tapped);
//  • an offline screen: a page that can't load because there is no connection shows
//    /offline.html (kept here) instead of the browser's error;
//  • «شارك لزاومو»: photos and videos shared to Zawmo from the phone's gallery (the manifest's
//    share_target) are kept here for a moment, then the new-moment page picks them up.

const SHELL = "zawmo-shell-1";
const SHARE = "zawmo-share";
const SHELL_FILES = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(SHELL_FILES).catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Pages load as fast as without a service worker: the browser starts fetching at once.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
      for (const key of await caches.keys()) if (key !== SHELL && key !== SHARE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // «شارك لزاومو» from the gallery: keep the files (10 at most), then open the new-moment page.
  if (url.pathname === "/share" && request.method === "POST") {
    event.respondWith(
      (async () => {
        try {
          const form = await request.formData();
          const files = form
            .getAll("media")
            .filter((f) => f && typeof f === "object" && f.size > 0)
            .slice(0, 10);
          await caches.delete(SHARE);
          const cache = await caches.open(SHARE);
          const at = String(Date.now());
          await Promise.all(
            files.map((f, i) =>
              cache.put(`/shared/${i}`, new Response(f, { headers: { "content-type": f.type || "application/octet-stream", "x-name": encodeURIComponent(f.name || `zawmo-${i}`), "x-at": at } })),
            ),
          );
          return Response.redirect(`/new?shared=${files.length}`, 303);
        } catch {
          return Response.redirect("/new?shared=0", 303);
        }
      })(),
    );
    return;
  }

  // A page (GET only): from the network as always; with no connection, the offline screen.
  if (request.mode === "navigate" && request.method === "GET") {
    event.respondWith(
      (async () => {
        try {
          return (await event.preloadResponse) || (await fetch(request));
        } catch {
          return (await caches.match("/offline.html")) || Response.error();
        }
      })(),
    );
  }
});

// A notification from the server: { title, body, url, tag }.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}
  const title = data.title || "زاومو";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || "/" },
      dir: "auto",
    }),
  );
});

// Tapping it opens the right page — in an open Zawmo window if there is one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return open.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
