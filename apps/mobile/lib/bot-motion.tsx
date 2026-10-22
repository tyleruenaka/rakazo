import type { BotMotion } from "@rakazo/core";
import { SETTLED_MS } from "@rakazo/core";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";

type LiveMotions = {
  motions: ReadonlyMap<string, BotMotion>;
  since: ReadonlyMap<string, number>;
};

const BotMotionContext = createContext<LiveMotions>({ motions: new Map(), since: new Map() });

/**
 * Live motion by bot id for the open thread, so every avatar of a working bot shows the same
 * face. `since` is when each motion began; a done or failed face ends by itself after
 * SETTLED_MS, re-rendering only that avatar (as on web).
 */
export function BotMotionProvider({
  value,
  since,
  children,
}: {
  value: ReadonlyMap<string, BotMotion>;
  since: ReadonlyMap<string, number>;
  children: ReactNode;
}) {
  return <BotMotionContext value={{ motions: value, since }}>{children}</BotMotionContext>;
}

export function useLiveBotMotion(botId: string | undefined): BotMotion | undefined {
  const { motions, since } = useContext(BotMotionContext);
  const motion = botId ? motions.get(botId) : undefined;
  const settled = motion === "done" || motion === "failed";
  const endsAt = settled && botId ? (since.get(botId) ?? 0) + SETTLED_MS : 0;
  const [, expire] = useState(0);
  useEffect(() => {
    if (!settled) return;
    const timer = setTimeout(() => expire((n) => n + 1), Math.max(0, endsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [settled, endsAt]);
  return settled && Date.now() >= endsAt ? undefined : motion;
}
