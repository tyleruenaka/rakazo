// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import type { AgentSkillCatalogEntry, ThreadMessage } from "@rakazo/contracts";
import type { ComposerMention } from "@rakazo/core";
import { MODEL_REQUIRED_SEND_ERROR } from "@rakazo/core";
import type { ComponentProps, ReactNode } from "react";
import { act, createRef } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((text, part, index) => `${text}${index > 0 ? values[index - 1] : ""}${part}`, "");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});

const callSession = vi.hoisted(() => ({ current: null as { botId: string } | null }));
vi.mock("../lib/call-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/call-session")>()),
  useCallSession: () => callSession.current,
  useCallBotId: () => callSession.current?.botId ?? null,
}));

import { dictation } from "../lib/dictation";
import {
  Composer,
  ComposerDock,
  ComputerControlPill,
  computerFrameStyle,
  MessageView,
  showsWorkingLine,
} from "./Shell";

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let composerProps: ComponentProps<typeof Composer>;

beforeEach(() => {
  i18n.load("en", {});
  i18n.activate("en");
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  localStorage.clear();
});

const bob: ComposerMention = { kind: "bot", id: "bot-2", name: "Bob" };
const summarize: AgentSkillCatalogEntry = {
  id: "skill-1",
  name: "summarize",
  description: "Summarize a document",
  source: "user",
  readOnly: false,
};

function renderComposer(
  onSend: ComponentProps<typeof Composer>["onSend"],
  overrides: Partial<ComponentProps<typeof Composer>> = {},
) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Reduced motion skips the chip-row resize animation, which jsdom cannot run.
  window.matchMedia ??= () =>
    ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  composerProps = {
    artifactTarget: { botId: "bot-1" },
    activeName: "Ada",
    running: false,
    pendingAttachments: [],
    attachmentNotice: null,
    sendError: null,
    onOpenModels: () => {},
    runError: null,
    runErrorId: null,
    onRunErrorPresented: () => {},
    onDismissError: () => {},
    sending: false,
    fileInputRef: createRef(),
    onAttachmentPick: () => true,
    onRemoveAttachment: () => {},
    onSend,
    onStop: async () => {},
    draftKey: "bot:bot-1",
    enterToSend: true,
    mentionTargets: [bob],
    agentSkills: [summarize],
    ...overrides,
  };
  rerenderComposer({});
  const textarea = container.querySelector("textarea");
  if (!textarea) throw new Error("composer textarea not found");
  return textarea;
}

function rerenderComposer(overrides: Partial<ComponentProps<typeof Composer>>) {
  composerProps = { ...composerProps, ...overrides };
  act(() => root?.render(<Composer {...composerProps} />));
}

it("shows a readable run error with raw details, while preserving send errors", () => {
  const runError = '429: {"message":"Too many requests","metadata":{"provider":"OpenRouter"}}';
  renderComposer(async () => true, { runError, runErrorId: "failed-run" });
  const error = container?.querySelector('[data-testid="composer-error"]');
  expect(error?.textContent).toContain(
    "Your OpenRouter is rate limiting requests. Try again shortly.",
  );
  const details = error?.querySelector("details");
  expect(details?.open).toBe(false);
  expect(details?.querySelector("summary")?.textContent).toBe("Details");
  act(() => details?.querySelector("summary")?.click());
  expect(details?.open).toBe(true);
  expect(details?.querySelector("pre")?.textContent).toBe(runError);

  rerenderComposer({ sendError: "Could not send the message." });
  expect(error?.textContent).toBe("Could not send the message.");
  expect(error?.querySelector("details")).toBeNull();
});

it("links the missing-model send error to model settings", () => {
  const onOpenModels = vi.fn();
  renderComposer(async () => true, { sendError: MODEL_REQUIRED_SEND_ERROR, onOpenModels });
  const link = container?.querySelector<HTMLButtonElement>(
    '[data-testid="composer-error-open-models"]',
  );
  expect(link?.textContent).toBe(MODEL_REQUIRED_SEND_ERROR);
  act(() => link?.click());
  expect(onOpenModels).toHaveBeenCalledOnce();

  rerenderComposer({ sendError: "Could not send the message." });
  expect(container?.querySelector('[data-testid="composer-error-open-models"]')).toBeNull();
});

function pickAttachment() {
  const input = container?.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("attachment input not found");
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [new File(["notes"], "notes.txt", { type: "text/plain" })],
  });
  act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
}

