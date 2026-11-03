import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS entirely — only for operations the
 * Supabase Auth Admin API requires (creating a chatter's auth.users row).
 * Never import this from client code; every caller must independently
 * verify the requester is an agency_admin first (see requireAgencyAdmin()).
 */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
