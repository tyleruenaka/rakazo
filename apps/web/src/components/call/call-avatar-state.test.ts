import { describe, expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => ({ useLingui: () => ({ t: String.raw }) }));

const { callAvatarState } = await import("./CallCard");

describe("callAvatarState", () => {
  it("maps the live call to Grok's call faces", () => {
    expect(callAvatarState({ phase: "ringing", heard: "" })).toBe("idle");
    expect(callAvatarState({ phase: "listening", heard: "" })).toBe("idle");
    expect(callAvatarState({ phase: "listening", heard: "  " })).toBe("idle");
    expect(callAvatarState({ phase: "listening", heard: "hey there" })).toBe("listening");
    expect(callAvatarState({ phase: "thinking", heard: "hey there" })).toBe("thinking");
    expect(callAvatarState({ phase: "speaking", heard: "" })).toBe("speaking");
    expect(callAvatarState({ phase: "listening", heard: "" }, true)).toBe("listening");
    expect(callAvatarState({ phase: "speaking", heard: "" }, true)).toBe("speaking");
  });
});
