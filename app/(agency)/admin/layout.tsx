import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/session";
import { AdminNav } from "@/components/nav/AdminNav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Résolu une seule fois par requête : les pages enfants réutilisent ce même
  // appel au lieu de refaire getUser() + select profiles chacune de leur côté.
  const profile = await getSessionProfile();

  if (!profile) redirect("/login");
  if (profile.role !== "agency_admin") redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AdminNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
