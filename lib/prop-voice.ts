import { parseAbbrev, parseGrammar, parseSwearRate, type SwearRate } from "@/lib/conversations/rules";

export const TEMPERAMENTS = [
  { id: "easygoing", label: "Easygoing" },
  { id: "warm", label: "Warm" },
  { id: "blunt", label: "Blunt" },
  { id: "dry", label: "Dry" },
  { id: "anxious", label: "Anxious" },
  { id: "upbeat", label: "Upbeat" },
] as const;

export const TALK_STYLES = [
  { id: "brief", label: "Few words" },
  { id: "ordinary", label: "Ordinary" },
  { id: "chatty", label: "Chatty" },
] as const;

export const LIFE_STAGES = [
  { id: "student", label: "Student" },
  { id: "working", label: "Working" },
  { id: "parent", label: "Parent" },
  { id: "retired", label: "Retired" },
  { id: "new", label: "New here" },
] as const;

export type Temperament = "" | (typeof TEMPERAMENTS)[number]["id"];
export type TalkStyle = "" | (typeof TALK_STYLES)[number]["id"];
export type LifeStage = "" | (typeof LIFE_STAGES)[number]["id"];

/** Facts about one prop account. Empty values are unused. */
export type PropTraits = {
  age: number | null;
  interests: string;
  temperament: Temperament;
  talk: TalkStyle;
  life: LifeStage;
};

/** How one prop account speaks. Null cuss words, grammar, and abbreviations follow the conversation. */
export type PropVoice = {
  personality: string;
  swear: boolean | null;
  swearRate: SwearRate;
  grammar: number | null;
  abbrev: number | null;
  behavior: string;
  traits: PropTraits;
};

export const EMPTY_TRAITS: PropTraits = {
  age: null,
  interests: "",
  temperament: "",
  talk: "",
  life: "",
};

export const EMPTY_PROP_VOICE: PropVoice = {
  personality: "",
  swear: null,
  swearRate: "sometimes",
  grammar: null,
  abbrev: null,
  behavior: "",
  traits: { ...EMPTY_TRAITS },
};

export type CussMode = "run" | "off" | SwearRate;

const PERSONALITY_MAX = 500;
const BEHAVIOR_MAX = 2000;
const INTERESTS_MAX = 280;

const TEMPERAMENT_IDS = new Set<string>(TEMPERAMENTS.map((item) => item.id));
const TALK_IDS = new Set<string>(TALK_STYLES.map((item) => item.id));
const LIFE_IDS = new Set<string>(LIFE_STAGES.map((item) => item.id));

type VoiceRow = {
  personality?: string | null;
  swear?: boolean | null;
  swear_rate?: string | null;
  grammar?: number | string | null;
  abbrev?: number | string | null;
  behavior?: string | null;
  age?: number | string | null;
  interests?: string | null;
  temperament?: string | null;
  talk?: string | null;
  life?: string | null;
};

function parseAge(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(99, Math.max(13, Math.round(parsed)));
}

function parseTemperament(value: string | null | undefined): Temperament {
  return value && TEMPERAMENT_IDS.has(value) ? (value as Temperament) : "";
}

function parseTalk(value: string | null | undefined): TalkStyle {
  return value && TALK_IDS.has(value) ? (value as TalkStyle) : "";
}

function parseLife(value: string | null | undefined): LifeStage {
  return value && LIFE_IDS.has(value) ? (value as LifeStage) : "";
}

function parseTraits(row: VoiceRow): PropTraits {
  return {
    age: parseAge(row.age),
    interests: String(row.interests ?? "").trim().slice(0, INTERESTS_MAX),
    temperament: parseTemperament(row.temperament),
    talk: parseTalk(row.talk),
    life: parseLife(row.life),
  };
}

export function parsePropVoice(row: VoiceRow | null | undefined): PropVoice {
  if (!row) return { ...EMPTY_PROP_VOICE, traits: { ...EMPTY_TRAITS } };
  const hasSwear = row.swear === true || row.swear === false;
  return {
    personality: String(row.personality ?? "").trim().slice(0, PERSONALITY_MAX),
    swear: hasSwear ? row.swear === true : null,
    swearRate: parseSwearRate(row.swear_rate),
    grammar: row.grammar == null || row.grammar === "" ? null : parseGrammar(row.grammar),
    abbrev: row.abbrev == null || row.abbrev === "" ? null : parseAbbrev(row.abbrev),
    behavior: String(row.behavior ?? "").trim().slice(0, BEHAVIOR_MAX),
    traits: parseTraits(row),
  };
}

