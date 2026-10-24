/**
 * On-device dictation for calls, mirroring the web store's endpoint mode: the recognizer
 * reports words, and only a quiet gap measured here ends a turn. The recognizer's own
 * `isFinal` / `end` is a breath or an OS timeout, never the caller finishing a sentence.
 */

/** Quiet gap that ends an utterance. A natural breath is well under it, a finished turn well over. */
export const ENDPOINT_SILENCE_MS = 1_200;
const RESTART_MIN_MS = 250;
const RESTART_MAX_MS = 2_000;
/** Restarts in a row that hear nothing: the recognizer is wedged, stop churning the mic. */
const MAX_DEAD_RESTARTS = 5;
/** Errors that mean this turn cannot recover; the rest are routine and `end` restarts. */
const FATAL_ERRORS = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "language-not-supported",
]);
/** iOS answers a permission request once the person taps; this only catches a lost answer. */
export const PERMISSION_TIMEOUT_MS = 60_000;
/** Region for an app language when the phone's own languages do not name one. */
const DEFAULT_REGIONS: Record<string, string> = {
  en: "en-US",
  de: "de-DE",
  ru: "ru-RU",
  nl: "nl-NL",
  zh: "zh-CN",
};

/** Whether the recognizer may use the microphone: refused is not the same as unsupported. */
export type MicAccess = "granted" | "denied" | "unavailable";

type ResultEvent = { isFinal: boolean; results: { transcript: string }[] };
type ErrorEvent = { error?: string };
type DictationEventMap = {
  result: ResultEvent;
  end: null;
  error: ErrorEvent;
  volumechange: { value: number };
};

/** The slice of `expo-speech-recognition` this module needs, so tests can drive the events. */
export type SpeechRecognizer = {
  start(options: {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    volumeChangeEventOptions?: { enabled: boolean; intervalMillis: number };
    iosCategory?: {
      category: "playAndRecord";
      categoryOptions: readonly ("defaultToSpeaker" | "allowBluetooth")[];
      mode: "default";
    };
  }): void;
  stop(): void;
  abort(): void;
  isRecognitionAvailable(): boolean;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  /** iOS lists the exact tags it recognises; anything else fails as unsupported. */
  getSupportedLocales?(options: Record<string, never>): Promise<{ locales: string[] }>;
  addListener<Event extends keyof DictationEventMap>(
    event: Event,
    listener: (payload: DictationEventMap[Event]) => void,
  ): { remove: () => void };
};

type Session = {
  recognizer: SpeechRecognizer;
  lang: string;
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (code: string) => void;
  /** Input level, -2 (silent) to 10, for a live meter. */
  onVolume?: (value: number) => void;
  subs: { remove: () => void }[];
  /** Text from earlier recognizer sessions of the same utterance. */
  carried: string;
  /** Text of the recognizer session running now. */
  heard: string;
  silence?: ReturnType<typeof setTimeout>;
  restart?: ReturnType<typeof setTimeout>;
  backoff: number;
  deadRestarts: number;
};

const IOS_SESSION = {
  category: "playAndRecord",
  categoryOptions: ["defaultToSpeaker", "allowBluetooth"],
  mode: "default",
} as const satisfies Parameters<SpeechRecognizer["start"]>[0]["iosCategory"];

let injected: SpeechRecognizer | null = null;
/** Test seam: an injected recognizer replaces the native module. */
export function setSpeechRecognizer(recognizer: SpeechRecognizer | null): void {
  injected = recognizer;
  supportedTags = null;
}

async function load(): Promise<SpeechRecognizer> {
  if (injected) return injected;
  const { ExpoSpeechRecognitionModule } = await import("expo-speech-recognition");
  return ExpoSpeechRecognitionModule as unknown as SpeechRecognizer;
}

/** A session older than this one can never deliver a final. */
let token = 0;
let active: Session | null = null;

