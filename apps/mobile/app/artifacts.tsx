import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BotAvatar } from "../components/bot-avatar";
import { NativeSymbol } from "../components/native-symbol";
import type { MobileBot } from "../lib/api";
import { rpc } from "../lib/api";
import { mobileTokens } from "../lib/appearance";
import type { MobileArtifactSummary } from "../lib/artifacts";
import {
  listSpaceArtifacts,
  matchesArtifactQuery,
  mimeBadgeLabel,
  removeArtifact,
} from "../lib/artifacts";
import { useI18n } from "../lib/i18n";
import { native, useThemedStyles } from "../lib/native";
import { errorText } from "../lib/user-error";

const PAGE_SIZE = 30;

export default function ArtifactsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { t } = useI18n();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const [bots, setBots] = useState<MobileBot[]>([]);
  const { botId } = useLocalSearchParams<{ botId?: string }>();
  const [activeBotId, setActiveBotId] = useState<string | null>(botId || null);
  const chipsScrollRef = useRef<ScrollView>(null);
  const initialChipLayout = useRef({
    viewportWidth: 0,
    contentWidth: 0,
    chip: null as { x: number; width: number } | null,
    revealed: false,
  });

  function revealInitialChip() {
    const layout = initialChipLayout.current;
    if (layout.revealed || !layout.viewportWidth || !layout.chip) return;
    const right = layout.chip.x + layout.chip.width;
    if (layout.contentWidth < right) return;
    chipsScrollRef.current?.scrollTo({
      x: Math.max(0, right - layout.viewportWidth),
      animated: false,
    });
    layout.revealed = true;
  }

  const [items, setItems] = useState<MobileArtifactSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchPageFailed, setSearchPageFailed] = useState(false);
  const loadingMoreRef = useRef(false);
  const generationRef = useRef(0);
  const autoFetchedCursorRef = useRef<string | null>(null);
  const activeBotIdRef = useRef(activeBotId);
  const didFocusRef = useRef(false);
  activeBotIdRef.current = activeBotId;

  useLayoutEffect(() => {
    navigation.setOptions({
      // Grok's list titles are plain text in the bar, not a glass capsule.
      headerTitle: t("Library"),
      headerTitleStyle: { fontWeight: "400" },
      headerSearchBarOptions: {
        placeholder: t("Search library…"),
        hideWhenScrolling: false,
        autoCapitalize: "none",
        onChangeText: (event: { nativeEvent: { text: string } }) =>
          setQuery(event.nativeEvent.text),
        onCancelButtonPress: () => setQuery(""),
        onClose: () => setQuery(""),
      },
    });
  }, [navigation, t]);

  useFocusEffect(
    useCallback(() => {
      rpc<MobileBot[]>("bots/list")
        .then(setBots)
        .catch(() => undefined);
    }, []),
  );

  const load = useCallback(
    async (botId: string | null, mode: "replace" | "refresh") => {
      const generation = ++generationRef.current;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      autoFetchedCursorRef.current = null;
      setSearchPageFailed(false);
      setLoadError(null);
      if (mode === "replace") {
        setItems(null);
        setNextCursor(null);
      }
      try {
        const page = await listSpaceArtifacts({ botId: botId ?? undefined, limit: PAGE_SIZE });
        if (generation !== generationRef.current) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
      } catch (error) {
        if (generation !== generationRef.current) return;
        if (mode === "replace") {
          setLoadError(errorText(error, t("Could not load artifacts.")));
        }
      }
    },
    [t],
  );

  useFocusEffect(
    useCallback(() => {
      if (!didFocusRef.current) {
        didFocusRef.current = true;
        return;
      }
      void load(activeBotIdRef.current, "refresh");
    }, [load]),
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) return;
    const generation = generationRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await listSpaceArtifacts({
        botId: activeBotId ?? undefined,
        cursor: nextCursor,
        limit: PAGE_SIZE,
      });
      if (generation !== generationRef.current) return;
      setItems((current) => (current ?? []).concat(page.items));
      setNextCursor(page.nextCursor);
      setSearchPageFailed(false);
    } catch {
      if (generation === generationRef.current) setSearchPageFailed(true);
    } finally {
      if (generation === generationRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [activeBotId, nextCursor]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load(activeBotId, "refresh");
    } finally {
      setRefreshing(false);
    }
  }

  function confirmDelete(item: MobileArtifactSummary) {
    Alert.alert(
      t('Delete "{name}"?', { name: item.name }),
      item.versionCount > 1
        ? t("This deletes all {count} versions of this artifact. This can't be undone.", {
            count: item.versionCount,
          })
        : t("This can't be undone."),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Delete"),
          style: "destructive",
          onPress: () =>
            void removeArtifact(item.id)
              .then(() =>
                setItems((current) => current?.filter((row) => row.id !== item.id) ?? current),
              )
              .catch((error: unknown) =>
                Alert.alert(t("Could not delete this artifact"), errorText(error, t("Try again."))),
              ),
        },
      ],
    );
  }

  const queryActive = query.trim().length > 0;
  const filtered = useMemo(() => {
    if (!items) return null;
    if (!queryActive) return items;
    return items.filter((item) => matchesArtifactQuery(item, query));
  }, [items, query, queryActive]);
  const botsById = useMemo(() => new Map(bots.map((bot) => [bot.id, bot])), [bots]);
  const now = Date.now();

  useEffect(() => {
    autoFetchedCursorRef.current = null;
    setSearchPageFailed(false);
  }, [query, activeBotId]);

  useEffect(() => {
    if (searchPageFailed || !queryActive || !nextCursor || loadingMore || items === null) return;
    if (filtered && filtered.length > 0) return;
    if (autoFetchedCursorRef.current === nextCursor) return;
    autoFetchedCursorRef.current = nextCursor;
    void loadMore();
  }, [filtered, items, loadMore, loadingMore, nextCursor, queryActive, searchPageFailed]);

  useEffect(() => {
    void load(activeBotId, "replace");
  }, [activeBotId, load]);

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <FlatList<MobileArtifactSummary>
        // Opened from a bot, the list is that bot's Library; the bot filter shows only for all bots.
        ListHeaderComponent={
          botId ? null : (
            <ScrollView
              ref={chipsScrollRef}
              onLayout={(event) => {
                initialChipLayout.current.viewportWidth = event.nativeEvent.layout.width;
                revealInitialChip();
              }}
              onContentSizeChange={(width) => {
                initialChipLayout.current.contentWidth = width;
                revealInitialChip();
              }}
              horizontal
              contentInsetAdjustmentBehavior="never"
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chipsRow}
            >
              <Chip
                label={t("All bots")}
                active={activeBotId === null}
                onPress={() => setActiveBotId(null)}
              />
              {bots.map((bot) => (
                <Chip
                  key={bot.id}
                  onLayout={
                    bot.id === botId && activeBotId === botId
                      ? (event) => {
                          initialChipLayout.current.chip = event.nativeEvent.layout;
                          revealInitialChip();
                        }
                      : undefined
                  }
                  label={bot.name}
                  active={activeBotId === bot.id}
                  onPress={() => setActiveBotId(bot.id)}
                  avatar={<BotAvatar color={bot.color} identity={bot.id} size={16} />}
                />
              ))}
            </ScrollView>
          )
        }
        style={styles.listView}
        contentInsetAdjustmentBehavior="automatic"
        data={filtered ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        indicatorStyle="default"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={native.secondaryLabel}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => void loadMore()}
        ListEmptyComponent={
          items === null ? (
            <View style={styles.centered}>
              {loadError ? (
                <Text style={styles.empty}>{loadError}</Text>
              ) : (
                <ActivityIndicator color={native.secondaryLabel} />
              )}
            </View>
          ) : queryActive && filtered?.length === 0 && nextCursor && searchPageFailed ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                autoFetchedCursorRef.current = null;
                setSearchPageFailed(false);
              }}
              style={styles.centered}
            >
              <Text style={styles.empty}>{t("Could not load artifacts.")}</Text>
              <Text style={styles.empty}>{t("Try again.")}</Text>
            </Pressable>
          ) : queryActive &&
            filtered?.length === 0 &&
            nextCursor &&
            (loadingMore || autoFetchedCursorRef.current !== nextCursor) ? (
            <View style={styles.centered}>
              <ActivityIndicator color={native.secondaryLabel} />
            </View>
          ) : (
            <Text style={styles.empty}>
              {queryActive ? t("No matching artifacts") : t("No artifacts yet")}
            </Text>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={native.secondaryLabel} />
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const list = filtered ?? [];
          const section = artifactSection(item.createdAt, now);
          const previous = list[index - 1];
          const next = list[index + 1];
          const first = !previous || artifactSection(previous.createdAt, now) !== section;
          const last = !next || artifactSection(next.createdAt, now) !== section;
          return (
            <>
              {first ? (
                <Text style={[styles.sectionLabel, index === 0 && styles.sectionLabelFirst]}>
                  {section === "week" ? t("This week") : t("Older")}
                </Text>
              ) : null}
              <ArtifactRow
                item={item}
                bot={activeBotId === null && item.botId ? botsById.get(item.botId) : undefined}
                first={first}
                last={last}
                onPress={() =>
                  router.push({ pathname: "/artifact", params: { artifactId: item.id } })
                }
                onLongPress={() => confirmDelete(item)}
              />
            </>
          );
        }}
      />
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  avatar,
  onLayout,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  avatar?: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      onLayout={onLayout}
      style={[styles.chip, active && styles.chipActive]}
    >
      {avatar}
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ArtifactRow({
  item,
  bot,
  first,
  last,
  onPress,
  onLongPress,
}: {
  item: MobileArtifactSummary;
  bot?: MobileBot;
  first: boolean;
  last: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const { t } = useI18n();
  const isCode = item.mimeType === "text/html";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bot ? `${item.name}, ${bot.name}` : item.name}
      accessibilityHint={t("Long press to delete")}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        first && styles.rowFirst,
        last && styles.rowLast,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.rowIcon}>
        <NativeSymbol
          ios={isCode ? "chevron.left.forwardslash.chevron.right" : "doc.text"}
          android={isCode ? "code-slash-outline" : "document-text-outline"}
          size={14}
          color={styles.rowIconGlyph.color}
        />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {bot?.name ?? mimeBadgeLabel(item.mimeType)}
        </Text>
      </View>
      {last ? null : <View style={styles.separator} />}
    </Pressable>
  );
}

