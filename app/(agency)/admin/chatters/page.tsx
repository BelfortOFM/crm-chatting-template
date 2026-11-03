import Link from "next/link";
import { headers } from "next/headers";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { PageHeader, SectionTitle, EmptyState } from "@/components/ui/PageHeader";
import { CreateChatterForm } from "./CreateChatterForm";

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export default async function ChattersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: chatters } = await supabase
    .from("profiles")
    .select("id, full_name, active, left_on")
    .eq("role", "chatter")
    .order("full_name");

  // Les partis sont regroupés à part : ils restent consultables (historique de
  // CA, versements passés) sans encombrer la liste de travail quotidienne.
  const activeChatters = (chatters ?? []).filter((c) => c.active);
  const formerChatters = (chatters ?? []).filter((c) => !c.active);

  // L'email vit dans auth.users, pas dans profiles : on le récupère via l'API
  // admin pour l'afficher en face de chaque chatter.
  const admin = createAdminClient();
  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  // Domaine proposé par défaut pour les nouveaux comptes = celui de l'admin.
  const emailDomain = user?.email?.split("@")[1] ?? "agence.com";

  const host = (await headers()).get("host") ?? "";
  const appUrl = host ? `https://${host}` : "";

  return (
    <div className="space-y-5">
      <PageHeader title="Chatters" subtitle="Comptes, modèles assignés, commission, objectifs." />

      <Card>
        <SectionTitle>Nouveau chatter</SectionTitle>
        <CreateChatterForm emailDomain={emailDomain} appUrl={appUrl} />
      </Card>

      <div className="space-y-2">
        {activeChatters.map((chatter) => (
          <ChatterRow key={chatter.id} chatter={chatter} email={emailById.get(chatter.id)} />
        ))}
        {activeChatters.length === 0 && (
          <EmptyState>
            Aucun chatter actif — crée le premier compte ci-dessus.
          </EmptyState>
        )}
      </div>

      {formerChatters.length > 0 && (
        <div>
          <SectionTitle>
            Anciens chatters ({formerChatters.length})
          </SectionTitle>
          <p className="mt-1 text-xs text-muted">
            Comptes désactivés. Leur historique de CA et leurs versements restent consultables.
          </p>
          <div className="mt-3 space-y-2">
            {formerChatters.map((chatter) => (
              <ChatterRow key={chatter.id} chatter={chatter} email={emailById.get(chatter.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatterRow({
  chatter,
  email,
}: {
  chatter: { id: string; full_name: string; active: boolean; left_on: string | null };
  email?: string;
}) {
  return (
    <Link
      href={`/admin/chatters/${chatter.id}`}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-accent/60 hover:bg-surface-2",
        !chatter.active && "opacity-60"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
          chatter.active ? "bg-gradient-to-br from-info via-sky-500 to-accent" : "bg-surface-2 text-muted"
        )}
      >
        {initials(chatter.full_name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">
          {chatter.full_name}
          {!chatter.active && (
            <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
              parti{chatter.left_on ? ` le ${new Date(chatter.left_on).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}` : ""}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-muted">{email}</span>
      </span>
      <ChevronRight size={17} className="shrink-0 text-muted" />
    </Link>
  );
}
