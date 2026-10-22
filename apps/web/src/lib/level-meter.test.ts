import { describe, expect, it } from "vitest";
import { barCount, nextMeterState } from "./level-meter";

// 128 bins at 48 kHz: each bin is 187.5 Hz, so the 1–6 kHz bar band is bins 6–32.
const SAMPLE_RATE = 48_000;
const bins = (fill: (bin: number) => number) => Uint8Array.from({ length: 128 }, (_, i) => fill(i));
const fixed = { count: 5, sensitivity: 0.8, noiseFloor: "fixed" as const, now: 0 };

describe("level meter", () => {
  it("fits Grok's bar counts: five in the dictation chip, fourteen in the call bar", () => {
    expect(barCount(18, 2, 2)).toBe(5);
    expect(barCount(96, 3, 4)).toBe(14);
  });

  it("stays flat in a quiet room", () => {
    expect(
      nextMeterState(
        null,
        bins(() => 40),
        SAMPLE_RATE,
        fixed,
      ).levels,
    ).toEqual([0, 0, 0, 0, 0]);
  });

  it("lifts only the bars whose slice of the voice band is loud", () => {
    const { levels } = nextMeterState(
      null,
      bins((bin) => (bin >= 6 && bin <= 10 ? 255 : 0)),
      SAMPLE_RATE,
      fixed,
    );
    expect(levels[0]).toBeCloseTo(1);
    expect(levels.slice(1)).toEqual([0, 0, 0, 0]);
  });

  it("rises quickly and falls slowly", () => {
    const rest = { levels: [0, 0, 0, 0, 0], floor: null, at: 0 };
    expect(
      nextMeterState(
        rest,
        bins(() => 255),
        SAMPLE_RATE,
        fixed,
      ).levels[0],
    ).toBeCloseTo(0.32);
    const loud = { levels: [1, 1, 1, 1, 1], floor: null, at: 0 };
    expect(
      nextMeterState(
        loud,
        bins(() => 0),
        SAMPLE_RATE,
        fixed,
      ).levels[0],
    ).toBeCloseTo(0.88);
  });

  it("learns a steady room noise and keeps it flat with an adaptive floor", () => {
    const hum = bins(() => 120);
    const options = { count: 14, sensitivity: 0.9, noiseFloor: "adaptive" as const, now: 0 };
    const first = nextMeterState(null, hum, SAMPLE_RATE, options);
    expect(first.levels.every((level) => level === 0)).toBe(true);
    const later = nextMeterState(first, hum, SAMPLE_RATE, { ...options, now: 1_000 });
    expect(later.levels.every((level) => level === 0)).toBe(true);
  });
});
