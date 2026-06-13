const CACHE_NAME = "madupe-v1";
const API_CACHE_NAME = "madupe-api-v1";
const STATIC_URLS = ["/", "/offline"];

const API_BASE = self.location.origin;

const mutationMethods = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function isMutationRequest(request) {
  return mutationMethods.has(request.method);
}

function isApiRequest(url) {
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/public/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/admin/") || url.pathname.startsWith("/venues/") || url.pathname.startsWith("/requests/");
}

function isPageRequest(url) {
  return url.pathname === "/" || url.pathname.startsWith("/qr/") || url.pathname.startsWith("/command") || url.pathname.startsWith("/staff") || url.pathname.startsWith("/login") || url.pathname.startsWith("/signup");
}

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/") || url.pathname.match(/\.(js|css|woff2?|svg|png|jpg|ico)$/);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_URLS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
    ])
  );
});

function networkFirst(request, cacheName = CACHE_NAME) {
  return fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaqueredirect") {
        const clone = response.clone();
        caches.open(cacheName).then((cache) => cache.put(request, clone));
      }
      return response;
    })
    .catch(() => caches.match(request).then((cached) => cached || Response.error()));
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    });
  });
}

function queueMutationRequest(request) {
  if (!request.clone) return fetch(request);

  const bodyPromise = request.clone().text().catch(() => "");

  return bodyPromise.then((body) => {
    const pendingItem = {
      url: request.url,
      method: request.method,
      headers: Array.from(request.headers.entries()),
      body,
      timestamp: Date.now(),
      idempotencyKey: request.headers.get("Idempotency-Key") || null
    };

    return saveToQueue(pendingItem).then(() => {
      return new Response(null, { status: 202, statusText: "Queued" });
    });
  });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const request = event.request;

  if (url.origin !== self.location.origin && !url.origin.includes(API_BASE)) {
    return;
  }

  if (request.headers.get("Accept") === "text/event-stream" || url.pathname.endsWith("/events")) {
    return;
  }

  if (isMutationRequest(request)) {
    if (navigator.onLine === false) {
      event.respondWith(queueMutationRequest(request));
    }
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(request, API_CACHE_NAME));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isPageRequest(url)) {
    event.respondWith(networkFirst(request));
    return;
  }
});

self.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data.type === "PROCESS_QUEUE") {
    event.waitUntil(processPendingQueue());
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-pending-requests") {
    event.waitUntil(processPendingQueue());
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || "Madupe";
    const options = {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: data.tag || "madupe-push",
      renotify: true,
      requireInteraction: true
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    const title = "Madupe";
    const body = event.data.text();
    event.waitUntil(self.registration.showNotification(title, { body, icon: "/icon.svg" }));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/command";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url === urlToOpen && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

function saveToQueue(item) {
  return new Promise((resolve) => {
    const request = indexedDB.open("madupe-offline-queue", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("pending")) {
        db.createObjectStore("pending", { keyPath: "timestamp" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("pending", "readwrite");
      tx.objectStore("pending").add(item);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
  });
}

function processPendingQueue() {
  return new Promise((resolve) => {
    const request = indexedDB.open("madupe-offline-queue", 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("pending", "readwrite");
      const store = tx.objectStore("pending");
      const getAll = store.getAll();

      getAll.onsuccess = () => {
        const items = getAll.result;
        if (!items.length) {
          db.close();
          resolve();
          return;
        }

        let completed = 0;
        for (const item of items) {
          const headers = new Headers(item.headers);
          if (item.idempotencyKey && !headers.has("Idempotency-Key")) {
            headers.set("Idempotency-Key", item.idempotencyKey);
          }

          fetch(item.url, {
            method: item.method,
            headers,
            body: item.body || undefined
          })
            .then(() => {
              store.delete(item.timestamp);
            })
            .catch(() => {
              // will retry on next sync
            })
            .finally(() => {
              completed += 1;
              if (completed >= items.length) {
                db.close();
                resolve();
              }
            });
        }
      };
    };
  });
}

self.addEventListener("online", () => {
  self.registration.sync.register("sync-pending-requests").catch(() => undefined);
});


