import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/session";
import { Carousel } from "./Carousel";

/**
 * Hors du groupe (chatter), comme /verification et /nouveau-mot-de-passe : ce
 * groupe redirige ici tant que la presentation n'a pas ete vue, donc l'y
 * placer ferait boucler la redirection.
 */
export default async function BienvenuePage() {
  const profile = await getSessionProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "chatter") redirect("/admin/dashboard");
  // Les etapes precedentes restent prioritaires : on ne presente pas l'outil
  // a quelqu'un dont le compte n'est pas encore securise ni verifie.
  if (profile.mustChangePassword) redirect("/nouveau-mot-de-passe");
  if (profile.onboardingSeen) redirect("/dashboard");

  const firstName = profile.fullName.split(/\s+/)[0] ?? profile.fullName;

  return (
    <main className="bg-background">
      <Carousel firstName={firstName} />
    </main>
  );
}
