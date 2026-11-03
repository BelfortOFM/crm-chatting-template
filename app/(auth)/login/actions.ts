"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clientIp } from "@/lib/geolocation";
import { checkIpWatchOnLogin } from "@/lib/ip-watch";
import { recordLogin } from "@/lib/login-history";

export interface LoginState {
  error?: string;
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase limite le nombre de tentatives d'authentification (429,
    // code over_request_rate_limit) — ce n'est pas un mauvais mot de passe,
    // mais le message generique le laissait croire, envoyant un chatter
    // dont les identifiants sont corrects retenter en boucle pour rien.
    if (error.code === "over_request_rate_limit") {
      return { error: "Too many login attempts. Try again in a few minutes." };
    }
    return { error: "Invalid credentials." };
  }

  const { data: profile } = await supabase.from("profiles").select("agency_id").eq("id", data.user.id).maybeSingle();
  if (profile) {
    const h = await headers();
    await Promise.all([
      checkIpWatchOnLogin(profile.agency_id, data.user.id, clientIp(h)),
      recordLogin(profile.agency_id, data.user.id, h),
    ]);
  }

  redirect("/");
}
