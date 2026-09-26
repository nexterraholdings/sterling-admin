import { isMissingSchemaError } from "@/lib/discussions/listDiscussions";
import { supabaseAdmin } from "@/lib/supabase/server";

export type RunMomentRow = {
  id: string;
  group_id: string;
  user_id: string;
  job_id: string | null;
  decision: "jumped_in" | "stayed_out";
  subject: string;
  pace: string;
  at: string;
};

export async function recordRunMoment(input: {
  groupId: string;
  userId: string;
  jobId?: string | null;
  decision: "jumped_in" | "stayed_out";
  subject: string;
  pace: string;
}): Promise<void> {
  if (input.decision === "stayed_out") {
    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    const existing = await supabaseAdmin
      .from("prop_run_moments")
      .select("id")
      .eq("group_id", input.groupId)
      .eq("user_id", input.userId)
      .eq("decision", "stayed_out")
      .gte("at", since)
      .limit(1);
    if (existing.error && isMissingSchemaError(existing.error)) return;
    if (existing.error) {
      console.error("[conversations] could not check a stay-out:", existing.error.message);
      return;
    }
    if ((existing.data ?? []).length > 0) return;
  }

  const { error } = await supabaseAdmin.from("prop_run_moments").insert({
    group_id: input.groupId,
    user_id: input.userId,
    job_id: input.jobId ?? null,
    decision: input.decision,
    subject: input.subject.trim().slice(0, 180),
    pace: input.pace.trim().slice(0, 80),
  });
  if (error && !isMissingSchemaError(error)) {
    console.error("[conversations] could not record a run moment:", error.message);
  }
}

export async function loadRunMomentsSince(since: string): Promise<RunMomentRow[]> {
  const { data, error } = await supabaseAdmin
    .from("prop_run_moments")
    .select("id, group_id, user_id, job_id, decision, subject, pace, at")
    .gte("at", since)
    .order("at", { ascending: false })
    .limit(500);
  if (error && isMissingSchemaError(error)) return [];
  if (error) throw new Error(error.message);
  return ((data ?? []) as RunMomentRow[]).map((row) => ({
    id: String(row.id),
    group_id: String(row.group_id),
    user_id: String(row.user_id),
    job_id: row.job_id ? String(row.job_id) : null,
    decision: row.decision === "stayed_out" ? "stayed_out" : "jumped_in",
    subject: String(row.subject ?? ""),
    pace: String(row.pace ?? ""),
    at: String(row.at),
  }));
}

export async function loadRunMomentForJob(jobId: string): Promise<RunMomentRow | null> {
  const { data, error } = await supabaseAdmin
    .from("prop_run_moments")
    .select("id, group_id, user_id, job_id, decision, subject, pace, at")
    .eq("job_id", jobId)
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && isMissingSchemaError(error)) return null;
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: String(data.id),
    group_id: String(data.group_id),
    user_id: String(data.user_id),
    job_id: data.job_id ? String(data.job_id) : null,
    decision: data.decision === "stayed_out" ? "stayed_out" : "jumped_in",
    subject: String(data.subject ?? ""),
    pace: String(data.pace ?? ""),
    at: String(data.at),
  };
}
