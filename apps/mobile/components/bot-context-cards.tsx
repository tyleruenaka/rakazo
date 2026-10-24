import type { MemoryDocument, ScratchpadItem } from "@rakazo/contracts";
import { isEmptyBotMemory } from "@rakazo/contracts";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { rpc } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { native, useMobileTokens } from "../lib/native";
import { errorText } from "../lib/user-error";
import { BotCard, BotCardLabel, BotCardRow } from "./bot-card";
import { NativeSymbol } from "./native-symbol";
import { ProfileEditDialog } from "./profile-edit-dialog";

/**
 * Open work and memory on the bot settings page. Open work always shows its heading and +,
 * so the first item can be added; its card and the Memory card hide until they have rows.
 */
export function BotContextCards({ botId }: { botId: string }) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const [work, setWork] = useState<ScratchpadItem[]>([]);
  const [docs, setDocs] = useState<MemoryDocument[]>([]);
  const [allWork, setAllWork] = useState(false);
  const [allDocs, setAllDocs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void rpc<ScratchpadItem[]>("scratchpad/list", { botId })
      .then((items) => {
        if (current) setWork(items);
      })
      .catch((err) => {
        if (current) setError(errorText(err));
      });
    void rpc<MemoryDocument[]>("memory/list", { botId, scope: "bot" })
      .then((documents) => {
        if (current) setDocs(documents.filter((doc) => !isEmptyBotMemory(doc)));
      })
      .catch((err) => {
        if (current) setError(errorText(err));
      });
    return () => {
      current = false;
    };
  }, [botId]);
  const showMore = (onPress: () => void) => (
    <Pressable
      key="more"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.more, pressed && { backgroundColor: native.fillPressed }]}
    >
      <Text style={{ color: native.secondaryLabel, fontSize: 15 }}>{t("Show more")}</Text>
    </Pressable>
  );
  return (
    <>
      <View style={styles.section}>
        <View style={styles.labelRow}>
          <BotCardLabel>{t("Open work")}</BotCardLabel>
          <ProfileEditDialog
            value=""
            label={t("Add open work")}
            editLabel={t("Add open work")}
            maxLength={200}
            icon="plus"
            onCommit={async (title) => {
              if (!title || busy) return;
              setBusy(true);
              try {
                const item = await rpc<ScratchpadItem>("scratchpad/create", { botId, title });
                setWork((items) => [item, ...items]);
              } catch (err) {
                setError(errorText(err));
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
        {work.length ? (
          <BotCard>
            {(allWork ? work : work.slice(0, 5)).map((item) => (
              <View key={item.id} style={styles.workRow}>
                <Pressable
                  accessibilityLabel={`${t("Complete")} ${item.title}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: false }}
                  hitSlop={11}
                  style={styles.check}
                  disabled={busy}
                  onPress={() => {
                    setBusy(true);
                    void rpc("scratchpad/update", { itemId: item.id, status: "done" })
                      .then(() => setWork((items) => items.filter((entry) => entry.id !== item.id)))
                      .catch((err) => setError(errorText(err)))
                      .finally(() => setBusy(false));
                  }}
                >
                  <NativeSymbol
                    ios="circle"
                    android="ellipse-outline"
                    size={22}
                    color={native.secondaryLabel}
                  />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: native.label, fontSize: 17 }}>{item.title}</Text>
                  {item.notes ? (
                    <Text
                      numberOfLines={3}
                      style={{ color: native.secondaryLabel, fontSize: 13, marginTop: 2 }}
                    >
                      {item.notes}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
            {!allWork && work.length > 5 ? showMore(() => setAllWork(true)) : null}
          </BotCard>
        ) : null}
      </View>
      {docs.length ? (
        <View style={styles.section}>
          <BotCardLabel>{t("Memory")}</BotCardLabel>
          <BotCard>
            {(allDocs ? docs : docs.slice(0, 5)).map((doc) => (
              <BotCardRow
                key={doc.id}
                title={doc.path}
                accessibilityLabel={doc.path}
                onPress={() => Alert.alert(doc.path, doc.content)}
              />
            ))}
            {!allDocs && docs.length > 5 ? showMore(() => setAllDocs(true)) : null}
          </BotCard>
        </View>
      ) : null}
      {error ? <Text style={{ color: tokens.destructive, marginTop: 16 }}>{error}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  labelRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingEnd: 8,
  },
  workRow: {
    minHeight: 49,
    paddingStart: 19,
    paddingEnd: 19.5,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  check: { width: 22, minHeight: 22, alignItems: "center", justifyContent: "center" },
  more: { minHeight: 49, alignItems: "center", justifyContent: "center" },
});
