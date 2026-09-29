import { GROQ_MODEL } from "@/lib/conversations/groq";
import type { KnowledgeSource, KnowledgeVerdict } from "@/lib/knowledge/types";

export type JudgeInput = { id: string; claim: string; author: string; source: KnowledgeSource };
export type JudgeResult = {
  verdicts: Map<string, { verdict: KnowledgeVerdict; reason: string }>;
  tokens: number;
};

const RULES = [
  "Items can be news headlines, posts, event listings, or weather alerts, in any language. Judge the meaning, not the wording.",
  "Approve only when every one of these is true:",
  "- It is about this place or the area around it.",
  "- It is concrete: something that happened, was announced, or is scheduled. Not an opinion, a question, or an ad.",
  "- A neighbor could bring it up in a casual local group chat without it being upsetting or divisive.",
  "Reject anything about elections, candidates, ballot measures, campaigns, or partisan fights.",
  "Reject crimes, accidents, arrests, or lawsuits that name private people.",
  "Reject deaths, disasters, and tragedies. Routine weather alerts such as heat, wind, or flood advisories are fine.",
  "Reject national or world news that only mentions this place in passing.",
  "Reject medical or health claims, and financial or investment claims.",
  "Reject rumors, unconfirmed reports, and anything sexual, hateful, or about a private person.",
].join("\n");

export async function judgeItems(place: string, items: JudgeInput[]): Promise<JudgeResult> {
  const verdicts = new Map<string, { verdict: KnowledgeVerdict; reason: string }>();
  if (items.length === 0) return { verdicts, tokens: 0 };
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new Error("GROQ_API_KEY is not configured");

  const list = items.map((item) => ({ id: item.id, claim: item.claim, from: item.author || item.source }));
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0,
      max_tokens: 1500,
      reasoning_effort: "low",
      include_reasoning: false,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            `You screen facts before neighbors in ${place || "this place"} talk about them in a local group chat.`,
            RULES,
            'Return JSON only: {"items":[{"id":"the id you were given","verdict":"approve or reject","reason":"under 12 words"}]}',
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify({ items: list }) },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const tokens = Number(payload?.usage?.prompt_tokens ?? 0) + Number(payload?.usage?.completion_tokens ?? 0);
  if (!response.ok) throw new Error(payload?.error?.message || `Groq returned ${response.status}`);

  let parsed: { items?: Array<{ id?: unknown; verdict?: unknown; reason?: unknown }> } | null = null;
  try {
    parsed = JSON.parse(payload?.choices?.[0]?.message?.content ?? "");
  } catch {
    parsed = null;
  }
  const ids = new Set(items.map((item) => item.id));
  for (const row of parsed?.items ?? []) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!ids.has(id)) continue;
    const verdict = row.verdict === "approve" ? "approve" : row.verdict === "reject" ? "reject" : null;
    if (!verdict) continue;
    verdicts.set(id, { verdict, reason: typeof row.reason === "string" ? row.reason.trim().slice(0, 160) : "" });
  }
  return { verdicts, tokens };
}
