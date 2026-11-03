"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAgencyAdmin } from "@/lib/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePassword } from "@/lib/credentials";
import { logAction } from "@/lib/audit";
import { toDateString } from "@/lib/period";

export interface Credentials {
  fullName: string;
  email: string;
  password: string;
}

export interface ActionState {
  error?: string;
  /** Renseigné après un succès : identifiants à transmettre au chatter.
   *  Le mot de passe n'est lisible qu'ici — il n'est stocké nulle part en clair. */
  created?: Credentials;
}

export async function createChatter(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const typed = String(formData.get("password") ?? "").trim();
  const commissionRaw = String(formData.get("rate_percent") ?? "").trim();
  // Case decochee = le chatter accede directement a son espace, sans depot
  // de pieces. Une case a cocher absente du POST vaut "non cochee".
  const requireIdentity = formData.get("require_identity") === "on";

  if (!email || !fullName) return { error: "Email et nom complet requis." };
  // Champ laissé vide = mot de passe généré ici. Évite aussi tout écart
  // d'hydratation : rien d'aléatoire n'est produit au rendu du formulaire.
  if (typed && typed.length < 8) return { error: "Mot de passe : 8 caractères minimum." };
  const password = typed || generatePassword();

  const commission = commissionRaw === "" ? null : Number.parseFloat(commissionRaw);
  if (commission !== null && (!Number.isFinite(commission) || commission < 0 || commission > 100)) {
    return { error: "Commission invalide (0 à 100)." };
  }

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    const msg = createError?.message ?? "";
    if (/already|exists|registered/i.test(msg)) {
      return { error: "Un compte existe déjà avec cet email." };
    }
    return { error: msg || "Échec de la création du compte." };
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: created.user.id,
    agency_id: profile.agency_id,
    role: "chatter",
    full_name: fullName,
    // Mot de passe transmis par message : il devra etre remplace a la
    // premiere connexion.
    must_change_password: true,
  });

  if (profileError) {
    // Roll back the orphaned auth account so retrying with the same email works.
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: profileError.message };
  }

  if (!requireIdentity) {
    await supabase
      .from("identity_verifications")
      .update({ required: false })
      .eq("chatter_id", created.user.id);
  }

  // Commission posée dès la création : sans elle le chatter voit un salaire à 0.
  if (commission !== null) {
    await supabase
      .from("commission_rules")
      .insert({ chatter_id: created.user.id, rate_percent: commission });
  }

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "chatter.create",
    targetLabel: fullName,
    details: { email, verification_identite: requireIdentity ? "exigée" : "non exigée" },
  });

  revalidatePath("/admin/chatters");
  return { created: { fullName, email, password } };
}

export interface ResetState {
  error?: string;
  password?: string;
}

/** Regénère le mot de passe d'un chatter et le renvoie une seule fois pour affichage. */
export async function resetChatterPassword(chatterId: string): Promise<ResetState> {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const target = await requireOwnChatter(supabase, profile.agency_id, chatterId);
  if (!target) return { error: "Chatter introuvable." };

  const password = generatePassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(chatterId, { password });

  if (error) return { error: error.message };

  // Meme raisonnement qu'a la creation : ce mot de passe transite par un
  // message, il ne doit pas rester en place.
  await supabase.from("profiles").update({ must_change_password: true }).eq("id", chatterId);

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "chatter.password_reset",
    targetLabel: target.full_name,
  });

  return { password };
}

/**
 * Garde commune aux actions ci-dessous : la cible doit etre un chatter de
 * l'agence de l'admin. La RLS empeche deja d'ecrire ailleurs, mais on veut un
 * refus explicite plutot qu'une mise a jour silencieusement sans effet.
 */
async function requireOwnChatter(
  supabase: Awaited<ReturnType<typeof requireAgencyAdmin>>["supabase"],
  agencyId: string,
  chatterId: string
): Promise<{ full_name: string; active: boolean } | null> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, role, agency_id, active")
    .eq("id", chatterId)
    .single();

  if (!data || data.role !== "chatter" || data.agency_id !== agencyId) return null;
  return { full_name: data.full_name, active: data.active };
}

/**
 * Sortie d'effectif. On desactive au lieu de supprimer : `shift_entries` est
 * en ON DELETE CASCADE, donc supprimer le compte effacerait tout le chiffre
 * d'affaires que la personne a genere — et fausserait l'historique de
 * l'agence. Un chatter desactive ne peut plus se connecter, disparait des
 * classements et des assignations, mais ses periodes passees restent intactes.
 */
