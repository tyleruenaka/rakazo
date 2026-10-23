import { ChatMarkdown } from "@rakazo/chat-ui/native";
import type { ThreadMessage } from "@rakazo/contracts";
import { loadPeerHistory, peerConversations, timeSeparatorIds } from "@rakazo/core";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BotAvatar } from "../components/bot-avatar";
import { GlassSurface } from "../components/glass-surface";
import type { MarkdownArtifactPreviewTarget } from "../components/markdown-artifact-preview";
import { MarkdownArtifactPreview } from "../components/markdown-artifact-preview";
import { MessageAttachments } from "../components/message-attachments";
import { NativeActionButton } from "../components/native-action-button";
import { NativeSymbol } from "../components/native-symbol";
import { ScrollToBottomButton } from "../components/scroll-to-bottom-button";
import { createThreadHeaderStyles } from "../components/thread-header-styles";
import { ThreadScrollSurface } from "../components/thread-scroll-surface";
import { TimeSeparator } from "../components/time-separator";
import { rpc } from "../lib/api";
import { mobileTokens } from "../lib/appearance";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance, useThemedStyles } from "../lib/native";
import { HEADER_CONTROL_SIZE } from "../lib/native-controls";

type Params = {
  botId: string;
  botName: string;
  botColor?: string;
  peerBotId: string;
  peerBotName: string;
  peerBotColor?: string;
};

/** The two bots' avatars, the second laid over the first, in place of a title. */
function PairAvatars({
  owner,
  peer,
  label,
}: {
  owner: [string, string];
  peer: [string, string];
  label: string;
}) {
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={label} style={styles.pair}>
      <BotAvatar color={owner[1]} identity={owner[0]} size={28} />
      <View style={styles.pairPeer}>
        <BotAvatar color={peer[1]} identity={peer[0]} size={28} />
      </View>
    </View>
  );
}

