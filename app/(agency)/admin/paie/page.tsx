import { redirect } from "next/navigation";

/**
 * L'ancienne adresse `/admin/paie` reste dans les liens (navigation,
 * dashboard) : on la redirige vers OnlyFans, seule plateforme integree.
 */
export default function PaieIndexPage() {
  redirect("/admin/paie/onlyfans");
}
