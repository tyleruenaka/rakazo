import { Trans, useLingui } from "@lingui/react/macro";
import type { AccountSecurity, AvatarStyle } from "@rakazo/contracts";
import { accountDisplay, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@rakazo/core";
import { BotAvatar, Button, Field, FieldLabel, Input, Switch } from "@rakazo/ui-web";
import { ChevronRight } from "lucide-react";
import type { RefObject } from "react";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { AccountAccess } from "../components/AccountAccess";
import { SuccessPop } from "../components/ai/primitives";
import { ComputersUnavailableHint } from "../components/ComputersUnavailableHint";
import { DesktopUpdateSection } from "../components/DesktopUpdates";
import { ListboxSelect } from "../components/ListboxSelect";
import { PasskeySettings } from "../components/PasskeySettings";
import {
  SettingsCard,
  SettingsDescription,
  SettingsGroup,
  SettingsRow,
  settingsPillClass,
} from "../components/SettingsLayout";
import type { ServerUpdateLoad } from "../components/SoftwareUpdateSection";
import { hasServerUpdates, SoftwareUpdateSection } from "../components/SoftwareUpdateSection";
import { authClient } from "../lib/auth";
import type { BotsSidebarDensity } from "../lib/bots-sidebar-density-pref";
import {
  getBotsSidebarDensity,
  setBotsSidebarDensity,
  subscribeBotsSidebarDensity,
} from "../lib/bots-sidebar-density-pref";
import type { ChatAccent } from "../lib/chat-accent";
import { getChatAccent, setChatAccent } from "../lib/chat-accent";
import {
  getComposerEnterToSend,
  setComposerEnterToSend,
  subscribeComposerEnterToSend,
} from "../lib/composer-enter-to-send-pref";
import { getActiveUiLocale, setUiLocale } from "../lib/i18n";
import { localTimezone, sameTimeZone, timezoneOptions, zoneTime } from "../lib/local-timezone";
import {
  getRemoteImagesPreference,
  setRemoteImagesPreference,
} from "../lib/remote-images-preference";
import {
  getResponseStreamingPreference,
  setResponseStreamingPreference,
} from "../lib/response-streaming";
import {
  getToolActivityPreference,
  setToolActivityPreference,
} from "../lib/tool-activity-preference";
import type { AppearancePreference } from "../lib/ui-appearance";
import { getUiAppearancePreference, setUiAppearance } from "../lib/ui-appearance";
import type { UiLocale } from "../lib/ui-locale";
import { UI_LOCALE_LABELS, UI_LOCALES } from "../lib/ui-locale";
import { authErrorText } from "../lib/user-error";

const USE_DEVICE_ZONE = "use-device:";

export type SettingsGeneralProps = {
  email?: string | null;
  name: string;
  avatarStyle: AvatarStyle;
  onAvatarStyleChange: (style: AvatarStyle) => Promise<void>;
  /** The user's saved IANA timezone, or null before one is set. */
  timezone?: string | null;
  onTimezoneChange?: (timezone: string) => Promise<void>;
  messagingEnabled?: boolean;
  onOpenMessaging?: () => void;
  isDeploymentOwner?: boolean;
};

export function GeneralSettingsPanels({
  email,
  name,
  avatarStyle,
  onAvatarStyleChange,
  timezone = null,
  onTimezoneChange,
  messagingEnabled = false,
  onOpenMessaging,
  isDeploymentOwner = false,
}: SettingsGeneralProps) {
  const { t } = useLingui();
  const account = accountDisplay({ name, email }, t`You`);
  const [accountSecurity, setAccountSecurity] = useState<AccountSecurity | null>(null);
  const [locale, setLocale] = useState<UiLocale>(() => getActiveUiLocale());
  const localeRequestRef = useRef(0);
  const [chatAccent, setChatAccentState] = useState<ChatAccent>(getChatAccent);
  const [appearance, setAppearance] = useState<AppearancePreference>(() =>
    getUiAppearancePreference(),
  );
  const sidebarDensity = useSyncExternalStore(
    subscribeBotsSidebarDensity,
    getBotsSidebarDensity,
    (): BotsSidebarDensity => "comfortable",
  );
  const [streamReplies, setStreamReplies] = useState(
    () => getResponseStreamingPreference() === "on",
  );
  const streamRepliesId = useId();
  const [showToolActivity, setShowToolActivity] = useState(
    () => getToolActivityPreference() === "on",
  );
  const showToolActivityId = useId();
  const enterToSend = useSyncExternalStore(
    subscribeComposerEnterToSend,
    getComposerEnterToSend,
    () => false,
  );
  const enterToSendId = useId();
  const [loadRemoteImages, setLoadRemoteImages] = useState(
    () => getRemoteImagesPreference() === "on",
  );
  const loadRemoteImagesId = useId();
  const [avatarPending, setAvatarPending] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [timezonePending, setTimezonePending] = useState(false);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const deviceTimezone = localTimezone();

  function chooseLocale(next: UiLocale) {
    if (next === locale) return;
    const requestId = ++localeRequestRef.current;
    setLocale(next);
    void setUiLocale(next).then((activated) => {
      if (requestId !== localeRequestRef.current) return;
      setLocale(activated);
    });
  }

  async function chooseAvatarStyle(next: AvatarStyle) {
    if (avatarPending || next === avatarStyle) return;
    setAvatarPending(true);
    setAvatarError(null);
    try {
      await onAvatarStyleChange(next);
    } catch {
      setAvatarError(t`Couldn't update avatars`);
    } finally {
      setAvatarPending(false);
    }
  }

  async function chooseTimezone(next: string) {
    if (!onTimezoneChange || timezonePending || next === timezone) return;
    setTimezonePending(true);
    setTimezoneError(null);
    try {
      await onTimezoneChange(next);
    } catch {
      setTimezoneError(t`Couldn't update your timezone`);
    } finally {
      setTimezonePending(false);
    }
  }

  const timezoneValue = timezone ?? deviceTimezone;
  const languageNames = new Intl.DisplayNames([locale], { type: "language" });

  return (
    <div className="space-y-7">
      <SettingsGroup label={<Trans>Account</Trans>}>
        <AccountAccess onSecurity={setAccountSecurity}>
          <div className="min-w-0">
            <p className="truncate text-[13px] leading-[19px] font-medium text-foreground">
              {account.label}
            </p>
            {email && account.label !== email ? (
              <SettingsDescription>{email}</SettingsDescription>
            ) : null}
          </div>
        </AccountAccess>
      </SettingsGroup>

      <PasskeySettings />

      <SettingsGroup label={<Trans>Appearance</Trans>}>
        <SettingsRow label={<Trans>Theme</Trans>}>
          <ListboxSelect
            testId="ui-appearance-select"
            label={t`Theme`}
            options={(["system", "light", "dark"] as const).map((option) => ({
              value: option,
              label:
                option === "system" ? t`Follow System` : option === "light" ? t`Light` : t`Dark`,
              testId: `ui-appearance-${option}`,
            }))}
            value={appearance}
            onChange={(next) => {
              setAppearance(next);
              setUiAppearance(next);
            }}
          />
        </SettingsRow>
        <SettingsRow label={<Trans>Accent</Trans>}>
          <ListboxSelect
            label={t`Accent`}
            options={[
              { value: "none", label: t`Black` },
              { value: "bot", label: t`Bot color` },
            ]}
            value={chatAccent}
            onChange={(next) => {
              setChatAccentState(next);
              setChatAccent(next);
            }}
          />
        </SettingsRow>
        <SettingsRow label={<Trans>Language</Trans>}>
          <ListboxSelect
            testId="ui-locale-select"
            label={t`Language`}
            options={UI_LOCALES.map((code) => ({
              value: code,
              label: UI_LOCALE_LABELS[code],
              detail: languageNames.of(code),
            }))}
            value={locale}
            onChange={chooseLocale}
            search={{
              placeholder: t`Search language`,
              clearLabel: t`Clear`,
              className: "w-[320px]",
            }}
          />
        </SettingsRow>
        <SettingsRow label={<Trans>Sidebar density</Trans>}>
          <ListboxSelect
            testId="bots-sidebar-density-select"
            label={t`Sidebar density`}
            options={[
              {
                value: "comfortable",
                label: t`Comfortable`,
                testId: "bots-sidebar-density-comfortable",
              },
              { value: "compact", label: t`Compact`, testId: "bots-sidebar-density-compact" },
            ]}
            value={sidebarDensity}
            onChange={setBotsSidebarDensity}
          />
        </SettingsRow>
        <SettingsRow
          label={<Trans>Avatars</Trans>}
          description={
            avatarError ? (
              <span role="alert" className="text-destructive">
                {avatarError}
              </span>
            ) : null
          }
        >
          <ListboxSelect
            testId="avatar-style-select"
            label={t`Avatars`}
            disabled={avatarPending}
            options={(["robot", "organic"] as const).map((style) => ({
              value: style,
              label: style === "robot" ? t`Robot` : t`Organic`,
              testId: `avatar-style-${style}`,
              icon: (
                <BotAvatar
                  color="#D9508A"
                  identity="avatar-style-preview"
                  size={16}
                  variant={style}
                />
              ),
            }))}
            value={avatarStyle}
            onChange={(next) => void chooseAvatarStyle(next)}
          />
        </SettingsRow>
      </SettingsGroup>

      {(messagingEnabled && onOpenMessaging) || isDeploymentOwner ? (
        <SettingsGroup>
          {messagingEnabled && onOpenMessaging ? (
            <SettingsRow label={<Trans>Messaging</Trans>}>
              <Button
                variant="secondary"
                className={settingsPillClass}
                aria-label={t`Manage messaging settings`}
                onClick={onOpenMessaging}
              >
                <Trans>Manage</Trans>
              </Button>
            </SettingsRow>
          ) : null}
          {isDeploymentOwner ? (
            <SettingsRow label={<Trans>Server integrations</Trans>}>
              <Button
                variant="secondary"
                className={settingsPillClass}
                nativeButton={false}
                render={<Link to="/integrations/setup" />}
              >
                <Trans>Manage</Trans>
              </Button>
            </SettingsRow>
          ) : null}
        </SettingsGroup>
      ) : null}

      {onTimezoneChange ? (
        <SettingsGroup label={<Trans>Bot</Trans>} testId="timezone-settings">
          <SettingsRow
            label={<Trans>Timezone</Trans>}
            description={
              timezoneError ? (
                <span role="alert" className="text-destructive">
                  {timezoneError}
                </span>
              ) : null
            }
          >
            <ListboxSelect
              testId="timezone-select"
              label={t`Timezone`}
              disabled={timezonePending}
              options={[
                ...(!timezone || !sameTimeZone(timezone, deviceTimezone)
                  ? [
                      {
                        // Its own value, so the trigger and the check stay on the saved zone.
                        value: `${USE_DEVICE_ZONE}${deviceTimezone}`,
                        label: t({
                          message: `Use ${deviceTimezone.replaceAll("_", " ")}`,
                          comment:
                            "Switches the saved timezone to this device's, e.g. 'Use Pacific/Auckland'",
                        }),
                        testId: "timezone-use-device",
                      },
                    ]
                  : []),
                ...timezoneOptions(timezoneValue).map((zone) => ({
                  value: zone,
                  label: zone.replaceAll("_", " "),
                })),
              ]}
              value={timezoneValue}
              onChange={(next) => void chooseTimezone(next.replace(USE_DEVICE_ZONE, ""))}
              renderDetail={(zone) => zoneTime(zone.replace(USE_DEVICE_ZONE, ""), locale)}
              search={{
                placeholder: t`Search timezone`,
                clearLabel: t`Clear`,
                className: "w-[424px]",
              }}
            />
          </SettingsRow>
        </SettingsGroup>
      ) : null}

      <details data-testid="advanced-settings" className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 px-2 text-[12px] leading-4 text-muted-foreground outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring">
          <Trans>Advanced</Trans>
          <ChevronRight
            aria-hidden="true"
            className="size-3 transition-transform group-open:rotate-90"
          />
        </summary>
        <SettingsCard className="mt-2">
          <SettingsRow label={<Trans>Send with Enter</Trans>} htmlFor={enterToSendId}>
            <Switch
              id={enterToSendId}
              data-testid="composer-enter-to-send-toggle"
              checked={enterToSend}
              onCheckedChange={(checked) => setComposerEnterToSend(checked)}
            />
          </SettingsRow>
          <SettingsRow label={<Trans>Stream replies</Trans>} htmlFor={streamRepliesId}>
            <Switch
              id={streamRepliesId}
              data-testid="response-streaming-toggle"
              checked={streamReplies}
              onCheckedChange={(checked) => {
                setStreamReplies(checked);
                setResponseStreamingPreference(checked ? "on" : "off");
              }}
            />
          </SettingsRow>
          <SettingsRow label={<Trans>Show tool activity</Trans>} htmlFor={showToolActivityId}>
            <Switch
              id={showToolActivityId}
              data-testid="tool-activity-toggle"
              checked={showToolActivity}
              onCheckedChange={(checked) => {
                setShowToolActivity(checked);
                setToolActivityPreference(checked ? "on" : "off");
              }}
            />
          </SettingsRow>
          <SettingsRow
            label={<Trans>Load web images automatically</Trans>}
            htmlFor={loadRemoteImagesId}
          >
            <Switch
              id={loadRemoteImagesId}
              data-testid="remote-images-toggle"
              checked={loadRemoteImages}
              onCheckedChange={(checked) => {
                setLoadRemoteImages(checked);
                setRemoteImagesPreference(checked ? "on" : "off");
              }}
            />
          </SettingsRow>
        </SettingsCard>
      </details>

      {accountSecurity?.hasPassword && accountSecurity.passwordChangeEnabled !== false ? (
        <ChangePasswordSection email={email} />
      ) : null}
    </div>
  );
}

export function UsageSettingsPanel({
  usage,
  panelRef,
}: {
  usage?: {
    runs: number;
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens?: number | null;
  } | null;
  panelRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={panelRef} tabIndex={-1} data-testid="usage-settings" className="outline-none">
      {usage ? (
        <SettingsCard>
          <SettingsRow
            label={
              <Trans>
                {usage.runs} runs · {usage.totalTokens ?? "—"} tokens
              </Trans>
            }
          />
        </SettingsCard>
      ) : null}
      <p className={`px-2 text-[12px] leading-4 text-muted-foreground ${usage ? "mt-2" : ""}`}>
        <Trans>Model spend uses your provider keys.</Trans>
      </p>
    </div>
  );
}

export function ComputerSettingsPanel({
  sandboxProvider,
  onSandboxProviderChange,
  onRecoveryDismissed,
}: {
  sandboxProvider?: string | null;
  onSandboxProviderChange?: (sandboxProvider: string) => void;
  onRecoveryDismissed?: () => void;
}) {
  return (
    <SettingsGroup label={<Trans>Computers</Trans>} testId="computers-setup-settings">
      <ComputersUnavailableHint
        className="px-3.5 py-2.5 text-[12.5px] leading-[19px] text-description"
        sandboxProvider={sandboxProvider}
        onRecovered={onSandboxProviderChange}
        onRecoveryDismissed={onRecoveryDismissed}
      />
    </SettingsGroup>
  );
}

export function UpdatesSettingsPanel({ serverUpdate }: { serverUpdate: ServerUpdateLoad }) {
  return (
    <div className="space-y-7">
      <DesktopUpdateSection />
      {hasServerUpdates(serverUpdate) ? <SoftwareUpdateSection load={serverUpdate} /> : null}
    </div>
  );
}

function ChangePasswordSection({ email }: { email?: string | null }) {
  const { t } = useLingui();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changePassword() {
    if (pending) return;
    if (newPassword !== confirmation) {
      setError(t`Passwords do not match`);
      return;
    }
    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        setError(authErrorText(result.error, t`Could not change password`));
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setSaved(true);
    } catch {
      setError(t`Could not reach the server`);
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsGroup label={<Trans>Password</Trans>}>
      <div className="grid gap-3 px-3.5 py-2.5">
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={email ?? ""}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        />
        <SettingsPasswordInput
          label={t`Current password`}
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
        <SettingsPasswordInput
          label={t`New password`}
          autoComplete="new-password"
          value={newPassword}
          onChange={setNewPassword}
        />
        <SettingsPasswordInput
          label={t`Confirm password`}
          autoComplete="new-password"
          value={confirmation}
          onChange={setConfirmation}
        />
      </div>
      {error ? (
        <p role="alert" className="px-3.5 text-[12.5px] leading-[19px] text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-3 px-3.5 py-2.5">
        {saved ? <SuccessPop label={t`Password updated`} /> : null}
        <Button
          className={settingsPillClass}
          disabled={pending || !currentPassword || !newPassword}
          onClick={() => void changePassword()}
        >
          {pending ? <Trans>Changing…</Trans> : <Trans>Change password</Trans>}
        </Button>
      </div>
    </SettingsGroup>
  );
}

function SettingsPasswordInput({
  label,
  autoComplete,
  value,
  onChange,
}: {
  label: string;
  autoComplete: "current-password" | "new-password";
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id} className="text-[12.5px] font-normal">
        {label}
      </FieldLabel>
      <Input
        id={id}
        className="h-[35px] rounded-[8px] md:text-[12.5px]"
        type="password"
        autoComplete={autoComplete}
        minLength={autoComplete === "new-password" ? MIN_PASSWORD_LENGTH : undefined}
        maxLength={MAX_PASSWORD_LENGTH}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}