/** Asks for the microphone and speech recognition, showing the system prompt the first time. */
export async function access(): Promise<MicAccess> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const recognizer = await load();
    if (!recognizer.isRecognitionAvailable()) return "unavailable";
    const answer = await Promise.race([
      recognizer.requestPermissionsAsync(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), PERMISSION_TIMEOUT_MS);
      }),
    ]);
    if (!answer) return "unavailable";
    if (answer.granted) return "granted";
    return "denied";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timer);
  }
}

/** True when the device can recognise speech itself and the caller allowed it. */
export async function available(): Promise<boolean> {
  return (await access()) === "granted";
}

/**
 * The tag to recognise in. The app language is a bare "en" or "de", and iOS only takes a
 * tag it lists exactly ("en-US"; never "en", "en-NL" or "zh-Hans-CN"), so anything else
 * leaves the microphone deaf. Tries the asked-for tag, the phone's own variants of that
 * language, then a default region, and on iOS keeps only a tag it lists. With no list
 * (Android takes any tag) the first tag with a region wins.
 */
export function recognitionLang(
  lang: string,
  phoneTags: readonly string[],
  supported: readonly string[],
): string {
  const asked = lang.replace(/_/g, "-");
  const language = languageOf(asked);
  const candidates = [
    asked,
    ...phoneTags
      .map((tag) => tag.replace(/_/g, "-"))
      .filter((tag) => languageOf(tag) === language)
      .flatMap((tag) => [tag, withoutScript(tag)]),
    DEFAULT_REGIONS[language] ?? "",
  ].filter((tag) => tag.includes("-"));
  if (supported.length === 0) return candidates[0] ?? asked;
  const listed = new Map(supported.map((tag) => [tag.replace(/_/g, "-").toLowerCase(), tag]));
  for (const tag of candidates) {
    const match = listed.get(tag.toLowerCase());
    if (match) return match;
  }
  return supported.find((tag) => languageOf(tag) === language) ?? candidates[0] ?? asked;
}

function languageOf(tag: string): string {
  return tag.split(/[-_]/)[0]?.toLowerCase() ?? "";
}

/** "zh-Hans-CN" → "zh-CN": iOS lists Chinese by region, not by script. */
function withoutScript(tag: string): string {
  const [language, script, region] = tag.split("-");
  return script?.length === 4 && region ? `${language}-${region}` : tag;
}

async function phoneLanguageTags(): Promise<string[]> {
  try {
    const { getLocales } = await import("expo-localization");
    return getLocales().map((locale) => locale.languageTag);
  } catch {
    return [];
  }
}

let supportedTags: string[] | null = null;
/** The tags iOS recognises, read once; empty elsewhere, where any tag works. */
async function recognizedTags(recognizer: SpeechRecognizer): Promise<string[]> {
  if (supportedTags) return supportedTags;
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS !== "ios" || !recognizer.getSupportedLocales) return [];
    supportedTags = (await recognizer.getSupportedLocales({})).locales;
    return supportedTags;
  } catch {
    return [];
  }
}

export function stop(): void {
  const session = active;
  active = null;
  token += 1;
  if (!session) return;
  clearTimeout(session.silence);
  clearTimeout(session.restart);
  for (const sub of session.subs) sub.remove();
  try {
    session.recognizer.abort();
  } catch {
    // already stopped
  }
}

