import { createClient } from "@/lib/supabase/server";
import { getLedModels } from "@/lib/team-leader";

/**
 * Every Server Action re-checks auth/role independently rather than trusting
 * the route's layout gate, per Next.js's own guidance: a Server Action is a
 * reachable POST endpoint regardless of which page renders the form that
 * calls it. RLS still enforces agency scoping underneath this.
 */
export async function requireAgencyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, agency_id, full_name")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "agency_admin") throw new Error("Forbidden");

  return { supabase, user, profile };
}

export async function requireChatter() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, agency_id, full_name")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "chatter") throw new Error("Forbidden");

  return { supabase, user, profile };
}

/**
 * Un Team Leader n'agit jamais sur lui-meme : ce garde-fou refuse la cible
 * avant meme d'interroger la base, en plus de la policy RLS equivalente qui
 * fait foi (chatter_id != auth.uid()) sur warnings/sanctions.
 */
export async function requireTeamLeaderFor(targetChatterId: string) {
  const { supabase, user, profile } = await requireChatter();
  if (targetChatterId === user.id) throw new Error("Forbidden");

  const ledModelIds = (await getLedModels(supabase, user.id)).map((m) => m.id);
  if (ledModelIds.length === 0) throw new Error("Forbidden");

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("chatter_model_assignments")
    .select("chatter_id")
    .eq("chatter_id", targetChatterId)
    .in("model_id", ledModelIds)
    .lte("assigned_from", today)
    .or(`assigned_to.is.null,assigned_to.gte.${today}`)
    .limit(1);

  if (!data || data.length === 0) throw new Error("Forbidden");

  return { supabase, user, profile };
}
