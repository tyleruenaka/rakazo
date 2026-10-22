/**
 * Picks up once the browser has granted the microphone, so its permission prompt shows
 * while the call connects instead of interrupting the first turn. A refused or missing
 * microphone still picks up; listening reports the error on the call bar. There is no
 * ringback tone: as in Grok, connecting is silent.
 */
export async function pickUp(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await microphoneReady();
}

async function microphoneReady(): Promise<void> {
  const media = globalThis.navigator?.mediaDevices;
  if (!media?.getUserMedia) return;
  try {
    const stream = await media.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
  } catch {
    // Listening asks again and surfaces the failure.
  }
}
