"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface PasswordState {
  error?: string;
}

const MIN_LENGTH = 8;

/**
 * Le chatter choisit son mot de passe a la premiere connexion.
 *
 * Passe par la session de l'interesse (`auth.updateUser`), jamais par la cle
 * de service : c'est lui qui change son propre mot de passe, le serveur n'a
 * pas a agir en son nom. Le drapeau est ensuite leve par le meme client, ce
 * que la RLS autorise pour sa propre ligne uniquement.
 */
export async function setOwnPassword(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_LENGTH) {
    return { error: `Password must be at least ${MIN_LENGTH} characters.` };
  }
  if (password !== confirm) {
    return { error: "The two entries don't match." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // Supabase refuse notamment un mot de passe identique au precedent.
    return { error: error.message };
  }

  const { error: flagError } = await supabase
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  if (flagError) return { error: flagError.message };

  redirect("/dashboard");
}
