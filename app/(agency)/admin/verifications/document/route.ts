import { NextResponse, type NextRequest } from "next/server";
import { requireAgencyAdmin } from "@/lib/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptBuffer, documentPath, DOCUMENT_KINDS, BUCKET, type DocumentKind } from "@/lib/identity-crypto";

/**
 * Seul point de lecture d'une pièce d'identité.
 *
 * Le bucket est privé et aucune URL signée n'est jamais émise : une URL
 * signée circule, se recopie et survit à la session. Ici chaque affichage
 * repasse par un contrôle de rôle, et l'image n'existe en clair qu'en mémoire,
 * le temps de la réponse.
 */
export async function GET(request: NextRequest) {
  // requireAgencyAdmin lève sur un non-admin : sans ce filet, un chatter qui
  // tente l'URL reçoit un 500 et l'incident se noie dans les erreurs serveur,
  // alors que c'est un refus d'accès parfaitement normal à tracer comme tel.
  let session: Awaited<ReturnType<typeof requireAgencyAdmin>>;
  try {
    session = await requireAgencyAdmin();
  } catch {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }
  const { supabase, profile } = session;

  const chatterId = request.nextUrl.searchParams.get("chatter");
  const kind = request.nextUrl.searchParams.get("kind") as DocumentKind | null;

  if (!chatterId || !kind || !DOCUMENT_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  // La cible doit appartenir à l'agence de l'admin : sans ce contrôle, un
  // admin pourrait lire la pièce d'un chatter d'une autre agence en changeant
  // l'identifiant dans l'URL.
  const { data: verification } = await supabase
    .from("identity_verifications")
    .select("agency_id, status")
    .eq("chatter_id", chatterId)
    .maybeSingle();

  if (!verification || verification.agency_id !== profile.agency_id) {
    return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(documentPath(chatterId, kind));

  if (error || !data) {
    return NextResponse.json({ error: "Document indisponible." }, { status: 404 });
  }

  let decrypted: Buffer;
  try {
    decrypted = decryptBuffer(Buffer.from(await data.arrayBuffer()));
  } catch {
    // Clé absente/incorrecte, ou fichier altéré : GCM refuse de déchiffrer.
    return NextResponse.json({ error: "Déchiffrement impossible." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(decrypted), {
    headers: {
      // Le type réel est inconnu (tout est stocké en octets bruts) ; les
      // navigateurs détectent correctement JPEG/PNG/HEIC à l'affichage.
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Content-Disposition": "inline",
      // Une pièce d'identité n'a rien à faire dans un cadre externe.
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
