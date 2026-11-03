"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireChatter } from "@/lib/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp, lookupIpLocation } from "@/lib/geolocation";
import {
  encryptBuffer,
  documentPath,
  DOCUMENT_KINDS,
  BUCKET,
  hasEncryptionKey,
  type DocumentKind,
} from "@/lib/identity-crypto";

export interface VerificationState {
  error?: string;
  submitted?: boolean;
}

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/**
 * Depot des pieces (recto, verso, selfie, selfie + piece). Le fichier est chiffre ICI, cote serveur, avant
 * d'atteindre le bucket : le navigateur envoie l'image en clair (protegee par
 * TLS), rien n'est jamais ecrit en clair cote stockage.
 *
 * L'upload passe par le client service-role parce que le bucket est prive et
 * qu'aucune policy Storage n'autorise l'ecriture directe par un chatter : le
 * seul chemin d'ecriture est cette action, apres verification du role.
 */
export async function submitVerification(
  _prev: VerificationState,
  formData: FormData
): Promise<VerificationState> {
  const { supabase, user } = await requireChatter();

  if (!hasEncryptionKey()) {
    return { error: "Incomplete server configuration — let your agency know." };
  }

  const { data: existing } = await supabase
    .from("identity_verifications")
    .select("status, id_front_path, id_back_path, selfie_path, id_with_face_path")
    .eq("chatter_id", user.id)
    .maybeSingle();

  if (!existing) return { error: "Verification record not found." };
  if (existing.status === "approved") return { error: "Your identity is already verified." };
  if (existing.status === "submitted") return { error: "Your submission is already under review." };

  const admin = createAdminClient();
  const paths: Partial<Record<DocumentKind, string>> = {};

  for (const kind of DOCUMENT_KINDS) {
    const file = formData.get(kind);
    if (!(file instanceof File) || file.size === 0) {
      return { error: "All photos are required." };
    }
    if (file.size > MAX_BYTES) {
      return { error: "Each photo must be under 8 MB." };
    }
    // HEIC arrive sans type fiable depuis certains iPhone : on tolere un type
    // vide plutot que de bloquer un envoi legitime.
    if (file.type && !ACCEPTED.includes(file.type)) {
      return { error: "Unsupported image format (JPEG, PNG or HEIC)." };
    }

    const encrypted = encryptBuffer(Buffer.from(await file.arrayBuffer()));
    const path = documentPath(user.id, kind);

    const { error } = await admin.storage.from(BUCKET).upload(path, encrypted, {
      contentType: "application/octet-stream",
      upsert: true,
    });
    if (error) return { error: `Upload failed: ${error.message}` };
    paths[kind] = path;
  }

  // GPS d'abord (position posee par CaptureForm si le navigateur l'a
  // autorisee) ; a defaut, estimation approximative depuis l'IP de la
  // requete. Un echec des deux ne bloque jamais l'envoi du dossier.
  const gpsLat = formData.get("loc_lat");
  const gpsLon = formData.get("loc_lon");
  const gpsAccuracy = formData.get("loc_accuracy");
  const ip = clientIp(await headers());

  let location: {
    location_source: "gps" | "ip" | null;
    location_lat: number | null;
    location_lon: number | null;
    location_accuracy_m: number | null;
    location_city: string | null;
    location_country: string | null;
    location_ip: string | null;
    location_captured_at: string | null;
  };

  if (typeof gpsLat === "string" && typeof gpsLon === "string" && gpsLat && gpsLon) {
    location = {
      location_source: "gps",
      location_lat: Number(gpsLat),
      location_lon: Number(gpsLon),
      location_accuracy_m: typeof gpsAccuracy === "string" && gpsAccuracy ? Number(gpsAccuracy) : null,
      location_city: null,
      location_country: null,
      location_ip: ip,
      location_captured_at: new Date().toISOString(),
    };
  } else {
    const geo = await lookupIpLocation(ip);
    location = {
      location_source: geo ? "ip" : null,
      location_lat: geo?.lat ?? null,
      location_lon: geo?.lon ?? null,
      location_accuracy_m: null,
      location_city: geo?.city ?? null,
      location_country: geo?.country ?? null,
      location_ip: ip,
      location_captured_at: geo ? new Date().toISOString() : null,
    };
  }

  const { error: updateError } = await supabase
    .from("identity_verifications")
    .update({
      status: "submitted",
      id_front_path: paths.id_front,
      id_back_path: paths.id_back,
      selfie_path: paths.selfie,
      id_with_face_path: paths.id_with_face,
      submitted_at: new Date().toISOString(),
      rejection_reason: null,
      ...location,
    })
    .eq("chatter_id", user.id);

  if (updateError) return { error: updateError.message };

  revalidatePath("/verification");
  revalidatePath("/dashboard");
  return { submitted: true };
}
