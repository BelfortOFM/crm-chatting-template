"use client";

import { useActionState, useRef, useState } from "react";
import { RefreshCw, UserPlus, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";
import { createChatter, type ActionState } from "./actions";
import { Field, Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { generatePassword, suggestEmail, credentialsMessage } from "@/lib/credentials";

const initialState: ActionState = {};

export function CreateChatterForm({ emailDomain, appUrl }: { emailDomain: string; appUrl: string }) {
  const [state, formAction, pending] = useActionState(createChatter, initialState);

  return (
    <div className="mt-3 space-y-4">
      {state.created && (
        <div className="rounded-xl border border-success/40 bg-success/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            <CheckCircle2 size={16} />
            Compte créé pour {state.created.fullName}
          </p>
          <p className="mt-1 text-xs text-muted">
            Le mot de passe n&apos;est affiché qu&apos;une fois — transmets-le maintenant.
          </p>

          <dl className="mt-3 space-y-1.5 rounded-lg bg-background/40 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-xs uppercase tracking-wide text-muted">Identifiant</dt>
              <dd className="font-mono break-all text-foreground">{state.created.email}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-xs uppercase tracking-wide text-muted">Mot de passe</dt>
              <dd className="font-mono font-bold break-all text-foreground">{state.created.password}</dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton
              label="Copier le message complet"
              value={credentialsMessage(
                state.created.fullName,
                state.created.email,
                state.created.password,
                appUrl
              )}
              className="bg-success/15 text-success hover:bg-success/25"
            />
            <CopyButton label="Copier le mot de passe" value={state.created.password} />
          </div>
        </div>
      )}

      {/* La clé change à chaque création réussie : React remonte le bloc et
          vide les champs, sans effet ni setState de nettoyage. */}
      <ChatterFields
        key={state.created?.email ?? "new"}
        emailDomain={emailDomain}
        formAction={formAction}
        pending={pending}
        error={state.error}
      />
    </div>
  );
}

function ChatterFields({
  emailDomain,
  formAction,
  pending,
  error,
}: {
  emailDomain: string;
  formAction: (formData: FormData) => void;
  pending: boolean;
  error?: string;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  // Une fois l'email saisi à la main, on cesse de le dériver du nom.
  const emailTouched = useRef(false);
  // Champ non contrôlé : rempli à la demande par le bouton « générer », sinon
  // laissé vide et c'est le serveur qui génère.
  const passwordRef = useRef<HTMLInputElement>(null);

  function onNameChange(value: string) {
    setFullName(value);
    if (!emailTouched.current) setEmail(suggestEmail(value, emailDomain));
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom complet" htmlFor="full_name">
          <Input
            id="full_name"
            name="full_name"
            required
            placeholder="Ex: Léa Dupont"
            value={fullName}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </Field>
        <Field label="Identifiant (email)" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder={`lea@${emailDomain}`}
            value={email}
            onChange={(e) => {
              emailTouched.current = true;
              setEmail(e.target.value);
            }}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="password">Mot de passe</Label>
          <div className="flex items-end gap-2">
            {/* Volontairement en clair : l'admin doit pouvoir le relire et le dicter. */}
            <Input
              id="password"
              name="password"
              type="text"
              ref={passwordRef}
              minLength={8}
              placeholder="Généré automatiquement"
              className="font-mono"
            />
            <button
              type="button"
              onClick={() => {
                if (passwordRef.current) passwordRef.current.value = generatePassword();
              }}
              aria-label="Générer un mot de passe"
              className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        <Field label="Commission (%) — optionnel" htmlFor="rate_percent">
          <Input
            id="rate_percent"
            name="rate_percent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            inputMode="decimal"
            placeholder="Ex: 30"
          />
        </Field>
      </div>

      {/* Coché par défaut : le contrôle d'identité doit être le cas normal,
          le dispenser un geste délibéré. */}
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-surface-2/40 p-3.5 transition-colors hover:border-accent/40">
        <input
          type="checkbox"
          name="require_identity"
          defaultChecked
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <ShieldCheck size={14} className="text-accent" />
            Exiger la vérification d&apos;identité
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            Le chatter devra photographier sa pièce d&apos;identité (recto/verso) et son visage
            avant d&apos;accéder à son espace. Décoche uniquement si tu as déjà vérifié son
            identité par ailleurs — l&apos;accès sera alors immédiat.
          </span>
        </span>
      </label>

      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        <span className="inline-flex items-center gap-1.5">
          <UserPlus size={15} />
          {pending ? "Création…" : "Créer le compte chatter"}
        </span>
      </Button>
    </form>
  );
}
