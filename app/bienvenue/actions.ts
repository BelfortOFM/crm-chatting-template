"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Marque la presentation comme vue. Passe par la session de l'interesse : la
 * colonne lui est ouverte (elle ne figure pas dans les champs verrouilles par
 * profile_self_update_guard), inutile de mobiliser la cle de service.
 */
export async function completeOnboarding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("profiles")
    .update({ onboarding_seen_at: new Date().toISOString() })
    .eq("id", user.id);

  redirect("/dashboard");
}
