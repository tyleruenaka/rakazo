import type { PeerMarkerGroup, PeerMarkerPeer } from "@rakazo/core";
import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useMobileTokens } from "../lib/native";
import { BotAvatar } from "./bot-avatar";
import { NativeSymbol } from "./native-symbol";

// Marks where the chip sits inside a translated sentence such as "Messaged {peer}".
const CHIP = "\u0000";

/** The translated sentence around the chip, so languages can put the name first. */
function aroundChip(sentence: string): [string, string] {
  const [before = "", after = ""] = sentence.split(CHIP);
  return [before.trimEnd(), after.trimStart()];
}

/** The peer's avatar and name, as on desktop's bot-to-bot chip. */
function PeerChip({ color, identity, name }: { color: string; identity: string; name: string }) {
  const tokens = useMobileTokens();
  return (
    <View style={styles.chip}>
      <BotAvatar color={color} identity={identity} size={16} />
      <Text numberOfLines={1} style={[styles.text, { color: tokens.mutedForeground }]}>
        {name}
      </Text>
    </View>
  );
}

/**
 * A bot-to-bot exchange, centered like desktop: "Messaged" or "Message from" and the peer's
 * chip, and a chevron: the row opens the conversation.
 */
export function PeerMarker({
  sent,
  peer,
  color,
}: {
  sent: boolean;
  peer: PeerMarkerPeer;
  color: string;
}) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const [before, after] = aroundChip(
    sent ? t("Messaged {peer}", { peer: CHIP }) : t("Message from {peer}", { peer: CHIP }),
  );
  return (
    <View style={styles.row}>
      <View style={styles.sentence}>
        {before ? (
          <Text style={[styles.text, { color: tokens.mutedForeground }]}>{before}</Text>
        ) : null}
        <PeerChip color={color} identity={peer.id} name={peer.name} />
        {after ? (
          <Text style={[styles.text, { color: tokens.mutedForeground }]}>{after}</Text>
        ) : null}
      </View>
      <OpenChevron />
    </View>
  );
}

/** Every marker row opens its conversation; the chevron says so on each one alike. */
function OpenChevron() {
  const tokens = useMobileTokens();
  return (
    <View style={styles.chevron}>
      <NativeSymbol
        ios="chevron.right"
        android="chevron-forward"
        size={11}
        color={tokens.mutedForeground}
      />
    </View>
  );
}

/**
 * Consecutive markers as one row, like desktop: "Messaged" or "N messages with", then one chip,
 * two chips joined by "and", or a stacked-avatar chip for three or more bots.
 */
export function PeerMarkerGroupRow({
  summary,
  peerColor,
}: {
  summary: PeerMarkerGroup["summary"];
  peerColor: (botId: string) => string;
}) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const { peers } = summary;
  const [before] =
    summary.kind === "fanout"
      ? aroundChip(t("Messaged {peer}", { peer: CHIP }))
      : [t("{count} messages with", { count: summary.messageCount })];
  const muted = [styles.text, { color: tokens.mutedForeground }];
  return (
    <View style={styles.row}>
      <View style={styles.sentence}>
        {before ? <Text style={muted}>{before}</Text> : null}
        {peers.length <= 2 ? (
          peers.map((peer, index) => (
            <Fragment key={peer.id}>
              {index > 0 ? (
                <Text style={[styles.text, { color: tokens.placeholder }]}>{t("and")}</Text>
              ) : null}
              <PeerChip color={peerColor(peer.id)} identity={peer.id} name={peer.name} />
            </Fragment>
          ))
        ) : (
          <View style={styles.chip}>
            <View style={styles.stack}>
              {peers.slice(0, 3).map((peer, index) => (
                <View key={peer.id} style={index > 0 ? styles.stacked : undefined}>
                  <BotAvatar color={peerColor(peer.id)} identity={peer.id} size={16} />
                </View>
              ))}
            </View>
            <Text numberOfLines={1} style={muted}>
              {t("{count} Bots", { count: peers.length })}
            </Text>
          </View>
        )}
      </View>
      <OpenChevron />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: "100%",
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  sentence: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  text: { fontSize: 12, lineHeight: 16 },
  // Desktop pads its chip for a hover fill; mobile draws none, so words keep even gaps.
  chip: {
    flexShrink: 1,
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chevron: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  stack: { flexDirection: "row", alignItems: "center" },
  stacked: { marginStart: -6 },
});
