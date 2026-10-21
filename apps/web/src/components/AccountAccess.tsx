import { Trans, useLingui } from "@lingui/react/macro";
import type { AccountSecurity } from "@rakazo/contracts";
import { Button, Input, Label } from "@rakazo/ui-web";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { fetchAccountSecurity, requestAccountDeletionCode } from "../lib/account-security";
import { authClient } from "../lib/auth";
import { runSsoFlow } from "../lib/sso-flow";
import { authErrorText } from "../lib/user-error";

/** Account actions in the Account card, at the right of the identity passed as children. */
export function AccountAccess({
  onSecurity,
  children,
}: {
  onSecurity?: (security: AccountSecurity) => void;
  children?: ReactNode;
}) {
  const { t } = useLingui();
  const [security, setSecurity] = useState<AccountSecurity | null>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    return code ? authErrorText({ code }, t`Could not continue`) : null;
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void fetchAccountSecurity()
      .then((value) => {
        if (active) {
          setSecurity(value);
          onSecurity?.(value);
        }
      })
      .catch(() => {
        if (active) setError(t`Could not continue`);
      });
    return () => {
      active = false;
    };
  }, [attempt, onSecurity]);
  async function action(run: () => Promise<unknown>, sso = false) {
    if (!sso) setPending(true);
    setError(null);
    try {
      await run();
    } catch (error) {
      setError(error instanceof Error ? error.message : t`Could not continue`);
    } finally {
      if (!sso) setPending(false);
    }
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-4 px-3.5 py-2.5">
        {children}
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {security?.sso && !security.ssoLinked ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                void action(async () => {
                  const result = await runSsoFlow(
                    (disableRedirect, callbackURL) =>
                      authClient.linkSocial({
                        disableRedirect,
                        provider: "oidc",
                        callbackURL: callbackURL(window.location.href),
                        errorCallbackURL: callbackURL(window.location.href),
                      }),
                    [window.location.href],
                  );
                  if (result.error)
                    throw new Error(authErrorText(result.error, t`Could not continue`));
                }, true)
              }
            >
              <Trans>Link SSO</Trans>
            </Button>
          ) : null}
          <Button
            variant="secondary"
            className="text-destructive hover:text-destructive"
            onClick={() => setOpen((value) => !value)}
          >
            <Trans>Delete account</Trans>
          </Button>
        </div>
      </div>
      {open ? (
        <div className="space-y-3 px-3.5 py-2.5">
          <p className="text-sm">
            <Trans>This permanently deletes your account and data.</Trans>
          </p>
          {!security ? (
            <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              <Trans>Retry</Trans>
            </Button>
          ) : security.hasPassword ? (
            <div>
              <Label htmlFor="delete-password">
                <Trans>Current password</Trans>
              </Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          ) : (
            <>
              {security.sso ? (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    void action(async () => {
                      const result = await runSsoFlow(
                        (disableRedirect, callbackURL) =>
                          authClient.signIn.social({
                            disableRedirect,
                            provider: "oidc",
                            additionalData: { reauthenticate: true },
                            callbackURL: callbackURL(window.location.href),
                            errorCallbackURL: callbackURL(window.location.href),
                          }),
                        [window.location.href],
                      );
                      if (result.error)
                        throw new Error(authErrorText(result.error, t`Could not continue`));
                    }, true)
                  }
                >
                  <Trans>Sign in again</Trans>
                </Button>
              ) : null}
              {security.emailDeletion ? (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    void action(async () => {
                      await requestAccountDeletionCode();
                      setSent(true);
                    })
                  }
                >
                  <Trans>Send deletion code</Trans>
                </Button>
              ) : null}
              {sent ? (
                <div>
                  <Label htmlFor="deletion-code">
                    <Trans>Deletion code</Trans>
                  </Label>
                  <Input
                    id="deletion-code"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </div>
              ) : null}
            </>
          )}
          <Button
            variant="destructive"
            disabled={
              pending ||
              !security ||
              (security.hasPassword && !password) ||
              (!security.hasPassword && !security.freshOidcAuth && !code.trim())
            }
            onClick={() =>
              void action(async () => {
                const current = await fetchAccountSecurity();
                setSecurity(current);
                onSecurity?.(current);
                if (!current.hasPassword && !current.freshOidcAuth && !code.trim()) return;
                if (current.hasPassword && !password) return;
                const result = await authClient.deleteUser(
                  current.hasPassword ? { password } : code.trim() ? { token: code.trim() } : {},
                );
                if (result.error)
                  throw new Error(authErrorText(result.error, t`Could not continue`));
                window.location.assign("/sign-in");
              })
            }
          >
            <Trans>Delete account</Trans>
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="px-3.5 py-2.5 text-[12.5px] leading-[19px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
