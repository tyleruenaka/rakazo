import { rpc } from "./api";
import { deviceVoices, setVoiceForBot, voiceForBot, voiceLabel } from "./bot-voices";
import { loadDeviceVoiceEnabled } from "./device-voice";
import { t } from "./i18n";

export type CallVoiceChoice = { key: string; label: string };

/** The bot's voice choice and where to save it: the phone's own voices, or the voice service's. */
export type CallVoice = {
  choices: CallVoiceChoice[];
  value: string;
  save: (key: string) => Promise<void>;
};

export async function loadCallVoice(botId: string): Promise<CallVoice> {
  if (await loadDeviceVoiceEnabled().catch(() => false)) {
    const [available, assigned] = await Promise.all([deviceVoices(), voiceForBot(botId)]);
    return {
      choices: available.map((voice) => ({ key: voice.identifier, label: voiceLabel(voice) })),
      value: assigned ?? "",
      save: (key) => setVoiceForBot(botId, key),
    };
  }
  const [voices, bot] = await Promise.all([
    rpc<{ id: string; label: string }[]>("voice/voices", {}),
    rpc<{ voiceId: string | null }>("bots/get", { botId }),
  ]);
  if (voices.length === 0) return { choices: [], value: "", save: async () => undefined };
  return {
    // A bot without its own voice speaks with the account's voice.
    choices: [
      { key: "", label: t("Default") },
      ...voices.map((voice) => ({ key: voice.id, label: voice.label })),
    ],
    value: bot.voiceId ?? "",
    save: async (key) => {
      await rpc("bots/update", { botId, voiceId: key || null });
    },
  };
}
