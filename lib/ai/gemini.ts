/** Free-tier friendly defaults: Flash-Lite allows far more free requests per day than Flash. */
export const GEMINI_LITE_MODEL = process.env.GEMINI_LITE_MODEL?.trim() || "gemini-3.5-flash-lite";
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export type GeminiResult = { text: string; model: string; promptTokens: number; completionTokens: number };

export async function geminiJson(input: {
  system: string;
  prompt: string;
  model?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const model = input.model ?? GEMINI_LITE_MODEL;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.system }] },
      contents: [{ role: "user", parts: [{ text: input.prompt }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: input.maxOutputTokens ?? 2048 },
    }),
    signal: AbortSignal.timeout(input.timeoutMs ?? 20_000),
  });
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    modelVersion?: string;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  } | null;
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini returned ${response.status}`);
  const text = (payload?.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  return {
    text,
    model: payload?.modelVersion || model,
    promptTokens: Number(payload?.usageMetadata?.promptTokenCount ?? 0),
    completionTokens:
      Number(payload?.usageMetadata?.candidatesTokenCount ?? 0) + Number(payload?.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}
