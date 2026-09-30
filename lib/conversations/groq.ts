import {
  abbrevInstruction,
  attitudeInstruction,
  grammarInstruction,
  HARD_LIMITS,
  parseAbbrev,
  parseAttitude,
  parseGrammar,
  parseSwearStrength,
  swearPlan,
  type Attitude,
  type SwearRate,
  type SwearStrength,
} from "@/lib/conversations/rules";
import { copiesSource, fixMechanics, hardLimitTells, hasSwear, rewriteRequest, robotTells, universalVoiceRules } from "@/lib/conversations/voice-guard";

export const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";

const MAX_ATTEMPTS = 3;

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

const COMMON_CAPITALS = new Set(
  "i i'm i've i'd i'll im ive id ill ok okay omg lol lmao tbh idk fyi asap ngl smh btw pm am tv usa us uk".split(" "),
);

function numberKey(token: string): string {
  return token.replace(/[,]/g, "").replace(/[.:]+$/, "");
}

/**
 * Numbers and mid-sentence capitalized names in an English `line` that `grounded` never mentions.
 * Lines in other languages are not checked: the fact is stored in English, so names and dates will not match word for word.
 */
export function unsupportedDetails(line: string, grounded: string): string[] {
  const source = grounded.toLowerCase();
  const sourceNumbers = new Set((grounded.match(/\d[\d,.:]*/g) ?? []).map(numberKey));
  const extra = new Set<string>();
  for (const token of line.match(/\d[\d,.:]*/g) ?? []) {
    const key = numberKey(token);
    if (key && !sourceNumbers.has(key)) extra.add(key);
  }
  for (const match of line.matchAll(/\b[A-Z][\p{L}'’]+(?:\s+[A-Z][\p{L}'’]+)*/gu)) {
    const before = line.slice(0, match.index).trimEnd();
    if (!before || /[.!?]$/.test(before)) continue;
    for (const word of match[0].split(/\s+/)) {
      const bare = word.replace(/['’]s$/i, "").toLowerCase();
      if (!bare || COMMON_CAPITALS.has(bare) || source.includes(bare)) continue;
      extra.add(word);
    }
  }
  return [...extra].slice(0, 4);
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
  swearStrength?: SwearStrength;
  attitude?: Attitude;
  /** Teen persona. Swearing stays mild and nothing sexual, whatever the run allows. */
  minor?: boolean;
  grammar?: number;
  abbrev?: number;
  place?: string;
  language?: string;
  /** From the knowledge hub. An opening post is written about this and nothing else; a reply may not add to it. */
  fact?: { claim: string; author: string } | null;
  /** Set when this prop lives far from the group's hub. */
  visitor?: { from: string; here: string } | null;
  /** What this prop established in earlier posts. */
  memories?: string[];
  /** The director's one sentence on what this line should do. Direction, not wording. */
  brief?: string;
}): Promise<GroqLine> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new GroqCallError("GROQ_API_KEY is not configured");

  const fact = input.fact?.claim.trim() ? { claim: input.fact.claim.trim(), author: input.fact.author.trim() } : null;
  const opensFromFact = Boolean(fact) && input.kind === "start_post";
  const rules = (input.rules ?? []).map((rule) => rule.trim()).filter(Boolean);
  const behavior = input.behavior?.trim() ?? "";
  const character = input.character?.trim() ?? "";
  const subject = opensFromFact ? "" : input.subject?.trim() ?? "";
  const objective = input.objective?.trim() ?? "";
  const brief = input.brief?.replace(/\s+/g, " ").trim() ?? "";
  const grammar = parseGrammar(input.grammar);
  const abbrev = parseAbbrev(input.abbrev);
  const allowSwearing = Boolean(input.swear);
  const minor = Boolean(input.minor);
  const strength = minor ? "mild" : parseSwearStrength(input.swearStrength);
  const attitude = attitudeInstruction(parseAttitude(input.attitude));
  const swearing = swearPlan(allowSwearing, input.swearRate ?? "sometimes", strength);
  const thread = (input.thread ?? []).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8);
  const memories = (input.memories ?? []).map((memory) => memory.trim()).filter(Boolean).slice(0, 10);
  const place = input.place?.trim() ?? "";
  const language = input.language?.trim() ?? "";
  const foreign = Boolean(language) && language.toLowerCase() !== "english";
  const task =
    input.kind === "reply"
      ? [
          thread.length > 0 ? `Conversation so far:\n${thread.map((line, index) => `${index + 1}. ${line}`).join("\n")}` : "",
          `Reply to this message: ${input.parentBody ?? ""}`,
          "Stay on what this conversation is already about. Do not start a new subject.",
        ]
          .filter(Boolean)
          .join("\n\n")
      : opensFromFact
        ? "Open a new post in the group about the fact above. Do not mention that you were asked to post, and do not include a link."
        : "Open a new post in the group. Do not mention that you were asked to post.";
  const factLines = !fact
    ? []
    : opensFromFact
      ? [
          `Something real going on in ${place || "this place"} right now: ${fact.claim}${fact.author ? ` (from ${fact.author})` : ""}`,
          "Write about this fact only. Mention only names, places, numbers, dates, and events that appear in it. Do not add prices, times, reasons, or details it does not give. React to it the way this person would.",
        ]
      : [
          `This conversation is about something real: ${fact.claim}`,
          "React to it, ask about it, or give an opinion. Do not add new facts, names, numbers, dates, or events.",
        ];

  const system = {
    role: "system",
    content: [
      place
        ? `You write one short message for a local group chat in ${place}, like a text from a real neighbor who lives there.`
        : "You write one short message for a local group chat, like a text from a real neighbor.",
      ...universalVoiceRules(!foreign),
      ...(foreign
        ? [`Write the message in ${language}, the way people there actually text. The grammar and abbreviation levels apply in ${language}.`]
        : []),
      ...(input.visitor
        ? [
            `This person does not live here. They live in ${input.visitor.from} and are visiting ${input.visitor.here || "this area"} or just got here.`,
            "They do not know local history, local people, or local slang. They can mention where they are from, ask locals, or compare it with home.",
          ]
        : []),
      ...(objective ? [`Run objective: ${objective} Serve that goal while still sounding like one neighbor texting.`] : []),
      `Personality: ${personalityOrDefault(input.personality)}`,
      ...(character
        ? [
            `Who this person is: ${character}`,
            "These traits decide what they care about and how they phrase it. The grammar level and the abbreviation level still control typos and shortened words.",
          ]
        : []),
      ...(memories.length > 0
        ? [
            "What this person already said in earlier posts. Stay consistent with it and never contradict it. Bring one up only when it fits naturally, like a real person would:",
            ...memories.map((memory) => `- ${memory}`),
          ]
        : []),
      `Topic: ${topicOrDefault(input.topic)}`,
      ...factLines,
      ...(subject ? [`What they bring up, in their own words: ${subject}`] : []),
      ...(brief ? [`What they want to get across with this message: ${brief} Say it your own way. Do not copy this sentence.`] : []),
      ...styleNotes(grammar),
      swearing.instruction,
      ...(attitude ? [attitude] : []),
      HARD_LIMITS,
      ...(rules.length > 0
        ? [
            behavior
              ? "Follow every rule below. A rule wins when it conflicts with the style notes above, except the universal rules, the grammar level, the abbreviation level, and this person's own behavior."
              : "Follow every rule below. A rule wins when it conflicts with the style notes above, except the universal rules, the grammar level, and the abbreviation level.",
            ...rules.map((rule) => `- ${rule}`),
          ]
        : []),
      `Grammar level: ${grammarInstruction(grammar)} This grammar level wins over any rule about spelling, typos, or polish.`,
      `Abbreviation level: ${abbrevInstruction(abbrev, allowSwearing)} This abbreviation level wins over any rule about spelling those phrases out.`,
      ...(behavior
        ? [
            "This person's own behavior controls how they write. Follow it on this line. It wins over the run rules when they conflict.",
            behavior,
          ]
        : []),
      "Before you answer, check the universal rules at the top again. Nothing above overrides them: no hyphens or dashes, no AI or marketing voice, just a real person typing.",
    ].join("\n"),
  };

  const usage = { promptTokens: 0, completionTokens: 0, model: GROQ_MODEL };
  const messages: Array<{ role: string; content: string }> = [system, { role: "user", content: task }];
  const grounded = fact
    ? [fact.claim, fact.author, place, input.visitor?.from ?? "", input.visitor?.here ?? "", input.parentBody ?? "", ...thread, ...memories].join(" ")
    : "";
  const recent = [...new Set([...thread, input.parentBody ?? ""].filter(Boolean))];
  let clean = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: opensFromFact ? 0.4 : 0.9,
        max_tokens: 700,
        reasoning_effort: "low",
        include_reasoning: false,
        messages,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      choices?: Array<{ message?: { content?: unknown } }>;
    } | null;
    usage.promptTokens += Number(payload?.usage?.prompt_tokens ?? 0);
    usage.completionTokens += Number(payload?.usage?.completion_tokens ?? 0);
    usage.model = payload?.model || usage.model;

    if (!response.ok) {
      throw new GroqCallError(payload?.error?.message || `Groq returned ${response.status}`, usage);
    }

    clean = fixMechanics(cleanLine(messageText(payload?.choices?.[0]?.message?.content)));
    const hard = hardLimitTells(clean, { minor });
    const tells = [...hard, ...robotTells(clean, !foreign, recent)];
    if (fact && copiesSource(clean, fact.claim)) tells.push("it reads like a pasted headline, react to it in your own words");
    if (swearing.required && !foreign && attempt < MAX_ATTEMPTS - 1 && !hasSwear(clean, true)) {
      tells.push("it has no cuss word, and this line needs one spelled out");
    }
    const extra = fact && !foreign ? unsupportedDetails(clean, grounded) : [];
    if (tells.length === 0 && extra.length === 0) break;
    if (attempt === MAX_ATTEMPTS - 1) {
      throw new GroqCallError(
        hard.length > 0
          ? `Line broke a hard limit after ${MAX_ATTEMPTS} tries: ${hard.join(", ")}`
          : extra.length > 0
          ? `Line added details that are not in the fact: ${extra.join(", ")}`
          : `Line still sounded like AI after ${MAX_ATTEMPTS} tries: ${tells.join(", ")}`,
        usage,
      );
    }
    messages.push(
      { role: "assistant", content: clean },
      {
        role: "user",
        content: [
          ...(extra.length > 0 ? [`That added ${extra.join(", ")}, which the fact does not say. Use only what the fact says.`] : []),
          ...(tells.length > 0 ? [rewriteRequest(tells)] : []),
          ...(extra.length > 0 && tells.length === 0 ? ["Write it again."] : []),
        ].join(" "),
      },
    );
  }

  const text = fixMechanics(roughenLine(clean, grammar));
  if (text.length < 2) throw new GroqCallError("Groq returned an empty line", usage);
  const prior = new Set(
    [input.parentBody ?? "", ...thread].map((line) => line.trim().toLowerCase()).filter(Boolean),
  );
  if (prior.has(text.toLowerCase())) {
    throw new GroqCallError("Groq repeated a line already in the conversation", usage);
  }

  return { text, model: usage.model, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens };
}
