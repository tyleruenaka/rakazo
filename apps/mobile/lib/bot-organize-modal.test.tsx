// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BotOrganizeModal } from "../components/bot-organize-modal";
import type { MobileBotSection } from "./api";

vi.mock("react-native", () => {
  const View = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    View,
    Modal: View,
    KeyboardAvoidingView: View,
    ScrollView: View,
    Platform: { OS: "ios" },
    Pressable: ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      children?: ReactNode;
      onPress: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) => (
      <button type="button" onClick={onPress} disabled={disabled} aria-label={accessibilityLabel}>
        {children}
      </button>
    ),
    Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
    TextInput: () => <input />,
    StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
    Alert: { alert: vi.fn() },
  };
});
vi.mock("./native", () => ({
  native: {},
  useThemedStyles: (createStyles: () => unknown) => createStyles(),
}));
vi.mock("./appearance", () => ({
  mobileTokens: () => new Proxy({}, { get: (_, key) => String(key) }),
}));
vi.mock("./i18n", () => {
  const t = (text: string) => text;
  return { t, useI18n: () => ({ t }) };
});
vi.mock("./confirm-delete-section", () => ({ confirmDeleteSection: vi.fn() }));
vi.mock("./user-error", () => ({ errorText: (_: unknown, fallback: string) => fallback }));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));
vi.mock("../components/native-action-button", () => ({
  NativeActionButton: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
}));

const sections = [
  { id: "sec-research", name: "Research", position: 0, createdAt: "", updatedAt: "" },
] as MobileBotSection[];
let root: Root;
let container: HTMLDivElement;
const onUpdate = vi.fn(async () => {});
const onClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(
  bot: ComponentProps<typeof BotOrganizeModal>["bot"],
  canMove?: boolean,
  onDelete?: () => void,
) {
  await act(async () =>
    root.render(
      <BotOrganizeModal
        bot={bot}
        sections={sections}
        canMove={canMove}
        onClose={onClose}
        onUpdate={onUpdate}
        onCreateSection={vi.fn()}
        onRenameSection={vi.fn()}
        onDeleteSection={vi.fn()}
        onDelete={onDelete}
      />,
    ),
  );
}
function button(label: string) {
  return [...container.querySelectorAll("button")].find((item) => item.textContent === label);
}

it("hides Pin and the whole Move to block for a nested bot under an unpinned parent", async () => {
  await render(
    { name: "Helper", pinned: false, sectionId: "sec-research", parentBotId: "lead" },
    false,
  );
  expect(container.textContent).toContain("Helper");
  expect(button("Pin")).toBeUndefined();
  expect(container.textContent).not.toContain("Move to");
  expect(button("Research")).toBeUndefined();
  expect(button("Unassigned")).toBeUndefined();
  expect(button("New section")).toBeUndefined();
  expect(button("Rename section")).toBeUndefined();
  expect(button("Delete section")).toBeUndefined();
  expect(button("Cancel")).toBeDefined();
});

it("lets a nested bot under a pinned parent move sections but not pin", async () => {
  await render({ name: "Helper", pinned: false, sectionId: null, parentBotId: "lead" });
  expect(button("Pin")).toBeUndefined();
  expect(container.textContent).toContain("Move to");
  expect(button("Unassigned")).toBeDefined();
  expect(button("New section")).toBeDefined();
  await act(async () => button("Research")!.click());
  expect(onUpdate).toHaveBeenCalledWith({ sectionId: "sec-research" });
  expect(onClose).toHaveBeenCalledOnce();
});

it("shows Pin for a top-level bot and pins it", async () => {
  await render({ name: "Helper", pinned: false, sectionId: null });
  await act(async () => button("Pin")!.click());
  expect(onUpdate).toHaveBeenCalledWith({ pinned: true });
});

it("offers Delete last, before Cancel, and closes the sheet for the chat's own confirmation", async () => {
  const onDelete = vi.fn();
  await render({ name: "Helper", pinned: false, sectionId: "sec-research" }, true, onDelete);
  const labels = [...container.querySelectorAll("button")].map((item) => item.textContent);
  expect(labels.slice(-2)).toEqual(["Delete…", "Cancel"]);
  await act(async () => button("Delete…")!.click());
  expect(onClose).toHaveBeenCalledOnce();
  expect(onDelete).toHaveBeenCalledOnce();
  expect(onUpdate).not.toHaveBeenCalled();
});

it("has no Delete for a chat from another space", async () => {
  await render({ name: "Helper", pinned: false, sectionId: null });
  expect(button("Delete…")).toBeUndefined();
});
