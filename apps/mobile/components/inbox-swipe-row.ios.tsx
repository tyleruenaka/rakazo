import {
  Button,
  ContextMenu,
  Divider,
  Host,
  List,
  Menu,
  RNHostView,
  SwipeActions,
  Toggle,
} from "@expo/ui/swift-ui";
import {
  labelStyle,
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  listStyle,
  scrollContentBackground,
  scrollDisabled,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useState } from "react";
import { PlatformColor, useWindowDimensions, View } from "react-native";
import { useI18n } from "../lib/i18n";
import type { InboxRowAction } from "../lib/inbox-swipe";
import { INBOX_ROW_ACTIONS, inboxRowActions } from "../lib/inbox-swipe";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { InboxChatPreview } from "./inbox-chat-preview";
import type { InboxPinnedMenuProps, InboxSwipeRowProps } from "./inbox-swipe-row";

// Measured row heights, so recycled and reopened rows start at their size instead of 0.
const rowHeights = new Map<string, number>();
let lastRowHeight = 0;

/**
 * The inbox row inside a one-row SwiftUI list, which is what gives it the system swipe
 * actions, full swipe and haptics, and the system context menu on long press. The FlatList
 * around it keeps scrolling and sections.
 */
export function InboxSwipeRow({
  rowKey,
  unread,
  pinned,
  nested,
  primary,
  notifyOnFinish,
  sectionId,
  sections,
  preview,
  onAction,
  onOrganize,
  onEditSection,
  children,
}: InboxSwipeRowProps) {
  const { t } = useI18n();
  const scheme = useResolvedAppearance();
  const tokens = useMobileTokens();
  const window = useWindowDimensions();
  const [width, setWidth] = useState(window.width);
  const [height, setHeight] = useState(() => rowHeights.get(rowKey) ?? lastRowHeight);
  const actions = inboxRowActions({ unread, pinned, nested });

  function button(action: InboxRowAction) {
    const { label, systemImage } = INBOX_ROW_ACTIONS[action];
    return (
      <Button
        key={action}
        label={t(label)}
        systemImage={systemImage}
        role={action === "archive" ? "destructive" : undefined}
        modifiers={[
          labelStyle("iconOnly"),
          ...(action === "read" || action === "unread" ? [tint(PlatformColor("systemBlue"))] : []),
        ]}
        onPress={() => onAction(action)}
      />
    );
  }

  return (
    <View
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        if (next > 0 && next !== width) setWidth(next);
      }}
    >
      <Host style={{ height }} colorScheme={scheme} ignoreSafeArea="all">
        <List
          modifiers={[listStyle("plain"), scrollDisabled(true), scrollContentBackground("hidden")]}
        >
          <SwipeActions
            modifiers={[
              listRowInsets({ top: 0, leading: 0, bottom: 0, trailing: 0 }),
              listRowSeparator("hidden"),
              listRowBackground(tokens.inboxBackground),
            ]}
          >
            <ContextMenu>
              <ContextMenu.Trigger>
                <RNHostView matchContents>
                  <View
                    style={{ width }}
                    onLayout={(event) => {
                      const next = Math.ceil(event.nativeEvent.layout.height);
                      if (next <= 0 || next === height) return;
                      rowHeights.set(rowKey, next);
                      lastRowHeight = next;
                      setHeight(next);
                    }}
                  >
                    {children}
                  </View>
                </RNHostView>
              </ContextMenu.Trigger>
              <ContextMenu.Preview>
                <InboxChatPreview {...preview} />
              </ContextMenu.Preview>
              <ContextMenu.Items>
                <InboxMenuItems
                  unread={unread}
                  pinned={pinned}
                  nested={nested}
                  primary={primary}
                  notifyOnFinish={notifyOnFinish}
                  sectionId={sectionId}
                  sections={sections}
                  onAction={onAction}
                  onOrganize={onOrganize}
                  onEditSection={onEditSection}
                />
              </ContextMenu.Items>
            </ContextMenu>
            <SwipeActions.Actions edge="leading">{button(actions.leading)}</SwipeActions.Actions>
            <SwipeActions.Actions edge="trailing" allowsFullSwipe={false}>
              {actions.trailing.map((action) => button(action))}
            </SwipeActions.Actions>
          </SwipeActions>
        </List>
      </Host>
    </View>
  );
}

