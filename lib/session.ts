import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Session + profil, resolus UNE SEULE FOIS par requete HTTP.
 *
 * Chaque aller-retour vers Supabase coute environ 100 ms depuis le Mac Mini.
 * Or le schema habituel d'une page — `auth.getUser()` puis un `select` sur
 * `profiles` pour recuperer l'agence — etait repete dans le layout ET dans la
 * page, soit quatre appels reseau la ou deux suffisent.
 *
 * `cache()` de React memorise le resultat pour la duree du rendu : les appels
 * suivants, quel que soit le composant, reutilisent la meme reponse. Rien
 * n'est conserve entre deux requetes ni entre deux utilisateurs.
 */
export interface SessionProfile {
  userId: string;
  email: string | null;
  agencyId: string;
  role: "agency_admin" | "chatter";
  fullName: string;
  active: boolean;
  mustChangePassword: boolean;
  onboardingSeen: boolean;
}

export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("agency_id, role, full_name, active, must_change_password, onboarding_seen_at")
    .eq("id", user.id)
    .single();

  if (!data) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    agencyId: data.agency_id,
    role: data.role,
    fullName: data.full_name,
    active: data.active,
    mustChangePassword: Boolean(data.must_change_password),
    onboardingSeen: data.onboarding_seen_at !== null,
  };
});

/** Client Supabase partagé sur la durée du rendu, pour éviter de le reconstruire. */
export const getSupabase = cache(async () => createClient());
