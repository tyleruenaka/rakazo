import { Trans, useLingui } from "@lingui/react/macro";
import type {
  AgentSkillCatalogEntry,
  Bot,
  ComputerMode,
  Me,
  ModelCatalogEntry,
  ModelCredential,
  ThinkingLevel,
  VoiceInfo,
} from "@rakazo/contracts";
import {
  BOT_COMPUTER_MODES,
  BOT_DESCRIPTION_MAX_LENGTH,
  BOT_NAME_MAX_LENGTH,
  BOT_TITLE_MAX_LENGTH,
  BUILTIN_TOOL_NAMES,
  isBuiltinToolName,
} from "@rakazo/contracts";
import {
  chatModelChoices,
  connectedModelChoices,
  credentialForModel,
  MODEL_SEARCH_THRESHOLD,
  modelOptionKey,
  parseModelOptionKey,
  resolveSelectableModelId,
} from "@rakazo/core";
import {
  Button,
  Input,
  NativeSelect,
  NativeSelectOption,
  Switch,
  Textarea,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@rakazo/ui-web";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@rakazo/ui-web/components/ui/collapsible";
import { ChevronRight, Download, Eraser, Settings, X } from "lucide-react";
import { Suspense, useEffect, useId, useRef, useState } from "react";
import { ErrorBoundary, SectionLoadFailed } from "../../components/ErrorBoundary";
import { InfoTooltip } from "../../components/InfoTooltip";
import { InstructionSettings } from "../../components/InstructionSettings";
import { ListboxSelect } from "../../components/ListboxSelect";
import {
  SettingsCard,
  SettingsGroup,
  SettingsRow,
  settingsNativeSelectClass,
} from "../../components/SettingsLayout";
import { TextOnlyMark } from "../../components/TextOnlyMark";
import { botProfilePatch } from "../../lib/bot-profile-patch";
import { thinkingLevelLabel } from "../../lib/model-catalog";
import { lazyComponent } from "../../lib/preload-recovery";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";
import { AvatarStudioPopover } from "./avatar-studio-popover";
import { BotCredentialsSection } from "./bot-credentials";

const ScratchpadSection = lazyComponent(() =>
  import("../ScratchpadSection").then((module) => module.ScratchpadSection),
);

const KnowledgeSection = lazyComponent(() =>
  import("../KnowledgeSection").then((module) => module.KnowledgeSection),
);

const rowLabelClass = "text-[14px] text-muted-foreground";
const fieldLabelClass = `mt-4 block ${rowLabelClass}`;

function ComputerModePicker({
  value,
  onChange,
  teamTestId,
  privateTestId,
}: {
  value: ComputerMode;
  onChange: (value: ComputerMode) => void;
  teamTestId?: string;
  privateTestId?: string;
}) {
  return (
    <div className="mt-4">
      <div className="text-[14px] text-muted-foreground">
        <Trans>Computer</Trans>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {BOT_COMPUTER_MODES.map((mode) => (
          <Toggle
            key={mode}
            variant="outline"
            pressed={value === mode}
            data-testid={mode === "team" ? teamTestId : privateTestId}
            onPressedChange={(pressed) => {
              if (pressed) onChange(mode);
            }}
            className="capitalize aria-pressed:border-foreground/40 aria-pressed:text-foreground"
          >
            {mode === "team" ? <Trans>Team</Trans> : <Trans>Private</Trans>}
          </Toggle>
        ))}
      </div>
    </div>
  );
}

export function CreateBotForm({
  onCreate,
  onCancel,
}: {
  onCreate: (input: {
    name: string;
    title: string;
    description: string;
    computerMode: ComputerMode;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const ids = useId();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [computerMode, setComputerMode] = useState<ComputerMode>("team");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        title: title.trim(),
        description: description.trim(),
        computerMode,
      });
    } catch (err) {
      setError(errorText(err, t`Could not create bot`));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-testid="create-bot-form">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[14px] font-medium text-foreground">
          <Trans>New bot</Trans>
        </span>
        <Button variant="ghost" size="icon-sm" aria-label={t`Cancel new bot`} onClick={onCancel}>
          <X size={16} strokeWidth={1.8} />
        </Button>
      </div>
      {error ? (
        <p
          role="alert"
          data-testid="create-bot-error"
          className="mb-3 text-[13px] text-destructive"
        >
          {error}
        </p>
      ) : null}
      <label htmlFor={`${ids}-name`} className="mt-6 block text-[14px] text-muted-foreground">
        <Trans>Name</Trans>
        <Input
          id={`${ids}-name`}
          value={name}
          maxLength={BOT_NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value)}
          placeholder={t`Name this bot`}
          className="mt-2"
        />
      </label>
      <label htmlFor={`${ids}-title`} className={fieldLabelClass}>
        <Trans>Title</Trans>
        <Input
          id={`${ids}-title`}
          value={title}
          maxLength={BOT_TITLE_MAX_LENGTH}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t`Describe what this bot does`}
          className="mt-2"
        />
      </label>
      <label htmlFor={`${ids}-description`} className={fieldLabelClass}>
        <Trans>Description</Trans>
        <Textarea
          id={`${ids}-description`}
          value={description}
          maxLength={BOT_DESCRIPTION_MAX_LENGTH}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t`What this bot is for`}
          rows={4}
          className="mt-2"
        />
      </label>
      <div data-testid="create-bot-computer">
        <ComputerModePicker
          value={computerMode}
          onChange={setComputerMode}
          teamTestId="create-bot-team"
          privateTestId="create-bot-private"
        />
      </div>
      <Button
        className="mt-5"
        disabled={!name.trim() || submitting}
        onClick={() => void handleSubmit()}
      >
        {submitting ? <Trans>Creating…</Trans> : <Trans>Create</Trans>}
      </Button>
    </div>
  );
}

