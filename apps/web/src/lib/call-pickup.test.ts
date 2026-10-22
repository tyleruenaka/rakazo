import { afterEach, expect, it, vi } from "vitest";
import { pickUp } from "./call-pickup.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("connects without a ringback tone, once the microphone is granted", async () => {
  const createOscillator = vi.fn();
  vi.stubGlobal(
    "AudioContext",
    class {
      createOscillator = createOscillator;
    },
  );
  const stopTrack = vi.fn();
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: stopTrack }] }) },
  });
  await pickUp(new AbortController().signal);
  expect(createOscillator).not.toHaveBeenCalled();
  expect(stopTrack).toHaveBeenCalledOnce();
});

it("does nothing once the call is hung up", async () => {
  const getUserMedia = vi.fn();
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  const controller = new AbortController();
  controller.abort();
  await pickUp(controller.signal);
  expect(getUserMedia).not.toHaveBeenCalled();
});
