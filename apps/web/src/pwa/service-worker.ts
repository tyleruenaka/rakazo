export const SKIP_WAITING = "rakazo:skip-waiting";
export const CACHE_PREFIX = "rakazo-shell-";
export const SERVICE_WORKER_PATH = "/sw.js";
const SHELL_PATH = "/";

// Live data, auth callbacks and the screen proxy always go straight to the server.
const BYPASS_PREFIXES = ["/api", "/rpc", "/novnc", "/.well-known", "/health"];
const ACTIVATION_TIMEOUT_MS = 3_000;

type ExtendableEvent = { waitUntil(promise: Promise<unknown>): void };
type FetchEvent = ExtendableEvent & {
  request: Request;
  respondWith(response: Promise<Response>): void;
};
type MessageEvent = ExtendableEvent & { data: unknown };

export type ServiceWorkerScope = {
  location: { origin: string };
  caches: CacheStorage;
  clients: { matchAll(options: { type: "window" }): Promise<readonly unknown[]> };
  registration: {
    waiting: Pick<ServiceWorker, "postMessage" | "addEventListener" | "removeEventListener"> | null;
    unregister(): Promise<boolean>;
  };
  skipWaiting(): Promise<void>;
  fetch(request: Request): Promise<Response>;
  addEventListener(type: "install" | "activate", listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
};

export function bypassesServiceWorker(pathname: string): boolean {
  return BYPASS_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const isHtml = (response: Response) =>
  response.headers.get("content-type")?.includes("text/html") ?? false;

/**
 * True when the server answering /sw.js no longer ships a service worker: a
 * 404/410, or the SPA's HTML fallback that a build without one serves for
 * unknown paths. A 5xx or a network error during a deploy is not a verdict.
 */
export function serviceWorkerRemoved(response: Response): boolean {
  if (response.status === 404 || response.status === 410) return true;
  if (!response.ok) return false;
  return !/javascript|ecmascript/i.test(response.headers.get("content-type") ?? "");
}

/**
 * Precaches the app shell, serves hashed assets cache-first and falls back to
 * the cached shell for navigations while offline. A new version waits until
 * the next navigation of the last open window, then takes over by reloading
 * that navigation. The previous shell stays cached for tabs still using it.
 *
 * Navigations always go to the network first, so an online page is whatever
 * version the server runs now. When the server is switched to a build without
 * a service worker the browser keeps this one registered (its update check just
 * fails), so after each online navigation the worker checks /sw.js and retires
 * itself, dropping its caches, once the server stops shipping one.
 */
export function installServiceWorker(
  scope: ServiceWorkerScope,
  precache: readonly string[],
  cacheName: string,
): void {
  const precached = new Set(precache);
  // Set once the server stops shipping a worker: from then on every request goes to the network.
  let retired = false;

  scope.addEventListener("install", (event) => {
    event.waitUntil(precacheShell());
  });

  scope.addEventListener("activate", (event) => {
    event.waitUntil(
      scope.caches.keys().then((names) => {
        // Keep the newest previous shell for tabs still running its bundle.
        const previous = names.filter(
          (name) => name.startsWith(CACHE_PREFIX) && name !== cacheName,
        );
        return Promise.all(previous.slice(0, -1).map((name) => scope.caches.delete(name)));
      }),
    );
  });

  scope.addEventListener("message", (event) => {
    if (event.data === SKIP_WAITING) event.waitUntil(scope.skipWaiting());
  });

  scope.addEventListener("fetch", (event) => {
    const { request } = event;
    if (retired || request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== scope.location.origin || bypassesServiceWorker(url.pathname)) return;
    if (request.mode === "navigate") {
      event.respondWith(navigate(event));
    } else if (
      // The HTML shell is only ever served from the cache for an offline navigation.
      url.pathname !== SHELL_PATH &&
      (precached.has(url.pathname) || url.pathname.startsWith("/assets/"))
    ) {
      event.respondWith(cacheFirst(event, url.pathname));
    }
  });

  async function precacheShell(): Promise<void> {
    // Fetch the whole shell before storing any of it, and refuse one that is not
    // this build's: if the server was switched mid-install, this build's assets
    // come back as 404s or as the other build's SPA HTML.
    const entries = await Promise.all(
      precache.map(async (path) => {
        const request = new Request(new URL(path, scope.location.origin), { cache: "no-cache" });
        const response = await scope.fetch(request);
        if (!response.ok || (path !== SHELL_PATH && isHtml(response))) {
          throw new Error(`Could not precache ${path} for this version.`);
        }
        return [request, response] as const;
      }),
    );
    const cache = await scope.caches.open(cacheName);
    await Promise.all(entries.map(([request, response]) => cache.put(request, response)));
  }

  async function navigate(event: FetchEvent): Promise<Response> {
    const { request } = event;
    if (await activateWaitingWorker()) {
      return new Response("", { headers: { Refresh: "0" } });
    }
    let response: Response;
    try {
      response = await scope.fetch(request);
    } catch (error) {
      // Only a failed network reaches the cache; an HTTP error from the server passes through.
      const shell = await (await scope.caches.open(cacheName)).match(SHELL_PATH);
      if (shell) return shell;
      throw error;
    }
    if (request.destination !== "iframe") event.waitUntil(retireIfRemoved());
    return response;
  }

  async function retireIfRemoved(): Promise<void> {
    let response: Response;
    try {
      response = await scope.fetch(
        new Request(new URL(SERVICE_WORKER_PATH, scope.location.origin), { cache: "no-store" }),
      );
    } catch {
      return;
    }
    if (!serviceWorkerRemoved(response)) return;
    retired = true;
    await scope.registration.unregister().catch(() => false);
    const names = await scope.caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX))
        .map((name) => scope.caches.delete(name)),
    );
  }

  async function activateWaitingWorker(): Promise<boolean> {
    const waiting = scope.registration.waiting;
    if (!waiting) return false;
    if ((await scope.clients.matchAll({ type: "window" })).length > 1) return false;
    return new Promise((resolve) => {
      const changed = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        waiting.removeEventListener("statechange", changed);
        resolve(false);
      }, ACTIVATION_TIMEOUT_MS);
      waiting.addEventListener("statechange", changed, { once: true });
      waiting.postMessage(SKIP_WAITING);
    });
  }

  async function cacheFirst(event: FetchEvent, pathname: string): Promise<Response> {
    const cache = await scope.caches.open(cacheName);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    // Hashed file names: the same URL in an earlier version's cache is the same bytes.
    for (const name of await scope.caches.keys()) {
      if (!name.startsWith(CACHE_PREFIX) || name === cacheName) continue;
      const previous = await (await scope.caches.open(name)).match(event.request);
      if (previous) return previous;
    }
    const response = await scope.fetch(event.request);
    // A missing chunk can come back as the SPA's HTML; never store that as an asset.
    if (response.ok && !isHtml(response) && pathname.startsWith("/assets/")) {
      event.waitUntil(cache.put(event.request, response.clone()).catch(() => undefined));
    }
    return response;
  }
}
