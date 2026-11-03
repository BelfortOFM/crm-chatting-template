"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/Input";
import { currencySymbol } from "@/lib/currency";
import type { Currency } from "@/lib/types";

/**
 * Liste des ventes d'un shift, dans la devise réelle du modèle choisi.
 *
 * Partagée par la déclaration et la correction : les deux manipulent la même
 * liste de montants, avec le même total. Le modèle est figé une fois le shift
 * créé (sa devise ne change donc jamais en cours de saisie), d'où une devise
 * passée en prop plutôt que recalculée ici.
 *
 * La liste vit ici et non chez le parent : ni l'un ni l'autre n'en a besoin,
 * les montants partant au serveur par le `name` des champs. Pour la remettre à
 * zéro après un enregistrement, le parent change la `key` du composant — le
 * moyen idiomatique de réinitialiser un état, sans effet de bord.
 */
export function SaleAmounts({ initial, currency }: { initial: string[]; currency: Currency }) {
  const [amounts, setAmounts] = useState<string[]>(initial.length > 0 ? initial : [""]);
  const total = amounts.reduce((sum, a) => sum + (parseFloat(a) || 0), 0);
  const filledCount = amounts.filter((a) => (parseFloat(a) || 0) > 0).length;
  const symbol = currencySymbol(currency);

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>Shift sales</Label>
        <span className="text-xs text-muted">
          {filledCount} sale{filledCount > 1 ? "s" : ""}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Didn't sell anything during this shift? Leave the field empty and save anyway — the shift
        will count for 0 {symbol}, but your hours will still show up.
      </p>

      <div className="mt-2 space-y-2">
        {amounts.map((value, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">
                {symbol}
              </span>
              <input
                name="amounts"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={value}
                onChange={(e) => setAmounts(amounts.map((v, idx) => (idx === i ? e.target.value : v)))}
                placeholder="0.00"
                aria-label={`Amount of sale ${i + 1}`}
                className="w-full rounded-xl border border-border bg-surface-2 py-2.5 pl-8 pr-3 text-base text-foreground outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/25 sm:text-sm"
              />
            </div>
            {amounts.length > 1 && (
              <button
                type="button"
                onClick={() => setAmounts(amounts.filter((_, idx) => idx !== i))}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                aria-label={`Remove sale ${i + 1}`}
              >
                <Trash2 size={17} />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setAmounts([...amounts, ""])}
        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-accent transition-colors hover:border-accent hover:bg-accent-soft"
      >
        <Plus size={16} /> Add a sale
      </button>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-2 px-4 py-3">
        <span className="text-sm text-muted">Shift total</span>
        <span className="text-lg font-bold tabular-nums text-foreground">
          {total.toFixed(2)} {symbol}
        </span>
      </div>
    </div>
  );
}