function type(textarea: HTMLTextAreaElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pressEnter(textarea: HTMLTextAreaElement) {
  act(() => {
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

describe("Composer", () => {
  it.each([false, true])(
    "keeps the keyboard mention selection when targets refresh (reorder: %s)",
    (reorder) => {
      const alice: ComposerMention = { kind: "bot", id: "bot-3", name: "Alice" };
      const textarea = renderComposer(vi.fn(), { mentionTargets: [alice, bob] });
      type(textarea, "@");
      act(() => {
        textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      });
      expect(container?.querySelector('[aria-selected="true"]')?.textContent).toContain("Bob");

      rerenderComposer({
        mentionTargets: reorder ? [{ ...bob }, { ...alice }] : [{ ...alice }, { ...bob }],
      });
      pressEnter(textarea);

      expect(container?.querySelector('[data-testid="mention-chip"]')?.textContent).toBe("Bob");
      expect(container?.querySelector('[data-testid="mention-picker"]')).toBeNull();
    },
  );

  it("falls back to the first mention when the highlighted target disappears", () => {
    const alice: ComposerMention = { kind: "bot", id: "bot-3", name: "Alice" };
    const textarea = renderComposer(vi.fn(), { mentionTargets: [alice, bob] });
    type(textarea, "@");
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    rerenderComposer({ mentionTargets: [alice] });
    pressEnter(textarea);

    expect(container?.querySelector('[data-testid="mention-chip"]')?.textContent).toBe("Alice");
  });

  it("clears the draft once the message is sent", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const textarea = renderComposer(onSend);
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    expect(onSend).toHaveBeenCalledWith("hello", [], expect.any(String));
    expect(textarea.value).toBe("");
  });

  it("keeps the draft cleared when the send callback rejects", async () => {
    const onSend = vi
      .fn()
      .mockRejectedValueOnce(new Error("unknown outcome"))
      .mockResolvedValue(true);
    const textarea = renderComposer(onSend);
    type(textarea, "@Bo");
    pressEnter(textarea);
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    expect(textarea.value).toBe("");
    expect(container?.querySelector("[data-testid='mention-chip']")).toBeNull();
    type(textarea, "another message");
    pressEnter(textarea);
    await act(async () => {});
    expect(onSend.mock.calls[1]?.[2]).not.toBe(onSend.mock.calls[0]?.[2]);
  });

  it("restores the draft and its mentions when the send fails", async () => {
    let finishSend = (_sent: boolean) => {};
    const onSend = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    const textarea = renderComposer(onSend);
    const mentionChips = () =>
      [...(container?.querySelectorAll("[data-testid='mention-chip']") ?? [])].map(
        (chip) => chip.textContent,
      );
    type(textarea, "@Bo");
    pressEnter(textarea);
    type(textarea, "hello");
    pressEnter(textarea);
    expect(onSend).toHaveBeenCalledWith("@Bob hello", [bob], expect.any(String));
    expect(textarea.value).toBe("");
    expect(mentionChips()).toEqual([]);
    await act(async () => finishSend(false));
    expect(textarea.value).toBe("hello");
    expect(mentionChips()).toEqual(["Bob"]);
  });

  it("restores the chosen skill when the send fails", async () => {
    let finishSend = (_sent: boolean) => {};
    const onSend = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    const textarea = renderComposer(onSend);
    const skillChip = () => container?.querySelector("[data-testid='skill-chip']")?.textContent;
    type(textarea, "/sum");
    act(() =>
      container?.querySelector<HTMLButtonElement>("button[aria-label='Skill summarize']")?.click(),
    );
    type(textarea, "the notes");
    pressEnter(textarea);
    expect(onSend).toHaveBeenCalledWith("/summarize\nthe notes", [], expect.any(String));
    expect(skillChip()).toBeUndefined();
    await act(async () => finishSend(false));
    expect(textarea.value).toBe("the notes");
    expect(skillChip()).toBe("summarize");
  });

  it("keeps a newer draft when an earlier send fails", async () => {
    let finishSend = (_sent: boolean) => {};
    const textarea = renderComposer(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    type(textarea, "hello");
    pressEnter(textarea);
    type(textarea, "newer");
    await act(async () => finishSend(false));
    expect(textarea.value).toBe("newer");
  });

  it("does not restore after a newer draft was typed then cleared while sending", async () => {
    let finishSend = (_sent: boolean) => {};
    const textarea = renderComposer(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    type(textarea, "hello");
    pressEnter(textarea);
    type(textarea, "newer");
    type(textarea, "");
    await act(async () => finishSend(false));
    expect(textarea.value).toBe("");
  });

  it("reuses the nonce on an unchanged retry but renews it after an edit", async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    const textarea = renderComposer(onSend);
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    pressEnter(textarea);
    await act(async () => {});
    const firstNonce = onSend.mock.calls[0]?.[2];
    expect(firstNonce).toEqual(expect.any(String));
    expect(onSend.mock.calls[1]?.[2]).toBe(firstNonce);
    type(textarea, "hello edited");
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    expect(onSend.mock.calls[2]?.[2]).not.toBe(firstNonce);
  });

  it("does not restore after an attachment was picked while sending", async () => {
    let finishSend = (_sent: boolean) => {};
    const textarea = renderComposer(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    type(textarea, "hello");
    pressEnter(textarea);
    pickAttachment();
    await act(async () => finishSend(false));
    expect(textarea.value).toBe("");
  });

  it("restores after a rejected attachment pick and preserves the nonce on rejected retry picks", async () => {
    let finishSend = (_sent: boolean) => {};
    const onSend = vi.fn<ComponentProps<typeof Composer>["onSend"]>(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    const onAttachmentPick = vi.fn(() => false);
    const textarea = renderComposer(onSend, { onAttachmentPick });
    type(textarea, "hello");
    pressEnter(textarea);
    pickAttachment();
    await act(async () => finishSend(false));
    expect(textarea.value).toBe("hello");
    pickAttachment();
    pressEnter(textarea);
    await act(async () => finishSend(false));
    expect(onAttachmentPick).toHaveBeenCalledTimes(2);
    expect(onSend.mock.calls[1]?.[2]).toBe(onSend.mock.calls[0]?.[2]);
  });

  const reply: ThreadMessage = {
    id: "message-1",
    threadId: "thread-1",
    seq: 1,
    role: "bot",
    blocks: [{ kind: "text", text: "original reply" }],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const replyChanges = [
    { name: "cancelled reply", props: { replyTarget: null, replyQuote: null } },
    { name: "different reply", props: { replyTarget: { ...reply, id: "message-2" } } },
    { name: "different quote", props: { replyQuote: "different quote" } },
  ];

  it.each(replyChanges)("renews the retry nonce for a $name", async ({ props }) => {
    const onSend = vi.fn().mockResolvedValue(false);
    const textarea = renderComposer(onSend, { replyTarget: reply, replyQuote: "original" });
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    rerenderComposer(props);
    pressEnter(textarea);
    await act(async () => {});
    expect(onSend.mock.calls[1]?.[2]).not.toBe(onSend.mock.calls[0]?.[2]);
  });

  it.each(replyChanges)("does not restore after a $name while sending", async ({ props }) => {
    let finishSend = (_sent: boolean) => {};
    const textarea = renderComposer(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
      { replyTarget: reply, replyQuote: "original" },
    );
    type(textarea, "hello");
    pressEnter(textarea);
    rerenderComposer(props);
    await act(async () => finishSend(false));
    expect(textarea.value).toBe("");
  });

  it("preserves the retry nonce when the reply object refreshes without changing its ID or quote", async () => {
    const onSend = vi.fn().mockResolvedValue(false);
    const textarea = renderComposer(onSend, { replyTarget: reply, replyQuote: "original" });
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    rerenderComposer({ replyTarget: { ...reply } });
    pressEnter(textarea);
    await act(async () => {});
    expect(onSend.mock.calls[1]?.[2]).toBe(onSend.mock.calls[0]?.[2]);
  });

  it("uses a fresh nonce for another message after a successful retry", async () => {
    const onSend = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const textarea = renderComposer(onSend);
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    pressEnter(textarea);
    await act(async () => {});
    type(textarea, "hello");
    pressEnter(textarea);
    await act(async () => {});
    expect(onSend.mock.calls[1]?.[2]).toBe(onSend.mock.calls[0]?.[2]);
    expect(onSend.mock.calls[2]?.[2]).not.toBe(onSend.mock.calls[0]?.[2]);
  });

  it("restores an unsent draft when the composer remounts", () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const draftKey = "bot:draft-restore-test";
    const first = renderComposer(onSend, { draftKey });
    type(first, "unsent thought");
    expect(window.localStorage.getItem(`rakazo.composerDraft.${draftKey}`)).toBe("unsent thought");
    act(() => root?.unmount());
    container?.remove();
    const second = renderComposer(onSend, { draftKey });
    expect(second.value).toBe("unsent thought");
  });

  it("keeps Enter as newline and Ctrl+Enter as send when enter-to-send is off", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const textarea = renderComposer(onSend, {
      draftKey: "bot:enter-toggle-test",
      enterToSend: false,
    });
    expect(container?.querySelector('[data-testid="composer-enter-to-send-toggle"]')).toBeNull();
    type(textarea, "line one");
    pressEnter(textarea);
    await act(async () => {});
    expect(onSend).not.toHaveBeenCalled();
    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }),
      );
    });
    await act(async () => {});
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});

it.each([true, false])(
  "keeps a pending draft recoverable across unmount (accepted: %s)",
  async (accepted) => {
    let finishSend = (_accepted: boolean) => {};
    const onSend = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    const draftKey = "bot:pending-draft";
    const textarea = renderComposer(onSend, { draftKey });
    type(textarea, "pending text");
    pressEnter(textarea);
    expect(textarea.value).toBe("");
    expect(localStorage.getItem(`rakazo.composerDraft.${draftKey}`)).toBe("pending text");
    act(() => root?.unmount());
    container?.remove();
    await act(async () => finishSend(accepted));
    const restored = renderComposer(vi.fn(), { draftKey });
    expect(restored.value).toBe(accepted ? "" : "pending text");
  },
);

it.each([true, false])(
  "preserves newer stored edits when a send settles (accepted: %s)",
  async (accepted) => {
    let finishSend = (_accepted: boolean) => {};
    const textarea = renderComposer(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
    );
    type(textarea, "submitted text");
    pressEnter(textarea);
    type(textarea, "newer text");
    await act(async () => finishSend(accepted));
    expect(textarea.value).toBe("newer text");
    expect(localStorage.getItem("rakazo.composerDraft.bot:bot-1")).toBe("newer text");
  },
);

it.each([true, false])(
  "settles a submission after returning to its thread (accepted: %s)",
  async (accepted) => {
    let finishSend = (_accepted: boolean) => {};
    const draftKey = "bot:return-before-settle";
    const first = renderComposer(
      () =>
        new Promise<boolean>((resolve) => {
          finishSend = resolve;
        }),
      { draftKey },
    );
    type(first, "submitted text");
    pressEnter(first);
    act(() => root?.unmount());
    container?.remove();
    const returned = renderComposer(vi.fn(), { draftKey });
    expect(returned.value).toBe("submitted text");
    await act(async () => finishSend(accepted));
    expect(returned.value).toBe(accepted ? "" : "submitted text");
    expect(localStorage.getItem(`rakazo.composerDraft.${draftKey}`)).toBe(
      accepted ? null : "submitted text",
    );
  },
);

it("preserves edits made after returning, even when the text matches the submission", async () => {
  let finishSend = (_accepted: boolean) => {};
  const draftKey = "bot:identical-newer-edit";
  const first = renderComposer(
    () =>
      new Promise<boolean>((resolve) => {
        finishSend = resolve;
      }),
    { draftKey },
  );
  type(first, "submitted text");
  pressEnter(first);
  act(() => root?.unmount());
  container?.remove();
  const returned = renderComposer(vi.fn(), { draftKey });
  type(returned, "edited text");
  type(returned, "submitted text");
  await act(async () => finishSend(true));
  expect(returned.value).toBe("submitted text");
  expect(localStorage.getItem(`rakazo.composerDraft.${draftKey}`)).toBe("submitted text");
});

it("clears accepted saved text when only an attachment was picked during the send", async () => {
  let finishSend = (_accepted: boolean) => {};
  const textarea = renderComposer(
    () =>
      new Promise<boolean>((resolve) => {
        finishSend = resolve;
      }),
  );
  type(textarea, "submitted text");
  pressEnter(textarea);
  pickAttachment();
  await act(async () => finishSend(true));
  expect(textarea.value).toBe("");
  expect(localStorage.getItem("rakazo.composerDraft.bot:bot-1")).toBeNull();
});

describe("composer dictation", () => {
  const mic = () =>
    container?.querySelector<HTMLButtonElement>('button[aria-label="Start voice input"]');
  const chip = () => container?.querySelector<HTMLButtonElement>('[data-testid="dictation-chip"]');
  const button = (label: string) =>
    container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  type Emit = (snapshot: {
    status: "idle" | "listening" | "transcribing";
    transcript: string;
  }) => void;
  const emit: Emit = (snapshot) => act(() => (dictation as unknown as { set: Emit }).set(snapshot));
  let onFinal: (text: string) => void;
  let listen: ReturnType<typeof vi.spyOn>;
  let submit: ReturnType<typeof vi.spyOn>;
  let stop: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    listen = vi.spyOn(dictation, "listen").mockImplementation(async (options) => {
      onFinal = options.onFinal;
      (dictation as unknown as { set: Emit }).set({ status: "listening", transcript: "" });
    });
    // The words come back the way dictation hands them over: idle first, then the text.
    submit = vi.spyOn(dictation, "submitHold").mockImplementation(() => {
      (dictation as unknown as { set: Emit }).set({ status: "idle", transcript: "" });
      onFinal("dictated words");
    });
    stop = vi.spyOn(dictation, "stop");
  });

  afterEach(() => {
    listen.mockRestore();
    submit.mockRestore();
    stop.mockRestore();
  });

  it("records on click and puts the words in the field when the chip stops it", () => {
    const onSend = vi.fn();
    const textarea = renderComposer(onSend, { phoneCallsEnabled: true });
    type(textarea, "typed draft");
    act(() => mic()?.click());
    expect(listen).toHaveBeenCalledWith(expect.objectContaining({ mode: "hold", meter: true }));
    expect(mic()).toBeNull();
    expect(chip()?.getAttribute("aria-label")).toBe("Stop dictation");
    expect(textarea.placeholder).toBe("Listening…");
    act(() => chip()?.click());
    expect(textarea.value).toBe("typed draft dictated words");
    expect(onSend).not.toHaveBeenCalled();
    expect(chip()).toBeNull();
    expect(mic()).not.toBeNull();
  });

  it("sends the draft with the words when the arrow stops it", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const textarea = renderComposer(onSend, { phoneCallsEnabled: true, onVoice: vi.fn() });
    act(() => mic()?.click());
    // While recording, the voice button is the send arrow.
    expect(button("Voice")).toBeNull();
    await act(async () => button("Send")?.click());
    expect(onSend).toHaveBeenCalledWith("dictated words", [], expect.any(String));
    expect(textarea.value).toBe("");
  });

  it("keeps focus in the field while recording, so Escape there discards the take", () => {
    const textarea = renderComposer(vi.fn(), { phoneCallsEnabled: true });
    act(() => mic()?.click());
    expect(document.activeElement).toBe(textarea);
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(stop).toHaveBeenCalledWith("cancel");
    expect(chip()).toBeNull();
  });

  it("hands focus back to the field after the chip stops the take", () => {
    const textarea = renderComposer(vi.fn(), { phoneCallsEnabled: true });
    act(() => mic()?.click());
    // The chip takes focus when clicked, then disappears with the take.
    chip()?.focus();
    act(() => chip()?.click());
    expect(chip()).toBeNull();
    expect(document.activeElement).toBe(textarea);
  });

  it("discards the take on Escape", () => {
    const textarea = renderComposer(vi.fn(), { phoneCallsEnabled: true });
    act(() => mic()?.click());
    act(() => {
      chip()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(stop).toHaveBeenCalledWith("cancel");
    expect(chip()).toBeNull();
    expect(textarea.value).toBe("");
  });

  it("shows only a spinner while the words are transcribed", () => {
    const textarea = renderComposer(vi.fn(), { phoneCallsEnabled: true, onVoice: vi.fn() });
    act(() => mic()?.click());
    emit({ status: "transcribing", transcript: "" });
    expect(container?.querySelector('[role="status"][aria-label="Transcribing…"]')).not.toBeNull();
    expect(button("Send")).toBeNull();
    expect(textarea.placeholder).toBe("Transcribing…");
  });

  it("hides the mic until the server enables calls", () => {
    renderComposer(vi.fn().mockResolvedValue(true));
    expect(mic()).toBeNull();
  });
});

describe("composer while a bot works", () => {
  it("sends on one Enter pressed while Stop is in flight, once the run shows as stopped", () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const textarea = renderComposer(onSend, { running: true, stopping: true });
    type(textarea, "next message");
    pressEnter(textarea);
    expect(onSend).not.toHaveBeenCalled();
    // The run is cancelled before the stop request returns: the message goes now.
    rerenderComposer({ running: false });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("next message", [], expect.any(String));
  });

  it("sends at once once a stopped run is gone, even before the stop request returns", () => {
    const onSend = vi.fn().mockResolvedValue(true);
    const textarea = renderComposer(onSend, { running: false, stopping: true });
    type(textarea, "next message");
    pressEnter(textarea);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("ends the controls with Stop, which stops the run, as does Escape", () => {
    const onStop = vi.fn(async () => {});
    const textarea = renderComposer(vi.fn(), {
      running: true,
      onStop,
      onVoice: vi.fn(),
      phoneCallsEnabled: true,
    });
    const labels = Array.from(
      textarea.closest("fieldset")?.querySelectorAll("button[aria-label]") ?? [],
    ).map((button) => button.getAttribute("aria-label"));
    expect(labels.slice(-3)).toEqual(["Start voice input", "Voice", "Stop"]);
    act(() => container?.querySelector<HTMLButtonElement>('button[aria-label="Stop"]')?.click());
    expect(onStop).toHaveBeenCalledTimes(1);
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onStop).toHaveBeenCalledTimes(2);
  });

  it("drops Stop once the bot is done", () => {
    renderComposer(vi.fn(), { running: false, onVoice: vi.fn() });
    expect(container?.querySelector('button[aria-label="Stop"]')).toBeNull();
  });
});

describe("composer voice button", () => {
  const voiceButton = () =>
    container?.querySelector<HTMLButtonElement>('button[aria-label="Voice"]');
  const sendButton = () => container?.querySelector<HTMLButtonElement>('button[aria-label="Send"]');

  afterEach(() => {
    callSession.current = null;
  });

  it("takes the send button's place while there is nothing to send, and starts voice mode", () => {
    const onVoice = vi.fn();
    const onSend = vi.fn();
    renderComposer(onSend, { onVoice, phoneCallsEnabled: true });
    expect(sendButton()).toBeNull();
    expect(voiceButton()?.disabled).toBe(false);
    expect(container?.querySelector('button[aria-label="Start voice input"]')).not.toBeNull();
    act(() => voiceButton()?.click());
    expect(onVoice).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("turns into send once the draft has text or an attachment, keeping the mic", () => {
    const textarea = renderComposer(vi.fn(), { onVoice: vi.fn(), phoneCallsEnabled: true });
    const voice = voiceButton();
    type(textarea, "hi");
    expect(voiceButton()).toBeNull();
    expect(sendButton()?.disabled).toBe(false);
    // One button whose glyphs swap, so the change can animate.
    expect(sendButton()).toBe(voice);
    // Like Grok, the mic stays beside it.
    expect(container?.querySelector('button[aria-label="Start voice input"]')).not.toBeNull();
    type(textarea, "");
    expect(voiceButton()).not.toBeNull();
    rerenderComposer({
      pendingAttachments: [
        { id: "a", threadKey: "bot-1", file: new File(["x"], "a.txt", { type: "text/plain" }) },
      ],
    });
    expect(voiceButton()).toBeNull();
    expect(sendButton()).not.toBeNull();
  });

  it("stays a disabled send button without voice mode", () => {
    renderComposer(vi.fn());
    expect(voiceButton()).toBeNull();
    expect(sendButton()?.disabled).toBe(true);
  });

  it("is disabled during a call", () => {
    callSession.current = { botId: "bot-1" };
    renderComposer(vi.fn(), { onVoice: vi.fn() });
    expect(voiceButton()?.disabled).toBe(true);
  });
});

describe("composer attachments", () => {
  const image = {
    id: "shot",
    threadKey: "bot-1",
    file: new File(["png"], "shot.png", { type: "image/png" }),
    previewUrl: "blob:shot",
  };
  const pdf = {
    id: "report",
    threadKey: "bot-1",
    file: new File(["x".repeat(9933)], "report.pdf", { type: "application/pdf" }),
  };

  it("shows picked files inside the composer, above the text, in one scrolling row", () => {
    const onRemoveAttachment = vi.fn();
    const textarea = renderComposer(async () => true, {
      pendingAttachments: [image, pdf],
      onRemoveAttachment,
    });
    const bar = container?.querySelector('[data-testid="composer-bar"]');
    const row = bar?.querySelector('[data-testid="composer-attachments"]');
    expect(row).not.toBeNull();
    expect(bar?.getAttribute("data-expanded")).toBe("true");
    expect(row!.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row?.className).toContain("flex-nowrap");
    expect(row?.className).toContain("overflow-x-auto");
    expect(row?.className).toContain("no-scrollbar");

    const tile = row?.querySelector('[data-testid="composer-attachment-tile"]');
    expect(tile?.className).toContain("size-18");
    expect(tile?.className).toContain("rounded-xl");
    expect(tile?.querySelector("img")?.getAttribute("src")).toBe("blob:shot");
    expect(tile?.querySelector("img")?.className).toContain("object-cover");
    const disc = tile?.querySelector<HTMLButtonElement>('button[aria-label="Remove shot.png"]');
    expect(disc?.className).toContain("size-5");
    expect(disc?.className).toContain("opacity-0");
    expect(disc?.className).toContain("group-hover/attachment:opacity-100");

    const card = row?.querySelector('[data-testid="composer-attachment-card"]');
    expect(card?.className).toContain("rounded-[22px]");
    expect(card?.className).toContain("max-w-[354px]");
    expect(card?.textContent).toBe("report.pdf9.7kB");
    expect(card?.querySelector('[data-testid="file-icon-band"]')?.className).toContain(
      "bg-file-pdf",
    );
    // A file card only removes; it has no open action.
    expect(card?.querySelectorAll("button")).toHaveLength(1);
    act(() =>
      card?.querySelector<HTMLButtonElement>('button[aria-label="Remove report.pdf"]')?.click(),
    );
    expect(onRemoveAttachment).toHaveBeenCalledWith(pdf);
  });

  it("asks for an optional message and allows sending only the attachments", async () => {
    const onSend = vi.fn(async () => true);
    const textarea = renderComposer(onSend, { pendingAttachments: [image] });
    expect(textarea.placeholder).toBe("Add a message, or hit send");
    const send = container?.querySelector<HTMLButtonElement>('button[aria-label="Send"]');
    expect(send?.disabled).toBe(false);
    await act(async () => send?.click());
    expect(onSend).toHaveBeenCalledOnce();

    rerenderComposer({ pendingAttachments: [] });
    expect(textarea.placeholder).toBe("Message Ada");
    expect(container?.querySelector('[data-testid="composer-attachments"]')).toBeNull();
  });

  it("opens an image tile in the image viewer", async () => {
    renderComposer(async () => true, { pendingAttachments: [image] });
    await act(async () =>
      container?.querySelector<HTMLButtonElement>('button[aria-label="Open shot.png"]')?.click(),
    );
    const viewer = document.querySelector('[role="dialog"]');
    expect(viewer?.querySelector('img[src="blob:shot"]')?.getAttribute("alt")).toBe("shot.png");
  });
});

describe("composer replies and quotes", () => {
  const target: ThreadMessage = {
    id: "message-1",
    threadId: "thread-1",
    seq: 1,
    role: "bot",
    blocks: [{ kind: "text", text: "Stored in\nthe repo" }],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const image = {
    id: "shot",
    threadKey: "bot-1",
    file: new File(["png"], "shot.png", { type: "image/png" }),
    previewUrl: "blob:shot",
  };
  const bar = () => container!.querySelector('[data-testid="composer-bar"]')!;

  it("puts the reply pill inside the composer, above attachments and the field", () => {
    const onJumpToReply = vi.fn();
    const textarea = renderComposer(async () => true, {
      replyTarget: target,
      onJumpToReply,
      pendingAttachments: [image],
    });
    const pill = bar().querySelector('[data-testid="reply-chip"]')!;
    const attachments = bar().querySelector('[data-testid="composer-attachments"]')!;
    expect(bar().getAttribute("data-expanded")).toBe("true");
    expect(
      pill.compareDocumentPosition(attachments) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      attachments.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(pill.textContent).toBe("Stored in the repo");
    // The reply placeholder wins over the attachment one.
    expect(textarea.placeholder).toBe("Reply…");
    act(() =>
      pill
        .querySelector<HTMLButtonElement>('button[aria-label^="Jump to replied message"]')
        ?.click(),
    );
    expect(onJumpToReply).toHaveBeenCalledWith("message-1");
  });

  it.each([
    [
      { kind: "image", artifactId: "a", mimeType: "image/png", name: "a.png" },
      "Reply to attachment…",
    ],
    [
      { kind: "file", artifactId: "b", mimeType: "text/plain", name: "b.txt", size: 1 },
      "Reply to file…",
    ],
  ] as const)("names a text-less reply target in the placeholder", (block, placeholder) => {
    const textarea = renderComposer(async () => true, {
      replyTarget: { ...target, blocks: [block] },
    });
    expect(textarea.placeholder).toBe(placeholder);
  });

  it("shows a quote as a chip in the field instead of the pill, and Backspace removes it", () => {
    const onClearReply = vi.fn();
    const textarea = renderComposer(async () => true, {
      replyTarget: target,
      replyQuote: "the repo",
      onClearReply,
    });
    expect(bar().querySelector('[data-testid="reply-chip"]')).toBeNull();
    const chip = bar().querySelector('[data-testid="quote-chip"]')!;
    expect(chip.compareDocumentPosition(textarea) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chip.querySelector("q")?.textContent).toBe("the repo");
    expect(bar().getAttribute("data-expanded")).toBe("true");
    expect(textarea.placeholder).toBe("");
    // A quote alone does not make the draft sendable.
    expect(container?.querySelector<HTMLButtonElement>('button[aria-label="Send"]')?.disabled).toBe(
      true,
    );

    type(textarea, "x");
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    });
    expect(onClearReply).not.toHaveBeenCalled();
    type(textarea, "");
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
    });
    expect(onClearReply).toHaveBeenCalledOnce();
    expect(container?.querySelector('[data-testid="composer-announcement"]')?.textContent).toBe(
      "Reply cancelled",
    );
  });

  it("moves focus to the field when a new quote comes from the same message", () => {
    const textarea = renderComposer(async () => true, { replyTarget: target, replyQuote: "the" });
    textarea.blur();
    expect(document.activeElement).not.toBe(textarea);
    rerenderComposer({ replyQuote: "the repo" });
    expect(document.activeElement).toBe(textarea);
  });
});

describe("ComputerControlPill", () => {
  function renderPill(overrides: Partial<ComponentProps<typeof ComputerControlPill>> = {}) {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const props: ComponentProps<typeof ComputerControlPill> = {
      recording: false,
      hasControl: false,
      takeoverRequested: false,
      canTakeControl: true,
      busy: false,
      teachBusy: false,
      onStopTeaching: vi.fn(),
      onRelease: vi.fn(async () => {}),
      onTakeControl: vi.fn(),
      ...overrides,
    };
    act(() => root?.render(<ComputerControlPill {...props} />));
    const buttons = () => [...(container?.querySelectorAll("button") ?? [])];
    return { props, text: () => container?.textContent ?? "", buttons };
  }

  it("reads Watching with Take control as the filled segment", () => {
    const { props, text, buttons } = renderPill();
    expect(text()).toContain("Watching");
    expect(buttons().map((button) => button.textContent)).toEqual(["Take control"]);
    act(() => buttons()[0]?.click());
    expect(props.onTakeControl).toHaveBeenCalledOnce();
  });

  it("shows only Watching when control cannot be taken", () => {
    const { text, buttons } = renderPill({ canTakeControl: false });
    expect(text()).toBe("Watching");
    expect(buttons()).toHaveLength(0);
  });

  it("offers Release control while the user has control", () => {
    const { props, text, buttons } = renderPill({ hasControl: true });
    expect(text()).toContain("You have control");
    expect(text()).not.toContain("Watching");
    expect(buttons().map((button) => button.textContent)).toEqual(["Release control"]);
    act(() => buttons()[0]?.click());
    expect(props.onRelease).toHaveBeenCalledWith();
  });

  it("offers Skip and I’m done when the bot needs the user", () => {
    const { props, text, buttons } = renderPill({ hasControl: true, takeoverRequested: true });
    expect(text()).toContain("Needs you");
    expect(buttons().map((button) => button.textContent)).toEqual(["Skip", "I’m done"]);
    act(() => buttons()[0]?.click());
    act(() => buttons()[1]?.click());
    expect(props.onRelease).toHaveBeenNthCalledWith(1, "skipped");
    expect(props.onRelease).toHaveBeenNthCalledWith(2, "done");
  });

  it("holds only Stop teaching while recording", () => {
    const { props, text, buttons } = renderPill({ recording: true, hasControl: true });
    expect(text()).toBe("Stop teaching");
    expect(buttons()[0]?.dataset.testid).toBe("teach-stop-overlay");
    act(() => buttons()[0]?.click());
    expect(props.onStopTeaching).toHaveBeenCalledOnce();
  });
});

describe("computerFrameStyle", () => {
  it("fits the screen's shape and falls back to 16:10", () => {
    expect(computerFrameStyle(1920, 1080)).toEqual({
      aspectRatio: String(1920 / 1080),
      width: `min(100cqw, ${(1920 / 1080) * 100}cqh)`,
    });
    expect(computerFrameStyle(undefined, undefined)).toEqual({
      aspectRatio: "1.6",
      width: "min(100cqw, 160cqh)",
    });
  });
});

it("hides the working line only while the thread's bot is on a call", () => {
  expect(showsWorkingLine(true, true)).toBe(false);
  expect(showsWorkingLine(true, false)).toBe(true);
  expect(showsWorkingLine(false, false)).toBe(false);
});

describe("ComposerDock", () => {
  let resize: (() => void) | null = null;

  function renderDock(scroller: HTMLDivElement) {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root?.render(
        <ComposerDock scrollRef={{ current: scroller }}>
          <div>composer</div>
        </ComposerDock>,
      ),
    );
    const dock = container.firstElementChild as HTMLDivElement;
    return {
      dock,
      setHeight(height: number) {
        Object.defineProperty(dock, "offsetHeight", { configurable: true, value: height });
        act(() => resize?.());
      },
    };
  }

  function scrollerAt(scrollTop: number) {
    const scroller = document.createElement("div");
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1_000 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 400 });
    scroller.scrollTop = scrollTop;
    return scroller;
  }

  it("floats over the chat area and shares its live height", () => {
    const { dock, setHeight } = renderDock(scrollerAt(0));
    expect(dock.className).toContain("absolute");
    expect(dock.className).toContain("bottom-0");
    setHeight(60);
    expect(container?.style.getPropertyValue("--rk-composer-height")).toBe("60px");
    setHeight(104);
    expect(container?.style.getPropertyValue("--rk-composer-height")).toBe("104px");
  });

  it("keeps a transcript resting at its end there when the composer grows", () => {
    const scroller = scrollerAt(600);
    const { setHeight } = renderDock(scroller);
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1_044 });
    setHeight(104);
    expect(scroller.scrollTop).toBe(1_044);
  });

  it("leaves a transcript scrolled up where it is", () => {
    const scroller = scrollerAt(100);
    const { setHeight } = renderDock(scroller);
    setHeight(104);
    expect(scroller.scrollTop).toBe(100);
  });
});

