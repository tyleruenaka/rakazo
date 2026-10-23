import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServiceWorkerScope } from "./service-worker.js";
import {
  bypassesServiceWorker,
  installServiceWorker,
  SKIP_WAITING,
  serviceWorkerRemoved,
} from "./service-worker.js";

const ORIGIN = "https://app.example.com";
const CACHE = "rakazo-shell-current";
const JS = { "content-type": "text/javascript" };
const HTML = { "content-type": "text/html" };

class FakeCache {
  readonly entries = new Map<string, Response>();
  async match(request: RequestInfo) {
    const url = new URL(typeof request === "string" ? request : request.url, ORIGIN).href;
    return this.entries.get(url)?.clone();
  }
  async put(request: RequestInfo, response: Response) {
    this.entries.set(
      new URL(typeof request === "string" ? request : request.url, ORIGIN).href,
      response,
    );
  }
}

let network: (request: Request) => Promise<Response>;

const offline = async (): Promise<Response> => {
  throw new TypeError("offline");
};

/**
 * A server running one build, served the way `vite preview` serves it: known
 * files, and the SPA's index.html for any other path. `serviceWorker: false`
 * is a build from before the PWA, which has no /sw.js.
 */
function server(build: string, files: string[], options: { serviceWorker?: boolean } = {}) {
  return async (request: Request) => {
    const { pathname } = new URL(request.url);
    if (pathname === "/sw.js" && options.serviceWorker !== false) {
      return new Response(`sw ${build}`, { headers: JS });
    }
    if (files.includes(pathname) && pathname !== "/") {
      return new Response(`${build} ${pathname}`, { headers: JS });
    }
    return new Response(`<html>${build}</html>`, { headers: HTML });
  };
}

type Stores = Map<string, FakeCache>;

