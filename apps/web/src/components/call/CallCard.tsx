import { useLingui } from "@lingui/react/macro";
import type { VoiceInfo } from "@rakazo/contracts";
import type { CallAvatarState } from "@rakazo/ui-web";
import { BotAvatar, cn, defaultBotAvatarValue } from "@rakazo/ui-web";
import { MessageCircleMore, Mic, MicOff, Settings, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { CallState } from "../../lib/call-session";
import { endCall, toggleMute, useCallSession, useEndingCall } from "../../lib/call-session";
import { dictation, SILENCE_RMS } from "../../lib/dictation";
import { rpc } from "../../lib/rpc";
import { analyseStream } from "../../lib/stream-analyser";
import { speaker } from "../../lib/tts";
import { IconTooltip } from "../IconTooltip";
import { LevelMeter } from "../LevelMeter";
import { ListboxSelect } from "../ListboxSelect";

const EDITABLE = /^(?:input|textarea|select)$/i;
/** Grok's full bar needs this much chat width; below it the bar takes Grok's compact form. */
const FULL_BAR_MIN_WIDTH = 422;
/** Below this even the compact bar cannot keep its level line. */
const LEVEL_LINE_MIN_WIDTH = 321;

type Tray = "closed" | "settings" | "transcript";
type BarSize = "full" | "compact" | "tight";
type VoiceSetup = { provider: string; voiceId: string; voices: VoiceInfo[] };

/** The call's voice and the list it picks from, loaded as the call starts so the picker opens on a name. */
function useCallVoice(onCall: boolean) {
  const [setup, setSetup] = useState<VoiceSetup | null>(null);
  useEffect(() => {
    if (!onCall) {
      setSetup(null);
      return;
    }
    let live = true;
    void (async () => {
      const status = await rpc.voice.status();
      if (!status.provider) return;
      const voices = await rpc.voice.voices({ provider: status.provider });
      if (live) setSetup({ provider: status.provider, voiceId: status.voiceId, voices });
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [onCall]);
  return [setup, setSetup] as const;
}

/** The microphone and the bot's voice while they play, for the level line. */
function useCallStreams() {
  const [mic, setMic] = useState<MediaStream | null>(null);
  const [voice, setVoice] = useState<MediaStream | null>(null);
  useEffect(() => dictation.subscribe(() => setMic(dictation.stream)), []);
  useEffect(() => speaker.subscribe(() => setVoice(speaker.stream)), []);
  return { mic, voice };
}

/** How long the caller's voice must stay quiet before the bot stops looking like it listens. */
const VOICE_HOLD_MS = 300;

/** Whether someone is talking into `stream` right now, by its level (as dictation measures it). */
function useVoiceActivity(stream: MediaStream | null): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    setActive(false);
    const reading = stream && analyseStream(stream, 1024);
    if (!reading) return;
    const { analyser } = reading;
    const data = new Uint8Array(analyser.fftSize);
    let voiceAt = 0;
    let on = false;
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const sample of data) sum += ((sample - 128) / 128) ** 2;
      const now = performance.now();
      if (Math.sqrt(sum / data.length) > SILENCE_RMS) voiceAt = now;
      const next = now - voiceAt < VOICE_HOLD_MS;
      if (next === on) return;
      on = next;
      setActive(next);
    }, 50);
    return () => {
      clearInterval(timer);
      reading.stop();
    };
  }, [stream]);
  return active;
}

/**
 * The bot's face in the call, as Grok maps it: the caller speaking (their voice, or words heard
 * while the mic is open), the bot thinking or speaking, and quiet otherwise (ringing, or silence).
 */
export function callAvatarState(
  call: Pick<CallState, "phase" | "heard">,
  callerSpeaking = false,
): CallAvatarState {
  if (call.phase === "thinking" || call.phase === "speaking") return call.phase;
  return call.phase === "listening" && (callerSpeaking || call.heard.trim()) ? "listening" : "idle";
}

/**
 * The call, as a bar under the chat's name pill: the bot, its voice and yours as a level
 * line, then settings, transcript, mute and hang up. Settings and the transcript open
 * below the controls. Escape hangs up.
 */
