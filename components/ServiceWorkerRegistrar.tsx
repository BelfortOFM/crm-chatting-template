"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker au chargement.
 *
 * Il ne l'etait qu'au moment ou l'utilisateur activait les notifications. Deux
 * consequences : Chrome pouvait ne pas proposer l'installation (il attend un
 * service worker actif), et un appareil deja abonne ne recevait rien tant que
 * personne n'avait rouvert l'ecran des notifications.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Silencieux : un echec d'enregistrement ne doit pas remonter a
    // l'utilisateur, l'application fonctionne sans.
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
