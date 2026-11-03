/**
 * Service worker : reçoit les notifications quand l'app est fermée.
 *
 * Volontairement minimal — il ne met rien en cache. Le CRM affiche des
 * montants et des plannings qui changent en permanence : servir une version
 * mise en cache ferait lire des chiffres périmés, ce qui est pire que lent.
 * Son unique rôle est le push.
 */

self.addEventListener("install", (event) => {
  // Prend la main immédiatement, sans attendre la fermeture des onglets.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Chrome n'annonce un site comme installable que si un service worker
// intercepte les requetes. Celui-ci se contente de laisser passer : le CRM
// affiche des donnees qui changent en permanence, les servir depuis un cache
// donnerait des chiffres faux, ce qui est pire que lent.
self.addEventListener("fetch", () => {
  // Pas de event.respondWith : le navigateur suit son chemin normal.
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "CRM Chatter", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "CRM Chatter";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Regroupe les notifications de même nature : un second rappel de shift
    // remplace le premier au lieu d'empiler deux alertes identiques.
    tag: payload.tag || "crm-chatter",
    renotify: Boolean(payload.tag),
    data: { url: payload.url || "/" },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  // Si l'app est déjà ouverte, on la ramène au premier plan plutôt que
  // d'ouvrir une seconde fenêtre.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
