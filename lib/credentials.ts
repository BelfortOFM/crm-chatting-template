/**
 * Génération des identifiants remis aux chatters. Utilisé côté client (le
 * formulaire de création) comme côté serveur (réinitialisation), d'où
 * l'usage de `crypto` global, disponible dans les deux environnements.
 */

// Alphabet sans caractères ambigus (0/O, 1/l/I) : ces mots de passe sont
// recopiés à la main ou dictés, la confusion visuelle coûte cher.
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePassword(length = 14): string {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  // Modulo biaisé en théorie, négligeable ici (56 symboles vs 2^32).
  return Array.from(values, (v) => ALPHABET[v % ALPHABET.length]).join("");
}

/** "Léa Dupont" -> "lea.dupont" (accents retirés, ponctuation supprimée). */
export function slugifyName(fullName: string): string {
  return fullName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

/** Propose une adresse pour un nouveau chatter, sur le domaine de l'agence. */
export function suggestEmail(fullName: string, domain: string): string {
  const slug = slugifyName(fullName);
  return slug ? `${slug}@${domain}` : "";
}

/** Message prêt à envoyer au chatter (copié en un clic depuis l'UI). */
export function credentialsMessage(
  fullName: string,
  email: string,
  password: string,
  url: string
): string {
  return [
    `Salut ${fullName}, voici tes accès au CRM :`,
    "",
    `Lien : ${url}`,
    `Identifiant : ${email}`,
    `Mot de passe : ${password}`,
    "",
    "Pense à ne pas partager ces identifiants.",
  ].join("\n");
}
