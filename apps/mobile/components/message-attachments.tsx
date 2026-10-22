import { isAttachmentAudioMimeType, type MessageBlock } from "@rakazo/contracts";
import { formatFileSize } from "@rakazo/core";
import type { TextProps } from "react-native";
import { Alert, Pressable, Text } from "react-native";
import { mobileTokens } from "../lib/appearance";
import type { MobileArtifactTarget } from "../lib/artifact-open";
import { openMobileArtifact } from "../lib/artifact-open";
import { useI18n } from "../lib/i18n";
import { isInlineImageMimeType } from "../lib/inline-image";
import { errorText } from "../lib/user-error";
import { AudioAttachment } from "./audio-attachment";
import type { ImageArtifactPreviewTarget } from "./image-artifact-viewer";
import { InlineImageAttachment } from "./inline-image-attachment";
import type { MarkdownArtifactPreviewTarget } from "./markdown-artifact-preview";

export type MessageAttachment = Extract<MessageBlock, { kind: "image" | "file" }>;

/** A message's images and files: inline previews, audio players and file rows that open. */
export function MessageAttachments({
  attachments,
  role,
  target,
  actionProps,
  onPreviewImage,
  onPreviewMarkdown,
}: {
  attachments: readonly MessageAttachment[];
  role: string;
  target: MobileArtifactTarget;
  actionProps?: Pick<TextProps, "onLongPress" | "accessibilityActions" | "onAccessibilityAction">;
  onPreviewImage: (target: ImageArtifactPreviewTarget) => void;
  onPreviewMarkdown: (target: MarkdownArtifactPreviewTarget) => void;
}) {
  const { t } = useI18n();
  const tokens = mobileTokens();
  return (
    <>
      {attachments.map((attachment, index) =>
        attachment.kind === "image" ? (
          attachment.artifactId && isInlineImageMimeType(attachment.mimeType) ? (
            <InlineImageAttachment
              key={`${attachment.artifactId}-${index}`}
              threadTarget={target}
              artifactId={attachment.artifactId}
              name={attachment.name ?? t("Image")}
              mimeType={attachment.mimeType ?? "image/png"}
              labelColor={role === "user" ? tokens.chatUserForeground : tokens.foreground}
              pressableProps={actionProps}
              onOpen={() =>
                onPreviewImage({
                  artifactId: attachment.artifactId!,
                  name: attachment.name ?? t("Image"),
                  mimeType: attachment.mimeType ?? "image/png",
                })
              }
            />
          ) : (
            <Pressable
              {...actionProps}
              key={`${attachment.artifactId ?? attachment.name ?? "image"}-${index}`}
              onPress={() =>
                attachment.artifactId
                  ? void openMobileArtifact(
                      target,
                      attachment.artifactId,
                      attachment.name ?? t("Image"),
                      attachment.mimeType ?? "image/png",
                    ).catch((err) =>
                      Alert.alert(t("Could not open image"), errorText(err, t("Try again."))),
                    )
                  : undefined
              }
            >
              <Text
                style={{
                  color: role === "user" ? tokens.chatUserForeground : tokens.foreground,
                  fontSize: 15,
                }}
              >
                🖼 {attachment.name ?? t("Image")}
              </Text>
            </Pressable>
          )
        ) : attachment.artifactId && isAttachmentAudioMimeType(attachment.mimeType ?? "") ? (
          <AudioAttachment
            pressableProps={actionProps}
            key={`${attachment.artifactId}-${index}`}
            target={target}
            artifactId={attachment.artifactId}
            name={attachment.name ?? t("File")}
            mimeType={attachment.mimeType!}
            labelColor={role === "user" ? tokens.chatUserForeground : undefined}
          />
        ) : (
          <Pressable
            {...actionProps}
            key={`${attachment.artifactId ?? attachment.name ?? "file"}-${index}`}
            onPress={() =>
              attachment.artifactId
                ? attachment.mimeType === "text/markdown"
                  ? onPreviewMarkdown({
                      artifactId: attachment.artifactId,
                      name: attachment.name ?? t("Markdown file"),
                      mimeType: attachment.mimeType,
                    })
                  : void openMobileArtifact(
                      target,
                      attachment.artifactId,
                      attachment.name ?? t("File"),
                      attachment.mimeType ?? "text/plain",
                    ).catch((err) =>
                      Alert.alert(t("Could not open file"), errorText(err, t("Try again."))),
                    )
                : undefined
            }
          >
            <Text
              style={{
                color: role === "user" ? tokens.chatUserForeground : tokens.foreground,
                fontSize: 15,
              }}
            >
              📎 {attachment.name ?? t("File")}
            </Text>
            {formatFileSize(attachment.size) ? (
              <Text
                style={{
                  color: role === "user" ? tokens.chatUserForeground : tokens.mutedForeground,
                  marginTop: 4,
                  fontSize: 13,
                }}
              >
                {formatFileSize(attachment.size)}
              </Text>
            ) : null}
          </Pressable>
        ),
      )}
    </>
  );
}
