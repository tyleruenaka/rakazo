// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ListboxSelect } from "./ListboxSelect";

const languages = [
  { value: "en", label: "English", detail: "English" },
  { value: "de", label: "Deutsch", detail: "German" },
  { value: "nl", label: "Nederlands", detail: "Dutch" },
] as const;

let cleanup: (() => Promise<void>) | null = null;

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function render(props: Partial<React.ComponentProps<typeof ListboxSelect<string>>> = {}) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const onChange = vi.fn();
  const container = document.createElement("div");
  // Stands in for the Settings dialog, which clips what overflows it.
  container.style.overflow = "hidden";
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ListboxSelect
        testId="language"
        label="Language"
        options={languages}
        value="en"
        onChange={onChange}
        {...props}
      />,
    );
  });
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  };
  const trigger = container.querySelector<HTMLButtonElement>('[data-testid="language"]')!;
  return { container, trigger, onChange };
}

function options() {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
}

it("opens the list outside the clipping dialog, aligned to the trigger's end", async () => {
  const { container, trigger, onChange } = await render();

  await act(async () => trigger.click());

  const listbox = document.querySelector('[role="listbox"]');
  expect(listbox).not.toBeNull();
  expect(container.contains(listbox)).toBe(false);
  expect(listbox?.closest("[data-align]")?.getAttribute("data-align")).toBe("end");
  expect(options().map((option) => option.getAttribute("aria-selected"))).toEqual([
    "true",
    "false",
    "false",
  ]);

  await act(async () => options()[1]?.click());
  expect(onChange).toHaveBeenCalledWith("de");
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});

it("filters a searchable list by name or detail and picks with the keyboard", async () => {
  const { trigger, onChange } = await render({
    search: { placeholder: "Search language", clearLabel: "Clear", className: "w-[320px]" },
  });

  await act(async () => trigger.click());
  const search = document.querySelector<HTMLInputElement>('input[aria-label="Search language"]')!;
  await vi.waitFor(() => expect(document.activeElement).toBe(search));

  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(search, "dutch");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(options().map((option) => option.textContent)).toEqual(["NederlandsDutch"]);

  await act(async () => {
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  await act(async () => {
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  expect(onChange).toHaveBeenCalledWith("nl");
});

it("computes row details only while the list is open", async () => {
  const renderDetail = vi.fn((value: string) => `${value} time`);
  const { trigger } = await render({ renderDetail });
  expect(renderDetail).not.toHaveBeenCalled();

  await act(async () => trigger.click());
  expect(options()[0]?.textContent).toBe("Englishen time");
});

it("shows an option's mark on its row and on the trigger, described for screen readers", async () => {
  const marked = [
    { value: "en", label: "English" },
    { value: "de", label: "Deutsch", mark: <i data-mark />, markDescription: "Beta" },
  ];
  const description = (element: Element | null | undefined) =>
    document.getElementById(element?.getAttribute("aria-describedby") ?? "")?.textContent;
  const { trigger } = await render({ options: marked, value: "de" });

  expect(trigger.querySelector("[data-mark]")).not.toBeNull();
  expect(description(trigger)).toBe("Beta");
  expect(trigger.textContent).toBe("Deutsch");

  await act(async () => trigger.click());
  expect(options()[0]?.hasAttribute("aria-describedby")).toBe(false);
  expect(options()[0]?.querySelector("[data-mark]")).toBeNull();
  expect(options()[1]?.querySelector("[data-mark]")).not.toBeNull();
  expect(description(options()[1])).toBe("Beta");

  await cleanup?.();
  const english = await render({ options: marked, value: "en" });
  expect(english.trigger.hasAttribute("aria-describedby")).toBe(false);
  expect(english.trigger.querySelector("[data-mark]")).toBeNull();
});
