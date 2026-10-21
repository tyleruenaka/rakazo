import type { ReactNode } from "react";

/** A settings card with its section label above it. */
export function SettingsGroup({
  label,
  testId,
  children,
}: {
  label?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={testId}>
      {label ? (
        <h3 className="mb-2 px-2 text-[12px] leading-4 text-muted-foreground">{label}</h3>
      ) : null}
      <SettingsCard>{children}</SettingsCard>
    </section>
  );
}

export function SettingsCard({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-[14px] border-[0.5px] border-card-border bg-card py-2 ${className}`}>
      {children}
    </div>
  );
}

/** One setting: its label and description at the left, its control at the right. */
export function SettingsRow({
  label,
  labelId,
  htmlFor,
  description,
  children,
}: {
  label: ReactNode;
  labelId?: string;
  /** Id of the control the label names, for a switch or field. */
  htmlFor?: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  const labelClass = "block text-[12.5px] leading-[19px]";
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-2.5">
      <div className="min-w-0">
        {htmlFor ? (
          <label id={labelId} htmlFor={htmlFor} className={labelClass}>
            {label}
          </label>
        ) : (
          <div id={labelId} className={labelClass}>
            {label}
          </div>
        )}
        {description ? <SettingsDescription>{description}</SettingsDescription> : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsDescription({ children }: { children: ReactNode }) {
  return <div className="text-[12.5px] leading-[19px] text-description">{children}</div>;
}
