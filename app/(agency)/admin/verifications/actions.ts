"use server";

import { revalidatePath } from "next/cache";
import { requireAgencyAdmin } from "@/lib/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAction } from "@/lib/audit";
import { documentPath, DOCUMENT_KINDS, BUCKET } from "@/lib/identity-crypto";

/** Durée de conservation des pièces après validation. */
const KEEP_MONTHS = 12;

async function loadTarget(
  supabase: Awaited<ReturnType<typeof requireAgencyAdmin>>["supabase"],
  agencyId: string,
  chatterId: string
) {
  const { data } = await supabase
    .from("identity_verifications")
    .select("agency_id, status, chatter_id, chatter:profiles!identity_verifications_chatter_id_fkey(full_name)")
    .eq("chatter_id", chatterId)
    .maybeSingle();

  if (!data || data.agency_id !== agencyId) return null;
  const p = data.chatter as unknown as { full_name: string } | { full_name: string }[];
  return { name: Array.isArray(p) ? p[0]!.full_name : p.full_name, status: data.status };
}

export async function approveVerification(chatterId: string) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const target = await loadTarget(supabase, profile.agency_id, chatterId);
  if (!target) return;

  const purgeAfter = new Date();
  purgeAfter.setMonth(purgeAfter.getMonth() + KEEP_MONTHS);

  await supabase
    .from("identity_verifications")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      rejection_reason: null,
      purge_after: purgeAfter.toISOString().slice(0, 10),
    })
    .eq("chatter_id", chatterId);

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "identity.approve",
    targetLabel: target.name,
  });

  revalidatePath("/admin/verifications");
}

export async function rejectVerification(chatterId: string, formData: FormData) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;

  const target = await loadTarget(supabase, profile.agency_id, chatterId);
  if (!target) return;

  // Les pièces refusées sont supprimées immédiatement : conserver des images
  // qu'on vient de juger inexploitables n'a aucun intérêt et prolonge
  // inutilement la détention de données personnelles.
  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove(DOCUMENT_KINDS.map((k) => documentPath(chatterId, k)));

  await supabase
    .from("identity_verifications")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      rejection_reason: reason,
      id_front_path: null,
      id_back_path: null,
      selfie_path: null,
      id_with_face_path: null,
    })
    .eq("chatter_id", chatterId);

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "identity.reject",
    targetLabel: target.name,
    details: { motif: reason },
  });

  revalidatePath("/admin/verifications");
}

/** Efface les images sans toucher au statut : l'identité reste validée. */
export async function purgeDocuments(chatterId: string) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const target = await loadTarget(supabase, profile.agency_id, chatterId);
  if (!target) return;

  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove(DOCUMENT_KINDS.map((k) => documentPath(chatterId, k)));

  await supabase
    .from("identity_verifications")
    .update({ id_front_path: null, id_back_path: null, selfie_path: null, id_with_face_path: null, purge_after: null })
    .eq("chatter_id", chatterId);

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "identity.purge",
    targetLabel: target.name,
  });

  revalidatePath("/admin/verifications");
}

/**
 * Leve ou retablit l'exigence de verification pour un chatter.
 *
 * Retablir l'exigence sur quelqu'un qui n'a jamais depose ses pieces le
 * renvoie immediatement vers l'ecran de depot a sa prochaine navigation :
 * c'est le comportement voulu, un controle qu'on decide d'appliquer doit
 * s'appliquer tout de suite.
 */
export async function setIdentityRequired(chatterId: string, required: boolean) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const target = await loadTarget(supabase, profile.agency_id, chatterId);
  if (!target) return;

  await supabase
    .from("identity_verifications")
    .update({ required })
    .eq("chatter_id", chatterId);

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: required ? "identity.require" : "identity.waive",
    targetLabel: target.name,
  });

  revalidatePath("/admin/verifications");
  revalidatePath("/admin/chatters");
}

/**
 * Ajoute l'IP du dossier KYC a la watchlist anti-fraude (ip_watch, migration
 * 20261001000036) : toute future connexion depuis le meme reseau (meme /64
 * en IPv6) declenchera une alerte admin, cf. lib/ip-watch.ts.
 */
export async function watchIp(formData: FormData) {
  const chatterId = String(formData.get("chatterId") ?? "");
  const { supabase, user, profile } = await requireAgencyAdmin();

  const target = await loadTarget(supabase, profile.agency_id, chatterId);
  if (!target) return;

  const { data: verification } = await supabase
    .from("identity_verifications")
    .select("location_ip")
    .eq("chatter_id", chatterId)
    .maybeSingle();
  if (!verification?.location_ip) return;

  const admin = createAdminClient();
  const { error } = await admin.rpc("fn_create_ip_watch", {
    p_agency_id: profile.agency_id,
    p_ip: verification.location_ip,
    p_reason: `Dossier KYC de ${target.name}`,
    p_source_chatter_id: chatterId,
    p_created_by: user.id,
  });
  if (error) return;

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "ip_watch.create",
    targetLabel: target.name,
    details: { ip: verification.location_ip },
  });

  revalidatePath("/admin/verifications");
}
