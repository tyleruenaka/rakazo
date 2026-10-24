import { describe, expect, it, vi } from "vitest";
import type { RakazoDesktop } from "../lib/desktop.js";
import { registerServiceWorker } from "./register.js";
import { CACHE_PREFIX } from "./service-worker.js";

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0.0.0 Safari/537.36";
const ELECTRON_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Rakazo/0.3.1 Chrome/140.0.0.0 Electron/44.9.1 Safari/537.36";

function host({
  desktop,
  userAgent = BROWSER_UA,
}: {
  desktop?: RakazoDesktop;
  userAgent?: string;
} = {}) {
  const register = vi.fn(async () => ({}));
  const existing = [
    { unregister: vi.fn(async () => true) },
    { unregister: vi.fn(async () => true) },
  ];
  const cacheNames = new Set([
    `${CACHE_PREFIX}0123456789abcdef`,
    `${CACHE_PREFIX}fedcba9876543210`,
    "other-site",
  ]);
  const caches = {
    keys: vi.fn(async () => [...cacheNames]),
    delete: vi.fn(async (name: string) => cacheNames.delete(name)),
  };
  const target = new EventTarget() as EventTarget & Parameters<typeof registerServiceWorker>[0];
  Object.assign(target, {
    navigator: {
      userAgent,
      serviceWorker: { register, getRegistrations: vi.fn(async () => existing) },
    },
    rakazoDesktop: desktop,
    caches,
  });
  return { target, register, existing, cacheNames };
}

async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("registerServiceWorker", () => {
  it("registers after load in production browsers and leaves existing workers and caches alone", async () => {
    const { target, register, existing, cacheNames } = host();
    registerServiceWorker(target, true);
    expect(register).not.toHaveBeenCalled();
    target.dispatchEvent(new Event("load"));
    expect(register).toHaveBeenCalledWith("/sw.js");
    await settle();
    expect(existing[0]?.unregister).not.toHaveBeenCalled();
    expect(cacheNames.size).toBe(3);
  });

  it("stays off in dev and inside Electron", () => {
    const dev = host();
    registerServiceWorker(dev.target, false);
    dev.target.dispatchEvent(new Event("load"));
    expect(dev.register).not.toHaveBeenCalled();

    const electron = host({ desktop: {} as RakazoDesktop });
    registerServiceWorker(electron.target, true);
    electron.target.dispatchEvent(new Event("load"));
    expect(electron.register).not.toHaveBeenCalled();
  });

  it("never registers in a desktop app window that has no bridge", () => {
    const { target, register } = host({ userAgent: ELECTRON_UA });
    registerServiceWorker(target, true);
    target.dispatchEvent(new Event("load"));
    expect(register).not.toHaveBeenCalled();
  });

  it("removes workers and app caches already installed in the desktop app, before load", async () => {
    const { target, existing, cacheNames } = host({ userAgent: ELECTRON_UA });
    registerServiceWorker(target, true);
    await settle();
    expect(existing[0]?.unregister).toHaveBeenCalled();
    expect(existing[1]?.unregister).toHaveBeenCalled();
    expect([...cacheNames]).toEqual(["other-site"]);
  });
});
