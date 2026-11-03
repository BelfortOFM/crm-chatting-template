import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/login"];

/**
 * Renamed from middleware.ts in Next.js 16. Only checks authentication
 * (session present) — role-based authorization (agency_admin vs chatter)
 * is enforced in each route group's layout.tsx, as recommended by Next.js
 * for anything beyond an optimistic redirect.
 */
export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((path) => pathname === path);

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  // Restent joignables sans session de navigateur :
  // - manifest.webmanifest, que Safari lit AVANT toute connexion au moment de
  //   l'ajout a l'ecran d'accueil ;
  // - sw.js, le service worker, telecharge hors contexte de navigation :
  //   redirige vers /login, il ne s'enregistre pas et aucune notification
  //   n'arrive ;
  // - api/cron/*, appele par une tache planifiee externe, qui n'a pas de
  //   cookie. Ces routes portent leur propre authentification (secret
  //   partage) et la delegent donc volontairement au proxy.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|api/cron|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
