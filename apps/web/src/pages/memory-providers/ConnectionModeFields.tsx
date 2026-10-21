import { Trans, useLingui } from "@lingui/react/macro";
import { Field, FieldLabel, FieldTitle, Input } from "@rakazo/ui-web";
import { useId } from "react";
import { ListboxSelect } from "../../components/ListboxSelect";

export type ConnectionMode = "cloud" | "local";

/** Hosted service or a self-hosted instance at a base URL. */
export function ConnectionModeFields({
  busy,
  mode,
  onModeChange,
  baseUrl,
  onBaseUrlChange,
  baseUrlPlaceholder,
}: {
  busy: boolean;
  mode: ConnectionMode;
  onModeChange: (mode: ConnectionMode) => void;
  baseUrl: string;
  onBaseUrlChange: (baseUrl: string) => void;
  baseUrlPlaceholder: string;
}) {
  const { t } = useLingui();
  const baseUrlId = useId();
  return (
    <>
      <div className="mt-4 flex items-center justify-between gap-4">
        <FieldTitle>
          <Trans>Connection</Trans>
        </FieldTitle>
        <ListboxSelect
          label={t`Connection`}
          options={[
            { value: "cloud", label: t`Cloud` },
            { value: "local", label: t`Local` },
          ]}
          value={mode}
          disabled={busy}
          onChange={onModeChange}
        />
      </div>

      {mode === "local" ? (
        <Field className="mt-4">
          <FieldLabel htmlFor={baseUrlId}>
            <Trans>Base URL</Trans>
          </FieldLabel>
          <Input
            id={baseUrlId}
            value={baseUrl}
            disabled={busy}
            onChange={(event) => onBaseUrlChange(event.target.value)}
            placeholder={baseUrlPlaceholder}
          />
        </Field>
      ) : null}
    </>
  );
}