/** Grok-style list sections: the last seven days, then everything before. */
function artifactSection(createdAt: string, now: number): "week" | "older" {
  return now - Date.parse(createdAt) < 7 * 24 * 60 * 60 * 1000 ? "week" : "older";
}

function createStyles() {
  const tokens = mobileTokens();
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: tokens.groupedBackground },
    centered: { alignItems: "center", justifyContent: "center", paddingTop: 40 },
    chipsScroll: { flexGrow: 0, flexShrink: 0 },
    chipsRow: {
      flexDirection: "row",
      alignItems: "center",
      flexGrow: 0,
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      flexGrow: 0,
      flexShrink: 0,
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: native.fill,
    },
    chipActive: { backgroundColor: tokens.primary },
    chipLabel: { color: native.label, fontSize: 13, fontWeight: "600" },
    chipLabelActive: { color: tokens.primaryForeground },
    listView: { flex: 1 },
    list: { paddingBottom: 32 },
    empty: {
      color: native.secondaryLabel,
      fontSize: 15,
      textAlign: "center",
      paddingHorizontal: 24,
      paddingTop: 8,
    },
    footer: { paddingVertical: 20 },
    sectionLabel: {
      color: native.secondaryLabel,
      fontSize: 15,
      lineHeight: 20,
      paddingHorizontal: 34,
      paddingTop: 24,
      paddingBottom: 6,
    },
    sectionLabelFirst: { paddingTop: 12 },
    // Grouped inset rows: one card per section, 16pt from the screen edges.
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 70,
      marginHorizontal: 16,
      paddingLeft: 18,
      paddingRight: 18,
      paddingVertical: 13,
      backgroundColor: tokens.groupedCard,
    },
    rowFirst: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    rowLast: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
    rowPressed: { backgroundColor: tokens.groupedDivider },
    // Grok's link favicons sit on a white plate; artifacts get the same plate with a file glyph.
    rowIcon: {
      width: 24,
      height: 24,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.faviconPlate,
    },
    rowIconGlyph: { color: tokens.computerBackdrop },
    rowBody: { flex: 1, minWidth: 0, gap: 2 },
    rowName: { color: native.label, fontSize: 17, lineHeight: 22 },
    rowMeta: { color: native.secondaryLabel, fontSize: 15, lineHeight: 20 },
    separator: {
      position: "absolute",
      left: 52,
      right: 0,
      bottom: 0,
      height: 1,
      backgroundColor: tokens.groupedDivider,
    },
  });
}