// Hide shows in red, like the swipe action it matches.
const HIDE_ROLE = "destructive";

type InboxMenuProps = Omit<InboxSwipeRowProps, "rowKey" | "preview" | "children">;

/**
 * The long-press menu of a row or a pinned tile: read state, pin, Move to (rows), Hide, and the
 * rest under More. A pinned tile keeps Move to under More.
 */
function InboxMenuItems({
  unread,
  pinned,
  notifyOnFinish,
  primary,
  nested,
  sectionId,
  sections,
  onAction,
  onOrganize,
  onEditSection,
}: InboxMenuProps) {
  const { t } = useI18n();
  function moveTo(id: string | null) {
    if (id !== (sectionId ?? null)) onOrganize({ sectionId: id });
  }
  const move = (
    <Menu label={t("Move to")} systemImage="folder">
      {sections.map((section) => (
        <Toggle
          key={section.id}
          label={section.name}
          isOn={sectionId === section.id}
          onIsOnChange={() => moveTo(section.id)}
        />
      ))}
      <Toggle label={t("Unassigned")} isOn={sectionId == null} onIsOnChange={() => moveTo(null)} />
      <Divider />
      <Button
        label={t("New section")}
        systemImage="folder.badge.plus"
        onPress={() => onEditSection("create")}
      />
      {sections.some((section) => section.id === sectionId) ? (
        <Button
          label={t("Rename section")}
          systemImage="pencil"
          onPress={() => onEditSection("rename")}
        />
      ) : null}
    </Menu>
  );
  const notify =
    notifyOnFinish === undefined ? null : (
      <Button
        label={notifyOnFinish ? t("Silence notifications") : t("Resume notifications")}
        systemImage={notifyOnFinish ? "bell.slash" : "bell"}
        onPress={() => onOrganize({ notifyOnFinish: !notifyOnFinish })}
      />
    );
  return (
    <>
      <Button
        label={unread ? t("Mark Read") : t("Mark Unread")}
        systemImage={unread ? "checkmark.message" : "message.badge"}
        onPress={() => onAction(unread ? "read" : "unread")}
      />
      {nested ? null : (
        <Button
          label={pinned ? t("Unpin") : t("Pin")}
          systemImage={pinned ? "pin.slash" : "pin"}
          onPress={() => onAction(pinned ? "unpin" : "pin")}
        />
      )}
      {pinned ? null : move}
      <Button
        label={t("Hide")}
        systemImage="eye.slash"
        role={HIDE_ROLE}
        onPress={() => onAction("archive")}
      />
      {pinned || notify ? (
        <Menu label={t("More")} systemImage="ellipsis">
          {notify}
          {primary === false ? (
            <Button
              label={t("Make primary")}
              systemImage="star"
              onPress={() => onOrganize({ primary: true })}
            />
          ) : null}
          {pinned ? move : null}
        </Menu>
      ) : null}
    </>
  );
}

/** A pinned tile with the system context menu on long press: the chat preview and its menu. */
export function InboxPinnedMenu({ size, preview, children, ...menu }: InboxPinnedMenuProps) {
  const scheme = useResolvedAppearance();
  return (
    <Host style={size} colorScheme={scheme}>
      <ContextMenu>
        <ContextMenu.Trigger>
          <RNHostView matchContents>
            <View style={size}>{children}</View>
          </RNHostView>
        </ContextMenu.Trigger>
        <ContextMenu.Preview>
          <InboxChatPreview {...preview} />
        </ContextMenu.Preview>
        <ContextMenu.Items>
          <InboxMenuItems {...menu} />
        </ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}
