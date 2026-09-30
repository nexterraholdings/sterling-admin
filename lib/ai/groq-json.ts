import { GROQ_MODEL } from "@/lib/conversations/groq";
import { supabaseAdmin } from "@/lib/supabase/server";

/** One JSON-mode Groq call, logged to prop_groq_calls under `label` so it counts toward the daily budget. */
export async function groqJson(
  system: string,
  prompt: string,
  options: { label: string; maxTokens?: number; timeoutMs?: number },
): Promise<{ text: string; model: string }> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new Error("Set GEMINI_API_KEY or GROQ_API_KEY");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.3,
      max_tokens: options.maxTokens ?? 1200,
      reasoning_effort: "low",
      include_reasoning: false,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  await supabaseAdmin.from("prop_groq_calls").insert({
    job_id: null,
    model: `${payload?.model || GROQ_MODEL} (${options.label})`,
    ok: response.ok,
    prompt_tokens: Number(payload?.usage?.prompt_tokens ?? 0),
    completion_tokens: Number(payload?.usage?.completion_tokens ?? 0),
    error: response.ok ? null : (payload?.error?.message ?? `Groq returned ${response.status}`).slice(0, 300),
  });
  if (!response.ok) throw new Error(payload?.error?.message || `Groq returned ${response.status}`);
  return { text: payload?.choices?.[0]?.message?.content ?? "", model: payload?.model || GROQ_MODEL };
}

/** Pulls the outermost JSON object out of a model reply. Null when there is none. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
