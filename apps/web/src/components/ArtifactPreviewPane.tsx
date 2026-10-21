import { Trans, useLingui } from "@lingui/react/macro";
import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type { Artifact, ArtifactVersion } from "@rakazo/contracts";
import { isAttachmentImageMimeType } from "@rakazo/contracts";
import { Button, NativeSelect, NativeSelectOption } from "@rakazo/ui-web";
import { Download, Lock, Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { decodeArtifactBase64, downloadArtifactBytes } from "../lib/artifact-open";
import { formatRelativeTime } from "../lib/relative-time";
import { rpc } from "../lib/rpc";
import { useObjectUrl } from "../lib/use-object-url";
import { errorText } from "../lib/user-error";
import { PdfViewer } from "./PdfViewer";
import { SandboxedHtmlViewer } from "./SandboxedHtmlViewer";

/** Version picker, download and full preview of one artifact family. */
export function ArtifactPreviewPane({
  artifactId,
  maximized = false,
  onToggleMaximize,
  onClose,
}: {
  artifactId: string;
  maximized?: boolean;
  /** The Artifacts screen hides its list to maximize; a dialog passes onClose instead. */
  onToggleMaximize?: () => void;
  onClose?: () => void;
}) {
  const { t } = useLingui();
  const [versions, setVersions] = useState<ArtifactVersion[] | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; artifact: Artifact; bytes: Uint8Array }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setVersions(null);
    setSelectedVersionId(null);
    void rpc.artifacts
      .listVersions({ familyId: artifactId })
      .then((list) => {
        if (cancelled) return;
        setVersions(list);
        setSelectedVersionId(list[0]?.id ?? artifactId);
      })
      .catch(() => {
        if (!cancelled) setSelectedVersionId(artifactId);
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  useEffect(() => {
    if (!selectedVersionId) return;
    let cancelled = false;
    setState({ status: "loading" });
    void rpc.artifacts
      .getById({ artifactId: selectedVersionId })
      .then((artifact) => {
        if (!cancelled) {
          setState({
            status: "ready",
            artifact,
            bytes: decodeArtifactBase64(artifact.contentBase64),
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: errorText(error, t`Could not load this artifact.`),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedVersionId, t]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b-[0.5px] border-border px-6 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-semibold">
            {state.status === "ready" ? state.artifact.name : t`Loading…`}
          </h2>
          {state.status === "ready" && state.artifact.description ? (
            <p className="truncate text-[12.5px] text-muted-foreground">
              {state.artifact.description}
            </p>
          ) : null}
        </div>
        {versions && versions.length > 1 && selectedVersionId ? (
          <NativeSelect
            aria-label={t`Version`}
            className="w-auto shrink-0 text-[13px]"
            value={selectedVersionId}
            onChange={(event) => setSelectedVersionId(event.target.value)}
          >
            {versions.map((entry) => (
              <NativeSelectOption key={entry.id} value={entry.id}>
                {`v${entry.version} · ${formatRelativeTime(entry.createdAt)}`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : null}
        {state.status === "ready" ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadArtifactBytes(state.artifact.name, state.artifact.mimeType, state.bytes)
              }
            >
              <Download className="me-1.5" size={15} strokeWidth={1.9} />
              <Trans>Download</Trans>
            </Button>
            {onToggleMaximize ? (
              <Button
                variant="outline"
                size="icon"
                aria-label={maximized ? t`Show list` : t`Maximize`}
                title={maximized ? t`Show list` : t`Maximize`}
                onClick={onToggleMaximize}
              >
                {maximized ? (
                  <Minimize2 size={15} strokeWidth={1.9} />
                ) : (
                  <Maximize2 size={15} strokeWidth={1.9} />
                )}
              </Button>
            ) : null}
          </>
        ) : null}
        {onClose ? (
          <Button variant="outline" size="icon" aria-label={t`Close`} onClick={onClose}>
            <X size={15} strokeWidth={1.9} />
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 p-5">
        {state.status === "loading" ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground/80">
            <Trans>Loading…</Trans>
          </div>
        ) : state.status === "error" ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive">
            {state.message}
          </div>
        ) : (
          <div className="relative h-full overflow-hidden rounded-[14px] border-[0.5px] border-card-border">
            <ArtifactPreview artifact={state.artifact} bytes={state.bytes} />
            {state.artifact.mimeType === "text/html" ? (
              <div className="absolute bottom-3 end-3 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1.5 text-[11px] text-white">
                <Lock size={12} strokeWidth={2} />
                <span>
                  <Trans>Isolated preview — no access to your account</Trans>
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function ArtifactPreview({ artifact, bytes }: { artifact: Artifact; bytes: Uint8Array }) {
  if (artifact.mimeType === "text/html") {
    const html = new TextDecoder("utf-8").decode(bytes);
    return <SandboxedHtmlViewer html={html} title={artifact.name} />;
  }
  if (artifact.mimeType === "text/markdown") {
    const text = new TextDecoder("utf-8").decode(bytes);
    return (
      <div className="h-full overflow-y-auto bg-background">
        <article className="mx-auto w-full max-w-[760px] px-8 py-10 text-[16px] leading-7 text-foreground">
          <ChatMarkdown>{text}</ChatMarkdown>
        </article>
      </div>
    );
  }
  if (artifact.mimeType === "application/pdf") {
    return <PdfViewer bytes={bytes} title={artifact.name} />;
  }
  if (isAttachmentImageMimeType(artifact.mimeType)) {
    return <ImagePreview bytes={bytes} mimeType={artifact.mimeType} name={artifact.name} />;
  }
  return (
    <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground/80">
      <Trans>Preview isn't available for this file type — download it to view it.</Trans>
    </div>
  );
}

function ImagePreview({
  bytes,
  mimeType,
  name,
}: {
  bytes: Uint8Array;
  mimeType: string;
  name: string;
}) {
  const url = useObjectUrl(bytes, mimeType);
  if (!url) return null;
  return (
    <div className="grid h-full place-items-center overflow-auto bg-muted/40 p-4">
      <img src={url} alt={name} className="max-h-full max-w-full rounded-lg shadow-sm" />
    </div>
  );
}
