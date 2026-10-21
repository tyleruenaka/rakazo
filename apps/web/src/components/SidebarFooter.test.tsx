// @vitest-environment jsdom
import type { DesktopUpdateState } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DesktopUpdatesProvider } from "./DesktopUpdates";
import { SidebarFooter, sidebarMarkCount } from "./SidebarFooter";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce((text, part, index) => text + part + (values[index] ?? ""), ""),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  delete window.rakazoDesktop;
  vi.restoreAllMocks();
});
async function render(
  name = "Demo User",
  image?: string,
  onIntegrations = vi.fn(),
  onBoard?: () => void,
  logos?: Array<{ name: string; logo: string }>,
  { connectedCount, open = true }: { connectedCount?: number; open?: boolean } = {},
) {
  const email = "account@rakazo.test";
  await act(async () =>
    root.render(
      <DesktopUpdatesProvider>
        <SidebarFooter
          logos={logos}
          connectedCount={connectedCount}
          name={name}
          initials={name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
          image={image}
          email={email}
          open={open}
          onOpenChange={() => {}}
          onIntegrations={onIntegrations}
          onBoard={onBoard}
          onArtifacts={() => {}}
          onSettings={() => {}}
          onUsage={() => {}}
          onLogOut={() => {}}
          signingOut={false}
          logOutError={null}
        />
      </DesktopUpdatesProvider>,
    ),
  );
}
function bridge(phase: DesktopUpdateState["phase"]) {
  const state: DesktopUpdateState = {
    phase,
    currentVersion: "0.1.0",
    availableVersion: "0.2.0",
    percent: null,
    message: null,
    checkedAt: null,
  };
  const install = vi.fn(async () => state);
  window.rakazoDesktop = {
    platform: "darwin",
    window: {
      close: async () => {},
      minimize: async () => {},
      toggleMaximize: async () => {},
      state: async () => ({ minimized: false, maximized: false, fullScreen: false }),
    },
    oauth: { onCallback: () => () => {} },
    update: {
      state: async () => state,
      install,
      download: async () => state,
      check: async () => state,
    },
  };
  return install;
}
it("hides update controls without a desktop bridge", async () => {
  await render();
  expect(document.querySelector('[aria-label="Install update"]')).toBeNull();
  expect(document.body.textContent).not.toContain("New update available");
});
it.each(["unsupported", "idle", "available", "downloading", "checking", "error"] as const)(
  "hides install controls in phase %s",
  async (phase) => {
    bridge(phase);
    await render();
    expect(document.querySelector('[aria-label="Install update"]')).toBeNull();
    expect(document.body.textContent).not.toContain("New update available");
  },
);
it("installs the ready update only through the footer button", async () => {
  const install = bridge("ready");
  await render("Ada Lovelace");
  const icon = document.querySelector<HTMLButtonElement>('[aria-label="Install update"]')!;
  expect(icon).not.toBeNull();
  expect(document.body.textContent).not.toContain("New update available");
  expect(icon.title).toBe("Install update");
  await act(async () => icon.click());
  expect(install).toHaveBeenCalledTimes(1);
  expect(
    [...document.querySelectorAll("button")].some((button) => button.textContent === "Install"),
  ).toBe(false);
});
it("shows the account image and falls back to the initial after a load error", async () => {
  await render("Ada Lovelace", "https://example.test/avatar.png");
  const trigger = host.querySelector('[data-testid="user-menu-trigger"]')!;
  const image = trigger.querySelector("img")!;
  expect(image.src).toBe("https://example.test/avatar.png");
  await act(async () => image.dispatchEvent(new Event("error")));
  expect(trigger.querySelector("img")).toBeNull();
  expect(trigger.textContent).toBe("AL");
});

it("opens integrations and keeps the existing account actions and links", async () => {
  const onIntegrations = vi.fn();
  await render("Demo User", undefined, onIntegrations, vi.fn());
  const connect = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Connect apps"),
  )!;
  await act(async () => connect.click());
  expect(onIntegrations).toHaveBeenCalledOnce();
  const menu = document.querySelector('[data-slot="dropdown-menu-content"]')!;
  expect([...menu.querySelectorAll("[role=menuitem]")].map((row) => row.textContent)).toEqual([
    "Usage",
    "Get the mobile app",
    "Docs",
    "Board",
    "Artifacts",
    "Settings",
    "Log out",
  ]);
  expect(host.querySelector('[data-testid="user-menu-trigger"]')?.getAttribute("aria-label")).toBe(
    "Account menu for Demo User",
  );
});
it("omits Board when unavailable", async () => {
  await render();
  expect(document.querySelector('[data-slot="dropdown-menu-content"]')?.textContent).not.toContain(
    "Board",
  );
});

