import { t } from "@lingui/core/macro";
import type { ActivityKind } from "@rakazo/core";
import { useState } from "react";

export {
  type ActivityKind,
  activityMotion,
  type BotActivity,
  formatStepElapsed,
  reduceBotActivity,
  toolActivityKind,
} from "@rakazo/core";

/** Rakazo's own short status phrases; one is drawn each time a new step starts. */
export function activityPhrases(kind: ActivityKind): string[] {
  switch (kind) {
    case "thinking":
      return [t`Thinking`, t`Working it out`, t`Chewing on it`, t`Turning it over`];
    case "typing":
      return [t`Writing back…`];
    case "computer":
      return [t`Poking around`, t`Using its computer`];
    case "search":
      return [t`Looking it up`];
    case "reading":
      return [t`Reading up`];
    case "writing":
      return [t`Drafting`];
    case "commands":
      return [t`Running some code`];
    case "messaging":
      return [t`Looping in a teammate`];
    case "memory":
      return [t`Jogging its memory`];
    case "creating":
      return [t`Drawing it up`];
    case "waiting":
      return [t`Hanging tight`];
    case "working":
      return [t`On it`, t`Getting there`, t`Plugging away`, t`Making headway`];
  }
}

/** The status line's phrase for `kind`: a variant drawn each time a new step starts. */
export function useActivityPhrase(kind: ActivityKind): string {
  const [step, setStep] = useState(() => ({ kind, draw: Math.random() }));
  let current = step;
  if (step.kind !== kind) {
    current = { kind, draw: Math.random() };
    setStep(current);
  }
  const phrases = activityPhrases(current.kind);
  return phrases[Math.floor(current.draw * phrases.length)] ?? phrases[0] ?? "";
}
