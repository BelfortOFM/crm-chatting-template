import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session for a request. Used by proxy.ts
 * (Next.js 16's renamed middleware.ts convention) on every navigation.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let {
    data: { user },
  } = await supabase.auth.getUser();

  // ===== DEV ONLY — BYPASS LOGIN (à retirer avant déploiement) =====
  // En dev, on connecte automatiquement un compte seedé pour ne pas avoir à
  // passer par l'écran de login. Choix du compte via `?as=<nom>` puis mémorisé
  // dans un cookie ; sans indication, on reprend le dernier choix, sinon admin.
  // Garde `NODE_ENV` : en production (`next start`) ce bloc est inactif.
  if (process.env.NODE_ENV === "development") {
    const DEV_ACCOUNTS: Record<string, string> = {
      admin: "admin@agence.test",
      lea: "lea@agence.test",
      nina: "nina@agence.test",
      sam: "sam@agence.test",
    };
    const DEV_COOKIE = "dev-auth-email";
    const DEV_PASSWORD = "password123";

    const requested = request.nextUrl.searchParams.get("as");
    const previous = request.cookies.get(DEV_COOKIE)?.value;

    const target = requested && DEV_ACCOUNTS[requested]
      ? DEV_ACCOUNTS[requested]
      : !user
        ? (previous ?? DEV_ACCOUNTS.admin)
        : null;

    if (target) {
      if (user) await supabase.auth.signOut();
      await supabase.auth.signInWithPassword({ email: target, password: DEV_PASSWORD });
      supabaseResponse.cookies.set(DEV_COOKIE, target, { path: "/" });
      user = (await supabase.auth.getUser()).data.user;
    }
  }

  return { supabaseResponse, user };
}
