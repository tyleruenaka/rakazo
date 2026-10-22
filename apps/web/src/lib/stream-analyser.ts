let context: AudioContext | null = null;
let readers = 0;

/**
 * An analyser on a live stream, for level bars and voice activity. Every reader shares one
 * AudioContext, which runs only while someone reads: opening another context while some are
 * open can stall the page for over 100ms, as each call turn did. Null without Web Audio.
 */
export function analyseStream(
  stream: MediaStream,
  fftSize: number,
): { analyser: AnalyserNode; stop: () => void } | null {
  if (typeof AudioContext === "undefined") return null;
  context ??= new AudioContext();
  const shared = context;
  if (shared.state === "suspended") void shared.resume().catch(() => undefined);
  readers++;
  const source = shared.createMediaStreamSource(stream);
  const analyser = shared.createAnalyser();
  analyser.fftSize = fftSize;
  source.connect(analyser);
  return {
    analyser,
    stop: () => {
      source.disconnect();
      analyser.disconnect();
      if (--readers === 0) void shared.suspend().catch(() => undefined);
    },
  };
}
