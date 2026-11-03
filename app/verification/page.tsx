import { redirect } from "next/navigation";
import { ShieldCheck, Clock, XCircle, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CaptureForm } from "./CaptureForm";

/**
 * Volontairement hors du groupe (chatter) : ce groupe redirige ici tant que
 * l'identité n'est pas validée, donc y placer cette page ferait boucler la
 * redirection sur elle-même. Elle refait donc ses propres contrôles d'accès.
 */
export default async function VerificationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, must_change_password")
    .eq("id", user.id)
    .single();

  // Un admin n'a rien à faire ici : la vérification ne concerne que les chatters.
  if (profile?.role !== "chatter") redirect("/admin/dashboard");
  if (profile.must_change_password) redirect("/nouveau-mot-de-passe");

  const { data: verification } = await supabase
    .from("identity_verifications")
    .select("status, rejection_reason, submitted_at, required")
    .eq("chatter_id", user.id)
    .maybeSingle();

  // Identité déjà validée, ou contrôle levé par l'agence : rien à faire ici.
  if (verification?.status === "approved" || verification?.required === false) {
    redirect("/dashboard");
  }

  const submitted = verification?.status === "submitted";
  const rejected = verification?.status === "rejected";

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-info via-sky-500 to-accent text-white shadow-[0_4px_16px_rgb(56_189_248/0.5)]">
          <ShieldCheck size={22} />
        </span>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-foreground">
          Identity verification
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          A one-time step, before you access your space.
        </p>
      </div>

      {submitted ? (
        <Card className="border-warning/40 bg-warning-soft text-center">
          <Clock size={22} className="mx-auto text-warning" />
          <p className="mt-2 text-sm font-semibold text-foreground">Submission sent</p>
          <p className="mt-1 text-xs text-muted">
            Your agency will review it. You&apos;ll get access to your space as soon as it&apos;s
            approved — no need to resend anything.
          </p>
        </Card>
      ) : (
        <>
          {rejected && (
            <Card className="border-danger/40 bg-danger/10">
              <p className="flex items-center gap-2 text-sm font-semibold text-danger">
                <XCircle size={16} /> Submission rejected
              </p>
              <p className="mt-1 text-xs text-foreground">
                {verification?.rejection_reason || "Photos unreadable or incomplete."}
              </p>
              <p className="mt-1.5 text-xs text-muted">Retake the photos below.</p>
            </Card>
          )}

          {/* Information obligatoire : la personne doit savoir ce qui est
              collecté, pourquoi, qui y accède et combien de temps. */}
          <Card className="border-dashed bg-surface-2/40">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <Lock size={13} /> What happens to your documents
            </p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
              <li>
                <strong className="text-foreground">Why</strong> — to confirm you are indeed the
                person the agency entrusts with accounts and pays.
              </li>
              <li>
                <strong className="text-foreground">Who can access it</strong> — only your agency&apos;s
                administrators. No other chatter can see it.
              </li>
              <li>
                <strong className="text-foreground">How it&apos;s stored</strong> — encrypted
                (AES-256). Files are unreadable without the agency&apos;s key.
              </li>
              <li>
                <strong className="text-foreground">Location</strong> — at the time of submission,
                your location is recorded (GPS if you allow it, otherwise a rough estimate via
                your IP), for the same anti-fraud check.
              </li>
              <li>
                <strong className="text-foreground">How long</strong> — deleted after your
                collaboration ends. You can ask your agency to erase them.
              </li>
            </ul>
          </Card>

          <CaptureForm />
        </>
      )}
    </div>
  );
}
