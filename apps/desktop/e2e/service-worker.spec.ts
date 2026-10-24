import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { type ElectronApplication, _electron as electron, expect, test } from "@playwright/test";

const APP_MARKER = "Rakazo with a web worker";
const SIGN_IN_COOKIE = "rakazo_e2e_signed_in";

// Linux only: pointing XDG_CONFIG_HOME at a temp folder keeps the default session at the root of
// userData, as in a real install. The performance override moves it, and then the hidden startup
// check never runs.
test.skip(process.platform !== "linux", "needs XDG_CONFIG_HOME to place the profile");

let server: Server;
let serverUrl: string;
let configHome: string;
let app: ElectronApplication | undefined;

test.beforeAll(async () => {
  // Stands in for a server build that registers its worker wherever the desktop bridge is missing,
  // which includes the hidden startup check's window.
  server = createServer((request, response) => {
    if (request.url === "/sw.js") {
      response.writeHead(200, { "content-type": "text/javascript" });
      response.end(`
        self.addEventListener("install", (event) => {
          event.waitUntil(caches.open("rakazo-shell-e2e").then((cache) => cache.put("/", new Response("shell"))));
        });
        self.addEventListener("fetch", (event) => event.respondWith(fetch(event.request)));
      `);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Rakazo</title></head><body><main>${APP_MARKER}</main><script>if (!window.rakazoDesktop) navigator.serviceWorker.register("/sw.js");</script></body></html>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("stub server has no port");
  serverUrl = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test.beforeEach(async () => {
  configHome = await mkdtemp(path.join(tmpdir(), "rakazo-desktop-sw-e2e-"));
});

test.afterEach(async () => {
  await quit();
  await rm(configHome, { recursive: true, force: true });
});

async function launch() {
  const env = { ...process.env, XDG_CONFIG_HOME: configHome, RAKAZO_WEB_URL: serverUrl };
  delete env.RAKAZO_PERFORMANCE_USER_DATA;
  app = await electron.launch({ args: ["."], cwd: path.resolve(import.meta.dirname, ".."), env });
  // The first window can be the hidden startup check, so wait for the visible app window.
  await expect.poll(() => mainWindow(), { timeout: 30_000 }).not.toBeNull();
}

/** The visible app window's session: default or partition, and whether it holds the sign-in cookie. */
function mainWindow() {
  if (!app) throw new Error("app is not running");
  return app.evaluate(
    async ({ BrowserWindow, session }, { url, name }) => {
      const main = BrowserWindow.getAllWindows().find(
        (w) =>
          w.isVisible() && w.webContents.getURL().startsWith(url) && !w.webContents.isLoading(),
      );
      if (!main) return null;
      const cookies = await main.webContents.session.cookies.get({ url, name });
      return {
        isDefault: main.webContents.session === session.defaultSession,
        signedIn: cookies.length > 0,
      };
    },
    { url: serverUrl, name: SIGN_IN_COOKIE },
  );
}

async function quit() {
  await app?.close();
  app = undefined;
}

test("a web worker left in the default session does not sign the user out on the next launch", async () => {
  test.setTimeout(120_000);
  await launch();
  if (!app) throw new Error("app is not running");
  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath("userData"));
  // Stand-in for signing in: an auth cookie in the app window's session.
  await app.evaluate(
    async ({ BrowserWindow }, { url, name }) => {
      const main = BrowserWindow.getAllWindows().find((w) => w.isVisible());
      if (!main) throw new Error("no main window");
      await main.webContents.session.cookies.set({
        url,
        name,
        value: "1",
        expirationDate: Date.now() / 1000 + 3600,
      });
      await main.webContents.session.cookies.flushStore();
    },
    { url: serverUrl, name: SIGN_IN_COOKIE },
  );
  expect(await mainWindow()).toEqual({ isDefault: false, signedIn: true });
  // The hidden startup check loaded the server in the default session and got a worker there.
  await expect
    .poll(() => readdir(path.join(userData, "Service Worker", "CacheStorage")).catch(() => []), {
      timeout: 15_000,
    })
    .not.toEqual([]);
  await quit();

  for (let relaunch = 0; relaunch < 2; relaunch++) {
    await launch();
    expect(await mainWindow()).toEqual({ isDefault: false, signedIn: true });
    expect((await readdir(userData)).filter((name) => name.startsWith("legacy-default-"))).toEqual(
      [],
    );
    await quit();
  }
});
