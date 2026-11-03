import type { MetadataRoute } from "next";

/**
 * Manifeste d'installation. Next.js le sert sur /manifest.webmanifest.
 *
 * C'est ce fichier qui fait passer le site du statut de "page web" a celui
 * d'application installable : icone sur l'ecran d'accueil, ouverture en plein
 * ecran, et — cote iOS — la condition prealable a toute notification push,
 * qu'Apple refuse a un site consulte dans un onglet Safari.
 *
 * Android en tire davantage : Chrome propose l'installation de lui-meme,
 * enrichit sa fenetre avec les captures declarees ici, recadre l'icone selon
 * la forme du systeme et expose les raccourcis a l'appui long.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CRM Chatting",
    short_name: "CRM Chatting",
    description: "Shift tracking, planning and payroll for the agency.",
    start_url: "/",
    // standalone : ni barre d'adresse ni onglets, l'app occupe tout l'ecran.
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0e16",
    theme_color: "#0a0e16",
    lang: "en",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Icone dediee au recadrage Android : le symbole tient dans les 40 %
      // centraux. Reutiliser l'icone normale (17 % de marge) la faisait rogner
      // sur les surcouches qui decoupent en cercle.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Sans captures, Chrome Android affiche une fenetre d'installation minimale
    // et l'on installe sans savoir a quoi ressemble l'application.
    screenshots: [
      {
        src: "/screenshot-dashboard.png",
        sizes: "1082x2202",
        type: "image/png",
        form_factor: "narrow",
        label: "Agency overview",
      },
      {
        src: "/screenshot-paie.png",
        sizes: "1082x2202",
        type: "image/png",
        form_factor: "narrow",
        label: "Period payroll",
      },
    ],
    // Appui long sur l'icone : les deux gestes quotidiens d'un chatter.
    shortcuts: [
      {
        name: "Report a shift",
        short_name: "Report",
        url: "/report",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "My planning",
        short_name: "Planning",
        url: "/planning",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