export function sanitizePropVoice(input: PropVoice): PropVoice {
  const traits = input.traits ?? EMPTY_TRAITS;
  return parsePropVoice({
    personality: input.personality,
    swear: input.swear,
    swear_rate: input.swearRate,
    grammar: input.grammar,
    abbrev: input.abbrev,
    behavior: input.behavior,
    age: traits.age,
    interests: traits.interests,
    temperament: traits.temperament,
    talk: traits.talk,
    life: traits.life,
  });
}

export function cussMode(voice: PropVoice): CussMode {
  if (voice.swear == null) return "run";
  if (!voice.swear) return "off";
  return voice.swearRate;
}

export function voiceWithCuss(voice: PropVoice, mode: CussMode): PropVoice {
  if (mode === "run") return { ...voice, swear: null };
  if (mode === "off") return { ...voice, swear: false };
  return { ...voice, swear: true, swearRate: mode };
}

export function samePropVoice(a: PropVoice, b: PropVoice): boolean {
  const left = sanitizePropVoice(a);
  const right = sanitizePropVoice(b);
  return (
    left.personality === right.personality &&
    left.swear === right.swear &&
    (left.swear !== true || left.swearRate === right.swearRate) &&
    left.grammar === right.grammar &&
    left.abbrev === right.abbrev &&
    left.behavior === right.behavior &&
    left.traits.age === right.traits.age &&
    left.traits.interests === right.traits.interests &&
    left.traits.temperament === right.traits.temperament &&
    left.traits.talk === right.traits.talk &&
    left.traits.life === right.traits.life
  );
}

export function voiceIsSet(voice: PropVoice): boolean {
  const clean = sanitizePropVoice(voice);
  const traits = clean.traits;
  return Boolean(
    clean.personality ||
      clean.behavior ||
      clean.swear != null ||
      clean.grammar != null ||
      clean.abbrev != null ||
      traits.age != null ||
      traits.interests ||
      traits.temperament ||
      traits.talk ||
      traits.life,
  );
}

export function ageHint(age: number | null): string {
  if (age == null) return "Sets interests and how they text. 16, 18, and 60 do not sound alike.";
  if (age <= 15) return "School, sports, games. Short teen texts.";
  if (age <= 17) return "School, sports, driving. Older-teen texts, not a parent's.";
  if (age <= 24) return "Classes, a first job, going out. Casual, with more range than high school.";
  if (age <= 34) return "Work, rent, weekends. Everyday texts, little slang.";
  if (age <= 49) return "House, schedule, neighbors. Clearer sentences.";
  if (age <= 64) return "The neighborhood, family, routines. Plain sentences.";
  return "Neighbors, routines, the block. Plain language, no new slang.";
}

export function accountPace(voice: PropVoice | null | undefined): string {
  const talk = voice?.traits?.talk ?? "";
  if (talk === "brief") return "Starts rarely";
  if (talk === "chatty") return "Starts often";
  return "Starts sometimes";
}

export function startWeight(voice: PropVoice | null | undefined): number {
  const talk = voice?.traits?.talk ?? "";
  if (talk === "brief") return 1;
  if (talk === "chatty") return 5;
  return 3;
}

export function wantsToJumpIn(voice: PropVoice | null | undefined): boolean {
  const traits = voice?.traits ?? EMPTY_TRAITS;
  let odds = 0.45;
  if (traits.talk === "chatty") odds += 0.3;
  if (traits.talk === "brief") odds -= 0.25;
  if (traits.temperament === "warm" || traits.temperament === "upbeat") odds += 0.15;
  if (traits.temperament === "anxious") odds -= 0.2;
  return Math.random() < Math.min(0.92, Math.max(0.08, odds));
}

export function broughtUpSubject(voice: PropVoice | null | undefined, groupTopic: string): string {
  const interests = voice?.traits?.interests?.trim() ?? "";
  const topic = groupTopic.trim();
  const own = interests || (voice?.traits?.age != null ? ageHint(voice.traits.age) : "");
  if (own && topic) return `${own}. Stay near ${topic}`.slice(0, 180);
  return (own || topic || "everyday local life").slice(0, 180);
}

export function characterNotes(voice: PropVoice): string {
  const traits = sanitizePropVoice(voice).traits;
  const lines: string[] = [];
  if (traits.age != null) lines.push(ageInstruction(traits.age));
  if (traits.life) lines.push(lifeInstruction(traits.life, traits.age));
  if (traits.temperament) lines.push(temperamentInstruction(traits.temperament));
  if (traits.talk) lines.push(talkInstruction(traits.talk));
  if (traits.interests) lines.push(`Interests: ${traits.interests}. Bring one in only when it fits this conversation.`);
  return lines.join(" ");
}

