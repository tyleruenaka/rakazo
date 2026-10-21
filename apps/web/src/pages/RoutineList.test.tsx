// @vitest-environment jsdom
import type { Routine } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("../lib/rpc", () => ({ rpc: { routines: api } }));
vi.mock("@lingui/core/macro", () => ({
  t: (parts: TemplateStringsArray) => parts.join(""),
}));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ i18n: { locale: "en" }, t: (parts: TemplateStringsArray) => parts.join("") }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

import { RoutineListRow, setRoutineActive } from "./RoutineEditor";

const routine: Routine = {
  id: "routine-1",
  botId: "bot-1",
  name: "Morning digest",
  prompt: "Summarize",
  crons: ["0 9 * * *"],
  timezone: "UTC",
  active: true,
  notify: true,
  webhookEnabled: false,
  githubEnabled: false,
  messageProvider: null,
  modelProvider: null,
  modelId: null,
  thinkingLevel: null,
  watch: null,
  watchState: null,
  lastRunAt: null,
  nextRunAt: "2026-01-02T09:00:00Z",
  createdAt: "2026-01-01T00:00:00Z",
};

afterEach(() => {
  api.update.mockReset();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

it("pauses through the routine update the editor uses, showing the change at once", async () => {
  const saved = { ...routine, active: false, nextRunAt: null };
  api.update.mockResolvedValue(saved);
  const apply = vi.fn();
  const openEditor = vi.fn();
  await setRoutineActive(routine, false, { apply, openEditor });
  expect(api.update).toHaveBeenCalledExactlyOnceWith({ routineId: "routine-1", active: false });
  expect(apply.mock.calls).toEqual([[{ ...routine, active: false }], [saved]]);
  expect(openEditor).not.toHaveBeenCalled();
});

it("puts the routine back and rethrows when the save fails", async () => {
  const failure = new Error("offline");
  api.update.mockRejectedValue(failure);
  const paused = { ...routine, active: false };
  const apply = vi.fn();
  await expect(setRoutineActive(paused, true, { apply, openEditor: vi.fn() })).rejects.toBe(
    failure,
  );
  expect(apply.mock.calls).toEqual([[{ ...paused, active: true }], [paused]]);
});

it("opens the editor to resume a one-shot that still needs a run time", async () => {
  const oneShot = { ...routine, crons: ["@once"], active: false, nextRunAt: null };
  const apply = vi.fn();
  const openEditor = vi.fn();
  await setRoutineActive(oneShot, true, { apply, openEditor });
  expect(openEditor).toHaveBeenCalledExactlyOnceWith(oneShot);
  expect(api.update).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
});

it("toggles from the switch without opening the row, and opens from the row", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const onOpen = vi.fn();
  const onActiveChange = vi.fn();
  await act(async () =>
    createRoot(container).render(
      <RoutineListRow
        routine={routine}
        running={false}
        onOpen={onOpen}
        onStop={vi.fn()}
        onActiveChange={onActiveChange}
      />,
    ),
  );
  const toggle = container.querySelector<HTMLElement>('[role="switch"]')!;
  expect(toggle.getAttribute("aria-label")).toBe("Morning digest");
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  await act(async () => toggle.click());
  expect(onActiveChange).toHaveBeenCalledWith(false, expect.anything());
  expect(onOpen).not.toHaveBeenCalled();
  await act(async () => container.querySelector("button")!.click());
  expect(onOpen).toHaveBeenCalledOnce();
});
