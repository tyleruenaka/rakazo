import { errorText } from "./user-error";

export interface ComputerScreenResult {
  url: string | null;
  error: string | null;
  /** Every screen on the computer is taken; the bot's computer shows asleep. */
  unavailable?: true;
}

/** Only the latest request for the visible computer may replace its screen or error. */
export async function loadComputerScreen(options: {
  load: () => Promise<{ url: string | null; unavailable?: boolean }>;
  isCurrent: () => boolean;
  commit: (result: ComputerScreenResult) => void;
  fallbackError: string;
}): Promise<string | null> {
  let result: ComputerScreenResult;
  try {
    const screen = await options.load();
    result = { url: screen.url, error: null, ...(screen.unavailable ? { unavailable: true } : {}) };
  } catch (error) {
    result = {
      url: null,
      error: errorText(error, options.fallbackError),
    };
  }
  if (!options.isCurrent()) return null;
  options.commit(result);
  return result.url;
}

/**
 * What a proxied screen page reports to the app: its first drawn frame, or that a live
 * connection closed (the screen was taken, or the stream dropped).
 */
export function screenPageState(data: unknown): "painted" | "closed" | null {
  if (!data || typeof data !== "object") return null;
  const message = data as { type?: unknown; state?: unknown };
  if (message.type !== "rakazo-screen") return null;
  return message.state === "painted" || message.state === "closed" ? message.state : null;
}

export function embeddableScreenUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.href);
    const page = new URL(window.location.href);
    // The server that served this page proxies /novnc/. Keep the frame on this origin even when the
    // API's WEB_ORIGIN names another host for it (localhost vs 127.0.0.1), as the CSP frames 'self'.
    if (parsed.pathname.startsWith("/novnc/")) {
      return `${page.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    const pagePort = page.port || (page.protocol === "https:" ? "443" : "80");
    if (local && parsed.port && parsed.port !== pagePort) {
      return null;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function screenIframeSandbox(url: string | null) {
  if (!url) return undefined;
  try {
    return new URL(url, window.location.href).pathname.startsWith("/novnc/")
      ? "allow-scripts allow-pointer-lock"
      : undefined;
  } catch {
    return undefined;
  }
}

/** Deduplicate only the boot request; callers can still take over and refresh. */
export async function bootComputerOnce<T>(
  inFlight: Map<string, symbol>,
  botId: string,
  boot: () => Promise<T>,
): Promise<T | undefined> {
  if (inFlight.has(botId)) return;
  const token = Symbol(botId);
  inFlight.set(botId, token);
  try {
    return await boot();
  } finally {
    if (inFlight.get(botId) === token) inFlight.delete(botId);
  }
}
