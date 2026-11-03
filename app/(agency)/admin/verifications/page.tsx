import { ShieldCheck, Clock, XCircle, ShieldQuestion, Lock, MapPin, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { ReviewPanel } from "./ReviewPanel";
import { watchIp } from "./actions";

const STAMP = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Paris",
});

const STATUS = {
  submitted: { label: "À vérifier", tone: "warning" as const, icon: Clock },
  approved: { label: "Validée", tone: "success" as const, icon: ShieldCheck },
  rejected: { label: "Refusée", tone: "danger" as const, icon: XCircle },
  pending: { label: "En attente d'envoi", tone: "neutral" as const, icon: ShieldQuestion },
};

interface Row {
  chatter_id: string;
  status: keyof typeof STATUS;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  purge_after: string | null;
  id_front_path: string | null;
  required: boolean;
  location_source: "gps" | "ip" | null;
  location_lat: number | null;
  location_lon: number | null;
  location_accuracy_m: number | null;
  location_city: string | null;
  location_country: string | null;
  location_ip: string | null;
  chatter: { full_name: string; active: boolean } | { full_name: string; active: boolean }[];
}

export default async function VerificationsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("identity_verifications")
    .select(
      // Deux cles etrangeres pointent vers profiles (chatter_id et reviewed_by) :
      // sans nommer la contrainte, PostgREST refuse la jointure comme ambigue.
      `chatter_id, status, submitted_at, reviewed_at, rejection_reason, purge_after, id_front_path, required, location_source, location_lat, location_lon, location_accuracy_m, location_city, location_country, location_ip, chatter:profiles!identity_verifications_chatter_id_fkey(full_name, active)`
    )
    .order("submitted_at", { ascending: false, nullsFirst: false });

  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    profile: Array.isArray(r.chatter) ? r.chatter[0]! : r.chatter,
  }));

  // Les dossiers à traiter d'abord : c'est ce qui bloque l'arrivée d'un chatter.
  const order = { submitted: 0, rejected: 1, pending: 2, approved: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status]);
  const waiting = rows.filter((r) => r.status === "submitted" && r.required).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Vérifications d'identité"
        subtitle="Contrôle des pièces avant l'ouverture d'un compte chatter."
      />

      <Card className="flex items-start gap-3 border-dashed bg-surface-2/40">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
          <Lock size={15} />
        </span>
        <div className="text-xs leading-relaxed text-muted">
          Les pièces sont chiffrées (AES-256) dans un espace privé et ne sont lisibles que depuis
          cet écran, par un administrateur de l&apos;agence. Chaque consultation passe par un
          contrôle de rôle : aucune adresse d&apos;image n&apos;est partageable.
          {waiting > 0 && (
            <span className="mt-1 block font-medium text-warning">
              {waiting} dossier{waiting > 1 ? "s" : ""} en attente de vérification.
            </span>
          )}
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState>Aucun chatter à vérifier pour l&apos;instant.</EmptyState>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const s = STATUS[r.status];
            const Icon = s.icon;
            return (
              <Card key={r.chatter_id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-foreground">
                      {r.profile.full_name}
                      {!r.profile.active && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-muted">
                          parti
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {r.submitted_at && <>Envoyé le {STAMP.format(new Date(r.submitted_at))}</>}
                      {r.reviewed_at && <> · Vérifié le {STAMP.format(new Date(r.reviewed_at))}</>}
                      {!r.submitted_at && !r.reviewed_at && <>Le chatter n&apos;a rien envoyé</>}
                      {r.purge_after && <> · pièces supprimées après le {STAMP.format(new Date(r.purge_after))}</>}
                    </p>
                    {r.rejection_reason && (
                      <p className="mt-1 text-xs text-danger">Motif : {r.rejection_reason}</p>
                    )}
                    {r.location_source && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                        <MapPin size={12} className="shrink-0" />
                        {r.location_source === "gps" ? (
                          <>
                            Position GPS
                            {r.location_accuracy_m != null && (
                              <> (± {Math.round(r.location_accuracy_m)} m)</>
                            )}
                          </>
                        ) : (
                          <>
                            {r.location_city || "Ville inconnue"}
                            {r.location_country && <>, {r.location_country}</>}{" "}
                            <span className="text-muted/70">(estimée via IP)</span>
                          </>
                        )}
                        {r.location_lat != null && r.location_lon != null && (
                          <>
                            {" · "}
                            <a
                              href={`https://www.google.com/maps?q=${r.location_lat},${r.location_lon}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline hover:text-foreground"
                            >
                              voir sur la carte
                            </a>
                          </>
                        )}
                      </p>
                    )}
                    {r.location_source === "ip" && r.location_ip && (
                      <form action={watchIp} className="mt-1.5">
                        <input type="hidden" name="chatterId" value={r.chatter_id} />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
                        >
                          <ShieldAlert size={12} />
                          Surveiller cette IP
                        </button>
                      </form>
                    )}
                  </div>
                  {r.required ? (
                    <Badge tone={s.tone}>
                      <span className="inline-flex items-center gap-1">
                        <Icon size={12} /> {s.label}
                      </span>
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Non exigée</Badge>
                  )}
                </div>

                <ReviewPanel
                  chatterId={r.chatter_id}
                  fullName={r.profile.full_name}
                  status={r.status}
                  hasDocuments={Boolean(r.id_front_path)}
                  required={r.required}
                />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
