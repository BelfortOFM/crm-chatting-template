"use client";

import { useEffect } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Filet de securite global : sans lui, une erreur qui remonte jusqu'ici
 * laissait l'ecran vide ou fige, sans aucune indication pour l'utilisateur.
 *
 * Le cas le plus frequent en pratique : l'app redeploie plusieurs fois par
 * semaine (parfois par jour), et chaque build change l'identifiant interne
 * des Server Actions. Un chatter qui a l'onglet (ou la PWA) deja ouvert au
 * moment d'un redeploiement garde l'ancien identifiant en memoire ; des qu'il
 * soumet un formulaire ensuite (declarer un shift, pointer, poser un jour
 * OFF...), le serveur ne le reconnait plus et Next.js leve une erreur brute
 * — jusqu'ici invisible pour lui, d'ou l'impression que "ca ne marche pas"
 * sans autre explication.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const staleDeployment = /Failed to find Server Action/i.test(error.message);

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4">
      <Card className="w-full space-y-4 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-warning-soft text-warning">
          <AlertTriangle size={22} />
        </span>
        <div>
          <p className="text-base font-semibold text-foreground">
            {staleDeployment ? "L'app vient d'être mise à jour" : "Une erreur est survenue"}
          </p>
          <p className="mt-1.5 text-sm text-muted">
            {staleDeployment
              ? "Ton dernier envoi n'a pas été enregistré. Recharge la page, puis ressaisis et renvoie."
              : "Recharge la page. Si ça persiste, préviens ton agence."}
          </p>
          {/* Le message reel, en petit et discret : indispensable pour
              diagnostiquer un plantage qui ne laisse aucune trace serveur. */}
          <p className="mt-2 break-words rounded-lg bg-surface-2 px-2.5 py-2 text-left text-[11px] text-muted">
            {error.message || "(pas de message)"}
            {error.digest && (
              <>
                <br />
                digest: {error.digest}
              </>
            )}
          </p>
        </div>
        <Button type="button" onClick={() => window.location.reload()} className="w-full">
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw size={15} /> Recharger la page
          </span>
        </Button>
        {!staleDeployment && (
          <button
            type="button"
            onClick={() => reset()}
            className="text-xs text-muted underline-offset-2 hover:underline"
          >
            Réessayer sans recharger
          </button>
        )}
      </Card>
    </div>
  );
}
