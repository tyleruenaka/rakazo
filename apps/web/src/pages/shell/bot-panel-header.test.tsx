// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@lingui/core/macro", () => ({
  t: (parts: TemplateStringsArray) => parts.join(""),
}));
vi.mock("@rakazo/ui-web", () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
}));
vi.mock("./avatar-studio-popover", () => ({ AvatarStudioPopover: () => null }));

import { InlineBotField } from "./bot-panel-header";

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

async function field({
  value = "Chief",
  required = true,
  onSave = vi.fn(async () => undefined),
}: {
  value?: string;
  required?: boolean;
  onSave?: (value: string) => Promise<void>;
} = {}) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <InlineBotField
        label="Name"
        value={value}
        maxLength={64}
        required={required}
        onSave={onSave}
      />,
    ),
  );
  const input = container.querySelector("input")!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  return {
    container,
    input,
    onSave,
    focus: () => act(async () => input.focus()),
    type: (text: string) =>
      act(async () => {
        setValue.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }),
    key: (key: string) =>
      act(async () => {
        input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      }),
    blur: () => act(async () => input.blur()),
  };
}

it("saves nothing when Escape cancels an edit", async () => {
  const f = await field();
  await f.focus();
  await f.type("Boss");
  await f.key("Escape");
  expect(f.onSave).not.toHaveBeenCalled();
  expect(f.input.value).toBe("Chief");
  expect(document.activeElement).not.toBe(f.input);
});

it("saves nothing when focus leaves without a change", async () => {
  const f = await field();
  await f.focus();
  await f.blur();
  await f.focus();
  await f.type("  Chief  ");
  await f.blur();
  expect(f.onSave).not.toHaveBeenCalled();
});

it("saves the trimmed value on blur and on Enter", async () => {
  const f = await field();
  await f.focus();
  await f.type("  Boss ");
  await f.blur();
  expect(f.onSave).toHaveBeenCalledExactlyOnceWith("Boss");
  await f.focus();
  await f.type("Lead");
  await f.key("Enter");
  expect(f.onSave).toHaveBeenLastCalledWith("Lead");
  expect(f.onSave).toHaveBeenCalledTimes(2);
});

it("keeps a required name when it is cleared, but lets a label be cleared", async () => {
  const name = await field();
  await name.focus();
  await name.type("   ");
  await name.blur();
  expect(name.onSave).not.toHaveBeenCalled();
  expect(name.input.value).toBe("Chief");

  const label = await field({ value: "Coordinator", required: false });
  await label.focus();
  await label.type("");
  await label.blur();
  expect(label.onSave).toHaveBeenCalledExactlyOnceWith("");
});

it("shows the saved value back and an alert when the save fails", async () => {
  const f = await field({
    onSave: vi.fn(async () => {
      throw new Error("Name is taken");
    }),
  });
  await f.focus();
  await f.type("Boss");
  await f.blur();
  expect(f.input.value).toBe("Chief");
  expect(f.container.querySelector('[role="alert"]')?.textContent).toBeTruthy();
});
