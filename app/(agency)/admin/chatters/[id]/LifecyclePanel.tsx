"use client";

import { useState, useTransition } from "react";
import { UserMinus, UserCheck, Pencil, Check, X, Trash2, AlertTriangle } from "lucide-react";
import { setChatterActive, renameChatter, deleteChatter } from "../actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function LifecyclePanel({
  chatterId,
  fullName,
  active,
  leftOn,
  hasHistory,
}: {
  chatterId: string;
  fullName: string;
  active: boolean;
  leftOn: string | null;
  /** Un shift declare ou un versement : la suppression detruirait des chiffres. */
  hasHistory: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {editing ? (
        <form
          action={(fd) => {
            startTransition(async () => {
              await renameChatter(chatterId, fd);
              setEditing(false);
            });
          }}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <Input name="full_name" defaultValue={fullName} required aria-label="Nom du chatter" className="!mt-0 flex-1" />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending} className="!py-2 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <Check size={14} /> Enregistrer
              </span>
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)} className="!py-2 text-xs">
              <X size={14} />
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">Statut</p>
            <p className="mt-0.5 text-sm text-foreground">
              {active ? (
                <span className="font-medium text-success">Actif</span>
              ) : (
                <span className="font-medium text-muted">
                  Parti{leftOn ? ` le ${new Date(leftOn).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}` : ""}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
          >
            <Pencil size={13} /> Renommer
          </button>
        </div>
      )}

      {active ? (
        confirming ? (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-3.5">
            <p className="text-sm text-foreground">
              Retirer <strong>{fullName}</strong> de l&apos;effectif ?
            </p>
            <p className="mt-1 text-xs text-muted">
              Son accès est coupé et ses modèles sont libérés. Tout son historique de CA et ses
              versements passés sont conservés — c&apos;est réversible.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => {
                  await setChatterActive(chatterId, false);
                  setConfirming(false);
                })}
                className="bg-danger/15 bg-none text-danger shadow-none hover:bg-danger/25 hover:brightness-100"
              >
                {pending ? "…" : "Confirmer le départ"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg text-xs font-medium text-danger/80 transition-colors hover:text-danger"
          >
            <UserMinus size={14} /> Marquer comme parti
          </button>
        )
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => startTransition(() => setChatterActive(chatterId, true).then(() => undefined))}
        >
          <span className="inline-flex items-center gap-1.5">
            <UserCheck size={14} /> {pending ? "…" : "Réintégrer dans l'effectif"}
          </span>
        </Button>
      )}

      {/* Suppression definitive, separee du reste : sortir de l'effectif garde
          la personne dans les listes, ce qui n'a aucun sens pour un compte cree
          par erreur — un doublon, un essai. */}
      <div className="border-t border-border pt-3">
        {hasHistory ? (
          <p className="flex items-start gap-2 text-xs text-muted">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>
              Suppression impossible : {fullName} a déjà déclaré du chiffre ou reçu un versement.
              L&apos;effacer emporterait son CA et la trace de ce qui lui a été payé. Passe par
              « Marquer comme parti ».
            </span>
          </p>
        ) : purging ? (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-3.5">
            <p className="text-sm text-foreground">
              Supprimer définitivement <strong>{fullName}</strong> ?
            </p>
            <p className="mt-1 text-xs text-muted">
              Le compte, son accès, ses créneaux et son dossier d&apos;identité disparaissent. Ce
              compte n&apos;a aucun chiffre déclaré ni versement, il n&apos;y a donc rien d&apos;autre
              à perdre — mais c&apos;est irréversible.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await deleteChatter(chatterId);
                    if (res.error) {
                      setPurgeError(res.error);
                      setPurging(false);
                    }
                    // Succès : la page de ce chatter n'existe plus, la
                    // revalidation renvoie vers la liste.
                  })
                }
                className="bg-danger bg-none text-white shadow-none hover:brightness-110"
              >
                {pending ? "Suppression…" : "Supprimer définitivement"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setPurging(false)} disabled={pending}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setPurgeError(null);
              setPurging(true);
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg text-xs font-medium text-muted transition-colors hover:text-danger"
          >
            <Trash2 size={13} /> Supprimer le compte
          </button>
        )}

        {purgeError && (
          <p className="mt-2 flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {purgeError}
          </p>
        )}
      </div>
    </div>
  );
}