export async function setChatterActive(chatterId: string, active: boolean) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const target = await requireOwnChatter(supabase, profile.agency_id, chatterId);
  if (!target) return;

  const today = toDateString(new Date());
  const { error } = await supabase
    .from("profiles")
    .update({ active, left_on: active ? null : today })
    .eq("id", chatterId);

  if (error) return;

  // Couper l'acces effectivement : sans ban, le compte auth reste utilisable
  // meme si l'interface ne le liste plus.
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(chatterId, { ban_duration: active ? "none" : "876000h" });

  if (!active) {
    // Les modeles occupes par quelqu'un qui part doivent se liberer.
    await supabase
      .from("chatter_model_assignments")
      .update({ assigned_to: today })
      .eq("chatter_id", chatterId)
      .is("assigned_to", null);
  }

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: active ? "chatter.reactivate" : "chatter.deactivate",
    targetLabel: target.full_name,
  });

  revalidatePath("/admin/chatters");
  revalidatePath(`/admin/chatters/${chatterId}`);
}

export interface DeleteChatterState {
  error?: string;
}

/**
 * Supprime definitivement un compte chatter.
 *
 * Complement de la sortie d'effectif, pour les comptes crees par erreur : les
 * doublons, les essais, la personne qui n'est jamais venue. Sortir de
 * l'effectif garde la ligne dans les listes, ce qui n'a aucun sens pour un
 * compte qui n'aurait jamais du exister.
 *
 * Refuse des qu'il y a un historique, et ce n'est pas de la prudence de
 * principe : shift_entries ET payouts partent en cascade avec le profil.
 * Supprimer un chatter ayant travaille effacerait donc a la fois le chiffre
 * d'affaires qu'il a genere — faussant les totaux de l'agence — et la trace des
 * sommes qui lui ont ete versees, qui est une piece comptable. Pour ceux-la, la
 * sortie d'effectif reste la bonne reponse : elle coupe l'acces sans rien
 * detruire.
 */
export async function deleteChatter(chatterId: string): Promise<DeleteChatterState> {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const target = await requireOwnChatter(supabase, profile.agency_id, chatterId);
  if (!target) return { error: "Chatter introuvable." };

  const [{ count: shifts }, { count: payouts }] = await Promise.all([
    supabase.from("shift_entries").select("id", { count: "exact", head: true }).eq("chatter_id", chatterId),
    supabase.from("payouts").select("id", { count: "exact", head: true }).eq("chatter_id", chatterId),
  ]);

  if ((shifts ?? 0) > 0 || (payouts ?? 0) > 0) {
    return {
      error:
        `${target.full_name} a un historique (${shifts ?? 0} shift(s), ${payouts ?? 0} versement(s)). ` +
        "Le supprimer effacerait son chiffre d'affaires et la trace de ce qui lui a été versé. Utilise « Marquer comme parti ».",
    };
  }

  // Journalise AVANT la suppression : le profil disparait, et avec lui le nom
  // que le journal denormalise justement pour rester lisible ensuite.
  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "chatter.delete",
    targetLabel: target.full_name,
    details: { motif: "compte sans historique" },
  });

  // La suppression du compte auth entraine le profil et tout ce qui s'y
  // rattache (assignations, pointages, jours OFF, dossier d'identite).
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(chatterId);
  if (error) return { error: error.message };

  revalidatePath("/admin/chatters");
  revalidatePath("/admin/planning");
  // La fiche de ce chatter n'existe plus : rester dessus afficherait un 404.
  // `redirect` leve une exception traitee par Next, d'ou l'absence de `return`.
  redirect("/admin/chatters");
}


/** Corrige une faute de frappe dans le nom affiche partout dans l'app. */
export async function renameChatter(chatterId: string, formData: FormData) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) return;

  const target = await requireOwnChatter(supabase, profile.agency_id, chatterId);
  if (!target || target.full_name === fullName) return;

  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", chatterId);
  if (error) return;

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "chatter.rename",
    targetLabel: fullName,
    details: { avant: target.full_name },
  });

  revalidatePath("/admin/chatters");
  revalidatePath(`/admin/chatters/${chatterId}`);
}