export function BotSettings({
  bot,
  memoryProviderConfigured,
  onSkillsChange,
  onSave,
  onExport,
  onClear,
  focusModel = 0,
  onOpenConnections,
}: {
  bot: Bot;
  /** Changes each time something asks to open Advanced at the model row. */
  focusModel?: number;
  onOpenConnections?: () => void;
  onSkillsChange: (skills: AgentSkillCatalogEntry[]) => void;
  memoryProviderConfigured: boolean;
  onSave: (patch: {
    name?: string;
    title?: string;
    description?: string;
    instructions?: string;
    color?: string;
    notifyOnFinish?: boolean;
    computerMode?: ComputerMode;
    memoryScope?: "isolated" | "shared" | null;
    autoSpeak?: boolean;
    fleetManagement?: boolean;
    voiceId?: string | null;
    modelProvider?: string | null;
    modelId?: string | null;
    thinkingLevel?: ThinkingLevel | null;
    disabledBuiltinTools?: string[];
  }) => Promise<void>;
  onExport: () => Promise<void>;
  onClear: () => void;
}) {
  const { t } = useLingui();
  const ids = useId();
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(focusModel));
  const modelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusModel) setAdvancedOpen(true);
  }, [focusModel]);
  useEffect(() => {
    if (focusModel && advancedOpen) {
      modelRef.current?.scrollIntoView?.({ block: "nearest" });
      modelRef.current?.querySelector<HTMLElement>('[data-testid="bot-model-select"]')?.focus();
    }
  }, [advancedOpen, focusModel]);
  const [name, setName] = useState(bot.name);
  const [title, setTitle] = useState(bot.title);
  const savedNameRef = useRef(bot.name);
  const savedTitleRef = useRef(bot.title);
  const [description, setDescription] = useState(bot.description);
  // A roster refresh can skip replacing bots while a reorder is in flight, so
  // this prop keeps the description from when the panel opened. Later saves
  // compare against the description last saved here; otherwise a model or
  // voice change treats that stale text as an edit and overwrites instructions.
  const savedDescriptionRef = useRef(bot.description ?? "");
  const [color, setColor] = useState(bot.color);
  const [notifyOnFinish, setNotifyOnFinish] = useState(bot.notifyOnFinish ?? true);
  const acceptedAutomatic = useRef({
    color: bot.color,
    notifyOnFinish: bot.notifyOnFinish ?? true,
  });
  const automaticRevision = useRef({ color: 0, notifyOnFinish: 0 });
  const [computerMode, setComputerMode] = useState(bot.computerMode);
  const [memoryScope, setMemoryScope] = useState(bot.memoryScope);
  const [autoSpeak, setAutoSpeak] = useState(bot.autoSpeak);
  const [fleetManagement, setFleetManagement] = useState(bot.fleetManagement);
  useEffect(() => setFleetManagement(bot.fleetManagement), [bot.fleetManagement]);
  const fleetLabel = bot.primary ? t`Manage all bots` : t`Manage nested bots`;
  const [voiceId, setVoiceId] = useState(bot.voiceId ?? "");
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [modelKey, setModelKey] = useState(
    bot.modelProvider && bot.modelId ? modelOptionKey(bot.modelProvider, bot.modelId) : "",
  );
  const [thinkingLevel, setThinkingLevel] = useState(bot.thinkingLevel ?? "");
  const [disabledBuiltinTools, setDisabledBuiltinTools] = useState<string[]>(
    bot.disabledBuiltinTools ?? [],
  );
  // The list on screen is updated before the save returns. This stays on the
  // last list the server accepted so a rejection can undo that preview.
  const persistedDisabledToolsRef = useRef(disabledBuiltinTools);
  const serverDisabledToolsRef = useRef(disabledBuiltinTools);
  const pendingSavesRef = useRef(0);
  useEffect(() => {
    const next = bot.disabledBuiltinTools ?? [];
    if (serverDisabledToolsRef.current === next) return;
    serverDisabledToolsRef.current = next;
    persistedDisabledToolsRef.current = next;
    if (pendingSavesRef.current === 0) setDisabledBuiltinTools(next);
  }, [bot.disabledBuiltinTools]);
  const [credentials, setCredentials] = useState<ModelCredential[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [modelMetaReady, setModelMetaReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveQueueRef = useRef(Promise.resolve());
  const executeSaveRef = useRef<
    (
      patchOverrides?: {
        name?: string;
        title?: string;
        description?: string;
        color?: string;
        notifyOnFinish?: boolean;
        fleetManagement?: boolean;
        disabledBuiltinTools?: string[];
        baseDisabledBuiltinTools?: string[];
      },
      revisions?: { color: number; notifyOnFinish: number },
    ) => Promise<void>
  >(async () => undefined);
  useEffect(() => {
    void rpc.voice
      .voices({})
      .then(setVoices)
      .catch(() => setVoices([]));
    void Promise.all([rpc.models.credentials(), rpc.models.list(), rpc.me()])
      .then(([nextCredentials, nextCatalog, nextMe]) => {
        setCredentials(nextCredentials);
        setCatalog(nextCatalog);
        setMe(nextMe);
        // Only mark ready on success — a failed catalog load must not clear
        // an existing thinkingLevel override on save.
        setModelMetaReady(true);
      })
      .catch(() => undefined);
  }, []);

  const connectedOptions = connectedModelChoices(credentials, catalog);
  const storedModel = modelKey ? parseModelOptionKey(modelKey) : null;
  const selectedModel = storedModel
    ? {
        provider: storedModel.provider,
        modelId: resolveSelectableModelId(catalog, storedModel.provider, storedModel.modelId),
      }
    : null;
  const selectedModelKey = selectedModel
    ? modelOptionKey(selectedModel.provider, selectedModel.modelId)
    : "";

  const defaultEntry = me?.defaultModel
    ? catalogEntry(catalog, me.defaultProvider, me.defaultModel)
    : undefined;
  const modelChoices = chatModelChoices(
    connectedOptions,
    selectedModelKey,
    me?.defaultModel
      ? `${t`Space default`} (${defaultEntry?.label ?? me.defaultModel})`
      : t`Space default`,
    defaultEntry?.images,
  );

  const effectiveProvider = selectedModel?.provider ?? me?.defaultProvider ?? null;
  const effectiveModelId = selectedModel?.modelId ?? me?.defaultModel ?? null;
  const effectiveEntry =
    effectiveProvider && effectiveModelId
      ? catalog.find(
          (entry) =>
            entry.provider === effectiveProvider &&
            resolveSelectableModelId(catalog, entry.provider, entry.id) === effectiveModelId,
        )
      : undefined;
  const effectiveCredential = credentialForModel(credentials, effectiveProvider, effectiveModelId);
  const thinkingOptions = (
    effectiveCredential?.thinkingLevels ??
    effectiveEntry?.thinkingLevels ??
    []
  ).filter((level) => level !== "off");
  const defaultThinkingLevel = effectiveCredential?.thinkingLevel ?? "medium";

  async function executeSave(
    patchOverrides?: {
      name?: string;
      title?: string;
      description?: string;
      color?: string;
      notifyOnFinish?: boolean;
      fleetManagement?: boolean;
      disabledBuiltinTools?: string[];
      baseDisabledBuiltinTools?: string[];
    },
    revisions?: { color: number; notifyOnFinish: number },
  ) {
    try {
      setSaving(true);
      setError(null);
      if (patchOverrides?.fleetManagement !== undefined) {
        await onSave({ fleetManagement: patchOverrides.fleetManagement });
        return;
      }
      const selected = selectedModel;
      const nextName = (patchOverrides?.name !== undefined ? patchOverrides.name : name).trim();
      const nextTitle = (patchOverrides?.title !== undefined ? patchOverrides.title : title).trim();
      const nextDescription = (
        patchOverrides?.description !== undefined ? patchOverrides.description : description
      ).trim();
      const nextColor = patchOverrides?.color !== undefined ? patchOverrides.color : color;
      const nextNotify =
        patchOverrides?.notifyOnFinish !== undefined
          ? patchOverrides.notifyOnFinish
          : notifyOnFinish;

      if (nextName) setName(nextName);
      setTitle(nextTitle);
      setDescription(nextDescription);
      const patch = {
        ...(nextName && nextName !== savedNameRef.current.trim() ? { name: nextName } : {}),
        ...(nextTitle !== savedTitleRef.current.trim() ? { title: nextTitle } : {}),
        // Keep untouched profile fields off the wire.
        ...botProfilePatch(savedDescriptionRef.current, nextDescription),
        // Unchanged color stays off the wire so a legacy named value cannot fail a name save.
        ...(nextColor !== acceptedAutomatic.current.color ? { color: nextColor } : {}),
        notifyOnFinish: nextNotify,
        computerMode,
        memoryScope,
        autoSpeak,
        voiceId: voiceId || null,
        modelProvider: selected?.provider ?? null,
        modelId: selected?.modelId ?? null,
        ...(modelMetaReady &&
        (thinkingOptions.length > 0 ||
          (selected?.provider ?? null) !== bot.modelProvider ||
          (selected?.modelId ?? null) !== bot.modelId)
          ? {
              thinkingLevel: thinkingOptions.length
                ? ((thinkingLevel || null) as ThinkingLevel | null)
                : null,
            }
          : {}),
      };
      const requestedTools = patchOverrides?.disabledBuiltinTools;
      const baseTools = patchOverrides?.baseDisabledBuiltinTools ?? [];
      // Preserve this edit's additions/removals against any refreshed server list.
      // Retry if a refresh arrives while the request is in flight.
      for (;;) {
        const serverTools = serverDisabledToolsRef.current;
        const nextTools =
          requestedTools === undefined
            ? undefined
            : [
                ...persistedDisabledToolsRef.current.filter(
                  (name) => !baseTools.includes(name) || requestedTools.includes(name),
                ),
                ...requestedTools.filter(
                  (name) =>
                    !baseTools.includes(name) && !persistedDisabledToolsRef.current.includes(name),
                ),
              ];
        // Unrelated saves omit the list, preserving changes from other sessions.
        await onSave({
          ...patch,
          ...(nextTools !== undefined ? { disabledBuiltinTools: nextTools } : {}),
        });
        if (nextTools === undefined) break;
        if (
          serverTools !== serverDisabledToolsRef.current &&
          !sameStringList(nextTools, serverDisabledToolsRef.current)
        )
          continue;
        persistedDisabledToolsRef.current = nextTools;
        break;
      }
      if (nextName) savedNameRef.current = nextName;
      savedTitleRef.current = nextTitle;
      savedDescriptionRef.current = nextDescription;
      acceptedAutomatic.current = { color: nextColor, notifyOnFinish: nextNotify };
    } catch (err) {
      // Roll back only when no newer edit of the same field is queued.
      if (
        patchOverrides?.color !== undefined &&
        revisions?.color === automaticRevision.current.color
      )
        setColor(acceptedAutomatic.current.color);
      if (
        patchOverrides?.notifyOnFinish !== undefined &&
        revisions?.notifyOnFinish === automaticRevision.current.notifyOnFinish
      )
        setNotifyOnFinish(acceptedAutomatic.current.notifyOnFinish);
      if (patchOverrides?.fleetManagement !== undefined)
        setFleetManagement(!patchOverrides.fleetManagement);
      setError(errorText(err, t`Could not save`));
    } finally {
      pendingSavesRef.current -= 1;
      if (pendingSavesRef.current === 0) {
        setDisabledBuiltinTools([...persistedDisabledToolsRef.current]);
      }
      setSaving(pendingSavesRef.current > 0);
    }
  }
  executeSaveRef.current = executeSave;

  function disableBuiltinTool(raw: string) {
    const name = raw.trim();
    if (!name) return;
    if (!isBuiltinToolName(name)) return;
    setError(null);
    if (disabledBuiltinTools.includes(name)) return;
    const next = [...disabledBuiltinTools, name];
    setDisabledBuiltinTools(next);
    void enqueueSave({ disabledBuiltinTools: next });
  }

  function enqueueSave(patchOverrides?: {
    name?: string;
    title?: string;
    description?: string;
    color?: string;
    notifyOnFinish?: boolean;
    fleetManagement?: boolean;
    disabledBuiltinTools?: string[];
  }) {
    // Serialize full-object auto-saves so an older in-flight request cannot
    // finish after a newer one and clobber fields. Always call through a ref so
    // queued work reads the latest field values, not a stale render closure.
    pendingSavesRef.current += 1;
    if (patchOverrides?.color !== undefined) automaticRevision.current.color += 1;
    if (patchOverrides?.notifyOnFinish !== undefined) automaticRevision.current.notifyOnFinish += 1;
    const revisions = { ...automaticRevision.current };
    const queuedPatch =
      patchOverrides?.disabledBuiltinTools === undefined
        ? patchOverrides
        : {
            ...patchOverrides,
            baseDisabledBuiltinTools: [...persistedDisabledToolsRef.current],
          };
    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(() => executeSaveRef.current(queuedPatch, revisions));
    return saveQueueRef.current;
  }

  return (
    <div data-testid="bot-settings">
      <div data-testid="bot-profile-header">
        <div className="flex justify-center py-4">
          <AvatarStudioPopover
            value={color}
            identity={bot.id}
            status={bot.status}
            size={76}
            onChange={(newColor) => {
              setColor(newColor);
              void enqueueSave({ color: newColor });
            }}
          />
        </div>
        <label htmlFor={`${ids}-name`} className={fieldLabelClass}>
          <Trans>Name</Trans>
          <Input
            id={`${ids}-name`}
            value={name}
            maxLength={BOT_NAME_MAX_LENGTH}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void enqueueSave()}
            className="mt-1.5"
          />
        </label>
        <label htmlFor={`${ids}-title`} className={fieldLabelClass}>
          <Trans>Title</Trans>
          <Input
            id={`${ids}-title`}
            value={title}
            maxLength={BOT_TITLE_MAX_LENGTH}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void enqueueSave()}
            placeholder={t`e.g. Hivenet Agent, Presales, Timesheets bot`}
            className="mt-1.5"
          />
        </label>
        <label htmlFor={`${ids}-description`} className={fieldLabelClass}>
          <Trans>Description</Trans>
          <Textarea
            id={`${ids}-description`}
            value={description}
            maxLength={BOT_DESCRIPTION_MAX_LENGTH}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => void enqueueSave()}
            rows={3}
            className="mt-1.5"
          />
        </label>
      </div>
      <div className="mt-6 space-y-7">
        <InstructionSettings key={bot.id} bot={bot} />
        <SettingsGroup label={<Trans>Notifications</Trans>}>
          <SettingsRow
            label={<Trans>When it finishes or needs input</Trans>}
            labelId={`${ids}-notify-finish-label`}
            htmlFor={`${ids}-notify-finish`}
          >
            <Switch
              id={`${ids}-notify-finish`}
              checked={notifyOnFinish}
              aria-labelledby={`${ids}-notify-finish-label`}
              onCheckedChange={(checked) => {
                setNotifyOnFinish(checked);
                void enqueueSave({ notifyOnFinish: checked });
              }}
            />
          </SettingsRow>
        </SettingsGroup>
        <ErrorBoundary fallback={<SectionLoadFailed />}>
          <Suspense fallback={null}>
            <ScratchpadSection botId={bot.id} />
          </Suspense>
        </ErrorBoundary>
        <ErrorBoundary fallback={<SectionLoadFailed />}>
          <Suspense fallback={null}>
            <KnowledgeSection botId={bot.id} onSkillsChange={onSkillsChange} />
          </Suspense>
        </ErrorBoundary>
        <Collapsible
          open={advancedOpen}
          onOpenChange={setAdvancedOpen}
          data-testid="bot-settings-advanced"
        >
          <h3 className="px-2 text-[12px] leading-4 text-muted-foreground">
            <CollapsibleTrigger className="group flex w-fit cursor-pointer items-center gap-1 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring">
              <Trans>Advanced</Trans>
              <ChevronRight
                aria-hidden="true"
                className="size-3 transition-transform group-aria-expanded:rotate-90 motion-reduce:transition-none"
              />
            </CollapsibleTrigger>
          </h3>
          <CollapsibleContent>
            <div className="space-y-7 pt-4">
              <div ref={modelRef}>
                <SettingsCard>
                  <SettingsRow label={<Trans>Model</Trans>}>
                    <div className="flex min-w-0 items-center gap-1">
                      {/* min-w-0 lets a long model name truncate instead of pushing the gear past the card. */}
                      <div className="min-w-0">
                        <ListboxSelect
                          label={t`Model`}
                          testId="bot-model-select"
                          options={modelChoices.map((choice) => ({
                            value: choice.key,
                            label: choice.label,
                            detail: choice.detail,
                            mark: choice.images === false ? <TextOnlyMark size={13} /> : undefined,
                            markDescription:
                              choice.images === false ? t`Can't read images` : undefined,
                          }))}
                          value={selectedModelKey}
                          onChange={(next) => {
                            setModelKey(next);
                            setThinkingLevel("");
                          }}
                          search={
                            modelChoices.length > MODEL_SEARCH_THRESHOLD
                              ? {
                                  placeholder: t`Search models`,
                                  clearLabel: t`Clear`,
                                  className: "w-[320px]",
                                }
                              : undefined
                          }
                        />
                      </div>
                      {onOpenConnections ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={t`Model connections`}
                                onClick={onOpenConnections}
                                className="shrink-0 text-muted-foreground"
                              />
                            }
                          >
                            <Settings size={14} strokeWidth={1.6} />
                          </TooltipTrigger>
                          <TooltipContent side="bottom">{t`Model connections`}</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                  </SettingsRow>
                  {thinkingOptions.length ? (
                    <SettingsRow label={<Trans>Thinking</Trans>}>
                      <ListboxSelect
                        label={t`Thinking`}
                        options={[
                          {
                            value: "",
                            label: t`Default (${thinkingLevelLabel(defaultThinkingLevel)})`,
                          },
                          ...thinkingOptions.map((level) => ({
                            value: level,
                            label: thinkingLevelLabel(level),
                          })),
                        ]}
                        value={thinkingLevel}
                        onChange={setThinkingLevel}
                      />
                    </SettingsRow>
                  ) : null}
                  <SettingsRow label={<Trans>Computer</Trans>}>
                    <ListboxSelect
                      label={t`Computer`}
                      options={BOT_COMPUTER_MODES.map((mode) => ({
                        value: mode,
                        label: mode === "team" ? t`Team` : t`Private`,
                      }))}
                      value={computerMode}
                      onChange={setComputerMode}
                    />
                  </SettingsRow>
                  {memoryProviderConfigured ? (
                    <SettingsRow label={<Trans>Memory scope</Trans>}>
                      <ListboxSelect
                        label={t`Memory scope`}
                        options={[
                          { value: "inherit", label: t`Inherit default` },
                          { value: "isolated", label: t`Isolated` },
                          { value: "shared", label: t`Shared` },
                        ]}
                        value={memoryScope ?? "inherit"}
                        onChange={(next) => setMemoryScope(next === "inherit" ? null : next)}
                      />
                    </SettingsRow>
                  ) : null}
                </SettingsCard>
              </div>
              <SettingsCard>
                <SettingsRow
                  label={<Trans>Read replies aloud</Trans>}
                  htmlFor={`${ids}-auto-speak`}
                >
                  <Switch
                    id={`${ids}-auto-speak`}
                    checked={autoSpeak}
                    onCheckedChange={(checked) => setAutoSpeak(checked)}
                  />
                </SettingsRow>
                {voices.length ? (
                  <SettingsRow label={<Trans>Voice</Trans>}>
                    <ListboxSelect
                      label={t`Voice`}
                      options={[
                        { value: "", label: t`Account default` },
                        ...voices.map((voice) => ({ value: voice.id, label: voice.label })),
                      ]}
                      value={voiceId}
                      onChange={setVoiceId}
                    />
                  </SettingsRow>
                ) : null}
                <SettingsRow
                  label={
                    <span className="flex items-center gap-1">
                      <label htmlFor={`${ids}-fleet-management`}>{fleetLabel}</label>
                      <InfoTooltip label={fleetLabel}>
                        {t`Organize the sidebar and edit bots. Instruction, model, routine and group edits need approval.`}
                      </InfoTooltip>
                    </span>
                  }
                >
                  <Switch
                    id={`${ids}-fleet-management`}
                    checked={fleetManagement}
                    disabled={saving}
                    onCheckedChange={(checked) => {
                      setFleetManagement(checked);
                      void enqueueSave({ fleetManagement: checked });
                    }}
                  />
                </SettingsRow>
              </SettingsCard>
              <SettingsGroup label={<Trans>Tools</Trans>} testId="bot-settings-tools">
                <div className="px-3.5 py-2.5">
                  <NativeSelect
                    id={`${ids}-disabled-tools`}
                    aria-label={t`Disable a tool`}
                    value=""
                    onChange={(event) => disableBuiltinTool(event.target.value)}
                    className={`w-full ${settingsNativeSelectClass}`}
                  >
                    <NativeSelectOption value="">{t`Disable a tool`}</NativeSelectOption>
                    {BUILTIN_TOOL_NAMES.filter(
                      (toolName) => !disabledBuiltinTools.includes(toolName),
                    ).map((toolName) => (
                      <NativeSelectOption key={toolName} value={toolName}>
                        {humanizeTool(toolName)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                {disabledBuiltinTools.map((toolName) => (
                  <SettingsRow key={toolName} label={humanizeTool(toolName)}>
                    <Button
                      id={`${ids}-disabled-${toolName}`}
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t`Enable ${humanizeTool(toolName)}`}
                      title={t`Enable ${humanizeTool(toolName)}`}
                      className="text-muted-foreground"
                      onClick={() => {
                        const next = disabledBuiltinTools.filter((entry) => entry !== toolName);
                        setDisabledBuiltinTools(next);
                        void enqueueSave({ disabledBuiltinTools: next });
                      }}
                    >
                      <X />
                    </Button>
                  </SettingsRow>
                ))}
              </SettingsGroup>
              <BotCredentialsSection botId={bot.id} />
              <ErrorBoundary fallback={<SectionLoadFailed />}>
                <Suspense fallback={null}>
                  <KnowledgeSection botId={bot.id} onSkillsChange={onSkillsChange} skillsOnly />
                </Suspense>
              </ErrorBoundary>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
      {error ? <p className="mt-2 text-[13px] text-destructive">{error}</p> : null}
      <div className="mt-5 flex items-center gap-3">
        <Button
          disabled={saving}
          onClick={() => {
            void enqueueSave({
              name,
              title,
              description,
              color,
              notifyOnFinish,
            });
          }}
        >
          <Trans>Save</Trans>
        </Button>
        <div className="ms-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t`Export`}
                  onClick={() => void onExport()}
                />
              }
            >
              <Download size={16} strokeWidth={1.6} />
            </TooltipTrigger>
            <TooltipContent side="bottom">{t`Export`}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  aria-label={t`Clear conversation`}
                  onClick={onClear}
                />
              }
            >
              <Eraser size={16} strokeWidth={1.6} />
            </TooltipTrigger>
            <TooltipContent side="bottom">{t`Clear conversation`}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function sameStringList(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function catalogEntry(
  catalog: ModelCatalogEntry[],
  provider: string | null | undefined,
  modelId: string,
) {
  if (!provider) return undefined;
  return catalog.find((entry) => entry.provider === provider && entry.id === modelId);
}

function humanizeTool(name: string) {
  const words = name.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
