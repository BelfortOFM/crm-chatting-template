/**
 * Compression des photos avant envoi (navigateur uniquement).
 *
 * Une photo prise avec un iPhone recent pese 3 a 5 Mo. Trois d'un coup
 * depassaient la limite de corps des Server Actions et l'envoi echouait
 * silencieusement du point de vue de l'utilisateur.
 *
 * 1600 px sur le grand cote suffisent tres largement pour lire les mentions
 * d'une carte d'identite ou reconnaitre un visage, pour environ 300 Ko —
 * soit dix fois moins de donnees a transmettre, ce qui compte aussi quand le
 * chatter envoie ses pieces en 4G.
 */

const MAX_SIDE = 1600;
const QUALITY = 0.85;

export async function compressImage(file: File): Promise<File> {
  // Un format que le navigateur ne sait pas decoder (HEIC sur certains
  // Android, TIFF...) doit partir tel quel plutot que d'echouer : la limite
  // serveur relevee absorbe ce cas.
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    if (!blob) return file;

    // Si la "compression" a grossi le fichier (petite image deja optimisee),
    // on garde l'original.
    if (blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

/** Remplace le contenu d'un <input type="file"> par le fichier compressé. */
export function setInputFile(input: HTMLInputElement, file: File): void {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
}