it("offers the existing Android download on Android", async () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android");
  await render();
  const mobile = [...document.querySelectorAll("a")].find(
    (link) => link.textContent === "Get the mobile app",
  )!;
  expect(mobile.href).toBe(
    "https://github.com/elie222/rakazo/releases/download/android/rakazo.apk",
  );
});

it("falls back when app artwork fails and accepts replacement artwork", async () => {
  await render("Demo User", undefined, undefined, undefined, [
    { name: "Slack", logo: "https://example.test/slack.svg" },
  ]);
  const pill = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Connect apps"),
  )!;
  await act(async () => pill.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(pill.querySelector("img")).toBeNull();
  expect(pill.textContent).toContain("S");
  await render("Demo User", undefined, undefined, undefined, [
    { name: "Slack", logo: "https://example.test/new-slack.svg" },
  ]);
  expect(pill.querySelector("img")?.src).toBe("https://example.test/new-slack.svg");
});
it.each(["throw", "state"] as const)(
  "reveals a %s install failure after Later",
  async (failure) => {
    const install = bridge("ready");
    if (failure === "throw") install.mockRejectedValueOnce(new Error("offline"));
    else
      install.mockResolvedValueOnce({
        ...(await window.rakazoDesktop!.update.state()),
        phase: "error",
        message: "Update could not be installed",
      });
    await render();
    const notice = () => document.querySelector('[aria-label="Desktop update"]');
    const later = [...notice()!.querySelectorAll("button")].find(
      (button) => button.textContent === "Later",
    )!;
    await act(async () => later.click());
    expect(notice()).toBeNull();
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="Install update"]')!.click(),
    );
    expect(notice()?.querySelector('[role="status"]')?.textContent).toBe(
      failure === "throw"
        ? "Could not complete the update. Try again."
        : "Update could not be installed",
    );
    const dismiss = [...notice()!.querySelectorAll("button")].find(
      (button) => button.textContent === "Later",
    )!;
    await act(async () => dismiss.click());
    expect(notice()).toBeNull();
  },
);

const apps = ["Gmail", "GitHub", "Drive"].map((name) => ({
  name,
  logo: `https://example.test/${name}.svg`,
}));
const connectPill = () =>
  [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Connect apps"),
  )!;
const accountTrigger = () => host.querySelector('[data-testid="user-menu-trigger"]')!;
// React derives pointer enter and leave from pointerover and pointerout.
const point = (element: Element, type: "pointerover" | "pointerout") =>
  act(async () => element.dispatchEvent(new MouseEvent(type, { bubbles: true })));

it("keeps the avatar and labeled Connect apps pill with fewer than four connected apps", async () => {
  await render("Ada Lovelace", undefined, undefined, undefined, apps, {
    connectedCount: 3,
    open: false,
  });
  expect(accountTrigger().textContent).toBe("AL");
  expect(connectPill().hasAttribute("data-expanded")).toBe(false);
  expect(connectPill().querySelectorAll('span[aria-hidden="true"] > span')).toHaveLength(3);
});

it("names the account and folds Connect apps to its logos until it is hovered", async () => {
  await render("Ada Lovelace", undefined, undefined, undefined, apps, {
    connectedCount: 4,
    open: false,
  });
  expect(accountTrigger().textContent).toBe("ALAda Lovelace");
  expect(accountTrigger().getAttribute("title")).toBe("Ada Lovelace");
  expect(accountTrigger().hasAttribute("data-expanded")).toBe(true);
  expect(connectPill().hasAttribute("data-expanded")).toBe(false);
  expect(connectPill().getAttribute("aria-label") ?? connectPill().textContent).toContain(
    "Connect apps",
  );
  expect(connectPill().querySelectorAll('span[aria-hidden="true"] > span')).toHaveLength(3);

  await point(connectPill(), "pointerover");
  expect(connectPill().hasAttribute("data-expanded")).toBe(true);
  expect(accountTrigger().hasAttribute("data-expanded")).toBe(false);
  await point(connectPill(), "pointerout");
  expect(connectPill().hasAttribute("data-expanded")).toBe(false);
  expect(accountTrigger().hasAttribute("data-expanded")).toBe(true);
});

it("keeps the name out while the account menu is open", async () => {
  await render("Ada Lovelace", undefined, undefined, undefined, apps, { connectedCount: 4 });
  await point(connectPill(), "pointerover");
  expect(accountTrigger().hasAttribute("data-expanded")).toBe(true);
  expect(connectPill().hasAttribute("data-expanded")).toBe(false);
});

it.each([
  [-20, 0],
  [0, 0],
  [17, 0],
  [18, 1],
  [29, 1],
  [30, 2],
  [41, 2],
  [42, 3],
  [200, 3],
])("fits marks into %ipx without consuming label or padding space", (width, count) => {
  expect(sidebarMarkCount(width)).toBe(count);
});
