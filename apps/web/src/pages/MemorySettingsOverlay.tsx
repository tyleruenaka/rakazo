import { Trans, useLingui } from "@lingui/react/macro";
import type { SpaceMemoryConfig } from "@rakazo/contracts";
import { Button, Dialog, DialogClose, DialogContent, DialogTitle } from "@rakazo/ui-web";
import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { ListboxSelect } from "../components/ListboxSelect";
import { SettingsGroup, SettingsRow, settingsPillClass } from "../components/SettingsLayout";
import { useSpaceRpc } from "../lib/space-rpc";
import { errorText } from "../lib/user-error";
import { SpaceMemorySection } from "./KnowledgeSection";
import {
  defaultMemoryProviderSettings,
  MEMORY_PROVIDER_SETTINGS,
  type MemoryProviderConnectionDraft,
  memoryProviderSettings,
} from "./memory-providers/registry";

function ScopePicker({
  value,
  disabled,
  onChange,
}: {
  value: "isolated" | "shared";
  disabled: boolean;
  onChange: (scope: "isolated" | "shared") => void;
}) {
  const { t } = useLingui();
  return (
    <SettingsRow label={<Trans>Default scope</Trans>}>
      <ListboxSelect
        label={t`Default scope`}
        options={[
          { value: "isolated", label: t`Isolated` },
          { value: "shared", label: t`Shared` },
        ]}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    </SettingsRow>
  );
}

export function MemorySettingsOverlay({
  onClose,
  config,
  onConfigChange,
  embedded = false,
  onBusyChange,
}: {
  onClose: () => void;
  config: SpaceMemoryConfig | null | undefined;
  onConfigChange: (config: SpaceMemoryConfig | null) => void;
  /** Render panel body only for the shared Settings shell. */
  embedded?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const rpc = useSpaceRpc();
  const { t } = useLingui();
  const defaultRegistration = defaultMemoryProviderSettings();
  const [selectedProvider, setSelectedProvider] = useState(
    config?.provider ?? defaultRegistration.id,
  );
  const [defaultScope, setDefaultScope] = useState<"isolated" | "shared">(
    config?.defaultMemoryScope ?? "isolated",
  );
  const [pending, setPending] = useState<"connect" | "disconnect" | "scope" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setSelectedProvider(config.provider);
      setDefaultScope(config.defaultMemoryScope);
      return;
    }
    if (config === null && !memoryProviderSettings(selectedProvider)) {
      setSelectedProvider(defaultRegistration.id);
    }
  }, [config, defaultRegistration.id, selectedProvider]);

  const registration = memoryProviderSettings(config?.provider ?? selectedProvider);
  const busy = pending !== null;

  useEffect(() => {
    return () => onBusyChange?.(false);
  }, [onBusyChange]);

  function markPending(next: "connect" | "disconnect" | "scope" | null) {
    setPending(next);
    onBusyChange?.(next !== null);
  }

  async function connect(draft: MemoryProviderConnectionDraft) {
    if (!registration) return false;
    setError(null);
    markPending("connect");
    try {
      const next = await rpc.memory.connectProvider({
        provider: registration.id,
        ...draft,
        defaultMemoryScope: defaultScope,
      });
      onConfigChange(next);
      return true;
    } catch (err) {
      setError(errorText(err, t`Could not connect ${registration.name}`));
      return false;
    } finally {
      markPending(null);
    }
  }

  async function disconnect() {
    setError(null);
    markPending("disconnect");
    try {
      await rpc.memory.disconnectProvider();
      onConfigChange(null);
    } catch (err) {
      setError(errorText(err, t`Could not disconnect memory provider`));
    } finally {
      markPending(null);
    }
  }

  async function updateDefaultScope(scope: "isolated" | "shared") {
    if (scope === defaultScope) return;
    setError(null);
    markPending("scope");
    try {
      const next = await rpc.memory.setDefaultScope({ defaultMemoryScope: scope });
      onConfigChange(next);
    } catch (err) {
      setError(errorText(err, t`Could not update the default memory scope`));
    } finally {
      markPending(null);
    }
  }

  const body = (
    <>
      {!embedded ? (
        <div className="flex items-start justify-between px-6 pt-6 sm:px-8 sm:pt-7">
          <div>
            <DialogTitle className="text-2xl font-medium text-foreground">
              <Trans>Memory</Trans>
            </DialogTitle>
          </div>
          <DialogClose
            aria-label={t`Close memory settings`}
            disabled={busy}
            render={<Button variant="ghost" size="icon-sm" />}
          >
            <XIcon />
          </DialogClose>
        </div>
      ) : null}

      <div className="rk-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-[22px] pb-7 [scrollbar-gutter:stable] sm:ps-[32.5px] sm:pe-[24.5px]">
        <div className="space-y-7">
          {error ? <p className="px-2 text-[12.5px] text-destructive">{error}</p> : null}

          {config === undefined ? (
            <p className="text-[13px] text-muted-foreground">
              <Trans>Loading memory settings…</Trans>
            </p>
          ) : config ? (
            <SettingsGroup label={registration?.name ?? config.provider}>
              <SettingsRow
                label={
                  <span className="text-success">
                    <Trans>Connected</Trans>
                  </span>
                }
                description={registration?.connectedLabel(config) ?? config.provider}
              >
                <Button
                  variant="secondary"
                  className={settingsPillClass}
                  type="button"
                  disabled={busy}
                  onClick={() => void disconnect()}
                >
                  {pending === "disconnect" ? (
                    <Trans>Disconnecting…</Trans>
                  ) : (
                    <Trans>Disconnect</Trans>
                  )}
                </Button>
              </SettingsRow>
              <ScopePicker
                value={defaultScope}
                disabled={busy}
                onChange={(scope) => void updateDefaultScope(scope)}
              />
            </SettingsGroup>
          ) : registration ? (
            <SettingsGroup>
              <SettingsRow label={<Trans>Provider</Trans>} description={registration.description}>
                {MEMORY_PROVIDER_SETTINGS.length > 1 ? (
                  <ListboxSelect
                    label={t`Provider`}
                    options={MEMORY_PROVIDER_SETTINGS.map((entry) => ({
                      value: entry.id,
                      label: entry.name,
                    }))}
                    value={selectedProvider}
                    disabled={busy}
                    onChange={setSelectedProvider}
                  />
                ) : (
                  <span className="text-[12.5px]">{registration.name}</span>
                )}
              </SettingsRow>
              <ScopePicker value={defaultScope} disabled={busy} onChange={setDefaultScope} />
              {/* Provider forms take the settings row type: 12.5px labels, 35-tall fields. */}
              <div className="px-3.5 pb-2.5 [&_[data-slot=field-label]]:text-[12.5px] [&_[data-slot=field-label]]:font-normal [&_[data-slot=field-label]]:text-foreground [&_[data-slot=input]]:h-[35px] [&_[data-slot=input]]:rounded-[8px] md:[&_[data-slot=input]]:text-[12.5px]">
                <registration.SettingsForm busy={busy} onConnect={connect} />
              </div>
            </SettingsGroup>
          ) : (
            <p className="text-[13px] text-destructive">
              <Trans>The selected memory provider is not available in this build.</Trans>
            </p>
          )}
          <SpaceMemorySection />
        </div>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div data-testid="memory-settings" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {body}
      </div>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open, details) => {
        if (open) return;
        if (busy) {
          details.cancel();
          return;
        }
        onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[min(760px,calc(100%-2rem))] w-[560px] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-h-[min(760px,calc(100%-5rem))] sm:max-w-[calc(100%-5rem)]"
      >
        {body}
      </DialogContent>
    </Dialog>
  );
}
