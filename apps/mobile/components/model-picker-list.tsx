import type { ChatModelChoice } from "@rakazo/core";
import { groupModelChoices } from "@rakazo/core";
import { useNavigation } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ViewToken } from "react-native";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileTokens } from "../lib/appearance";
import { useFloatingHeaderInset } from "../lib/floating-header";
import { useI18n } from "../lib/i18n";
import { native, useThemedStyles } from "../lib/native";
import { NativeSymbol } from "./native-symbol";
import { Checkmark } from "./row-accessories";
import { SettingsLabel, SettingsRow } from "./settings-group";
import { TextOnlyMark } from "./text-only-mark";

const MAX_REVEAL_RETRIES = 10;
/** Rows rendered past the current pick so it can sit mid-screen. */
const ROWS_BELOW_PICK = 20;

/** Searchable grouped model cells shared by chat and connection settings. */
export function ModelPickerList({
  choices,
  selectedKey,
  onSelect,
  error,
  providerLabel,
  emptyMessage,
}: {
  choices: readonly ChatModelChoice[] | null;
  selectedKey: string;
  onSelect: (choice: ChatModelChoice) => void;
  error?: string | null;
  emptyMessage?: string;
  /** A single-provider picker only needs vendor headings. */
  providerLabel?: string;
}) {
  const { t } = useI18n();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const headerInset = useFloatingHeaderInset();
  const list = useRef<SectionList<ChatModelChoice>>(null);
  const initialScroll = useRef({
    ready: false,
    handled: false,
    cancelled: false,
    retries: 0,
    target: null as { sectionIndex: number; itemIndex: number; key: string } | null,
  });
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelInitialScroll = useCallback(() => {
    initialScroll.current.cancelled = true;
    if (retry.current !== null) clearTimeout(retry.current);
  }, []);
  useEffect(
    () => () => {
      if (retry.current !== null) clearTimeout(retry.current);
    },
    [],
  );
  const [query, setQuery] = useState("");
  const changeQuery = useCallback(
    (text: string) => {
      cancelInitialScroll();
      setQuery(text);
    },
    [cancelInitialScroll],
  );
  useLayoutEffect(() => {
    if (Platform.OS === "android") return;
    navigation.setOptions({
      headerSearchBarOptions: {
        placeholder: t("Search"),
        hideWhenScrolling: false,
        hideNavigationBar: false,
        autoCapitalize: "none",
        onChangeText: (event: { nativeEvent: { text: string } }) =>
          changeQuery(event.nativeEvent.text),
        onCancelButtonPress: () => changeQuery(""),
        onClose: () => changeQuery(""),
      },
    });
  }, [navigation, t, changeQuery]);

  const sections = useMemo(
    () =>
      choices
        ? groupModelChoices(choices, query).map((section) => ({
            ...section,
            heading:
              providerLabel && section.heading === providerLabel
                ? undefined
                : providerLabel && section.heading?.startsWith(`${providerLabel} · `)
                  ? section.heading.slice(providerLabel.length + 3)
                  : section.heading,
          }))
        : [],
    [choices, query, providerLabel],
  );
  // Render through the current pick up front: rows otherwise arrive in small batches and a
  // distant pick isn't measured yet when the list first tries to scroll to it.
  const initialNumToRender = useMemo(() => {
    let cells = 0;
    for (const section of sections) {
      const itemIndex = section.data.findIndex((item) => item.key === selectedKey);
      if (itemIndex !== -1) return cells + 1 + itemIndex + ROWS_BELOW_PICK;
      // Each section adds a header and a footer cell.
      cells += section.data.length + 2;
    }
    return undefined;
  }, [sections, selectedKey]);
  useLayoutEffect(() => {
    const state = initialScroll.current;
    if (state.handled || state.cancelled || choices === null) return;
    state.ready = true;
    state.target = null;
    for (const [sectionIndex, section] of sections.entries()) {
      const itemIndex = section.data.findIndex((item) => item.key === selectedKey);
      if (itemIndex !== -1) {
        state.target = { sectionIndex, itemIndex, key: selectedKey };
        break;
      }
    }
  }, [choices, sections, selectedKey]);

  // Viewability is reported after layout, including when an async catalog arrives.
  const revealInitialSelection = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ChatModelChoice>[] }) => {
      const state = initialScroll.current;
      if (
        !state.ready ||
        state.handled ||
        state.cancelled ||
        !viewableItems.some((item) => item.index !== null)
      )
        return;
      state.handled = true;
      if (
        !state.target ||
        viewableItems.some((item) => item.index !== null && item.item.key === state.target?.key)
      )
        return;
      list.current?.scrollToLocation({
        sectionIndex: state.target.sectionIndex,
        itemIndex: state.target.itemIndex,
        viewPosition: 0.5,
        animated: false,
      });
    },
    [],
  );

  const retryInitialSelection = useCallback(
    ({ averageItemLength, index }: { averageItemLength: number; index: number }) => {
      const state = initialScroll.current;
      if (!state.handled || state.cancelled || state.retries >= MAX_REVEAL_RETRIES || !state.target)
        return;
      state.retries += 1;
      // Rows render in batches, so keep moving the render window toward the row until it is measured.
      list.current
        ?.getScrollResponder()
        ?.scrollTo({ y: averageItemLength * index, animated: false });
      retry.current = setTimeout(() => {
        if (!state.cancelled && state.target) {
          list.current?.scrollToLocation({
            sectionIndex: state.target.sectionIndex,
            itemIndex: state.target.itemIndex,
            viewPosition: 0.5,
            animated: false,
          });
        }
      }, 100);
    },
    [],
  );

  const noMatchesMessage = emptyMessage ?? t("No matching models");
  const noMatches = choices !== null && sections.length === 0;

  // The search field keeps focus, so tell screen readers once when the results run out.
  useEffect(() => {
    if (noMatches) AccessibilityInfo.announceForAccessibility(noMatchesMessage);
  }, [noMatches, noMatchesMessage]);

  const sectionList = (
    <SectionList
      ref={list}
      onViewableItemsChanged={revealInitialSelection}
      onScrollToIndexFailed={retryInitialSelection}
      onScrollBeginDrag={cancelInitialScroll}
      initialNumToRender={initialNumToRender}
      key={query}
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        // On Android the pinned search bar adds 8 below itself, so the resting gap stays 16.
        {
          paddingTop: headerInset + (Platform.OS === "android" ? 8 : 16),
          paddingBottom: insets.bottom + 72,
        },
      ]}
      // Reserve the transparent bar explicitly: native search can drop its automatic inset.
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior={headerInset > 0 ? "never" : "automatic"}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      sections={sections}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) =>
        section.heading ? (
          <View style={styles.sectionHeading}>
            <SettingsLabel>{section.heading}</SettingsLabel>
          </View>
        ) : null
      }
      renderSectionFooter={() => <View style={styles.sectionGap} />}
      keyExtractor={(choice) => choice.key || "space-default"}
      ItemSeparatorComponent={() => (
        <View style={styles.cell}>
          <View style={styles.separator} />
        </View>
      )}
      ListEmptyComponent={
        error || noMatches ? (
          <Text style={styles.empty}>{error ?? noMatchesMessage}</Text>
        ) : (
          <ActivityIndicator color={native.secondaryLabel} />
        )
      }
      renderItem={({ item, index, section }) => {
        const selected = item.key === selectedKey;
        return (
          <View
            style={[
              styles.cell,
              index === 0 && styles.first,
              index === section.data.length - 1 && styles.last,
            ]}
          >
            <SettingsRow
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityHint={item.images === false ? t("Can't read images") : undefined}
              accessibilityState={{ selected }}
              onPress={() => onSelect(item)}
              title={item.title ?? item.label}
              detail={item.detail}
              trailing={
                item.images === false || selected ? (
                  <View style={styles.trailing}>
                    {item.images === false ? <TextOnlyMark /> : null}
                    {selected ? <Checkmark /> : null}
                  </View>
                ) : null
              }
            />
          </View>
        );
      }}
    />
  );
  if (Platform.OS !== "android") return sectionList;

  // Android has no native header search, so the field sits above the list instead of
  // scrolling with it: opening on a far-down pick must not leave search out of reach.
  return (
    <View style={styles.screen}>
      <View style={styles.search}>
        <NativeSymbol
          android="search"
          color={mobileTokens().sheetLabel}
          ios="magnifyingglass"
          size={18}
        />
        <TextInput
          accessibilityLabel={t("Search")}
          placeholder={t("Search")}
          placeholderTextColor={mobileTokens().sheetLabel}
          value={query}
          onChangeText={changeQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.searchInput}
        />
      </View>
      {sectionList}
    </View>
  );
}

// Cells match the settings cards: grey fill, a thin border around the group and full-width dividers.
function createStyles() {
  const tokens = mobileTokens();
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: native.page },
    content: { paddingHorizontal: 16 },
    sectionHeading: { paddingBottom: 7 },
    sectionGap: { height: 20 },
    trailing: { flexDirection: "row", alignItems: "center", gap: 10 },
    cell: {
      backgroundColor: tokens.sheetCell,
      borderColor: tokens.sheetBorder,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      overflow: "hidden",
    },
    first: {
      borderTopWidth: 1,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderCurve: "continuous",
    },
    last: {
      borderBottomWidth: 1,
      borderBottomLeftRadius: 16,
      borderBottomRightRadius: 16,
      borderCurve: "continuous",
    },
    separator: { height: 1, marginStart: 18, backgroundColor: tokens.sheetBorder },
    search: {
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: tokens.sheetBorder,
      backgroundColor: tokens.catalogField,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 8,
    },
    searchInput: { flex: 1, height: "100%", color: native.label, fontSize: 17 },
    empty: {
      color: native.secondaryLabel,
      fontSize: 15,
      paddingHorizontal: 16,
      paddingVertical: 10,
      textAlign: "center",
    },
  });
}
