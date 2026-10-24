// CACHE_PREFIX in service-worker.ts; importing it here would make the worker bundle share a chunk.
const CACHE_PREFIX = "rakazo-shell-";

type ServiceWorkerHost = Pick<
  Window,
  "addEventListener" | "navigator" | "rakazoDesktop" | "caches"
>;

/**
 * Production browsers only. Dev must always reach Vite. The desktop app never gets a worker:
 * its hidden startup check loads the server without the bridge, and a worker's caches there
 * made the next launch switch to a signed-out session. So inside Electron, remove any left over.
 */
export function registerServiceWorker(
  target: ServiceWorkerHost = window,
  production: boolean = import.meta.env.PROD,
): void {
  if (!("serviceWorker" in target.navigator)) return;
  if (target.rakazoDesktop || target.navigator.userAgent.includes("Electron/")) {
    void removeServiceWorkers(target);
    return;
  }
  if (!production) return;
  target.addEventListener(
    "load",
    () => {
      target.navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    },
    { once: true },
  );
}

async function removeServiceWorkers(target: ServiceWorkerHost): Promise<void> {
  // Undefined outside secure contexts.
  const caches: CacheStorage | undefined = target.caches;
  await Promise.all([
    target.navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
      .catch(() => undefined),
    caches
      ?.keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)),
        ),
      )
      .catch(() => undefined),
  ]);
}
