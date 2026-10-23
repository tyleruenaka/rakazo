import { useEffect, useRef, useState } from "react";

/** Every screen is taken: the bot's computer shows asleep, or waits after a Wake. */
export type ScreenSleep = { botId: string; waiting: boolean };

/** The bot a waiting screen may wake: only the one whose computer is on screen. */
export function waitingScreenWake(
  sleep: ScreenSleep | null,
  shownBotId: string | undefined,
): string | null {
  return sleep?.waiting && sleep.botId === shownBotId ? sleep.botId : null;
}

/**
 * A Wake belongs to the bot whose computer is shown; showing another bot drops it. Nothing
 * announces a freed screen (a run releases it after its bot already reads idle), so a waiting
 * screen asks again on each bots refresh the page already makes.
 */
export function useScreenWake(shownBotId: string | undefined, readScreen: (botId: string) => void) {
  const [sleep, setSleep] = useState<ScreenSleep | null>(null);
  const sleepRef = useRef(sleep);
  const wakingBotId = useRef<string | null>(null);
  // Clicked Wake and no answer yet: the waking look shows instead of asleep.
  const [wakeLookBotId, setWakeLookBotId] = useState<string | null>(null);
  const shownRef = useRef(shownBotId);
  shownRef.current = shownBotId;
  const readRef = useRef(readScreen);
  readRef.current = readScreen;

  function changeSleep(next: ScreenSleep | null) {
    sleepRef.current = next;
    setSleep(next);
  }

  function requestWake(botId: string) {
    wakingBotId.current = botId;
    setWakeLookBotId(botId);
  }

  useEffect(() => {
    if (sleepRef.current && sleepRef.current.botId !== shownBotId) changeSleep(null);
    if (wakingBotId.current !== shownBotId) wakingBotId.current = null;
    setWakeLookBotId((current) => (current === shownBotId ? current : null));
  }, [shownBotId]);

  return {
    sleep,
    sleepRef,
    wakeLookBotId,
    /** Whether a screen read for this bot asks to take an idle screen. */
    wantsWake: (botId: string) => wakingBotId.current === botId,
    /** Ask the next screen read to wake this bot (a caller that reads by itself). */
    requestWake,
    /** Take the longest-idle screen, or wait for one to free up. */
    wake(botId: string) {
      requestWake(botId);
      readRef.current(botId);
    },
    /** A screen read finished: no free screen, or `woke` while asking to wake. */
    settle(botId: string, unavailable: boolean, woke: boolean) {
      if (!unavailable && wakingBotId.current === botId) wakingBotId.current = null;
      changeSleep(unavailable ? { botId, waiting: woke } : null);
      setWakeLookBotId((current) => (current === botId ? null : current));
    },
    /** A bots refresh: a waiting screen asks again, keeping its waiting look. */
    onBotsRefresh() {
      const botId = waitingScreenWake(sleepRef.current, shownRef.current);
      if (!botId) return;
      wakingBotId.current = botId;
      readRef.current(botId);
    },
  };
}
