import { t } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ActionApprovalRule, ActionAutoReviewSettings } from "@rakazo/contracts";
import { Button, Switch } from "@rakazo/ui-web";
import { useEffect, useId, useState } from "react";
import { useSpaceRpc } from "../lib/space-rpc";
import { errorText } from "../lib/user-error";
import { SettingsCard, SettingsRow } from "./SettingsLayout";

function describeRule(rule: ActionApprovalRule): string {
  if (rule.effect === "require_approval") {
    if (rule.matchKind === "category") {
      if (rule.matchValue === "email") return t`Ask before email actions`;
      if (rule.matchValue === "purchase") return t`Ask before purchase actions`;
      return t`Ask before ${rule.matchValue} actions`;
    }
    if (rule.matchKind === "connector") return t`Ask before ${rule.matchValue} connector`;
    return t`Ask before ${rule.matchValue}`;
  }
  if (rule.matchKind === "category") {
    if (rule.matchValue === "email") return t`Allow email actions without asking`;
    if (rule.matchValue === "purchase") return t`Allow purchase actions without asking`;
    return t`Allow ${rule.matchValue} actions without asking`;
  }
  if (rule.matchKind === "connector") return t`Allow ${rule.matchValue} connector without asking`;
  return t`Allow ${rule.matchValue} without asking`;
}

export function ApprovalRulesSettings() {
  const rpc = useSpaceRpc();
  const { t } = useLingui();
  const autoReviewId = useId();
  const [rules, setRules] = useState<ActionApprovalRule[]>([]);
  const [autoReview, setAutoReview] = useState<ActionAutoReviewSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPreset, setSavingPreset] = useState<"email" | "purchase" | null>(null);
  const [savingAutoReview, setSavingAutoReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [nextRules, nextAutoReview] = await Promise.all([
        rpc.approvalRules.list(),
        rpc.autoReview.get(),
      ]);
      setRules(nextRules);
      setAutoReview(nextAutoReview);
    } catch (err) {
      setError(errorText(err, t`Could not load approval rules`));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function setPreset(matchValue: "email" | "purchase") {
    if (loading || savingPreset) return;
    if (
      rules.some(
        (rule) =>
          rule.effect === "require_approval" &&
          rule.matchKind === "category" &&
          rule.matchValue === matchValue,
      )
    ) {
      return;
    }
    setSavingPreset(matchValue);
    setError(null);
    try {
      const saved = await rpc.approvalRules.set({
        effect: "require_approval",
        matchKind: "category",
        matchValue,
      });
      setRules((current) => [...current, saved]);
    } catch (err) {
      setError(errorText(err, t`Could not save rule`));
    } finally {
      setSavingPreset(null);
    }
  }

  async function removeRule(id: string) {
    setError(null);
    try {
      await rpc.approvalRules.remove({ id });
      setRules((current) => current.filter((rule) => rule.id !== id));
    } catch (err) {
      setError(errorText(err, t`Could not remove rule`));
    }
  }

  async function toggleAutoReview(enabled: boolean) {
    if (loading || savingAutoReview) return;
    setSavingAutoReview(true);
    setError(null);
    try {
      setAutoReview(await rpc.autoReview.set({ enabled }));
    } catch (err) {
      setError(errorText(err, t`Could not save Auto Review`));
    } finally {
      setSavingAutoReview(false);
    }
  }

  return (
    <div data-testid="action-confirmation-settings" className="space-y-7">
      <SettingsCard>
        <SettingsRow
          label={<Trans>Flag unexpected actions</Trans>}
          htmlFor={autoReviewId}
          description={
            autoReview?.enabled && !autoReview.checkerAvailable ? (
              <Trans>Add a model in Settings to use this.</Trans>
            ) : null
          }
        >
          <Switch
            id={autoReviewId}
            data-testid="auto-review-toggle"
            checked={autoReview?.enabled ?? false}
            disabled={loading || savingAutoReview || !autoReview}
            onCheckedChange={(checked) => void toggleAutoReview(checked)}
          />
        </SettingsRow>
      </SettingsCard>
      <SettingsCard>
        <div className="flex flex-wrap gap-2 px-3.5 py-2.5">
          <Button
            variant="secondary"
            disabled={loading || savingPreset !== null}
            onClick={() => void setPreset("email")}
          >
            <Trans>Ask before sending external email</Trans>
          </Button>
          <Button
            variant="secondary"
            disabled={loading || savingPreset !== null}
            onClick={() => void setPreset("purchase")}
          >
            <Trans>Ask before purchases</Trans>
          </Button>
        </div>
        {loading ? (
          <p className="px-3.5 py-2.5 text-[12.5px] leading-[19px] text-description">
            <Trans>Loading rules…</Trans>
          </p>
        ) : (
          rules.map((rule) => (
            <SettingsRow key={rule.id} label={describeRule(rule)}>
              <Button variant="text" size="sm" onClick={() => void removeRule(rule.id)}>
                <Trans>Remove</Trans>
              </Button>
            </SettingsRow>
          ))
        )}
      </SettingsCard>
      {error ? <p className="px-2 text-[12.5px] text-destructive">{error}</p> : null}
    </div>
  );
}
