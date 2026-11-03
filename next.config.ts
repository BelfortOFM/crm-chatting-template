import type { NextConfig } from "next";

// Toutes les regles metier (periodes de paie, verrou de shift, "aujourd'hui")
// raisonnent en heure de Paris et le confirment cote base (fn_shift_date_locked
// fait `now() at time zone 'Europe/Paris'`). Le code app utilise `new Date()`
// + des getters locaux (getFullYear/getMonth/getDate), qui suivent le fuseau
// du process Node — fixer TZ ici garantit qu'il vaut toujours Europe/Paris,
// que le service tourne sur le Mac Mini (deja en heure de Paris) ou soit un
// jour redeploye sur une infra dont l'horloge systeme est en UTC par defaut.
process.env.TZ = "Europe/Paris";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Les Server Actions plafonnent a 1 Mo par defaut : plusieurs photos prises
      // au telephone depassaient la limite et l'envoi echouait avec un 413
      // ("this page couldn't load"). Les images sont compressees cote client
      // avant l'envoi (~300 Ko piece) ; cette valeur reste le filet pour les
      // cas ou la compression n'a pas pu s'appliquer (format exotique).
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
