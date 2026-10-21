// @vitest-environment jsdom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { Bot } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BotPanelHeader } from "./bot-panel-header";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
  // The organic avatar reads the reduced-motion preference.
  window.matchMedia = vi.fn(
    () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as never,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const bot = { id: "bot-1", name: "Sunny", title: "Engineer", color: "#8B5CF6" } as Bot;

function studio() {
  return document.querySelector<HTMLElement>('[data-testid="avatar-studio"]');
}

function button(name: string) {
  const match = [...(studio()?.querySelectorAll("button") ?? [])].find(
    (element) => element.getAttribute("aria-label") === name || element.textContent === name,
  );
  if (!match) throw new Error(`missing ${name}`);
  return match;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

it("opens Avatar Studio from the header avatar and saves each pick in order", async () => {
  const onSave = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <I18nProvider i18n={i18n}>
        <BotPanelHeader bot={bot} onSave={onSave} />
      </I18nProvider>,
    ),
  );

  const trigger = host.querySelector('[data-testid="avatar-studio-trigger"]');
  expect(trigger?.getAttribute("aria-label")).toBe("Customize bot avatar");
  expect(studio()).toBeNull();
  await click(trigger!);
  expect(studio()).not.toBeNull();

  // Grok's swatches, the bot's default look, and Rakazo's studio shapes.
  expect(button("Color #F79411")).toBeTruthy();
  expect(button("Default").getAttribute("aria-pressed")).toBe("true");

  await click(button("Color #F79411"));
  expect(button("Color #F79411").getAttribute("aria-pressed")).toBe("true");
  await click(button("wedge"));
  expect(button("wedge").getAttribute("aria-pressed")).toBe("true");
  expect(button("Default").getAttribute("aria-pressed")).toBe("false");

  expect(onSave.mock.calls).toEqual([[{ color: "#F79411" }], [{ color: "#F79411::shape_1" }]]);

  await click(button("Reset"));
  expect(onSave).toHaveBeenLastCalledWith({ color: "#F79411" });
});

it("goes back to the saved look when a pick fails to save", async () => {
  const onSave = vi.fn(async () => {
    throw new Error("offline");
  });
  await act(async () =>
    root.render(
      <I18nProvider i18n={i18n}>
        <BotPanelHeader bot={bot} onSave={onSave} />
      </I18nProvider>,
    ),
  );
  await click(host.querySelector('[data-testid="avatar-studio-trigger"]')!);
  await click(button("Color #F79411"));
  expect(button("Color #F79411").getAttribute("aria-pressed")).toBe("false");
  expect(button("Default").getAttribute("aria-pressed")).toBe("true");
});
