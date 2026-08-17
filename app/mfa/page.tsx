import { redirect } from "next/navigation";
import { STAFF_ROLES } from "@/app/dashboard/lib/dal";
import { MfaScreen } from "@/components/auth/MfaScreen";
import { getStaffMfaState, staffHasCompletedLoginChallenge } from "@/lib/auth/mfa";
import { getAuthUser } from "@/lib/auth/get-auth-user";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { supabaseAdmin } from "@/lib/supabase/server";

export default async function MfaPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser(supabase);

  if (!user) redirect("/");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("account_role")
    .eq("id", user.id)
    .single();

  if (!profile || !(STAFF_ROLES as readonly string[]).includes(profile.account_role)) {
    redirect("/");
  }

  if (await staffHasCompletedLoginChallenge(supabase, user.id)) {
    redirect("/dashboard");
  }

  const mfaState = await getStaffMfaState(supabase);
  if (mfaState.status === "ok") {
    redirect("/dashboard");
  }

  return (
    <MfaScreen
      mode={mfaState.status}
      factorId={mfaState.status === "verify" ? mfaState.factorId : undefined}
    />
  );
}