/** Opens the microphone until a quiet gap ends the utterance, or `signal` aborts it. */
export async function listen(opts: {
  onInterim?: (text: string) => void;
  /** The finished turn; empty when the recognizer kept stopping without hearing anything. */
  onFinal: (text: string) => void;
  /** The recognizer cannot run (an error code like "not-allowed"); nothing more is coming. */
  onError?: (code: string) => void;
  onVolume?: (value: number) => void;
  signal?: AbortSignal;
  lang?: string;
}): Promise<void> {
  stop();
  const mine = token;
  if (opts.signal?.aborted) return;
  const recognizer = await load();
  const [phoneTags, supported] = await Promise.all([
    phoneLanguageTags(),
    recognizedTags(recognizer),
  ]);
  // A hang-up or a newer session landed while the native module was loading.
  if (token !== mine) return;
  const session: Session = {
    recognizer,
    lang: recognitionLang(opts.lang || "en-US", phoneTags, supported),
    onInterim: opts.onInterim,
    onFinal: opts.onFinal,
    onError: opts.onError,
    onVolume: opts.onVolume,
    subs: [],
    carried: "",
    heard: "",
    backoff: RESTART_MIN_MS,
    deadRestarts: 0,
  };
  active = session;
  opts.signal?.addEventListener(
    "abort",
    () => {
      if (active === session) stop();
    },
    { once: true },
  );
  session.subs = [
    recognizer.addListener("result", (event) => onResult(session, event)),
    recognizer.addListener("end", () => onEnd(session)),
    recognizer.addListener("error", (event) => onError(session, event)),
  ];
  const { onVolume } = opts;
  if (onVolume) {
    session.subs.push(
      recognizer.addListener("volumechange", (event) => {
        if (active === session) onVolume(event.value);
      }),
    );
  }
  start(session);
}

function start(session: Session): void {
  if (active !== session) return;
  session.recognizer.start({
    lang: session.lang,
    interimResults: true,
    continuous: true,
    // The library's own default is a measurement session, which plays the bot's reply
    // very quietly while the microphone is open. Calls play audio in this same session.
    iosCategory: IOS_SESSION,
    ...(session.onVolume
      ? { volumeChangeEventOptions: { enabled: true, intervalMillis: 100 } }
      : {}),
  });
}

function onResult(session: Session, event: ResultEvent): void {
  if (active !== session) return;
  const heard = event.results?.[0]?.transcript ?? "";
  session.backoff = RESTART_MIN_MS;
  session.deadRestarts = 0;
  // Android reports a phrase once and starts over, iOS grows one transcript: folding a
  // final into the carried text and clearing the live one covers both.
  if (event.isFinal) {
    session.carried = join(session.carried, heard);
    session.heard = "";
  } else {
    session.heard = heard;
  }
  const text = join(session.carried, session.heard);
  if (!text) return;
  session.onInterim?.(text);
  // Any result means the caller was just heard, so the quiet gap restarts here — including
  // a phrase the recognizer finalises after repeating it, whose boundary is a breath.
  clearTimeout(session.silence);
  session.silence = setTimeout(() => finish(session), ENDPOINT_SILENCE_MS);
}

function onEnd(session: Session): void {
  if (active !== session) return;
  // iOS ends a session on its own — on a pause, an interruption, or its own cap — and that
  // says nothing about whether the caller finished. Pick the microphone straight back up.
  session.carried = join(session.carried, session.heard);
  session.heard = "";
  session.deadRestarts += 1;
  if (session.deadRestarts > MAX_DEAD_RESTARTS) {
    // A long quiet stretch: end the turn, empty if nothing was heard, so the caller can
    // open the microphone again instead of waiting on a session that is gone.
    finish(session);
    return;
  }
  clearTimeout(session.restart);
  const delay = session.backoff;
  session.backoff = Math.min(RESTART_MAX_MS, session.backoff * 2);
  session.restart = setTimeout(() => {
    if (active !== session) return;
    try {
      start(session);
    } catch {
      finish(session);
    }
  }, delay);
}

function onError(session: Session, event: ErrorEvent): void {
  if (active !== session) return;
  const code = event?.error;
  if (!code || !FATAL_ERRORS.has(code)) return;
  // Words already heard still count as the turn; the next turn meets the error again.
  if (join(session.carried, session.heard)) {
    finish(session);
    return;
  }
  const report = session.onError;
  stop();
  report?.(code);
}

function finish(session: Session): void {
  if (active !== session) return;
  const text = join(session.carried, session.heard).trim();
  const { onFinal } = session;
  stop();
  onFinal(text);
}

function join(left: string, right: string): string {
  return `${left} ${right}`.replace(/\s+/g, " ").trim();
}
