"use client";

import { useState, useTransition } from "react";
import { KeyRound, AlertCircle } from "lucide-react";
import { resetChatterPassword } from "../actions";
import { CopyButton } from "@/components/ui/CopyButton";
import { Button } from "@/components/ui/Button";
import { credentialsMessage } from "@/lib/credentials";

export function ResetPasswordPanel({
  chatterId,
  fullName,
  email,
  appUrl,
}: {
  chatterId: string;
  fullName: string;
  email: string;
  appUrl: string;
}) {
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await resetChatterPassword(chatterId);
      if (res.error) setError(res.error);
      else setPassword(res.password ?? null);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted">Identifiant</p>
          <p className="truncate font-mono text-sm text-foreground">{email || "—"}</p>
        </div>
        <Button type="button" variant="secondary" onClick={run} disabled={pending} className="shrink-0">
          {pending ? "Génération…" : "Réinitialiser le mot de passe"}
        </Button>
      </div>

      {password && (
        <div className="rounded-xl border border-success/40 bg-success/10 p-3.5">
          <p className="flex items-center gap-2 text-xs font-semibold text-success">
            <KeyRound size={14} /> Nouveau mot de passe — affiché une seule fois
          </p>
          <p className="mt-2 font-mono text-base font-bold text-foreground">{password}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton
              label="Copier le message"
              value={credentialsMessage(fullName, email, password, appUrl)}
              className="bg-success/15 text-success hover:bg-success/25"
            />
            <CopyButton label="Copier le mot de passe" value={password} />
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
