import { abbrevInstruction, forbidsHyphens, grammarInstruction, parseAbbrev, parseGrammar, stripHyphens, swearInstruction, type SwearRate } from "@/lib/conversations/rules";

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

function roughenLine(raw: string, grammar: number): string {
  const level = parseGrammar(grammar);
  if (level >= 85) return raw.replace(/\s+/g, " ").trim();

  const mess = (85 - level) / 85;
  let text = raw;
  if (mess > 0.45) {
    text = text.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-");
    text = text.replace(/\s+-\s+/g, " ");
    text = text.replace(/([A-Za-z])-([A-Za-z])/g, "$1 $2");
    text = text.replace(/;/g, ",");
    text = text.replace(/\s+,/g, ",");
    text = text.replace(/,{2,}/g, ",");
  }
  text = text.replace(/…/g, "...");
  text = text.replace(/\s+/g, " ").trim();

  const contraction = text.match(/\b[A-Za-z]+'[A-Za-z]+\b/);
  if (contraction && Math.random() < 0.7 * mess) {
    text = text.replace(contraction[0], contraction[0].replace("'", ""));
  }

  if (text.endsWith(".") && Math.random() < 0.9 * mess) text = text.slice(0, -1).trim();
  if (/^[A-Z]/.test(text) && text.slice(1, 2) !== "." && Math.random() < 0.8 * mess) {
    text = text.charAt(0).toLowerCase() + text.slice(1);
  }

  if (Math.random() < 0.95 * mess) text = addTypo(text);
  return text.replace(/\s+/g, " ").trim();
}

function styleNotes(grammar: number): string[] {
  const level = parseGrammar(grammar);
  const shared = "One or two sentences. No hashtags, no quotes around the message, no labels, no emoji stacks.";
  if (level >= 85) {
    return [shared, grammarInstruction(level), "Still sound like a neighbor, not a press release."];
  }
  if (level >= 60) {
    return [shared, grammarInstruction(level)];
  }
  if (level >= 35) {
    return [shared, grammarInstruction(level), "Avoid a polished essay rhythm."];
  }
  return [
    shared,
    grammarInstruction(level),
    "Never use a hyphen, dash, em dash, semicolon, or colon. Do not write compounds like well-known or check-in. Use a space or a new sentence instead.",
    "No polished rhythm. No 'its not just x, its y'. Sound slightly rushed and uneven.",
  ];
}

function addTypo(text: string): string {
  const parts = text.split(" ");
  const candidates = parts
    .map((word, index) => ({ word, index }))
    .filter(({ word, index }) => index > 0 && wordCore(word).length >= 5);
  if (candidates.length === 0) return text;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  if (!pick) return text;
  parts[pick.index] = typoWord(pick.word);
  return parts.join(" ");
}

function wordCore(word: string): string {
  return word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
}

function typoWord(word: string): string {
  const match = word.match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/);
  if (!match) return word;
  const lead = match[1] ?? "";
  const core = match[2] ?? "";
  const tail = match[3] ?? "";
  if (core.length < 5) return word;
  const chars = core.split("");
  const at = 1 + Math.floor(Math.random() * (chars.length - 2));
  const roll = Math.floor(Math.random() * 3);
  if (roll === 0 && at + 1 < chars.length) {
    const swap = chars[at];
    chars[at] = chars[at + 1] ?? chars[at];
    chars[at + 1] = swap ?? chars[at + 1];
  } else if (roll === 1) {
    chars.splice(at, 1);
  } else {
    chars.splice(at, 0, chars[at] ?? "e");
  }
  return `${lead}${chars.join("")}${tail}`;
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
  behavior?: string;
  character?: string;
  subject?: string;
  objective?: string;
  kind: "start_post" | "reply";
  parentBody: string | null;
  rules?: string[];
  thread?: string[];
  swear?: boolean;
  swearRate?: SwearRate;
  grammar?: number;
  abbrev?: number;
}): Promise<GroqLine> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new GroqCallError("GROQ_API_KEY is not configured");

  const rules = (input.rules ?? []).map((rule) => rule.trim()).filter(Boolean);
  const behavior = input.behavior?.trim() ?? "";
  const character = input.character?.trim() ?? "";
  const subject = input.subject?.trim() ?? "";
  const objective = input.objective?.trim() ?? "";
  const grammar = parseGrammar(input.grammar);
  const abbrev = parseAbbrev(input.abbrev);
  const allowSwearing = Boolean(input.swear);
  const thread = (input.thread ?? []).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8);
  const task =
    input.kind === "reply"
      ? [
          thread.length > 0 ? `Conversation so far:\n${thread.map((line, index) => `${index + 1}. ${line}`).join("\n")}` : "",
          `Reply to this message: ${input.parentBody ?? ""}`,
          "Stay on what this conversation is already about. Do not start a new subject.",
        ]
          .filter(Boolean)
          .join("\n\n")
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
            "You write one short message for a local group chat, like a text from a real neighbor.",
            ...(objective ? [`Run objective: ${objective} Serve that goal while still sounding like one neighbor texting.`] : []),
            `Personality: ${personalityOrDefault(input.personality)}`,
            ...(character
              ? [
                  `Who this person is: ${character}`,
                  "These traits decide what they care about and how they phrase it. The grammar level and the abbreviation level still control typos and shortened words.",
                ]
              : []),
            `Topic: ${topicOrDefault(input.topic)}`,
            ...(subject ? [`What they bring up, in their own words: ${subject}`] : []),
            ...styleNotes(grammar),
            swearInstruction(allowSwearing, input.swearRate ?? "sometimes"),
            ...(rules.length > 0
              ? [
                  behavior
                    ? "Follow every rule below. A rule wins when it conflicts with the style notes above, except the grammar level, the abbreviation level, and this person's own behavior."
                    : "Follow every rule below. A rule wins when it conflicts with the style notes above, except the grammar level and the abbreviation level.",
                  ...rules.map((rule) => `- ${rule}`),
                ]
              : []),
            `Grammar level: ${grammarInstruction(grammar)} This grammar level wins over any rule about spelling, typos, or polish.`,
            `Abbreviation level: ${abbrevInstruction(abbrev, allowSwearing)} This abbreviation level wins over any rule about spelling those phrases out.`,
            ...(forbidsHyphens(rules)
              ? ["Never use a hyphen or a dash anywhere in this line, including compound words. Use a space or a period. This wins over the grammar level."]
              : []),
            ...(behavior
              ? [
                  "This person's own behavior controls how they write. Follow it on this line. It wins over the run rules when they conflict.",
                  behavior,
                ]
              : []),
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

  const drafted = roughenLine(cleanLine(messageText(payload?.choices?.[0]?.message?.content)), grammar);
  const text = forbidsHyphens(rules) ? stripHyphens(drafted) : drafted;
  if (text.length < 2) throw new GroqCallError("Groq returned an empty line", usage);
  const prior = new Set(
    [input.parentBody ?? "", ...thread].map((line) => line.trim().toLowerCase()).filter(Boolean),
  );
  if (prior.has(text.toLowerCase())) {
    throw new GroqCallError("Groq repeated a line already in the conversation", usage);
  }

  return { text, model: usage.model, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens };
}
