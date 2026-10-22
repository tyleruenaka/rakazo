import { cn } from "@rakazo/ui-web";
import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import type { NoiseFloor } from "../lib/level-meter";
import { barCount, nextMeterState } from "../lib/level-meter";
import { analyseStream } from "../lib/stream-analyser";

/**
 * Rounded bars that read a live audio stream, in the current text color. Without a
 * stream, or with reduced motion, they rest at their minimum height.
 */
export function LevelMeter({
  stream,
  width,
  height,
  barWidth,
  gap,
  minBar,
  sensitivity,
  noiseFloor = "fixed",
  className,
  style,
}: {
  stream: MediaStream | null;
  width: number;
  height: number;
  barWidth: number;
  gap: number;
  minBar: number;
  sensitivity: number;
  noiseFloor?: NoiseFloor;
  className?: string;
  style?: CSSProperties;
}) {
  const count = barCount(width, barWidth, gap);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!stream || reduced || stream.getAudioTracks().length === 0) return;
    const reading = analyseStream(stream, 256);
    if (!reading) return;
    const { analyser } = reading;
    analyser.smoothingTimeConstant = 0.8;
    const bins = new Uint8Array(analyser.frequencyBinCount);
    let state: ReturnType<typeof nextMeterState> | null = null;
    let frame = requestAnimationFrame(function draw(now) {
      analyser.getByteFrequencyData(bins);
      state = nextMeterState(state, bins, analyser.context.sampleRate, {
        count,
        sensitivity,
        noiseFloor,
        now,
      });
      state.levels.forEach((level, index) => {
        const bar = bars.current[index];
        if (bar) bar.style.height = `${Math.max(minBar, level * height)}px`;
      });
      frame = requestAnimationFrame(draw);
    });
    return () => {
      cancelAnimationFrame(frame);
      reading.stop();
      for (const bar of bars.current) if (bar) bar.style.height = `${minBar}px`;
    };
  }, [stream, count, height, minBar, sensitivity, noiseFloor]);

  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0 items-center justify-center", className)}
      style={{ width, height, gap, ...style }}
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          ref={(bar) => {
            bars.current[index] = bar;
          }}
          className="shrink-0 rounded-full bg-current"
          style={{ width: barWidth, height: minBar }}
        />
      ))}
    </span>
  );
}