describe("MessageView alignment", () => {
  const view = (
    role: ThreadMessage["role"],
    blocks: ThreadMessage["blocks"],
    {
      voiceReady = false,
      speaking = false,
      onSpeak = () => undefined,
    }: { voiceReady?: boolean; speaking?: boolean; onSpeak?: () => void } = {},
  ) => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia ??= () =>
      ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const noop = () => undefined;
    const done = async () => undefined;
    act(() =>
      root?.render(
        <MessageView
          artifactTarget={{ botId: "bot-1" }}
          canAnswer={false}
          canDismiss={false}
          message={{
            id: "m1",
            threadId: "t1",
            seq: 1,
            role,
            blocks,
            createdAt: "2026-10-21T12:00:00.000Z",
          }}
          onAnswer={done}
          onOpenBot={noop}
          onOpenPeerMessages={noop}
          onTogglePeerReplies={noop}
          peerBot={() => undefined}
          onRefresh={done}
          onBotChanged={done}
          onAddRoutine={noop}
          voiceReady={voiceReady}
          speaking={speaking}
          onSpeak={onSpeak}
          onOpenComputer={noop}
          showToolActivity={false}
          onReply={noop}
          onReact={done}
          reacted={false}
        />,
      ),
    );
    return container.firstElementChild as HTMLElement;
  };

  it("puts the speaker in the hover row between reply and more, not in the bubble", () => {
    const onSpeak = vi.fn();
    const row = view("bot", [{ kind: "text", text: "Hello" }], { voiceReady: true, onSpeak });
    const actions = row.querySelector('[data-testid="message-hover-actions"]');
    const labels = Array.from(actions?.querySelectorAll("[aria-label]") ?? []).map((element) =>
      element.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["React", "Reply", "Speak this reply", "More"]);
    expect(
      row.querySelector('[data-testid="message-bot-bubble"] button[aria-label="Speak this reply"]'),
    ).toBeNull();
    act(() =>
      row.querySelector<HTMLButtonElement>('button[aria-label="Speak this reply"]')?.click(),
    );
    expect(onSpeak).toHaveBeenCalledTimes(1);
  });

  it("lets go of focus after a mouse click, so the row hides once reading ends", () => {
    const row = view("bot", [{ kind: "text", text: "Hello" }], { voiceReady: true });
    const speak = row.querySelector<HTMLButtonElement>('button[aria-label="Speak this reply"]');
    speak?.focus();
    act(() => {
      speak?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    expect(document.activeElement).not.toBe(speak);
    speak?.focus();
    act(() => {
      speak?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    });
    expect(document.activeElement).toBe(speak);
  });

  it("keeps the stop button showing while a reply is read aloud", () => {
    const row = view("bot", [{ kind: "text", text: "Hello" }], {
      voiceReady: true,
      speaking: true,
    });
    expect(row.querySelector('button[aria-label="Stop speaking"]')).not.toBeNull();
    expect(row.querySelector('[data-testid="message-hover-rail"]')?.className).not.toContain(
      "opacity-0",
    );
  });

  it("keeps a group-chat message row centered when it arrives as a user message", () => {
    const column = view("user", [
      {
        kind: "channel_message",
        provider: "whatsapp",
        channelId: "c1",
        fromAddress: "+10000000000",
        fromLabel: "Sam",
        text: "hello there",
        hop: 0,
      },
    ]);
    // An end-aligned column shrinks the centered row to its text and pushes it to the right.
    expect(column.classList.contains("items-end")).toBe(false);
  });

  it("still ends a user's bubbles at the right", () => {
    expect(view("user", [{ kind: "text", text: "hi" }]).classList.contains("items-end")).toBe(true);
  });
});
