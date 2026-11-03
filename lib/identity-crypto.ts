import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement des pieces d'identite avant depot dans le bucket.
 *
 * Pourquoi chiffrer alors que Supabase chiffre deja au repos : leur
 * chiffrement protege les disques, pas l'acces au bucket. Une cle de service
 * qui fuite, un bucket bascule en public par erreur, un export mal maitrise —
 * et les pieces sont lisibles. Ici, sans IDENTITY_ENCRYPTION_KEY, le contenu
 * telecharge n'est qu'un tas d'octets.
 *
 * AES-256-GCM : chiffre ET authentifie. Un fichier altere est rejete au
 * dechiffrement au lieu de produire une image corrompue.
 *
 * Format du blob stocke : [IV 12 octets][tag 16 octets][donnees chiffrees]
 */

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function key(): Buffer {
  const raw = process.env.IDENTITY_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "IDENTITY_ENCRYPTION_KEY absente : impossible de traiter une pièce d'identité."
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("IDENTITY_ENCRYPTION_KEY doit être 32 octets encodés en base64.");
  }
  return buf;
}

export function encryptBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

export function decryptBuffer(blob: Buffer): Buffer {
  if (blob.length <= IV_LENGTH + TAG_LENGTH) {
    throw new Error("Fichier chiffré invalide ou tronqué.");
  }
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]);
}

export function hasEncryptionKey(): boolean {
  return Boolean(process.env.IDENTITY_ENCRYPTION_KEY);
}

/** Types de pièces attendues, dans l'ordre où on les demande. */
export const DOCUMENT_KINDS = ["id_front", "id_back", "selfie", "id_with_face"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  id_front: "Pièce d'identité — recto",
  id_back: "Pièce d'identité — verso",
  selfie: "Photo de ton visage",
  // Lie la piece au visage : un recto/verso vole ne suffit plus seul, il
  // faudrait aussi la photo de son detenteur legitime le tenant a cote.
  id_with_face: "Toi avec ta pièce d'identité",
};

export const BUCKET = "identity-documents";

/** Chemin dans le bucket. Extension .enc : rien d'exploitable sans la clé. */
export function documentPath(chatterId: string, kind: DocumentKind): string {
  return `${chatterId}/${kind}.enc`;
}
