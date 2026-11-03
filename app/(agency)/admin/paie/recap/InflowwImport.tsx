"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Check, AlertCircle, Link2, FileSpreadsheet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  importInfloww,
  linkInflowwEmployee,
  type InflowwImportResult,
  type InflowwUnmatched,
} from "./infloww-actions";

const usd = (n: number) => `${n.toFixed(2)} $`;

/**
 * Import de l'export Infloww d'une periode, depose a la main par l'admin.
 *
 * Infloww n'ouvre pas sa cle API a cette agence : le CA OnlyFans ne peut donc
 * pas etre lu en direct. L'admin genere l'export "stats par employe", le
 * recoit par email et le depose ici. L'ecran dit ensuite ce qui a ete relie
 * et laisse rattacher a la main les chatteurs qu'Infloww nomme autrement.
 */
export function InflowwImport({
  periodRange,
  chatters,
  existingCount,
}: {
  periodRange: string;
  chatters: { id: string; fullName: string }[];
  existingCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<InflowwImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await importInfloww(periodRange, formData);
      setResult(res);
      if (res.ok) {
        if (inputRef.current) inputRef.current.value = "";
        // Le reste de la page (recap, désormais verrouillé tant qu'aucun
        // import n'existe pour la période) dépend du compte d'import côté
        // serveur : sans ce refresh, il resterait verrouillé malgré l'import
        // qui vient de réussir.
        router.refresh();
      }
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <FileSpreadsheet size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Étape 1</p>
          <p className="text-sm font-semibold text-foreground">Suivi OnlyFans — import Infloww</p>
          <p className="mt-0.5 text-xs text-muted">
            Dépose l&apos;export « statistiques par employé » (.xlsx). Le CA brut par chatteur sert à
            comparer au déclaré. Tu peux ré-importer en cours de période (un export
            partiel du 8 au 13, par ex.) pour suivre l&apos;écart au fil de l&apos;eau — le dernier
            import remplace le précédent.
            {existingCount > 0 && (
              <span className="text-foreground">
                {" "}
                {existingCount} ligne{existingCount > 1 ? "s" : ""} déjà importée
                {existingCount > 1 ? "s" : ""}.
              </span>
            )}
          </p>
        </div>
      </div>

      <form action={submit} className="flex flex-wrap items-center gap-2">
        <label
          className={cn(
            "flex min-h-10 flex-1 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-surface-2/40 px-3 text-sm transition-colors hover:border-accent/50",
            fileName ? "text-foreground" : "text-muted"
          )}
        >
          <Upload size={15} className="shrink-0" />
          <span className="truncate">{fileName ?? "Choisir le fichier .xlsx Infloww"}</span>
          <input
            ref={inputRef}
            type="file"
            name="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </label>
        <Button type="submit" disabled={pending || !fileName} className="shrink-0">
          {pending ? "Import…" : "Importer"}
        </Button>
      </form>

      {result?.error && (
        <p className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {result.error}
        </p>
      )}

      {result?.ok && result.spillWarning && (
        <p className="flex items-start gap-2 rounded-xl bg-warning/10 px-3.5 py-2.5 text-sm text-warning">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {result.spillWarning}
        </p>
      )}

      {result?.ok && (
        <div className="space-y-3 rounded-xl border border-border bg-surface-2/40 p-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-success">
              <Check size={14} /> {result.matched}/{result.imported} chatteur
              {(result.imported ?? 0) > 1 ? "s" : ""} relié{(result.matched ?? 0) > 1 ? "s" : ""}
            </span>
            <span className="text-muted">
              CA importé : <span className="tnum text-foreground">{usd(result.totalUsd ?? 0)}</span>
            </span>
            {result.periodLabel && (
              <span className="truncate text-xs text-muted">{result.periodLabel}</span>
            )}
          </div>

          {(result.unmatched?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-warning">
                {result.unmatched!.length} ligne{result.unmatched!.length > 1 ? "s" : ""} qu&apos;Infloww
                nomme autrement — relie chacune à un chatteur (mémorisé pour les prochains imports) :
              </p>
              {result.unmatched!.map((u) => (
                <UnmatchedRow key={(u.email ?? "") + u.name} row={u} periodRange={periodRange} chatters={chatters} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function UnmatchedRow({
  row,
  periodRange,
  chatters,
}: {
  row: InflowwUnmatched;
  periodRange: string;
  chatters: { id: string; fullName: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-success">
        <Check size={13} /> {row.name} relié.
      </p>
    );
  }

  function link() {
    if (!choice) return;
    setError(null);
    startTransition(async () => {
      const res = await linkInflowwEmployee(periodRange, row.email, row.name, choice);
      if (res.error) setError(res.error);
      else setDone(true);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">
          {row.name} <span className="tnum text-muted">· {usd(row.salesUsd)}</span>
        </p>
        {row.email && <p className="truncate text-[11px] text-muted">{row.email}</p>}
      </div>
      <select
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className="min-h-9 rounded-lg border border-border bg-surface-2 px-2 text-xs text-foreground outline-none focus:border-accent"
      >
        <option value="">Chatteur…</option>
        {chatters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.fullName}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="secondary"
        disabled={pending || !choice}
        onClick={link}
        className="shrink-0 px-2.5"
      >
        <span className="inline-flex items-center gap-1">
          <Link2 size={13} /> Relier
        </span>
      </Button>
      {error && <span className="w-full text-[11px] text-danger">{error}</span>}
    </div>
  );
}