function ageInstruction(age: number): string {
  const guard = age < 18 ? " Ordinary and local only. No flirting and no sexual content." : "";
  if (age <= 15) {
    return `Age ${age}. Interests stay with school, sports, games, friends, and what is happening on the block. Write like a young teenager texting: short, a little slang, unfinished sentences. Do not mention mortgages, careers, or parenting.${guard}`;
  }
  if (age <= 17) {
    return `Age ${age}. Interests stay with school, sports, driving, friends, a part-time shift, and local plans. Write like an older teen: casual, some slang, still short. Do not sound like a parent or a coworker.${guard}`;
  }
  if (age <= 24) {
    return `Age ${age}. Interests lean toward classes or a first job, roommates, going out, and money being tight. Casual texting with some slang and more range than a high schooler. Do not sound middle-aged.`;
  }
  if (age <= 34) {
    return `Age ${age}. Interests lean toward work, rent or a starter home, weekends, and local plans. Everyday texting. Light slang is fine. Skip teen slang.`;
  }
  if (age <= 49) {
    return `Age ${age}. Interests lean toward the house, kids or neighbors, schedules, and practical local problems. Clearer sentences. Little slang. Do not write like a teenager.`;
  }
  if (age <= 64) {
    return `Age ${age}. Interests lean toward the neighborhood, routines, health, family, and local news. Plain, finished sentences. Almost no new slang.`;
  }
  return `Age ${age}. Interests lean toward neighbors, routines, the block, family, and what has changed nearby. Plain language and one clear thought. No teen slang.`;
}

function lifeInstruction(life: LifeStage, age: number | null): string {
  if (age != null && age < 18 && (life === "parent" || life === "retired" || life === "working")) {
    return "Ignore a life stage that does not fit this age.";
  }
  if (life === "student") return "Life: student. Frame a detail through school or classes when it fits.";
  if (life === "working") return "Life: working. Frame a detail through the workday when it fits.";
  if (life === "parent") return "Life: parent. Frame a detail through kids or the household when it fits. Still write like a text.";
  if (life === "retired") return "Life: retired. Frame a detail through the day at home and the neighborhood when it fits.";
  return "Life: new to the area. They ask where things are and do not pretend to know the block.";
}

function temperamentInstruction(temperament: Temperament): string {
  if (temperament === "easygoing") return "Temperament: easygoing. Unbothered, and willing to let a small thing go.";
  if (temperament === "warm") return "Temperament: warm. Friendly, and likely to ask how someone is.";
  if (temperament === "blunt") return "Temperament: blunt. Direct and short, without softening.";
  if (temperament === "dry") return "Temperament: dry. Understated, with a small joke instead of excitement.";
  if (temperament === "anxious") return "Temperament: anxious. Notices what could go wrong, and stays kind about it.";
  return "Temperament: upbeat. A little energy, still like a text, not a cheerleader.";
}

function talkInstruction(talk: TalkStyle): string {
  if (talk === "brief") return "Length: one short sentence.";
  if (talk === "chatty") return "Length: two sentences, with one specific detail.";
  return "Length: one or two ordinary sentences.";
}

const TEEN_TEXT = /\b(high ?school|teen(?:ager)?|hoco|homecoming|freshman|sophomore|middle school|(?:6|7|8|9|10|11|12)th grade|my (?:mom|parents) (?:won'?t|wont|said))\b/i;

/** Under 18, or no age set and the persona reads as a teenager. */
export function isMinorVoice(voice: PropVoice | null | undefined): boolean {
  if (!voice) return false;
  if (voice.traits.age != null) return voice.traits.age < 18;
  return TEEN_TEXT.test(`${voice.personality} ${voice.behavior} ${voice.traits.interests}`);
}

export function lineVoice(
  account: PropVoice | null | undefined,
  group: { swear: boolean; swearRate: SwearRate; grammar: number; abbrev: number },
): { personality: string; behavior: string; character: string; swear: boolean; swearRate: SwearRate; grammar: number; abbrev: number; minor: boolean } {
  const voice = account ?? EMPTY_PROP_VOICE;
  return {
    minor: isMinorVoice(account),
    personality: voice.personality,
    behavior: voice.behavior,
    character: characterNotes(voice),
    swear: voice.swear == null ? group.swear : voice.swear,
    swearRate: voice.swear == null ? group.swearRate : voice.swearRate,
    grammar: voice.grammar == null ? group.grammar : voice.grammar,
    abbrev: voice.abbrev == null ? group.abbrev : voice.abbrev,
  };
}
