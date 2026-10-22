import { useLingui } from "@lingui/react/macro";
import { Button, Spinner } from "@rakazo/ui-web";
import { Mic } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { dictation } from "../../lib/dictation";
import { LevelMeter } from "../LevelMeter";

const NOTICE_MS = 2_500;

export type DictationPhase = "idle" | "recording" | "transcribing";

/**
 * Click-to-dictate: the mic starts recording, the chip stops it and the words land in
 * the field, and stopping with send also sends the message once the words are in.
 */
export function useDictation({
  transcribe,
  disabled,
  onText,
}: {
  transcribe?: boolean;
  disabled?: boolean;
  onText: (text: string) => void;
}) {
  const [phase, setPhase] = useState<DictationPhase>("idle");
  const [startedAt, setStartedAt] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendPending, setSendPending] = useState(false);
  const active = useRef(false);
  const heard = useRef(false);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () =>
      dictation.subscribe((snapshot) => {
        if (!active.current) return;
        setStream(dictation.stream);
        if (snapshot.status === "listening") {
          heard.current = true;
          return;
        }
        if (snapshot.status === "transcribing") {
          setPhase("transcribing");
          return;
        }
        if (!heard.current) return;
        active.current = false;
        heard.current = false;
        setPhase("idle");
        setStream(null);
        if (!snapshot.error) return;
        // A failed take sends nothing; the draft stays as it was.
        setSendPending(false);
        setNotice(snapshot.error);
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
      }),
    [],
  );

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      if (active.current) dictation.stop("cancel");
    },
    [],
  );

  const start = useCallback(() => {
    if (disabled || active.current) return;
    active.current = true;
    heard.current = false;
    setNotice(null);
    setSendPending(false);
    setStartedAt(Date.now());
    setPhase("recording");
    void dictation.listen({
      mode: "hold",
      transcribe,
      meter: true,
      onFinal: (text) => onTextRef.current(text),
    });
  }, [disabled, transcribe]);

  const stop = useCallback((send: boolean) => {
    if (!active.current) return;
    if (send) setSendPending(true);
    dictation.submitHold();
  }, []);

  const cancel = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    heard.current = false;
    setPhase("idle");
    setStream(null);
    setSendPending(false);
    dictation.stop("cancel");
  }, []);

  const clearSendPending = useCallback(() => setSendPending(false), []);

  return {
    phase,
    startedAt,
    stream,
    notice,
    sendPending,
    start,
    stop,
    cancel,
    clearSendPending,
  };
}

export type DictationControls = ReturnType<typeof useDictation>;

/** The resting microphone, plus a short notice above it when a take fails. */
export function DictationMic({ talk, disabled }: { talk: DictationControls; disabled?: boolean }) {
  const { t } = useLingui();
  return (
    <span className="relative inline-flex">
      {talk.notice ? (
        <span
          role="status"
          className="pointer-events-none absolute bottom-full end-0 mb-2 w-max max-w-64 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground shadow-md"
        >
          {talk.notice}
        </span>
      ) : null}
      <Button
        variant="outline"
        size="icon"
        aria-label={t`Start voice input`}
        disabled={disabled}
        onClick={talk.start}
        className="size-7 shrink-0 rounded-full border-[0.5px] border-composer-control-border bg-control text-composer-icon"
      >
        <Mic size={18} strokeWidth={1.5} className="size-[18px]" />
      </Button>
    </span>
  );
}

/** Recording: a stop square, the elapsed time and live level bars. Escape discards. */
export function DictationChip({ talk }: { talk: DictationControls }) {
  const { t } = useLingui();
  const seconds = useElapsedSeconds(talk.startedAt);
  return (
    <button
      type="button"
      aria-label={t`Stop dictation`}
      data-testid="dictation-chip"
      onClick={() => talk.stop(false)}
      onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        talk.cancel();
      }}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-control px-2.5 py-1 outline-none transition-colors duration-[120ms] ease-[ease] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[2px] bg-foreground" />
      <span
        aria-hidden="true"
        className="shrink-0 text-[14px] leading-[22px] tracking-[-0.15px] text-foreground tabular-nums"
      >
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      </span>
      <LevelMeter
        stream={talk.stream}
        width={18}
        height={13}
        barWidth={2}
        gap={2}
        minBar={3}
        sensitivity={0.8}
        className="text-muted-foreground"
      />
    </button>
  );
}

/** Words are on their way back from transcription. */
export function DictationTranscribing() {
  const { t } = useLingui();
  return (
    <span
      role="status"
      aria-label={t`Transcribing…`}
      className="grid size-7 shrink-0 place-items-center text-composer-icon"
    >
      <Spinner className="size-[18px]" />
    </span>
  );
}

function useElapsedSeconds(since: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.floor((now - since) / 1000));
}
