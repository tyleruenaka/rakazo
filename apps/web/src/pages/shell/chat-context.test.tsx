// @vitest-environment jsdom
import type { ThreadMessage } from "@rakazo/contracts";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { rpc } from "../../lib/rpc";
import {
  ComposerQuoteChip,
  ComposerReplyPreview,
  ellipsize,
  ReplyLine,
  TimeSeparator,
} from "./chat-context";

vi.mock("../../lib/rpc", () => ({ rpc: { artifacts: { get: vi.fn() } } }));

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) => String.raw(strings, ...values),
  }),
}));
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const message: ThreadMessage = {
  id: "reply",
  threadId: "thread",
  seq: 1,
  role: "user",
  createdAt: new Date().toISOString(),
  blocks: [],
  replyToMessageId: "parent",
  replyPreview: { role: "bot", botId: "bot", text: "First line\nSecond line" },
};
it("renders an unselectable semantic separator", () => {
  act(() =>
    root.render(
      <TimeSeparator createdAt={new Date(2026, 9, 6, 16, 5).toISOString()} locale="en-US" />,
    ),
  );
  expect(container.querySelector("h3")?.textContent).toContain("4:05 PM");
  expect(container.querySelector("h3")?.className).toContain("select-none");
});
it("shows the composer reply as a pill that jumps, keeps focus, and dismisses", () => {
  const onJump = vi.fn();
  const onDismiss = vi.fn();
  act(() =>
    root.render(
      <ComposerReplyPreview
        text={"First line\n  Second line"}
        onJump={onJump}
        onDismiss={onDismiss}
      />,
    ),
  );
  // The whole message on one line, without an author.
  expect(container.textContent).toBe("First line Second line");
  const [pill, cancel] = container.querySelectorAll("button");
  expect(pill!.getAttribute("aria-label")).toBe("Jump to replied message: First line Second line");
  const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  pill!.dispatchEvent(mouseDown);
  expect(mouseDown.defaultPrevented).toBe(true);
  act(() => pill!.click());
  expect(onJump).toHaveBeenCalledOnce();
  expect(cancel!.getAttribute("aria-label")).toBe("Cancel reply");
  act(() => cancel!.click());
  expect(onDismiss).toHaveBeenCalledOnce();
});
it("shows a quote chip with a short curly-quoted label and the full text on hover", () => {
  const onDismiss = vi.fn();
  const quote = "anything that checks out\nthe repo";
  act(() => root.render(<ComposerQuoteChip quote={quote} onDismiss={onDismiss} />));
  const label = container.querySelector("q")!;
  expect(label.textContent).toBe("anything that check…");
  expect(label.parentElement!.getAttribute("title")).toBe("anything that checks out the repo");
  expect(container.querySelector("svg")).not.toBeNull();
  act(() => container.querySelector("button")!.click());
  expect(onDismiss).toHaveBeenCalledOnce();
  act(() =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true })),
  );
  expect(onDismiss).toHaveBeenCalledTimes(2);
});
it("cuts text to the limit including the ellipsis", () => {
  expect(ellipsize("short", 20)).toBe("short");
  expect(ellipsize("x".repeat(56), 56)).toBe("x".repeat(56));
  expect(ellipsize("x".repeat(57), 56)).toBe(`${"x".repeat(55)}…`);
});
it("navigates an authoritative quote pill without a loaded parent", () => {
  const onJump = vi.fn();
  act(() => root.render(<ReplyLine message={message} placement="sent" onJump={onJump} />));
  expect(container.textContent).toBe("First line Second line");
  expect(container.querySelector("q")).toBeNull();
  act(() => container.querySelector("button")!.click());
  expect(onJump).toHaveBeenCalledWith("parent");
});
it("quotes the replied message as the first row inside a bot bubble", () => {
  const onJump = vi.fn();
  const long = `${"word ".repeat(20)}end`;
  act(() =>
    root.render(
      <ReplyLine
        message={{ ...message, replyPreview: { role: "user", text: long } }}
        placement="in-bubble"
        onJump={onJump}
      />,
    ),
  );
  const label = container.querySelector("q")!;
  expect(label.textContent).toBe(`${long.slice(0, 55)}…`);
  expect(container.querySelector("svg")).not.toBeNull();
  act(() => container.querySelector("button")!.click());
  expect(onJump).toHaveBeenCalledWith("parent");
});
it("renders a deleted target as static unavailable text", () => {
  act(() =>
    root.render(
      <ReplyLine
        message={{
          ...message,
          replyToMessageId: undefined,
          replyQuote: "Old text",
          replyPreview: null,
        }}
        placement="sent"
      />,
    ),
  );
  expect(container.textContent).toBe("Original message unavailable");
  expect(container.querySelector("button")).toBeNull();
});

it("dismisses a composer reply with Escape", () => {
  const onDismiss = vi.fn();
  act(() => root.render(<ComposerReplyPreview text="Quote" onDismiss={onDismiss} />));
  act(() =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true })),
  );
  expect(onDismiss).toHaveBeenCalledOnce();
});

