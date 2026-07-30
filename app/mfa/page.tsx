import { redirect } from "next/navigation";
import { STAFF_ROLES } from "@/app/dashboard/lib/dal";
import { MfaScreen } from "@/components/auth/MfaScreen";
import { getStaffMfaState } from "@/lib/auth/mfa";
import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { supabaseAdmin } from "@/lib/supabase/server";

export default async function MfaPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("account_role")
    .eq("id", user.id)
    .single();

  if (!profile || !(STAFF_ROLES as readonly string[]).includes(profile.account_role)) {
    redirect("/");
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
