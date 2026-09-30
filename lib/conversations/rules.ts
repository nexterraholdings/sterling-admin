export const DEFAULT_RUN_RULES = [
  "Don't reply to the same post twice.",
  "Only reply in the context of that conversation.",
];

export const DEFAULT_GRAMMAR = 30;

export function parseGrammar(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_GRAMMAR;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

export function grammarLabel(level: number): string {
  const value = parseGrammar(level);
  if (value <= 15) return "Messy";
  if (value <= 35) return "Casual";
  if (value <= 55) return "Readable";
  if (value <= 75) return "Mostly correct";
  return "Correct";
}

export function grammarHint(level: number): string {
  const value = parseGrammar(level);
  if (value <= 15) return "Rushed texts. Typos, skipped caps, dropped punctuation.";
  if (value <= 35) return "Ordinary texting. A slip here and there.";
  if (value <= 55) return "Easy to read, with a light slip now and then.";
  if (value <= 75) return "Mostly clean spelling and sentences.";
  return "Correct grammar, spelling, and punctuation.";
}

export const DEFAULT_ABBREV = 30;

export function parseAbbrev(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

export function abbrevLabel(level: number): string {
  const value = parseAbbrev(level);
  if (value <= 8) return "None";
  if (value <= 25) return "A little";
  if (value <= 50) return "Sometimes";
  if (value <= 75) return "Often";
  return "Heavy";
}

export function abbrevHint(level: number): string {
  const value = parseAbbrev(level);
  if (value <= 8) return "Words are spelled out.";
  if (value <= 25) return "A light one now and then, like lol or idk.";
  if (value <= 50) return "About half of lines use one, like fr, ngl, or tbh.";
  if (value <= 75) return "Most lines use one or two, including wtf and fr.";
  return "Lines read like texts: wtf, fr, ngl, idk, lol.";
}

export function abbrevInstruction(level: number, allowSwearing: boolean): string {
  const value = parseAbbrev(level);
  const pool = allowSwearing
    ? "lol, lmao, idk, ngl, tbh, fr, imo, rn, omg, bc, prob, wtf"
    : "lol, lmao, idk, ngl, tbh, fr, imo, rn, omg, bc, prob";
  if (value <= 8) return "Do not use abbreviations. Spell words out.";
  if (value <= 25) {
    if (Math.random() >= 0.22) return "Do not use abbreviations in this line. Spell words out.";
    return "Use one light abbreviation in this line, such as lol, idk, or rn. Spell everything else out.";
  }
  if (value <= 50) {
    if (Math.random() >= 0.5) return "Do not use abbreviations in this line.";
    return `Use one texting abbreviation in this line. Choose from ${pool}.`;
  }
  if (value <= 75) {
    if (Math.random() >= 0.8) return "Use one texting abbreviation in this line.";
    return `Use one or two texting abbreviations in this line. Choose from ${pool}.`;
  }
  return `Write like a text. Use two or three abbreviations from this list: ${pool}. Do not spell those phrases out.`;
}

export function grammarInstruction(level: number): string {
  const value = parseGrammar(level);
  if (value >= 85) {
    return "Use correct grammar, spelling, capitalization, and punctuation. Write complete sentences.";
  }
  if (value >= 60) {
    return "Use mostly correct grammar and spelling. Sound like a person texting, not an essay. A small slip is fine.";
  }
  if (value >= 35) {
    return "Write readable texts. Do not proofread. A missed apostrophe or a dropped period is fine.";
  }
  return "Do not proofread. Leave a small typo. Drop the period. Dont capitalize the sentence. Miss an apostrophe (dont, im, cant).";
}

const MAX_RULES = 12;
const MAX_RULE_LENGTH = 180;

export const NO_HYPHEN_RULE = "Never use a hyphen or dash.";

export function forbidsHyphens(rules: string[]): boolean {
  return rules.some((rule) => isNoHyphenRule(rule));
}

export function editableRunRules(rules: string[]): string[] {
  return rules.filter((rule) => !isNoHyphenRule(rule));
}

export function withNoHyphenRule(rules: string[], enabled: boolean): string[] {
  const rest = editableRunRules(rules);
  return enabled ? [NO_HYPHEN_RULE, ...rest] : rest;
}

function isNoHyphenRule(rule: string): boolean {
  const text = rule.trim().toLowerCase().replace(/[.]+$/g, "");
  return text === "never use a hyphen or dash" || text === "never allow hyphens" || text === "never use hyphens";
}

export function stripHyphens(text: string): string {
  return text.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function parseRunRules(value: string | null | undefined): string[] {
  if (value == null) return [...DEFAULT_RUN_RULES];
  const lines = value
    .split("\n")
    .map((rule) => rule.trim())
    .filter(Boolean);
  const rest = editableRunRules(lines)
    .slice(0, MAX_RULES)
    .map((rule) => rule.slice(0, MAX_RULE_LENGTH));
  return forbidsHyphens(lines) ? [NO_HYPHEN_RULE, ...rest] : rest;
}

export const SWEAR_RATES = [
  { id: "rare", label: "Rarely", hint: "About 1 line in 8" },
  { id: "sometimes", label: "Sometimes", hint: "About 1 line in 4" },
  { id: "often", label: "Often", hint: "About every other line" },
] as const;

export type SwearRate = (typeof SWEAR_RATES)[number]["id"];

export function parseSwearRate(value: string | null | undefined): SwearRate {
  if (value === "rare" || value === "often" || value === "sometimes") return value;
  return "sometimes";
}

export const SWEAR_STRENGTHS = [
  { id: "mild", label: "Mild", hint: "damn, hell, shit, crap, ass" },
  { id: "strong", label: "Strong", hint: "Adds fuck, bitch, asshole, dick, and the like" },
  { id: "unfiltered", label: "Unfiltered", hint: "As crude and vulgar as the person would be" },
] as const;

export type SwearStrength = (typeof SWEAR_STRENGTHS)[number]["id"];

export function parseSwearStrength(value: string | null | undefined): SwearStrength {
  return value === "strong" || value === "unfiltered" ? value : "mild";
}

export const ATTITUDES = [
  { id: "normal", label: "Normal", hint: "Ordinary neighbors" },
  { id: "blunt", label: "Blunt", hint: "Strong opinions, trash talk, rude pushback" },
  { id: "savage", label: "Savage", hint: "Roasts, sarcasm, dark humor" },
] as const;

export type Attitude = (typeof ATTITUDES)[number]["id"];

export function parseAttitude(value: string | null | undefined): Attitude {
  return value === "blunt" || value === "savage" ? value : "normal";
}

/** Lines no strength or attitude unlocks. Code enforces them too, in voice-guard. */
export const HARD_LIMITS =
  "Hard limits that nothing overrides: no slurs or hate aimed at any group of people, no threats, no telling anyone to hurt themselves, and nothing sexual about or from a minor.";

/** `required` means the line must come back with a cuss word in it. */
export function swearPlan(enabled: boolean, rate: SwearRate, strength: SwearStrength = "mild"): { instruction: string; required: boolean } {
  if (!enabled) return { instruction: "Do not swear.", required: false };
  const odds = rate === "rare" ? 0.12 : rate === "often" ? 0.5 : 0.25;
  if (Math.random() >= odds) return { instruction: "Do not swear in this line.", required: false };
  if (strength === "strong") {
    return {
      instruction:
        "Put at least one real cuss word in this line, spelled out, like fuck, fucking, shit, bullshit, bitch, asshole, or dick. Aim it at the situation or say it jokingly to someone. wtf alone does not count.",
      required: true,
    };
  }
  if (strength === "unfiltered") {
    return {
      instruction:
        "Swear hard in this line, spelled out and uncensored, like fuck, fucking, shit, bitch, asshole, or dickhead, as crude and vulgar as this person would be. wtf alone does not count.",
      required: true,
    };
  }
  return {
    instruction: "Include one mild cuss word in this line, the way a person texts. Use damn, hell, shit, crap, or ass.",
    required: false,
  };
}

export function attitudeInstruction(attitude: Attitude): string | null {
  if (attitude === "blunt") {
    return "Attitude: blunt. Say what they really think. Trash talk places, teams, traffic, and bad ideas. Push back rudely when they disagree. Do not be nice for the sake of it.";
  }
  if (attitude === "savage") {
    return "Attitude: savage. Roast people and things, be sarcastic, and dark humor is fine. Clown on a bad take. Never soften a joke.";
  }
  return null;
}

export function serializeRunRules(rules: string[]): string {
  const rest = editableRunRules(rules)
    .map((rule) => rule.trim().slice(0, MAX_RULE_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_RULES);
  return (forbidsHyphens(rules) ? [NO_HYPHEN_RULE, ...rest] : rest).join("\n");
}
