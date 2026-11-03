import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionProfile, getSupabase } from "@/lib/session";
import { getPendingNotices } from "@/lib/notices";
import { ChatterHeader } from "@/components/nav/ChatterHeader";
import { ChatterNav } from "@/components/nav/ChatterNav";
import { ChatterSidebar } from "@/components/nav/ChatterSidebar";
import { PendingNoticeModal } from "@/components/notices/PendingNoticeModal";

export default async function ChatterLayout({ children }: { children: ReactNode }) {
  const profile = await getSessionProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "chatter") redirect("/admin/dashboard");

  // Avant toute chose : remplacer le mot de passe transmis par l'agence. On
  // securise l'acces au compte avant de reclamer des pieces d'identite.
  if (profile.mustChangePassword) redirect("/nouveau-mot-de-passe");

  // Tant que l'identite n'est pas validee, l'espace reste ferme : un compte
  // non verifie ne doit pouvoir ni declarer de chiffre d'affaires ni se voir
  // assigner un modele. /verification vit hors de ce groupe de routes, donc
  // cette redirection ne peut pas boucler sur elle-meme.
  const supabase = await getSupabase();
  const { data: verification } = await supabase
    .from("identity_verifications")
    .select("status, required")
    .eq("chatter_id", profile.userId)
    .maybeSingle();

  // Le controle peut avoir ete leve pour ce chatter a la creation de son
  // compte : dans ce cas l'espace s'ouvre directement.
  const mustVerify = verification?.required !== false;
  if (mustVerify && verification?.status !== "approved") redirect("/verification");

  // Une fois le compte securise et l'identite reglee, on presente l'outil.
  // En dernier : inutile d'expliquer un espace auquel la personne n'a pas
  // encore acces.
  if (!profile.onboardingSeen) redirect("/bienvenue");

  // Avertissements/sanctions pas encore vus : affiches en popup a la
  // prochaine connexion, apres les redirections ci-dessus (inutile de les
  // montrer pendant l'onboarding ou avant que le compte soit utilisable).
  const pendingNotices = await getPendingNotices(supabase, profile.userId);

  return (
    // Deux dispositions plutot qu'une seule etiree : sur telephone, en-tete en
    // haut et onglets sous le pouce ; sur ordinateur, une colonne laterale qui
    // rassemble tout a gauche. Le contenu des pages, lui, est identique — il
    // n'y a pas de "version PC" a maintenir a part.
    <div className="flex min-h-screen flex-col bg-background lg:pl-64">
      <ChatterSidebar fullName={profile.fullName} />

      {/* Masque par l'en-tete lui-meme et non par un conteneur : `sticky` ne
          colle qu'a l'interieur de son parent, un div de sa propre hauteur le
          rendrait inerte au defilement. */}
      <ChatterHeader fullName={profile.fullName} />

      {/* pb : hauteur des onglets + safe area de la barre d'accueil iPhone.
          Sur ordinateur il n'y a plus rien en bas : une simple marge suffit. */}
      <main className="flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-10 lg:pt-3">
        {children}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 lg:hidden">
        <ChatterNav />
      </div>

      <PendingNoticeModal items={pendingNotices} />
    </div>
  );
}