export function CallBar() {
  const { t } = useLingui();
  const session = useCallSession();
  const endingCall = useEndingCall();
  // As in Grok, a hung-up call keeps its bar, ending, until the server has closed it.
  const call = session ?? endingCall;
  const ending = !session && call !== null;
  const navigate = useNavigate();
  const { botId } = useParams();
  const [tray, setTray] = useState<Tray>("closed");
  /** What the tray shows. It stays while the tray closes, so closing never flashes the other panel. */
  const [panel, setPanel] = useState<Exclude<Tray, "closed">>("transcript");
  const streams = useCallStreams();
  const callerSpeaking = useVoiceActivity(call?.muted ? null : streams.mic);
  const onCall = Boolean(call);
  const [voice, setVoice] = useCallVoice(onCall);
  const bar = useRef<HTMLElement>(null);
  const [size, setSize] = useState<BarSize>("full");
  const trayPanel = useRef<HTMLDivElement>(null);
  /** The tray's last laid-out height, which a swap eases from. */
  const trayHeight = useRef(0);
  const shownPanel = useRef(panel);

  // Like Grok's, the bar is a fixed shape; a chat too narrow for it gets the compact one.
  useLayoutEffect(() => {
    const chat = bar.current?.parentElement;
    if (!chat) return;
    const measure = () => {
      const width = chat.clientWidth;
      setSize(
        width >= FULL_BAR_MIN_WIDTH ? "full" : width >= LEVEL_LINE_MIN_WIDTH ? "compact" : "tight",
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(chat);
    return () => observer.disconnect();
  }, [onCall]);

  useLayoutEffect(() => {
    const element = trayPanel.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      trayHeight.current = element.offsetHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [onCall]);

  // Swapping settings and the transcript eases the tray between their heights, as opening does.
  useLayoutEffect(() => {
    const element = trayPanel.current;
    const from = trayHeight.current;
    if (shownPanel.current === panel) return;
    shownPanel.current = panel;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!element || tray === "closed" || !from || reduced) return;
    const to = element.offsetHeight;
    if (to === from) return;
    // Start from the old height at once: heights from auto would otherwise animate there too.
    element.style.transition = "none";
    element.style.height = `${from}px`;
    void element.offsetHeight;
    element.style.transition = "";
    element.style.height = `${to}px`;
    const settle = (event: TransitionEvent) => {
      if (event.propertyName === "height") element.style.height = "";
    };
    element.addEventListener("transitionend", settle);
    return () => {
      element.removeEventListener("transitionend", settle);
      element.style.height = "";
    };
  }, [panel, tray]);

  useEffect(() => {
    if (!onCall) {
      setTray("closed");
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || EDITABLE.test(target?.tagName ?? "")) return;
      endCall();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCall]);

  if (!call) return null;
  const live = call.phase !== "ringing" && !ending;
  const toggle = (next: Exclude<Tray, "closed">) => {
    setPanel(next);
    setTray(tray === next ? "closed" : next);
  };
  const botColor = defaultBotAvatarValue(call.botColor);
  const compact = size !== "full";
  const iconSize = compact ? 16 : 20;

  return (
    <section
      ref={bar}
      data-testid="call-view"
      data-call-phase={ending ? "ending" : call.phase}
      data-call-tray={tray}
      data-call-size={size}
      aria-label={t`Call with ${call.botName}`}
      inert={ending}
      className={cn(
        "app-no-drag absolute start-1/2 top-[60px] z-30 flex w-max max-w-[calc(100%-24px)] -translate-x-1/2 flex-col overflow-hidden border-[0.5px] border-popover-border bg-card text-foreground shadow-popover dark:shadow-none rtl:translate-x-1/2",
        compact ? "rounded-[22px]" : "rounded-[34px]",
      )}
    >
      <div
        className={cn(
          "flex w-full shrink-0 flex-col items-center",
          compact ? "gap-2 p-2" : "gap-4 p-3",
        )}
      >
        <div className={cn("flex shrink-0 items-center", compact ? "gap-3" : "gap-6")}>
          <div
            className={cn(
              "flex shrink-0 items-center",
              compact ? "gap-[11.5px] ps-[3px]" : "gap-2.5 ps-2",
            )}
            style={{ color: botColor }}
          >
            <button
              type="button"
              aria-label={t`Open chat with ${call.botName}`}
              onClick={() => {
                if (botId !== call.botId) navigate(`/app/${call.botId}`);
              }}
              className={cn(
                "grid shrink-0 place-items-center rounded-full",
                compact ? "size-[22px]" : "size-9",
              )}
            >
              <BotAvatar
                color={call.botColor}
                identity={call.botId}
                size={compact ? 22 : 36}
                call={callAvatarState(call, callerSpeaking)}
              />
            </button>
            <span className={cn("relative h-7 w-24 shrink-0", size === "tight" && "hidden")}>
              {live ? (
                <>
                  <LevelMeter
                    stream={streams.voice}
                    width={96}
                    height={28}
                    barWidth={3}
                    gap={4}
                    minBar={3}
                    sensitivity={0.9}
                    className="absolute inset-0 opacity-20"
                  />
                  <LevelMeter
                    stream={call.muted ? null : streams.mic}
                    width={96}
                    height={28}
                    barWidth={3}
                    gap={4}
                    minBar={0}
                    sensitivity={0.9}
                    noiseFloor="adaptive"
                    className="absolute inset-0 -scale-x-100"
                  />
                </>
              ) : (
                <span
                  role="progressbar"
                  aria-label={t`Calling…`}
                  className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-control"
                >
                  <span className="rk-call-pending absolute inset-y-0 w-[34%] rounded-full bg-current" />
                </span>
              )}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CallControl
              compact={compact}
              label={t`Settings`}
              expanded={tray === "settings"}
              pressed={tray === "settings"}
              onClick={() => toggle("settings")}
            >
              <Settings size={iconSize} strokeWidth={1.5} />
            </CallControl>
            <CallControl
              compact={compact}
              label={t`Transcript`}
              expanded={tray === "transcript"}
              pressed={tray === "transcript"}
              onClick={() => toggle("transcript")}
            >
              <MessageCircleMore size={iconSize} strokeWidth={1.5} />
            </CallControl>
            <CallControl
              compact={compact}
              label={call.muted ? t`Unmute` : t`Mute`}
              ariaPressed={call.muted}
              pressed={call.muted}
              onClick={toggleMute}
            >
              {call.muted ? (
                <MicOff size={iconSize} strokeWidth={1.5} />
              ) : (
                <Mic size={iconSize} strokeWidth={1.5} />
              )}
            </CallControl>
            <IconTooltip label={t`Hang up`}>
              <button
                type="button"
                aria-label={t`Hang up`}
                onClick={endCall}
                className={cn(
                  "grid shrink-0 place-items-center rounded-full bg-call-hang-up text-destructive-foreground transition-colors hover:bg-call-hang-up-hover",
                  compact ? "size-7" : "size-11",
                )}
              >
                <X size={iconSize} strokeWidth={1.75} />
              </button>
            </IconTooltip>
          </div>
        </div>
      </div>
      <div
        ref={trayPanel}
        aria-hidden={tray === "closed"}
        inert={tray === "closed"}
        data-call-tray-panel={tray === "closed" ? "closed" : "open"}
        className={cn(
          // As in Grok, the tray never widens the bar: long turns wrap inside its width.
          "rk-call-tray grid w-full min-w-0 [contain:inline-size] transition-[grid-template-rows,height] duration-300 motion-reduce:transition-none",
          tray === "closed" ? "pointer-events-none grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={cn(
              "rk-call-tray transition-transform duration-300 motion-reduce:transition-none",
              tray === "closed" ? "-translate-y-2.5" : "translate-y-0",
            )}
          >
            {panel === "settings" ? (
              <CallSettings voice={voice} onVoice={setVoice} compact={compact} />
            ) : (
              <CallTranscript call={call} maxHeight={compact ? 160 : 240} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function CallControl({
  compact,
  label,
  pressed,
  expanded,
  ariaPressed,
  onClick,
  children,
}: {
  compact: boolean;
  label: string;
  pressed: boolean;
  expanded?: boolean;
  ariaPressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <IconTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={expanded}
        aria-pressed={ariaPressed}
        onClick={onClick}
        className={cn(
          "grid shrink-0 place-items-center rounded-full transition-colors hover:bg-control-active hover:text-foreground",
          compact ? "size-7" : "size-11",
          pressed ? "bg-control-active text-foreground" : "bg-control text-muted-foreground",
        )}
      >
        {children}
      </button>
    </IconTooltip>
  );
}

/** What was said, newest at the bottom, with the words still being spoken or heard. */
function CallTranscript({ call, maxHeight }: { call: CallState; maxHeight: number }) {
  const { t } = useLingui();
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  /** The turns' height, which the log eases to as turns arrive and grow. */
  const [height, setHeight] = useState<number | null>(null);
  const turns = [
    ...call.exchanges,
    // A sent turn stays in `heard` while the bot thinks; it is already the last turn.
    ...(call.heard && call.heard !== call.exchanges.at(-1)?.text
      ? [{ role: "user" as const, text: call.heard }]
      : []),
    ...(call.caption ? [{ role: "bot" as const, text: call.caption }] : []),
  ];
  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => setHeight(element.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const overflows = height !== null && height > maxHeight;
  const pinned = useRef(false);
  // Keep the newest words in view: at once when the log opens, then smoothly (unless motion is reduced).
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || !overflows) return;
    element.scrollTo({
      top: element.scrollHeight,
      behavior: pinned.current ? undefined : "instant",
    });
    pinned.current = true;
  }, [height, overflows]);
  return (
    <div
      ref={scroller}
      role="log"
      aria-label={t`Transcript`}
      className={cn(
        "rk-scroll rk-call-tray box-content w-full scroll-smooth border-t-[0.5px] border-popover-border transition-[height] duration-300 motion-reduce:scroll-auto motion-reduce:transition-none",
        overflows ? "overflow-y-auto" : "overflow-y-hidden",
      )}
      style={{ height: height === null ? undefined : Math.min(height, maxHeight), maxHeight }}
    >
      <div ref={content} className="flex flex-col gap-2.5 px-4 pt-4 pb-4">
        {turns.length === 0 ? (
          <span className="self-center text-[13px] text-muted-foreground">
            {t`No speech transcribed yet`}
          </span>
        ) : (
          turns.map((turn, index) => (
            <div
              key={index}
              dir="auto"
              className={cn(
                "max-w-[88%] select-text rounded-[14px] px-3 py-2 text-[14px] leading-[22px] wrap-anywhere",
                turn.role === "user"
                  ? "self-end bg-call-turn-user text-call-turn-user-foreground"
                  : "self-start bg-call-turn-bot text-foreground",
              )}
            >
              {turn.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** The voice the bot speaks with; the call's only setting Rakazo has today. */
function CallSettings({
  voice,
  onVoice,
  compact,
}: {
  voice: VoiceSetup | null;
  onVoice: (next: VoiceSetup) => void;
  compact: boolean;
}) {
  const { t } = useLingui();
  // Only a voice the list names is shown: never its raw id while the list loads.
  const named = voice?.voices.some((option) => option.id === voice.voiceId) ?? false;
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 border-t-[0.5px] border-popover-border pt-2 pb-4",
        compact ? "px-1" : "px-4",
      )}
    >
      <div className="flex min-h-9 items-center justify-between gap-4">
        <span className="shrink-0 text-[14px] leading-5 text-foreground">{t`Voice`}</span>
        {voice && named ? (
          // A long voice name truncates with an ellipsis and keeps its chevron in a narrow bar.
          <div className="flex min-w-0 flex-1 justify-end">
            <ListboxSelect
              label={t`Voice`}
              options={voice.voices.map((option) => ({ value: option.id, label: option.label }))}
              value={voice.voiceId}
              onChange={(next) => {
                const previous = voice;
                onVoice({ ...voice, voiceId: next });
                void rpc.voice
                  .setVoice({ voiceId: next, provider: voice.provider })
                  .catch(() => onVoice(previous));
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