function setup(
  options: { precache?: string[]; windows?: number; cacheName?: string; stores?: Stores } = {},
) {
  const stores: Stores = options.stores ?? new Map();
  const listeners = new Map<string, (event: unknown) => void>();
  const waiting = new EventTarget() as EventTarget & { postMessage: ReturnType<typeof vi.fn> };
  waiting.postMessage = vi.fn();
  const caches = {
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return stores.get(name)!;
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const scope = {
    location: { origin: ORIGIN },
    caches: caches as unknown as CacheStorage,
    clients: { matchAll: async () => Array.from({ length: options.windows ?? 1 }) },
    registration: {
      waiting: null as typeof waiting | null,
      unregister: vi.fn(async () => true),
    },
    skipWaiting: vi.fn(async () => undefined),
    fetch: (request: Request) => network(request),
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners.set(type, listener);
    },
  };
  installServiceWorker(
    scope as unknown as ServiceWorkerScope,
    options.precache ?? ["/"],
    options.cacheName ?? CACHE,
  );

  async function dispatch(type: string, extra: object) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners.get(type)!({
      ...extra,
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      respondWith: (value: Promise<Response>) => {
        response = value;
      },
    });
    const result = await response;
    await Promise.all(pending);
    return result;
  }
  const request = (path: string, mode: RequestMode = "cors", method = "GET") =>
    // Request() refuses "navigate" as a mode, so pin it the way the browser would.
    Object.defineProperty(new Request(new URL(path, ORIGIN), { method }), "mode", { value: mode });
  return {
    stores,
    scope,
    waiting,
    dispatch,
    fetch: (path: string, mode?: RequestMode, method?: string) =>
      dispatch("fetch", { request: request(path, mode, method) }),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("service worker", () => {
  it("never handles live data, auth callbacks or the screen proxy", async () => {
    network = vi.fn(async () => new Response("live"));
    const sw = setup();
    for (const path of ["/api/auth/callback/github?code=1", "/rpc/threads", "/novnc/session/x"]) {
      expect(await sw.fetch(path, "navigate")).toBeUndefined();
      expect(await sw.fetch(path)).toBeUndefined();
    }
    expect(await sw.fetch("/assets/app.js", "cors", "POST")).toBeUndefined();
    expect(await sw.fetch("https://cdn.example.com/assets/app.js")).toBeUndefined();
    expect(network).not.toHaveBeenCalled();
    expect(bypassesServiceWorker("/apiary")).toBe(false);
  });

  it("precaches the shell and serves it for navigations while offline", async () => {
    network = async (request) => {
      const { pathname } = new URL(request.url);
      return new Response(`network ${pathname}`, pathname === "/sw.js" ? { headers: JS } : {});
    };
    const sw = setup({ precache: ["/", "/assets/index-abc.js"] });
    await sw.dispatch("install", {});

    expect(await (await sw.fetch("/t/123", "navigate"))!.text()).toBe("network /t/123");
    network = offline;
    expect(await (await sw.fetch("/t/123", "navigate"))!.text()).toBe("network /");
    expect(await (await sw.fetch("/assets/index-abc.js"))!.text()).toBe(
      "network /assets/index-abc.js",
    );
  });

  it("caches lazy assets as they load, but not an HTML fallback", async () => {
    network = async (request) =>
      request.url.endsWith("missing.js")
        ? new Response("<html>", { headers: HTML })
        : new Response("chunk", { headers: JS });
    const sw = setup();
    await sw.fetch("/assets/lazy.js");
    await sw.fetch("/assets/missing.js");
    expect([...sw.stores.get(CACHE)!.entries.keys()]).toEqual([`${ORIGIN}/assets/lazy.js`]);
  });

  it("keeps only the current and newest previous shell caches on activate", async () => {
    network = async () => new Response("ok");
    const sw = setup();
    await sw.scope.caches.open("rakazo-shell-old");
    await sw.scope.caches.open("rakazo-shell-previous");
    await sw.scope.caches.open("someone-else");
    await sw.scope.caches.open(CACHE);
    await sw.dispatch("activate", {});
    expect([...sw.stores.keys()]).toEqual(["rakazo-shell-previous", "someone-else", CACHE]);
  });

  it("serves an old-version asset from the previous cache after activation while offline", async () => {
    network = vi.fn(offline);
    const sw = setup();
    const previous = await sw.scope.caches.open("rakazo-shell-previous");
    await previous.put("/assets/old.js", new Response("previous bundle"));
    await sw.scope.caches.open(CACHE);
    await sw.dispatch("activate", {});

    expect(await (await sw.fetch("/assets/old.js"))!.text()).toBe("previous bundle");
    expect(network).not.toHaveBeenCalled();
  });

  it("hands over to a waiting version on the next navigation of the last window", async () => {
    network = vi.fn(async () => new Response("page"));
    const sw = setup();
    sw.scope.registration.waiting = sw.waiting;
    sw.waiting.postMessage.mockImplementation(() =>
      sw.waiting.dispatchEvent(new Event("statechange")),
    );

    const response = await sw.fetch("/", "navigate");
    expect(sw.waiting.postMessage).toHaveBeenCalledWith(SKIP_WAITING);
    expect(response!.headers.get("refresh")).toBe("0");
    expect(network).not.toHaveBeenCalled();

    await sw.dispatch("message", { data: SKIP_WAITING });
    expect(sw.scope.skipWaiting).toHaveBeenCalledOnce();
  });

  it("keeps the current version while other windows still use it", async () => {
    network = server("v1", []);
    const sw = setup({ windows: 2 });
    sw.scope.registration.waiting = sw.waiting;
    expect(await (await sw.fetch("/", "navigate"))!.text()).toBe("<html>v1</html>");
    expect(sw.waiting.postMessage).not.toHaveBeenCalled();
  });

  it("loads the page normally when the waiting version does not take over", async () => {
    vi.useFakeTimers();
    network = server("v1", []);
    const sw = setup();
    sw.scope.registration.waiting = sw.waiting;
    const pending = sw.fetch("/", "navigate");
    await vi.runAllTimersAsync();
    expect(await (await pending)!.text()).toBe("<html>v1</html>");
  });
});

describe("switching server versions", () => {
  const V1 = ["/", "/assets/index-v1.js"];
  const V2 = ["/", "/assets/index-v2.js"];

  it("loads navigations from the network while online, even with a cached shell", async () => {
    network = server("v1", V1);
    const sw = setup({ precache: V1 });
    await sw.dispatch("install", {});

    network = server("v2", V2);
    expect(await (await sw.fetch("/", "navigate"))!.text()).toBe("<html>v2</html>");
    expect(await (await sw.fetch("/t/1", "navigate"))!.text()).toBe("<html>v2</html>");
    // A server error mid-deploy is shown as is, not covered up with the cached shell.
    network = async (request) =>
      new URL(request.url).pathname === "/sw.js"
        ? new Response("", { status: 502 })
        : new Response("bad gateway", { status: 502 });
    expect((await sw.fetch("/", "navigate"))!.status).toBe(502);
    // Only a failed network falls back to the cache.
    network = offline;
    expect(await (await sw.fetch("/", "navigate"))!.text()).toBe("<html>v1</html>");
  });

  it("never answers a non-navigation request for the shell from the cache", async () => {
    network = server("v1", V1);
    const sw = setup({ precache: V1 });
    await sw.dispatch("install", {});
    expect(await sw.fetch("/")).toBeUndefined();
  });

  it("lets a different build take over and drops all but its previous shell", async () => {
    const stores: Stores = new Map();
    network = server("v1", V1);
    const v1 = setup({ precache: V1, cacheName: "rakazo-shell-v1", stores });
    await v1.dispatch("install", {});
    await v1.dispatch("activate", {});

    network = server("v2", V2);
    const v2 = setup({ precache: V2, cacheName: "rakazo-shell-v2", stores });
    await v2.dispatch("install", {});
    await v2.dispatch("activate", {});
    network = server("v3", ["/", "/assets/index-v3.js"]);
    const v3 = setup({
      precache: ["/", "/assets/index-v3.js"],
      cacheName: "rakazo-shell-v3",
      stores,
    });
    await v3.dispatch("install", {});
    await v3.dispatch("activate", {});

    expect([...stores.keys()]).toEqual(["rakazo-shell-v2", "rakazo-shell-v3"]);
    network = offline;
    expect(await (await v3.fetch("/", "navigate"))!.text()).toBe("<html>v3</html>");
  });

  it("switching back to an older PWA build serves the older shell, not the newer cached one", async () => {
    const stores: Stores = new Map();
    network = server("v2", V2);
    const v2 = setup({ precache: V2, cacheName: "rakazo-shell-v2", stores });
    await v2.dispatch("install", {});
    await v2.dispatch("activate", {});

    // The server goes back to v1. Until v1's worker takes over, v2's worker is still in
    // charge, but pages and their assets come from v1.
    network = server("v1", V1);
    expect(await (await v2.fetch("/", "navigate"))!.text()).toBe("<html>v1</html>");
    expect(await (await v2.fetch("/assets/index-v1.js"))!.text()).toBe("v1 /assets/index-v1.js");
    expect(v2.scope.registration.unregister).not.toHaveBeenCalled();

    // The browser installs v1's /sw.js and it takes over on the next navigation.
    const v1 = setup({ precache: V1, cacheName: "rakazo-shell-v1", stores });
    await v1.dispatch("install", {});
    await v1.dispatch("activate", {});
    network = offline;
    expect(await (await v1.fetch("/", "navigate"))!.text()).toBe("<html>v1</html>");
  });

  it("refuses to install a shell when the server was switched to another build mid-install", async () => {
    network = server("v1", V1);
    const sw = setup({ precache: V2, cacheName: "rakazo-shell-v2" });
    await expect(sw.dispatch("install", {})).rejects.toThrow(/index-v2\.js/);
    expect(sw.stores.get("rakazo-shell-v2")?.entries.size ?? 0).toBe(0);
  });

  it("retires itself and its caches when the server goes back to a build without the PWA", async () => {
    network = server("v2", V2);
    const sw = setup({ precache: V2, cacheName: "rakazo-shell-v2" });
    await sw.dispatch("install", {});
    await sw.scope.caches.open("rakazo-shell-v1");
    await sw.scope.caches.open("someone-else");

    // That build answers /sw.js with its SPA HTML, so the browser's own update check fails
    // and keeps this worker. The first online navigation still gets the old build's page.
    network = server("old", ["/", "/assets/index-old.js"], { serviceWorker: false });
    expect(await (await sw.fetch("/", "navigate"))!.text()).toBe("<html>old</html>");
    expect(sw.scope.registration.unregister).toHaveBeenCalledOnce();
    expect([...sw.stores.keys()]).toEqual(["someone-else"]);

    // Until the browser drops the registration, the open page goes straight to the network.
    expect(await sw.fetch("/assets/index-old.js")).toBeUndefined();
    network = offline;
    expect(await sw.fetch("/", "navigate")).toBeUndefined();
    expect([...sw.stores.keys()]).toEqual(["someone-else"]);
  });

  it("keeps working when /sw.js is still served, or the server is only briefly unreachable", async () => {
    network = server("v2", V2);
    const sw = setup({ precache: V2 });
    await sw.dispatch("install", {});
    await sw.fetch("/", "navigate");
    network = async (request) =>
      new URL(request.url).pathname === "/sw.js"
        ? new Response("starting", { status: 503 })
        : new Response("<html>v2</html>", { headers: HTML });
    await sw.fetch("/", "navigate");
    expect(sw.scope.registration.unregister).not.toHaveBeenCalled();
    expect(sw.stores.get(CACHE)?.entries.size).toBe(2);
  });

  it("only treats a missing or non-script /sw.js as the PWA being gone", () => {
    expect(serviceWorkerRemoved(new Response("", { status: 404 }))).toBe(true);
    expect(serviceWorkerRemoved(new Response("<html>", { headers: HTML }))).toBe(true);
    expect(serviceWorkerRemoved(new Response("sw", { headers: JS }))).toBe(false);
    expect(
      serviceWorkerRemoved(
        new Response("sw", { headers: { "content-type": "application/javascript" } }),
      ),
    ).toBe(false);
    expect(serviceWorkerRemoved(new Response("", { status: 502 }))).toBe(false);
  });
});
