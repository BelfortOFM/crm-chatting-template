"use client";

import { useActionState, useState } from "react";
import { KeyRound, AlertCircle, Check } from "lucide-react";
import { setOwnPassword, type PasswordState } from "./actions";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const initialState: PasswordState = {};
const MIN_LENGTH = 8;

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(setOwnPassword, initialState);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const longEnough = password.length >= MIN_LENGTH;
  const matching = confirm.length > 0 && password === confirm;

  return (
    <form action={formAction} className="space-y-4">
      <Field label="New password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_LENGTH}
          autoComplete="new-password"
          placeholder={`${MIN_LENGTH} characters minimum`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      <Field label="Confirm it" htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Type it again"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>

      {/* Contrôles affichés en direct : corriger avant l'envoi plutôt que de
          se voir refuser après coup. */}
      <ul className="space-y-1 text-xs">
        <li className={longEnough ? "text-success" : "text-muted"}>
          {longEnough ? <Check size={12} className="mr-1 inline" /> : "· "}
          At least {MIN_LENGTH} characters
        </li>
        <li className={matching ? "text-success" : "text-muted"}>
          {matching ? <Check size={12} className="mr-1 inline" /> : "· "}
          Both entries match
        </li>
      </ul>

      {state.error && (
        <p className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending || !longEnough || !matching} className="w-full">
        <span className="inline-flex items-center gap-1.5">
          <KeyRound size={15} />
          {pending ? "Saving…" : "Set my password"}
        </span>
      </Button>
    </form>
  );
}
