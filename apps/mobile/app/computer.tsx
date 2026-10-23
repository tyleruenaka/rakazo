import type { ComputerReleaseReason } from "@rakazo/contracts";
import { displayName } from "@rakazo/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Modal, Pressable, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { BotAvatar } from "../components/bot-avatar";
import { ComputerKeyboardBar } from "../components/computer-keyboard-bar";
import { ComputerMaintenanceActions } from "../components/computer-maintenance-actions";
import { GlassIconButton } from "../components/glass-icon-button";
import { NativeActionButton } from "../components/native-action-button";
import type { MobileBot } from "../lib/api";
import { currentApiBase, rpc } from "../lib/api";
import type { ComputerStatus } from "../lib/computer";
import {
  COMPUTER_HEARTBEAT_MS,
  COMPUTER_LIFECYCLE_TIMEOUT_MS,
  computerLabel,
  controlLabel,
  embeddableScreenUrl,
  nextLoadedScreenUrl,
  previewPlaceholder,
  readScreenUrl,
  retainScreenSource,
  SCREEN_URL_OPEN_ATTEMPTS,
} from "../lib/computer";
import type { ComputerKeyboardCommand } from "../lib/computer-keyboard";
import {
  computerKeyboardReadyProbe,
  computerKeyboardScript,
  createComputerKeyboardBridge,
  isComputerKeyboardReadyMessage,
  NATIVE_COMPUTER_KEYBOARD_BOOT,
} from "../lib/computer-keyboard";
import { createComputerRefresh } from "../lib/computer-refresh";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { iosAtLeast } from "../lib/native-controls";
import { holdFreeRotation } from "../lib/orientation";
import { computerBootErrorDetail, errorText } from "../lib/user-error";

