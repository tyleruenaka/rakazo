/**
 * Level bars for a live microphone or voice: the voice band of an analyser frame split
 * into equal slices, each slice's loudness above a noise floor, eased up quickly and
 * down slowly.
 */

const VOICE_MIN_HZ = 280;
const BAR_MIN_HZ = 1_000;
const VOICE_MAX_HZ = 6_000;
const FIXED_FLOOR = 0.24;
const FIXED_GAIN = 2.2;
const ADAPTIVE_CEILING = 0.45;
const ADAPTIVE_RISE_PER_SECOND = 0.05;
const ADAPTIVE_SETTLE_MS = 300;
const ADAPTIVE_MARGIN = 0.03;
const ADAPTIVE_GAIN = 3;
const RISE = 0.32;
const FALL = 0.12;

/** `fixed` suits a quiet source; `adaptive` learns the room's noise and keeps it flat. */
export type NoiseFloor = "fixed" | "adaptive";

export type MeterState = {
  levels: number[];
  floor: { value: number; startedAt: number } | null;
  /** When this frame was read, to pace the adaptive floor. */
  at: number;
};

function binRange(binCount: number, sampleRate: number, minHz: number, ceil = false) {
  const nyquist = sampleRate / 2;
  const start = (minHz * binCount) / nyquist;
  return {
    start: Math.max(0, ceil ? Math.ceil(start) : Math.floor(start)),
    end: Math.min(binCount - 1, Math.ceil((VOICE_MAX_HZ * binCount) / nyquist)),
  };
}

export function nextMeterState(
  previous: MeterState | null,
  bins: Uint8Array,
  sampleRate: number,
  {
    count,
    sensitivity,
    noiseFloor,
    now,
  }: { count: number; sensitivity: number; noiseFloor: NoiseFloor; now: number },
): MeterState {
  const voice = binRange(bins.length, sampleRate, VOICE_MIN_HZ);
  const band = binRange(bins.length, sampleRate, BAR_MIN_HZ, true);
  const from = band.start > voice.end ? voice.start : band.start;
  const span = Math.max(0, voice.end - from + 1);

  let floor = previous?.floor ?? null;
  if (noiseFloor === "adaptive") {
    let sum = 0;
    for (let bin = voice.start; bin <= voice.end; bin++) sum += ((bins[bin] ?? 0) / 255) ** 2;
    const loudness = Math.sqrt(sum / Math.max(1, voice.end - voice.start + 1));
    if (!floor) floor = { value: Math.min(loudness, ADAPTIVE_CEILING), startedAt: now };
    else {
      const settled = now - floor.startedAt >= ADAPTIVE_SETTLE_MS;
      const elapsed = Math.max(0, now - (previous?.at ?? now));
      const cap = settled
        ? Math.min(ADAPTIVE_CEILING, floor.value + (ADAPTIVE_RISE_PER_SECOND * elapsed) / 1000)
        : ADAPTIVE_CEILING;
      floor = { value: Math.min(loudness, cap), startedAt: floor.startedAt };
    }
  }

  const levels: number[] = [];
  for (let bar = 0; bar < count; bar++) {
    const start = from + Math.floor((bar * span) / count);
    const end = Math.max(start, from + Math.floor(((bar + 1) * span) / count) - 1);
    let sum = 0;
    for (let bin = start; bin <= end; bin++) sum += (bins[bin] ?? 0) / 255;
    const raw = sum / (end - start + 1);
    const level = Math.min(
      1,
      noiseFloor === "adaptive" && floor
        ? Math.max(0, raw - floor.value - ADAPTIVE_MARGIN) * ADAPTIVE_GAIN * sensitivity
        : Math.max(0, raw - FIXED_FLOOR) * FIXED_GAIN * sensitivity,
    );
    const before = previous?.levels.length === count ? previous.levels[bar] : undefined;
    levels.push(
      before === undefined ? level : before + (level - before) * (level > before ? RISE : FALL),
    );
  }
  return { levels, floor, at: now };
}

/** How many bars of a width and gap fit across a box. */
export function barCount(width: number, barWidth: number, gap: number): number {
  return Math.max(0, Math.floor((width + gap) / (barWidth + gap)));
}
