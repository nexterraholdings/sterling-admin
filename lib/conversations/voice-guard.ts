import { stripHyphens } from "@/lib/conversations/rules";

/** Prompt lines every prop line gets, above run rules, personality, and behavior. */
export function universalVoiceRules(english: boolean): string[] {
  return [
    "Universal rules. These win over every other rule, personality, and behavior below:",
    "- Sound like a real person commenting on Reddit or replying on X. Casual, specific, a little opinionated, written fast.",
    "- Never use a hyphen or a dash of any kind, including in compound words. Use a space or a new sentence.",
    "- No semicolons, no lists, no hashtags, at most one emoji, at most one exclamation mark.",
    "- No assistant or marketing voice. Do not greet the group, sign off, summarize, wrap up, or explain yourself.",
    "- Do not sound balanced or polite on purpose. Real people pick a side, joke, complain, or ask one blunt question.",
    "- Do not repeat the other person's words back to them, and do not agree with a cheer like 'Absolutely!' or 'Great point'.",
    "- Do not open with a greeting like hey or hi. Most real messages have no filler like lol, rn, or tbh. Use one only if this person would, and never the one the thread already keeps using.",
    ...(english
      ? [
          "- Never use these words or phrases: delve, vibrant, bustling, tapestry, nestled, hidden gem, must visit, game changer, elevate, seamless, curated, sense of community, mark your calendars, stay tuned, don't miss, I'm thrilled, can't wait to see, whether you're, perfect for, something for everyone, it's not just, more than just, it's worth noting, in conclusion, all in all, overall.",
          "- The register looks like these (never reuse their words, and the abbreviation level still decides shortened words): 'wait is the light on 535 finally fixed or am i dreaming' / 'the new taco spot is fine but kinda overpriced' / 'anyone know if the sunday market is still a thing' / 'mine went out too, maybe 2 minutes'.",
        ]
      : []),
  ];
}

const BANNED_PHRASES = [
  "delve",
  "vibrant",
  "bustling",
  "tapestry",
  "testament to",
  "nestled",
  "hidden gem",
  "local gem",
  "must visit",
  "must see",
  "must try",
  "game changer",
  "elevate",
  "embark",
  "seamless",
  "curated",
  "sense of community",
  "community spirit",
  "mark your calendars",
  "stay tuned",
  "don't miss",
  "dont miss",
  "exciting news",
  "thrilled to",
  "i'm thrilled",
  "im thrilled",
  "can't wait to see",
  "cant wait to see",
  "whether you're",
  "whether youre",
  "perfect for",
  "a great way to",
  "something for everyone",
  "it's not just",
  "its not just",
  "not only",
  "more than just",
  "it's worth noting",
  "its worth noting",
  "it's important to",
  "its important to",
  "in conclusion",
  "all in all",
  "in summary",
  "at the end of the day",
  "furthermore",
  "moreover",
  "additionally",
  "friendly reminder",
  "just wanted to say",
  "just wanted to share",
  "just wanted to let",
  "what are your thoughts",
  "what do you all think",
  "i'd love to hear",
  "id love to hear",
  "let us know",
  "share your",
  "as a local",
  "as a resident",
  "fellow neighbors",
  "hey everyone",
  "hi everyone",
  "hello everyone",
  "hey neighbors",
  "hi neighbors",
  "hello neighbors",
  "hey all",
  "hi all",
  "great question",
  "great point",
];

const BANNED_PATTERN = new RegExp(
  `(?<![\\p{L}'’])(${BANNED_PHRASES.map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/'/g, "['’]")).join("|")})(?![\\p{L}])`,
  "iu",
);
const CHEER_OPENER = /^(absolutely|totally|definitely|great|love this|so true|agreed|yes|exactly|oh wow|wow)\s*!/i;
const GREETING_OPENER = /^(hey|hi|hello|howdy|yo)\b(?!\s*(?:is|are|was|did|does)\b)/i;
const OVERALL_OPENER = /^(overall|ultimately|honestly speaking|in short),/i;
const EMOJI = /\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/gu;

/** Fixes that never change meaning: dashes, semicolons, list colons, hashtags, emoji stacks, extra exclamation marks. */
export function fixMechanics(raw: string): string {
  let text = raw
    .replace(/(?<![\d\u2010-\u2015\u2212-])(\d{1,3})\s*[\u2013\u2014-]\s*(\d{1,3})(?![\d\u2010-\u2015\u2212-])/g, "$1 to $2")
    .replace(/(^|[\s(])[\u2212-](?=\d)/g, "$1minus ")
    .replace(/\s+[\u2010-\u2015\u2212-]+\s+/g, ", ");
  text = stripHyphens(text);
  text = text.replace(/\s*;\s*/g, ", ");
  text = text.replace(/(\p{L})\s*:\s+(?=\S)/gu, "$1, ");
  text = text.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "");
  text = text.replace(/(^|\s)#([\p{L}\p{N}_]+)/gu, "$1$2");
  let emojiSeen = 0;
  text = text.replace(EMOJI, (match) => (++emojiSeen === 1 ? match : ""));
  const bangs = (text.match(/!+/g) ?? []).length;
  let seen = 0;
  text = text.replace(/!+/g, () => (++seen === bangs ? "!" : "."));
  text = text.replace(/(\d)\s+(%|°)/g, "$1$2").replace(/°\s+([FC])\b/g, "°$1");
  return text.replace(/\s+([,.!?])/g, "$1").replace(/,{2,}/g, ",").replace(/\s+/g, " ").trim();
}

const FILLERS = ["lol", "lmao", "rn", "tbh", "ngl", "fr", "lowkey", "bro", "damn", "fam"];

/** Things only a rewrite can fix. Empty means the line passes. `recent` is the conversation so far, newest last. */
export function robotTells(text: string, english: boolean, recent: string[] = []): string[] {
  const found: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/).filter((part) => part.trim().length > 0);
  if (sentences.length > 3) found.push("more than three sentences");
  if (text.length > 260) found.push("too long");
  if (/(.{16,})\1/u.test(text) || /(.{24,}).*\1/u.test(text)) found.push("it repeats itself");
  if (!english) return found;
  const phrase = text.match(BANNED_PATTERN)?.[1];
  if (phrase) found.push(`"${phrase}"`);
  if (CHEER_OPENER.test(text)) found.push("a cheering opener");
  if (OVERALL_OPENER.test(text)) found.push("a summary opener");
  if (GREETING_OPENER.test(text)) found.push("a greeting opener");
  const lastFive = recent.filter(Boolean).slice(-5);
  for (const word of FILLERS) {
    const pattern = new RegExp(`(?<![\\p{L}])${word}(?![\\p{L}])`, "iu");
    if (pattern.test(text) && lastFive.filter((line) => pattern.test(line)).length >= 2) {
      found.push(`"${word}" again, the thread already overuses it`);
    }
  }
  return found;
}

/** True when nearly every word of the line comes straight from the source, like a pasted headline. */
export function copiesSource(line: string, source: string): boolean {
  const words = (value: string) => value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  const lineWords = words(line);
  if (lineWords.length < 4) return false;
  const sourceWords = new Set(words(source));
  return lineWords.filter((word) => sourceWords.has(word)).length / lineWords.length >= 0.8;
}

export function rewriteRequest(tells: string[]): string {
  return `That sounds like AI (${tells.join(", ")}). Write it again the way a real person would type it on Reddit or X, following the universal rules.`;
}