export default function Computer() {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const router = useRouter();
  const { botId, name: nameParam } = useLocalSearchParams<{ botId?: string; name?: string }>();
  const name = displayName(nameParam, t("Bot"));
  const [computer, setComputer] = useState<ComputerStatus | null>(null);
  const [screenUrl, setScreenUrl] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  // Every screen is taken: the computer shows asleep, or waits after a Wake.
  const [screenSleep, setScreenSleep] = useState<"asleep" | "waiting" | null>(null);
  const wakeScreen = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [readyBotId, setReadyBotId] = useState<string | null>(null);
  const [bootingCount, setBootingCount] = useState(0);
  const booting = bootingCount > 0;
  const [bootFailed, setBootFailed] = useState(false);
  const [computerOpen, setComputerOpen] = useState(false);
  const autoBooted = useRef<string | null>(null);
  const screenWebViewRef = useRef<WebView>(null);
  const keyboardGate = useRef({
    key: "",
    session: 0,
    bridge: createComputerKeyboardBridge(),
  });
  const heldScreenUrl = useRef<string | null>(null);
  // Bumped to load the screen page again after the app returns from the background or the
  // WebView loses its renderer; either can leave the stream black until it reconnects.
  const [screenReload, setScreenReload] = useState(0);

  const embeddedScreenUrl = embeddableScreenUrl(screenUrl, currentApiBase());
  useEffect(() => setScreenError(null), [embeddedScreenUrl]);

  const hasControl = computer?.controlHolder === "user" && computer.controlBotId === botId;
  const screenVisible =
    computerOpen && computer?.state === "running" && Boolean(embeddedScreenUrl) && !screenError;
  const loadedScreenUrl = nextLoadedScreenUrl(
    heldScreenUrl.current,
    embeddedScreenUrl,
    screenVisible,
  );
  heldScreenUrl.current = loadedScreenUrl;
  // The gate follows the page the WebView actually loaded. A capability refresh that
  // does not reload that page must not open a session the bridge will never acknowledge.
  const keyboardSurfaceKey = `${computerOpen}:${hasControl}:${screenReload}:${loadedScreenUrl ?? ""}`;
  if (keyboardGate.current.key !== keyboardSurfaceKey) {
    keyboardGate.current = {
      key: keyboardSurfaceKey,
      session: keyboardGate.current.session + 1,
      bridge: createComputerKeyboardBridge(),
    };
  }
  const keyboardSession = String(keyboardGate.current.session);

  useEffect(() => {
    if (!computerOpen || !hasControl || !loadedScreenUrl) return;
    const gate = keyboardGate.current;
    if (gate.bridge.isReady()) return;
    const webView = screenWebViewRef.current;
    if (!webView) return;
    webView.injectJavaScript(computerKeyboardReadyProbe(String(gate.session)));
  }, [computerOpen, hasControl, loadedScreenUrl, embeddedScreenUrl, keyboardSession]);

  function injectKeyboardCommands(commands: ComputerKeyboardCommand[]) {
    const webView = screenWebViewRef.current;
    if (!webView) return;
    for (const command of commands) webView.injectJavaScript(computerKeyboardScript(command));
  }

  const label = computerLabel(computer?.mode, name);

  const [bot, setBot] = useState<MobileBot | null>(null);
  useEffect(() => {
    setBot(null);
    void rpc<MobileBot[]>("bots/list")
      .then((bots) => setBot(bots.find((item) => item.id === botId) ?? null))
      .catch(() => undefined);
  }, [botId]);

  const refreshController = useMemo(
    () =>
      createComputerRefresh({
        readStatus: () => rpc<ComputerStatus>("computer/status", { botId }),
        readScreen: (attempts) =>
          readScreenUrl(
            async () => {
              const wake = wakeScreen.current;
              const screen = await rpc<{ url: string | null; unavailable?: boolean }>(
                "computer/screenUrl",
                wake ? { botId, wake } : { botId },
              );
              if (!screen.unavailable) wakeScreen.current = false;
              setScreenSleep(screen.unavailable ? (wake ? "waiting" : "asleep") : null);
              return screen;
            },
            { attempts },
          ),
        onStatus: (status) => {
          setComputer(status);
          // Another client may have started it since this one failed.
          if (status.state === "running") setBootFailed(false);
        },
        onScreen: setScreenUrl,
        onReady: () => setReadyBotId(botId ?? null),
        onInitialError: (err) => setError(errorText(err)),
      }),
    [botId],
  );
  const refresh = refreshController.refresh;
  const refreshAfterMaintenance = useCallback(async () => {
    await refresh();
  }, [refresh]);

  useEffect(() => {
    setComputer(null);
    setScreenUrl(null);
    setScreenError(null);
    setScreenSleep(null);
    wakeScreen.current = false;
    setError(null);
    setReadyBotId(null);
    setBootingCount(0);
    setBootFailed(false);
    setComputerOpen(false);
    autoBooted.current = null;
    if (botId) refreshController.start();
    return () => refreshController.dispose();
  }, [botId, refreshController]);

  async function bootComputer({
    takeControl,
    showProgress,
    force = false,
  }: {
    takeControl: boolean;
    showProgress: boolean;
    force?: boolean;
  }) {
    if (!botId || !refreshController.isActive()) return false;
    const action = refreshController.beginAction();
    const needsBoot = force || computer?.state !== "running" || !screenUrl;
    let starting = needsBoot;
    const showBooting = showProgress && needsBoot;
    if (showBooting) {
      setBootingCount((count) => count + 1);
      setError(null);
    }
    setBootFailed(false);
    try {
      if (needsBoot) {
        const answered = await rpc(
          "computer/boot",
          { botId },
          { timeoutMs: COMPUTER_LIFECYCLE_TIMEOUT_MS },
        ).then(
          () => true,
          (err: unknown) => {
            // The server keeps booting after the client stops waiting; the status poll takes over.
            if (err instanceof Error && err.name === "TimeoutError") return false;
            throw err;
          },
        );
        if (!answered) return false;
      }
      starting = false;
      if (!action.isActive()) return false;
      if (takeControl) await rpc("computer/takeover", { botId });
      if (!action.isActive()) return false;
      await action.refresh({ screenAttempts: SCREEN_URL_OPEN_ATTEMPTS });
      if (!action.isActive()) return false;
      setError(null);
      return true;
    } catch (err) {
      if (!action.isActive()) return false;
      setError(
        starting
          ? computerBootErrorDetail(err)
          : err instanceof Error && err.name === "TimeoutError"
            ? t("Request timed out")
            : errorText(err, t("Could not open computer")),
      );
      setBootFailed(starting);
      throw err;
    } finally {
      if (action.isActive() && showBooting) setBootingCount((count) => count - 1);
      action.finish();
    }
  }

  useEffect(() => {
    if (!botId || readyBotId !== botId) return;
    if (computer?.state === "booting" || computer?.state === "suspended") return;
    if (autoBooted.current === botId) return;
    autoBooted.current = botId;
    void bootComputer({
      takeControl: false,
      showProgress: computer?.state !== "running",
      force: true,
    }).catch(() => undefined);
  }, [readyBotId, botId, computer?.state]);

  // Nothing announces a freed screen, so a waiting screen asks again on each status poll.
  useEffect(() => {
    if (screenSleep === "waiting" && computer) refreshController.invalidateScreen();
  }, [screenSleep, computer, refreshController]);

  const reloadScreen = useCallback(async () => {
    await refresh().catch(() => undefined);
    heldScreenUrl.current = null;
    setScreenError(null);
    setScreenReload((count) => count + 1);
  }, [refresh]);

  useEffect(() => {
    if (!computerOpen) return;
    let backgrounded = false;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") backgrounded = true;
      if (state !== "active" || !backgrounded) return;
      backgrounded = false;
      void reloadScreen();
    });
    return () => subscription.remove();
  }, [computerOpen, reloadScreen]);

  // Let the full-screen desktop rotate to landscape; phone-sized windows elsewhere stay portrait.
  useEffect(() => (computerOpen ? holdFreeRotation() : undefined), [computerOpen]);

  useEffect(() => {
    if (!botId || computer?.state !== "running") return;
    const ping = () => void rpc("computer/heartbeat", { botId }).catch(() => undefined);
    ping();
    const timer = setInterval(ping, COMPUTER_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [botId, computer?.state]);

  /** Open the full window. Only an explicit Take control asks for the lease. */
  async function openComputer({ takeControl }: { takeControl: boolean }) {
    if (!botId) return;
    const needsTakeover = takeControl && !hasControl;
    if (screenSleep) wakeScreen.current = true;
    try {
      const opened = await bootComputer({
        takeControl: needsTakeover,
        showProgress: needsTakeover || computer?.state !== "running",
        force: computer?.state !== "running",
      });
      if (!opened || !refreshController.isActive()) return;
      setComputerOpen(true);
      setScreenError(null);
    } catch {
      // error already set
    }
  }

  async function releaseComputer(reason?: ComputerReleaseReason) {
    if (!botId || !refreshController.isActive()) return;
    const action = refreshController.beginAction();
    try {
      await rpc("computer/release", { botId, reason });
      if (!action.isActive()) return;
      setComputerOpen(false);
      await action.refresh().catch(() => undefined);
    } catch {
      if (action.isActive()) setScreenError(t("Could not continue"));
    } finally {
      action.finish();
    }
  }

  const placeholder =
    screenError ??
    (screenSleep === "waiting"
      ? t("Waiting for a free screen…")
      : previewPlaceholder(
          screenSleep ? "suspended" : computer?.state,
          booting,
          name,
          computer?.mode,
        ));
  // Booting shows in the preview; the header and Back stay, and leaving lets the boot finish.
  const bootPending = booting || computer?.state === "booting";
  const canRetry = !bootPending && (bootFailed || computer?.state === "error");

  return (
    <View style={{ flex: 1, backgroundColor: tokens.computerPage }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Centered on the whole screen, under the header, as Grok does. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          justifyContent: "center",
        }}
      >
        {/* The desktop is 16:10 and spans the full width, as in a video player. */}
        <View style={{ width: "100%", aspectRatio: 16 / 10 }}>
          {computerOpen ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: tokens.computerIcon }}>{t("Open in full window")}</Text>
            </View>
          ) : computer?.state === "running" && embeddedScreenUrl && !screenError ? (
            <ScreenWebView
              key={screenReload}
              url={embeddedScreenUrl}
              interactive={false}
              onRendererLost={() => void reloadScreen()}
              onError={() => {
                refreshController.invalidateScreen();
                setScreenError(
                  t("Could not load the desktop. This device cannot reach the screen URL."),
                );
              }}
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                padding: 16,
              }}
            >
              {bootPending ? <ActivityIndicator size="large" color={tokens.computerIcon} /> : null}
              <Text style={{ color: tokens.computerIcon, textAlign: "center" }}>{placeholder}</Text>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={bootPending ? placeholder : t("Open computer")}
            accessibilityState={{ disabled: bootPending, busy: bootPending }}
            disabled={bootPending}
            onPress={() => void openComputer({ takeControl: false })}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          />
        </View>
        {computer?.busyBotName ? (
          <Text style={{ marginTop: 12, color: tokens.computerIcon, textAlign: "center" }}>
            {controlLabel(computer, name, botId)}
          </Text>
        ) : null}
      </View>
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          paddingHorizontal: 18,
          paddingTop: 6,
        }}
      >
        <GlassIconButton
          accessibilityLabel={t("Back")}
          onPress={() => router.back()}
          ios="chevron.left"
          android="chevron-back"
          size={44}
          iconSize={19}
          color={tokens.computerIconHover}
          fallbackStyle={{ backgroundColor: tokens.computerBackdrop }}
        />
        <View
          accessibilityRole="header"
          accessible
          style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 }}
        >
          {bot ? <BotAvatar color={bot.color} identity={bot.id} size={32} /> : null}
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              color: tokens.computerIconHover,
              fontSize: 18,
              fontWeight: "500",
            }}
          >
            {name}
          </Text>
        </View>
        <ComputerMaintenanceActions
          botId={botId ?? ""}
          computer={computer}
          onChanged={refreshAfterMaintenance}
        />
      </SafeAreaView>
      {canRetry || error ? (
        <View style={{ gap: 8, paddingHorizontal: 24, paddingTop: 24 }}>
          {canRetry && computer?.state !== "running" ? (
            <Text style={{ color: tokens.destructive, fontSize: 17, fontWeight: "600" }}>
              {t("Couldn't start the computer")}
            </Text>
          ) : null}
          <Text style={{ color: tokens.computerIcon }}>
            {error ?? t("Something went wrong while it was starting. Try again in a moment.")}
          </Text>
          {canRetry ? (
            <NativeActionButton
              label={t("Try again")}
              prominence="primary"
              size="default"
              style={{ marginTop: 8 }}
              onPress={() =>
                void bootComputer({ takeControl: false, showProgress: true, force: true }).catch(
                  () => undefined,
                )
              }
            />
          ) : null}
        </View>
      ) : null}
      <View style={{ position: "absolute", right: 30, bottom: 30 }}>
        {hasControl ? (
          <ComputerReleaseActions
            takeoverRequested={computer?.takeoverRequested ?? false}
            onRelease={releaseComputer}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: bootPending }}
            disabled={bootPending}
            onPress={() => void openComputer({ takeControl: true })}
            style={({ pressed }) => ({
              height: 38,
              justifyContent: "center",
              paddingHorizontal: 8,
              borderRadius: 19,
              borderWidth: 1,
              borderColor: tokens.glassStroke,
              backgroundColor: tokens.computerBackdrop,
              opacity: bootPending ? 0.5 : pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ color: tokens.computerIconHover, fontSize: 17 }}>
              {t("Take control")}
            </Text>
          </Pressable>
        )}
      </View>

      <Modal
        visible={computerOpen}
        animationType="fade"
        presentationStyle="fullScreen"
        supportedOrientations={["portrait", "landscape-left", "landscape-right"]}
        onRequestClose={() => setComputerOpen(false)}
      >
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <KeyboardAvoidingView
            behavior="height"
            style={{ flex: 1, backgroundColor: tokens.background }}
          >
            <SafeAreaView
              edges={["top", "left", "right"]}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                borderBottomWidth: iosAtLeast(26) ? 0 : 1,
                borderBottomColor: tokens.border,
                paddingHorizontal: 14,
                paddingVertical: 4,
              }}
            >
              <View
                style={{
                  flex: 1,
                  minWidth: 0,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    color: tokens.foreground,
                    fontSize: 15.5,
                    fontWeight: "500",
                  }}
                >
                  {label}
                </Text>
                {hasControl ? (
                  <View
                    style={{
                      borderRadius: 999,
                      backgroundColor: tokens.muted,
                      paddingHorizontal: 9,
                      paddingVertical: 3,
                    }}
                  >
                    <Text numberOfLines={1} style={{ color: tokens.success, fontSize: 12 }}>
                      {t("You have control")}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {hasControl ? (
                  <ComputerReleaseActions
                    takeoverRequested={computer?.takeoverRequested ?? false}
                    onRelease={releaseComputer}
                  />
                ) : (
                  <NativeActionButton
                    label={t("Take control")}
                    prominence="secondary"
                    fill={false}
                    style={{ alignSelf: "center" }}
                    onPress={() =>
                      void bootComputer({ takeControl: true, showProgress: false }).catch(
                        () => undefined,
                      )
                    }
                  />
                )}
                <GlassIconButton
                  accessibilityLabel={t("Close computer")}
                  onPress={() => setComputerOpen(false)}
                  ios="xmark"
                  android="close"
                  size={36}
                  iconSize={16}
                />
              </View>
            </SafeAreaView>
            <View style={{ flex: 1, backgroundColor: tokens.card }}>
              {loadedScreenUrl ? (
                <ScreenWebView
                  key={screenReload}
                  url={loadedScreenUrl}
                  interactive={hasControl}
                  nativeKeyboard={hasControl}
                  keyboardSession={keyboardSession}
                  webViewRef={screenWebViewRef}
                  onKeyboardMessage={(data) => {
                    const gate = keyboardGate.current;
                    if (!isComputerKeyboardReadyMessage(data, String(gate.session))) return;
                    injectKeyboardCommands(gate.bridge.ready());
                  }}
                  onRendererLost={() => void reloadScreen()}
                  onError={() => {
                    refreshController.invalidateScreen();
                    setScreenError(
                      t("Could not load the desktop. This device cannot reach the screen URL."),
                    );
                  }}
                />
              ) : (
                <View
                  style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}
                >
                  <Text style={{ color: tokens.mutedForeground, textAlign: "center" }}>
                    {placeholder}
                  </Text>
                </View>
              )}
            </View>
            {hasControl ? (
              <ComputerKeyboardBar
                onCommand={(command) => {
                  injectKeyboardCommands(keyboardGate.current.bridge.push(command));
                }}
              />
            ) : null}
          </KeyboardAvoidingView>
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

function ComputerReleaseActions({
  takeoverRequested,
  onRelease,
}: {
  takeoverRequested: boolean;
  onRelease: (reason?: ComputerReleaseReason) => Promise<void>;
}) {
  const { t } = useI18n();
  const actions: Array<{ label: string; reason?: ComputerReleaseReason; primary?: boolean }> =
    takeoverRequested
      ? [
          { label: t("Skip"), reason: "skipped" },
          { label: t("I’m done"), reason: "done", primary: true },
        ]
      : [{ label: t("Release") }];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {actions.map((action) => (
        <NativeActionButton
          key={action.label}
          label={action.label}
          prominence={action.primary ? "primary" : "secondary"}
          fill={false}
          style={{ alignSelf: "center" }}
          onPress={() => void onRelease(action.reason)}
        />
      ))}
    </View>
  );
}