it("keeps internal peer receipt replies out of the transcript", () => {
  act(() =>
    root.render(
      <ReplyLine
        message={{
          ...message,
          blocks: [
            {
              kind: "bot_message_received",
              fromBotId: "peer",
              fromBotName: "Researcher",
              text: "peer response",
              hop: 1,
            },
          ],
          replyPreview: { role: "bot", botId: "bot", text: "peer-exchange-alpha" },
        }}
        placement="in-bubble"
      />,
    ),
  );
  expect(container.textContent).toBe("");
});

const photo = { kind: "image" as const, artifactId: "photo", mimeType: "image/png", name: "" };
it.each([
  [photo, "", "Photo", true],
  [photo, "Caption", "Caption", true],
  [
    { ...photo, kind: "file" as const, name: "notes.txt", mimeType: "text/plain" },
    "",
    "notes.txt",
    false,
  ],
])(
  "renders attachment labels and authenticated thumbnails in both reply views",
  async (attachment, text, label, image) => {
    vi.mocked(rpc.artifacts.get).mockResolvedValue({
      contentBase64: "AA==",
      mimeType: "image/png",
    } as never);
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:photo"), revokeObjectURL: vi.fn() });
    await act(async () =>
      root.render(
        <ComposerReplyPreview
          text={text}
          attachment={attachment}
          target={{ groupId: "group" }}
          onDismiss={vi.fn()}
        />,
      ),
    );
    expect(container.textContent).toBe(label);
    expect(container.querySelector("img")?.getAttribute("src") ?? null).toBe(
      image ? "blob:photo" : null,
    );
    await act(async () =>
      root.render(
        <ReplyLine
          message={{ ...message, replyPreview: { role: "user", text, attachment } }}
          placement="sent"
          target={{ botId: "bot" }}
        />,
      ),
    );
    expect(container.textContent).toBe(label);
    // A file shows its icon; a photo its thumbnail.
    expect(container.querySelector("svg") !== null).toBe(!image);
    expect(container.querySelector("img")?.getAttribute("src") ?? null).toBe(
      image ? "blob:photo" : null,
    );
    if (image)
      expect(rpc.artifacts.get).toHaveBeenCalledWith({ botId: "bot", artifactId: "photo" });
  },
);
it("keeps image labels when fetching fails", async () => {
  vi.mocked(rpc.artifacts.get).mockRejectedValue(new Error("unavailable"));
  await act(async () =>
    root.render(
      <ReplyLine
        message={{ ...message, replyPreview: { role: "user", text: "", attachment: photo } }}
        placement="sent"
        target={{ botId: "bot" }}
      />,
    ),
  );
  expect(container.textContent).toBe("Photo");
  expect(container.querySelector("img")).toBeNull();
});

it("prefers a selected excerpt over the photo caption in the transcript", () => {
  act(() =>
    root.render(
      <ReplyLine
        message={{
          ...message,
          replyQuote: "selected\ntext",
          replyPreview: { role: "user", text: "Caption", attachment: photo },
        }}
        placement="sent"
      />,
    ),
  );
  expect(container.textContent).toBe("selected text");
});

it("defers transcript thumbnails until near the viewport while the composer loads immediately", async () => {
  vi.mocked(rpc.artifacts.get)
    .mockClear()
    .mockResolvedValue({
      contentBase64: "AA==",
      mimeType: "image/png",
    } as never);
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:photo"), revokeObjectURL: vi.fn() });
  let onIntersection!: IntersectionObserverCallback;
  const observe = vi.fn();
  const disconnect = vi.fn();
  const observer = vi.fn(
    class {
      constructor(callback: IntersectionObserverCallback) {
        onIntersection = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  vi.stubGlobal("IntersectionObserver", observer);
  await act(async () =>
    root.render(
      <ReplyLine
        message={{ ...message, replyPreview: { role: "user", text: "", attachment: photo } }}
        placement="sent"
        target={{ botId: "bot" }}
      />,
    ),
  );
  expect(rpc.artifacts.get).not.toHaveBeenCalled();
  expect(observer).toHaveBeenCalledWith(expect.any(Function), { rootMargin: "320px" });
  expect(observe).toHaveBeenCalledOnce();
  act(() =>
    onIntersection(
      [{ isIntersecting: false }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  );
  expect(rpc.artifacts.get).not.toHaveBeenCalled();
  await act(async () =>
    onIntersection(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  );
  expect(rpc.artifacts.get).toHaveBeenCalledOnce();
  expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:photo");
  expect(disconnect).toHaveBeenCalled();
  vi.mocked(rpc.artifacts.get).mockClear();
  observer.mockClear();
  await act(async () =>
    root.render(
      <ComposerReplyPreview
        text=""
        attachment={photo}
        target={{ groupId: "group" }}
        onDismiss={vi.fn()}
      />,
    ),
  );
  expect(rpc.artifacts.get).toHaveBeenCalledOnce();
  expect(observer).not.toHaveBeenCalled();
});
