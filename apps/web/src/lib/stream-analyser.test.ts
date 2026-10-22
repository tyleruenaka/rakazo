import { expect, it, vi } from "vitest";
import { analyseStream } from "./stream-analyser";

it("reads every stream through one context that runs only while read", () => {
  const contexts: FakeContext[] = [];
  class FakeContext {
    state = "running";
    suspend = vi.fn(async () => {
      this.state = "suspended";
    });
    resume = vi.fn(async () => {
      this.state = "running";
    });
    constructor() {
      contexts.push(this);
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createAnalyser() {
      return { fftSize: 0, disconnect() {} };
    }
  }
  vi.stubGlobal("AudioContext", FakeContext);
  const stream = {} as MediaStream;

  const mic = analyseStream(stream, 256);
  const voice = analyseStream(stream, 1024);
  expect(contexts).toHaveLength(1);
  expect(voice?.analyser.fftSize).toBe(1024);

  mic?.stop();
  expect(contexts[0]?.suspend).not.toHaveBeenCalled();
  voice?.stop();
  expect(contexts[0]?.suspend).toHaveBeenCalledTimes(1);

  contexts[0]!.state = "suspended";
  analyseStream(stream, 256);
  expect(contexts).toHaveLength(1);
  expect(contexts[0]?.resume).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});