/** A read-only bot-to-bot conversation, opened from a "Messaged" / "Message from" row. */
export default function PeerThreadScreen() {
  const params = useLocalSearchParams<Params>();
  const { botId, botName, peerBotId } = params;
  const botColor = params.botColor ?? "";
  const peerBotColor = params.peerBotColor ?? "";
  const navigation = useNavigation();
  const headerStyles = useThemedStyles(createThreadHeaderStyles);
  const insets = useSafeAreaInsets();
  const tokens = useMobileTokens();
  const colorScheme = useResolvedAppearance();
  const { t } = useI18n();
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [detached, setDetached] = useState(false);
  const list = useRef<FlatList<Row>>(null);
  const router = useRouter();
  // Files in the exchange live in the bot's own chat.
  const artifactTarget = useMemo(() => ({ botId }), [botId]);
  const [markdownPreview, setMarkdownPreview] = useState<MarkdownArtifactPreviewTarget | null>(
    null,
  );

  useEffect(() => {
    const abort = new AbortController();
    setMessages(null);
    setFailed(false);
    void loadPeerHistory({
      signal: abort.signal,
      loadPage: (before, signal) =>
        rpc<{ messages: ThreadMessage[]; olderCursor: number | null }>(
          "threads/messages",
          { botId, before, includePeerRuns: true },
          { signal },
        ),
    })
      .then((loaded) => {
        if (!abort.signal.aborted) setMessages(loaded);
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => abort.abort();
  }, [botId, reloadKey]);

  const conversation = useMemo(
    () =>
      messages
        ? (peerConversations(messages).find((entry) => entry.peerBotId === peerBotId) ?? null)
        : null,
    [messages, peerBotId],
  );
  const peerBotName = conversation?.peerBotName ?? params.peerBotName;
  // Newest first for the inverted list, which opens on the latest exchange.
  const rows = useMemo<Row[]>(() => {
    const entries = (conversation?.messages ?? []).map((peerMessage, index) => ({
      id: `${peerMessage.messageId}-${index}`,
      createdAt: peerMessage.createdAt,
      peerMessage,
    }));
    const separators = timeSeparatorIds(entries);
    return entries.map((entry) => ({ ...entry, separator: separators.has(entry.id) })).reverse();
  }, [conversation]);

  useLayoutEffect(() => {
    // Grok's back circle and avatars sit lower than the system bar puts them, so the page
    // draws its own; the edge swipe still goes back.
    navigation.setOptions({ headerShown: false });
  }, [navigation]);
  const headerBottom = insets.top + HEADER_TOP + HEADER_CONTROL_SIZE;

  const speakers = {
    sent: { id: botId, name: botName, color: botColor },
    received: { id: peerBotId, name: peerBotName, color: peerBotColor },
  };

  const notice = (text: string) => (
    <View style={styles.notice}>
      <Text style={[styles.noticeText, { color: tokens.mutedForeground }]}>{text}</Text>
      {failed ? (
        <NativeActionButton
          label={t("Try again")}
          prominence="secondary"
          onPress={() => setReloadKey((key) => key + 1)}
        />
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: tokens.background }]}>
      {failed ? (
        notice(t("Could not load this chat."))
      ) : !messages ? (
        notice(t("Loading…"))
      ) : rows.length === 0 ? (
        notice(t("No messages with {name} yet.", { name: peerBotName }))
      ) : (
        <ThreadScrollSurface key={`${botId}:${peerBotId}`}>
          <FlatList
            ref={list}
            inverted
            data={rows}
            keyExtractor={(row) => row.id}
            contentContainerStyle={{
              // Inverted: the top padding sits above the read-only pill, the bottom under the header.
              paddingTop: insets.bottom + 56,
              paddingBottom: headerBottom + 8,
            }}
            scrollEventThrottle={16}
            onScroll={(event) => setDetached(event.nativeEvent.contentOffset.y > 120)}
            renderItem={({ item }) => {
              const speaker = speakers[item.peerMessage.direction];
              return (
                <View style={styles.row}>
                  {item.separator ? <TimeSeparator createdAt={item.createdAt} /> : null}
                  <View style={styles.message}>
                    <BotAvatar color={speaker.color} identity={speaker.id} size={16} />
                    <View style={styles.column}>
                      <Text
                        numberOfLines={1}
                        style={[styles.name, { color: tokens.faintForeground }]}
                      >
                        {speaker.name}
                      </Text>
                      <View style={[styles.bubble, { backgroundColor: tokens.chatBot }]}>
                        {item.peerMessage.text ? (
                          <ChatMarkdown
                            palette={mobileTokens()}
                            colorScheme={colorScheme}
                            streaming={false}
                          >
                            {item.peerMessage.text}
                          </ChatMarkdown>
                        ) : null}
                        {item.peerMessage.attachments.length > 0 ? (
                          <MessageAttachments
                            attachments={item.peerMessage.attachments}
                            messageRole="bot"
                            target={artifactTarget}
                            onPreviewImage={(preview) =>
                              router.push({
                                pathname: "/image",
                                params: { ...preview, botId },
                              })
                            }
                            onPreviewMarkdown={setMarkdownPreview}
                          />
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        </ThreadScrollSurface>
      )}
      <View pointerEvents="none" style={[headerStyles.headerFade, { height: headerBottom + 44 }]} />
      <View style={[styles.header, { top: insets.top + HEADER_TOP }]}>
        <GlassSurface
          shape="circle"
          style={styles.back}
          fallbackStyle={{ backgroundColor: tokens.muted }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("Back")}
            onPress={() => navigation.goBack()}
            style={styles.backPress}
          >
            <NativeSymbol
              ios="chevron.left"
              android="chevron-back"
              size={20}
              color={tokens.foreground}
            />
          </Pressable>
        </GlassSurface>
        <PairAvatars
          owner={[botId, botColor]}
          peer={[peerBotId, peerBotColor]}
          label={`${botName} · ${peerBotName}`}
        />
      </View>
      {/* Messages fade out behind the read-only pill, as in Grok. */}
      <View
        pointerEvents="none"
        style={[headerStyles.bottomFade, { height: insets.bottom + 50 }]}
      />
      <View
        pointerEvents="box-none"
        style={[styles.footer, { bottom: Math.max(insets.bottom - 2, 12) }]}
      >
        <GlassSurface style={styles.readOnly} fallbackStyle={{ backgroundColor: tokens.muted }}>
          <View accessible accessibilityRole="text" style={styles.readOnlyLabel}>
            <NativeSymbol
              ios="lock"
              android="lock-closed-outline"
              size={14}
              color={tokens.mutedForeground}
            />
            <Text style={[styles.readOnlyText, { color: tokens.mutedForeground }]}>
              {t("Read-only")}
            </Text>
          </View>
        </GlassSurface>
        {detached ? (
          <View style={styles.jump}>
            <ScrollToBottomButton
              accessibilityLabel={t("Jump to latest")}
              onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })}
            />
          </View>
        ) : null}
      </View>
      {markdownPreview ? (
        <MarkdownArtifactPreview
          threadTarget={artifactTarget}
          target={markdownPreview}
          onClose={() => setMarkdownPreview(null)}
        />
      ) : null}
    </View>
  );
}

// Grok's header controls sit 6pt below the status bar.
const HEADER_TOP = 6;

type Row = {
  id: string;
  createdAt: string;
  separator: boolean;
  peerMessage: ReturnType<typeof peerConversations>[number]["messages"][number];
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    position: "absolute",
    start: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  back: { width: HEADER_CONTROL_SIZE, height: HEADER_CONTROL_SIZE, borderRadius: 22 },
  backPress: { flex: 1, alignItems: "center", justifyContent: "center" },
  pair: { flexDirection: "row", alignItems: "center" },
  pairPeer: { marginStart: -8 },
  notice: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  noticeText: { fontSize: 15, textAlign: "center" },
  row: { marginTop: 12, paddingStart: 20, paddingEnd: 16 },
  // The sender's avatar sits outside the bubble, level with its bottom edge.
  message: { flexDirection: "row", alignItems: "flex-end", gap: 7 },
  column: { flexShrink: 1, maxWidth: 299, gap: 3 },
  name: { fontSize: 12, lineHeight: 16, paddingStart: 12 },
  bubble: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 24,
    borderCurve: "continuous",
    gap: 8,
  },
  footer: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  readOnly: { height: 40, borderRadius: 20, justifyContent: "center", paddingHorizontal: 16 },
  readOnlyLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  readOnlyText: { fontSize: 14 },
  jump: { position: "absolute", end: 31, bottom: -3 },
});
