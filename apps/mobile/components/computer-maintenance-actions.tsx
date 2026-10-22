import { MenuView } from "@expo/ui/community/menu";
import type { ComputerStatus } from "@rakazo/contracts";
import { useState } from "react";
import { Alert, View } from "react-native";
import { rpc } from "../lib/api";
import { computerUpdates } from "../lib/computer-updates";
import { useI18n } from "../lib/i18n";
import { useMobileTokens, useResolvedAppearance } from "../lib/native";
import { errorText } from "../lib/user-error";
import { GlassSurface } from "./glass-surface";
import { NativeSymbol } from "./native-symbol";

type Action = "recover" | "reset" | "update";

export function ComputerMaintenanceActions({
  botId,
  computer,
  onChanged,
}: {
  botId: string;
  computer: ComputerStatus | null;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const tokens = useMobileTokens();
  const scheme = useResolvedAppearance();
  const [pending, setPending] = useState<Action | null>(null);
  const busy = Boolean(computer?.busyBotName) || computer?.state === "booting" || pending !== null;

  async function run(action: Action) {
    if (busy) return;
    setPending(action);
    try {
      if (action === "recover") await computerUpdates.start(botId, "recover");
      else if (action === "reset") await rpc("computer/reset", { botId });
      else await computerUpdates.start(botId);
      await onChanged();
    } catch (err) {
      Alert.alert(t("Could not update computer"), errorText(err, t("Try again.")));
    } finally {
      setPending(null);
    }
  }

  function confirm(action: "recover" | "reset") {
    Alert.alert(
      action === "reset" ? t("Reset computer?") : t("Recover computer?"),
      action === "reset"
        ? t("Restore the last saved workspace. Unsaved work on the computer is lost.")
        : t("Recovery restores the last saved workspace. Unsaved work may be lost."),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: action === "reset" ? t("Reset") : t("Recover computer"),
          style: "destructive",
          onPress: () => void run(action),
        },
      ],
    );
  }

  const actions = [
    {
      id: "recover",
      title: t("Recover computer"),
      explanation: t("Recreate a computer that is not working."),
      destructive: false,
      onPress: () => confirm("recover"),
    },
    {
      id: "reset",
      title: t("Reset computer"),
      explanation: t("Restore the last saved workspace."),
      destructive: true,
      onPress: () => confirm("reset"),
    },
    ...(computer?.canUpdate
      ? [
          {
            id: "update",
            title: t("Update computer"),
            explanation: t("Save the workspace and install current software."),
            destructive: false,
            onPress: () => void run("update"),
          },
        ]
      : []),
  ];

  // The header sits on the dark computer backdrop in both appearances.
  if (!computer) return <View style={{ width: 44, height: 44 }} />;
  return (
    <MenuView
      colorScheme={scheme}
      title={t("More computer actions")}
      actions={actions.map((action) => ({
        id: action.id,
        title: action.explanation,
        displayInline: true,
        subactions: [
          {
            id: action.id,
            title: action.title,
            attributes: { destructive: action.destructive, disabled: busy },
          },
        ],
      }))}
      onPressAction={({ nativeEvent }) =>
        actions.find((action) => action.id === nativeEvent.event)?.onPress()
      }
    >
      <GlassSurface
        shape="circle"
        style={{ width: 44, height: 44 }}
        fallbackStyle={{ borderRadius: 22, backgroundColor: tokens.computerBackdrop }}
      >
        <View
          accessibilityRole="button"
          accessibilityLabel={t("More computer actions")}
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <NativeSymbol
            ios="ellipsis"
            android="ellipsis-horizontal"
            color={tokens.computerIconHover}
            size={19}
          />
        </View>
      </GlassSurface>
    </MenuView>
  );
}
