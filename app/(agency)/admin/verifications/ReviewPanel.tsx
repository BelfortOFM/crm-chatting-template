"use client";

import { useState, useTransition } from "react";
import { Check, X, Eye, EyeOff, Trash2, ShieldOff, ShieldCheck } from "lucide-react";
import { approveVerification, rejectVerification, purgeDocuments, setIdentityRequired } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const KINDS = [
  { kind: "id_front", label: "Recto" },
  { kind: "id_back", label: "Verso" },
  { kind: "selfie", label: "Visage" },
  { kind: "id_with_face", label: "Visage + pièce" },
] as const;

export function ReviewPanel({
  chatterId,
  fullName,
  status,
  hasDocuments,
  required,
}: {
  chatterId: string;
  fullName: string;
  status: string;
  hasDocuments: boolean;
  required: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const toggle = (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => setIdentityRequired(chatterId, !required).then(() => undefined))}
      className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
    >
      {required ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
      {required ? "Dispenser de la vérification" : "Exiger la vérification"}
    </button>
  );

  if (!required) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Vérification levée pour ce chatter : son espace est accessible sans dépôt de pièces.
        </p>
        {toggle}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasDocuments ? (
        <>
          {/* Les pièces ne s'affichent que sur demande explicite : elles n'ont
              pas à apparaître par surprise sur un écran partagé. */}
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-xs font-semibold text-foreground transition-colors hover:bg-border"
          >
            {shown ? <EyeOff size={14} /> : <Eye size={14} />}
            {shown ? "Masquer les pièces" : "Afficher les pièces"}
          </button>

          {shown && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {KINDS.map((k) => (
                <figure key={k.kind} className="overflow-hidden rounded-xl border border-border">
                  <figcaption className="border-b border-border bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                    {k.label}
                  </figcaption>
                  <a
                    href={`/admin/verifications/document?chatter=${chatterId}&kind=${k.kind}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- flux déchiffré à la volée, pas une image optimisable */}
                    <img
                      src={`/admin/verifications/document?chatter=${chatterId}&kind=${k.kind}`}
                      alt={`${k.label} — ${fullName}`}
                      className="h-40 w-full bg-black object-contain"
                    />
                  </a>
                </figure>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted">
          {status === "approved"
            ? "Pièces supprimées — l'identité reste validée."
            : "Aucune pièce déposée pour l'instant."}
        </p>
      )}

      {status === "submitted" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => approveVerification(chatterId).then(() => undefined))}
            className="bg-success/15 bg-none text-success shadow-none hover:bg-success/25 hover:brightness-100"
          >
            <span className="inline-flex items-center gap-1.5">
              <Check size={15} /> Valider l&apos;identité
            </span>
          </Button>
          <Button type="button" variant="ghost" onClick={() => setRejecting((v) => !v)} disabled={pending}>
            <span className="inline-flex items-center gap-1.5">
              <X size={15} /> Refuser
            </span>
          </Button>
        </div>
      )}

      {rejecting && (
        <form
          action={(fd) => startTransition(async () => {
            await rejectVerification(chatterId, fd);
            setRejecting(false);
          })}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <Input
            name="reason"
            required
            placeholder="Motif (ex : photo floue, document expiré)"
            aria-label="Motif du refus"
            className="!mt-0 flex-1"
          />
          <Button
            type="submit"
            disabled={pending}
            className="bg-danger/15 bg-none text-danger shadow-none hover:bg-danger/25 hover:brightness-100"
          >
            Confirmer le refus
          </Button>
        </form>
      )}

      {toggle}

      {status === "approved" && hasDocuments && (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => purgeDocuments(chatterId).then(() => undefined))}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-danger/80 transition-colors hover:text-danger"
        >
          <Trash2 size={13} /> Supprimer les pièces maintenant
        </button>
      )}
    </div>
  );
}
