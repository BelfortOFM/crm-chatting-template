import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { getSessionProfile } from "@/lib/session";
import { Card } from "@/components/ui/Card";
import { PasswordForm } from "./PasswordForm";

/**
 * Hors du groupe (chatter), comme /verification : ce groupe redirige ici tant
 * que le mot de passe provisoire n'a pas ete remplace, y placer la page
 * ferait boucler la redirection.
 */
export default async function NewPasswordPage() {
  const profile = await getSessionProfile();

  if (!profile) redirect("/login");
  // Un admin n'a rien a faire ici : il choisit son mot de passe lui-meme.
  if (profile.role !== "chatter") redirect("/admin/dashboard");
  if (!profile.mustChangePassword) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-8">
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-info via-sky-500 to-accent text-white shadow-[0_4px_16px_rgb(56_189_248/0.5)]">
          <KeyRound size={22} />
        </span>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-foreground">
          Choose your password
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Hi {profile.fullName} — one last step before you access your space.
        </p>
      </div>

      <Card className="mt-5">
        <PasswordForm />
      </Card>

      <Card className="mt-4 flex items-start gap-3 border-dashed bg-surface-2/40">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-muted" />
        <p className="text-xs leading-relaxed text-muted">
          The one your agency sent you was temporary: it was shared over a message and was known
          to someone else too. The one you choose now is known only to you — not even your agency
          can read it, they can only reset it if you lose it.
        </p>
      </Card>
    </main>
  );
}