function ScreenWebView({
  url,
  interactive,
  nativeKeyboard = false,
  keyboardSession,
  webViewRef,
  onKeyboardMessage,
  onRendererLost,
  onError,
}: {
  url: string;
  interactive: boolean;
  nativeKeyboard?: boolean;
  keyboardSession?: string;
  webViewRef?: RefObject<WebView | null>;
  onKeyboardMessage?: (data: string) => void;
  onRendererLost?: () => void;
  onError: () => void;
}) {
  const tokens = useMobileTokens();
  const sourceUrl = useRef(url);
  sourceUrl.current = retainScreenSource(sourceUrl.current, url);
  return (
    <WebView
      ref={webViewRef}
      // Reload when control enables the native keyboard. The boot script only
      // runs on load, and a view-only page never attaches the key bridge.
      key={`${nativeKeyboard ? "keys" : "view"}:${sourceUrl.current}`}
      source={{ uri: sourceUrl.current }}
      injectedJavaScriptBeforeContentLoaded={
        nativeKeyboard ? NATIVE_COMPUTER_KEYBOARD_BOOT : undefined
      }
      injectedJavaScript={
        nativeKeyboard && keyboardSession ? computerKeyboardReadyProbe(keyboardSession) : undefined
      }
      onMessage={
        nativeKeyboard
          ? (event) => {
              onKeyboardMessage?.(event.nativeEvent.data);
            }
          : undefined
      }
      style={{ flex: 1, backgroundColor: tokens.background }}
      pointerEvents={interactive ? "auto" : "none"}
      // A view-only screen is a picture: keep its page, including the hidden keyboard field,
      // out of VoiceOver and TalkBack.
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? "auto" : "no-hide-descendants"}
      javaScriptEnabled
      domStorageEnabled
      keyboardDisplayRequiresUserAction={false}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      originWhitelist={["*"]}
      mixedContentMode="always"
      setSupportMultipleWindows={false}
      scrollEnabled={false}
      overScrollMode="never"
      onError={onError}
      onHttpError={onError}
      onRenderProcessGone={onRendererLost}
      onContentProcessDidTerminate={onRendererLost}
    />
  );
}
