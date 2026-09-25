export const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";

const DEFAULT_PERSONALITY =
  "Casual neighbor. Short, specific, and a little informal. Sound like a person texting, not a brand.";

export function personalityOrDefault(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? text : DEFAULT_PERSONALITY;
}

export function topicOrDefault(value: string | null | undefined): string {
  const text = value?.trim();
  return text ? text : "everyday local life";
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
      return "";
    })
    .join("")
    .trim();
}

function cleanLine(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();
  text = text.replace(/^[\"“”']+|[\"“”']+$/g, "").trim();
  if (text.length > 240) {
    const cut = text.slice(0, 240);
    const lastSpace = cut.lastIndexOf(" ");
    text = (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim();
  }
  return text;
}

export type GroqLine = {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
};

export class GroqCallError extends Error {
  promptTokens: number;
  completionTokens: number;
  model: string;

  constructor(message: string, usage?: { promptTokens?: number; completionTokens?: number; model?: string }) {
    super(message);
    this.name = "GroqCallError";
    this.promptTokens = usage?.promptTokens ?? 0;
    this.completionTokens = usage?.completionTokens ?? 0;
    this.model = usage?.model ?? GROQ_MODEL;
  }
}

export async function writeConversationLine(input: {
  topic: string;
  personality: string;
  kind: "start_post" | "reply";
  parentBody: string | null;
}): Promise<GroqLine> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new GroqCallError("GROQ_API_KEY is not configured");

  const task =
    input.kind === "reply"
      ? `Reply to this message in the same group: ${input.parentBody ?? ""}`
      : "Open a new post in the group. Do not mention that you were asked to post.";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.9,
      max_tokens: 700,
      reasoning_effort: "low",
      include_reasoning: false,
      messages: [
        {
          role: "system",
          content: [
            "You write one short message for a local group chat.",
            `Personality: ${personalityOrDefault(input.personality)}`,
            `Topic: ${topicOrDefault(input.topic)}`,
            "One or two sentences. No hashtags, no quotes around the message, no labels, no emoji stacks.",
          ].join("\n"),
        },
        { role: "user", content: task },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string };
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: Array<{ message?: { content?: unknown } }>;
  } | null;

  const usage = {
    promptTokens: Number(payload?.usage?.prompt_tokens ?? 0),
    completionTokens: Number(payload?.usage?.completion_tokens ?? 0),
    model: payload?.model || GROQ_MODEL,
  };

  if (!response.ok) {
    throw new GroqCallError(payload?.error?.message || `Groq returned ${response.status}`, usage);
  }

  const text = cleanLine(messageText(payload?.choices?.[0]?.message?.content));
  if (text.length < 2) throw new GroqCallError("Groq returned an empty line", usage);
  if (input.parentBody && text.toLowerCase() === input.parentBody.trim().toLowerCase()) {
    throw new GroqCallError("Groq repeated the message it was answering", usage);
  }

  return { text, model: usage.model, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens };
}
