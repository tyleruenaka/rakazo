import { Trans, useLingui } from "@lingui/react/macro";
import { ORPCError } from "@orpc/client";
import type { Bot } from "@rakazo/contracts";
import { BOT_INSTRUCTIONS_MAX_LENGTH } from "@rakazo/contracts";
import { Button, Popover, PopoverContent, PopoverTrigger, Textarea } from "@rakazo/ui-web";
import { History } from "lucide-react";
import { useId, useState } from "react";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";
import { SettingsGroup } from "./SettingsLayout";

export function InstructionSettings({ bot }: { bot: Bot }) {
  const { t } = useLingui();
  const id = useId();
  const [previousBot, setPreviousBot] = useState(bot);
  const [current, setCurrent] = useState(bot);
  const [baseline, setBaseline] = useState(bot.instructions);
  const [instructions, setInstructions] = useState(bot.instructions);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  if (bot !== previousBot) {
    setPreviousBot(bot);
    if (instructions === baseline) {
      setInstructions(bot.instructions);
      setBaseline(bot.instructions);
    }
    setCurrent(bot);
  }
  async function save(action: () => Promise<Bot>) {
    setPending(true);
    setError("");
    try {
      const updated = await action();
      setConflict(false);
      setCurrent(updated);
      setInstructions(updated.instructions);
      setBaseline(updated.instructions);
    } catch (err) {
      setError(errorText(err));
      setConflict((current) => current || (err instanceof ORPCError && err.code === "CONFLICT"));
    } finally {
      setPending(false);
    }
  }
  return (
    <SettingsGroup
      label={
        <label htmlFor={`${id}-instructions`}>
          <Trans>Instructions</Trans>
        </label>
      }
      action={
        current.instructionHistory?.length ? (
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t`Instruction history`}
                  title={t`Instruction history`}
                  className="text-muted-foreground"
                />
              }
            >
              <History size={14} strokeWidth={1.6} />
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-96 w-80 overflow-y-auto">
              {current.instructionHistory.map((version) => (
                <div key={version.id} className="text-[12.5px] leading-[19px]">
                  <details>
                    <summary className="cursor-pointer">
                      {new Date(version.createdAt).toLocaleString()} · {version.reason}
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap text-description">
                      {version.instructions}
                    </pre>
                  </details>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1.5 rounded-full"
                    disabled={pending}
                    onClick={() =>
                      void save(() =>
                        rpc.bots.restoreInstructions({
                          botId: bot.id,
                          versionId: version.id,
                          expectedInstructions: current.instructions,
                        }),
                      )
                    }
                  >
                    <Trans>Restore</Trans>
                  </Button>
                </div>
              ))}
            </PopoverContent>
          </Popover>
        ) : null
      }
    >
      <div className="space-y-3 px-3.5 py-2.5 text-[12.5px]">
        <Textarea
          id={`${id}-instructions`}
          className="min-h-20 resize-none field-sizing-content"
          value={instructions}
          maxLength={BOT_INSTRUCTIONS_MAX_LENGTH}
          disabled={pending}
          onChange={(event) => setInstructions(event.target.value)}
          onBlur={() => {
            if (!conflict && instructions !== current.instructions)
              void save(() =>
                rpc.bots.update({ botId: bot.id, instructions, expectedInstructions: baseline }),
              );
          }}
        />
        {error ? <p className="text-destructive">{error}</p> : null}
        {conflict ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => void save(() => rpc.bots.get({ botId: bot.id }))}
          >
            <Trans>Reload</Trans>
          </Button>
        ) : null}
      </div>
    </SettingsGroup>
  );
}
