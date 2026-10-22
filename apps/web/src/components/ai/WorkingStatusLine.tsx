import {
  BotAvatar,
  type BotMotion,
  cn,
  GroupAvatar,
  type GroupAvatarMember,
  useLiveBotMotion,
} from "@rakazo/ui-web";
import { useEffect, useRef, useState } from "react";
import type { ActivityKind } from "../../lib/bot-activity";
import { formatStepElapsed, useActivityPhrase } from "../../lib/bot-activity";
import { Shimmer } from "./primitives";

/** Grok's status line leaves with a 140ms fade and shrink once the work is over. */
const EXIT_MS = 140;
/** Grok adds the time spent on a step once it passes a minute. */
const ELAPSED_AFTER_MS = 60_000;

type StatusLineProps = {
  bots: GroupAvatarMember[];
  kind: ActivityKind;
  /** When the current step started, if known; otherwise when the line first showed it. */
  since?: number;
  /** "Ezra is working"; read to screen readers, and shown when several bots work. */
  label: string;
};

/**
 * Grok's live status line at the end of the chat: the working bot's animated avatar and a
 * shimmering phrase for what it is doing. Several bots show their names instead.
 */
export function WorkingStatusLine({ running, ...props }: StatusLineProps & { running: boolean }) {
  // The line keeps its last bots and phrase while it leaves.
  const last = useRef(props);
  if (running) last.current = props;
  const [mounted, setMounted] = useState(running);
  if (running && !mounted) setMounted(true);
  useEffect(() => {
    if (running || !mounted) return;
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [running, mounted]);
  if (!mounted) return null;
  return <StatusLine {...last.current} exiting={!running} />;
}

function StatusLine({ bots, kind, since, label, exiting }: StatusLineProps & { exiting: boolean }) {
  const phrase = useActivityPhrase(kind);
  const elapsed = useStepElapsed(kind, since);
  const solo = bots.length === 1 ? bots[0] : undefined;
  const text = solo ? phrase : label;
  // Like Grok, a leaving line keeps the face it had while working, not the done face.
  const live = useLiveBotMotion(solo?.botId ?? "");
  const face = useRef<BotMotion | undefined>(live);
  if (!exiting) face.current = live;
  return (
    <div
      role="status"
      data-testid="working-status-line"
      data-exiting={exiting || undefined}
      className={cn(
        // Grok: centered 32 below the last bubble and 33 above the composer, so the row overlaps
        // most of the transcript's 54px end padding instead of stacking on top of it.
        "-mt-0.5 -mb-[39px] flex h-9 origin-left items-center gap-2.5 ps-2 motion-reduce:animate-none",
        exiting
          ? "animate-out fade-out-0 zoom-out-92 fill-mode-forwards duration-140 ease-out"
          : "animate-in fade-in-0 zoom-in-92 duration-180 ease-[cubic-bezier(.22,1,.36,1)]",
      )}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center">
        {solo ? (
          <BotAvatar
            color={solo.color}
            identity={solo.botId ?? solo.name}
            size={28}
            status={solo.status}
            motion={face.current}
            animated
          />
        ) : (
          <GroupAvatar members={bots} size={28} animated />
        )}
      </span>
      <span
        key={text}
        aria-hidden="true"
        className="flex min-w-0 items-center gap-1.5 text-[14px] leading-5 duration-180 ease-out animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none"
      >
        <Shimmer className="min-w-0 truncate animate-[bui-shimmer-text_2.2s_steps(60,end)_infinite] from-foreground/40 from-25% via-foreground via-60% to-foreground/40 to-75% motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-muted-foreground">
          {text}
        </Shimmer>
        {elapsed === null ? null : (
          <span className="shrink-0 text-[12px] text-faint-foreground">
            · {formatStepElapsed(elapsed)}
          </span>
        )}
      </span>
    </div>
  );
}

/** Time on the current step once it passes a minute, refreshed on each minute boundary. */
function useStepElapsed(kind: ActivityKind, since: number | undefined): number | null {
  const [seen, setSeen] = useState(() => ({ kind, at: Date.now() }));
  let shownAt = seen.at;
  if (seen.kind !== kind) {
    shownAt = Date.now();
    setSeen({ kind, at: shownAt });
  }
  const start = since ?? shownAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const elapsed = Date.now() - start;
    const wait =
      elapsed < ELAPSED_AFTER_MS ? ELAPSED_AFTER_MS - elapsed : 60_000 - (elapsed % 60_000);
    const timer = setTimeout(() => setNow(Date.now()), wait + 20);
    return () => clearTimeout(timer);
  }, [start, now]);
  const elapsed = Math.max(now, Date.now()) - start;
  return elapsed >= ELAPSED_AFTER_MS ? elapsed : null;
}
