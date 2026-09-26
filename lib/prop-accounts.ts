/** Admin-created "prop" accounts (creator_generateProAccount, the Sterling
 * system group owner, etc.) are always given an @sterlingtest.local email so
 * they can be reliably told apart from real users everywhere in the admin
 * dashboard — most importantly, excluded from analytics so seeded content
 * and fake members never get counted as real growth or engagement. */
export const PROP_ACCOUNT_EMAIL_SUFFIX = "@sterlingtest.local";
export const PROP_ACCOUNT_EMAIL_PATTERN = `%${PROP_ACCOUNT_EMAIL_SUFFIX}`;

/** Owns groups created from the admin dashboard. Not a chatter prop account. */
export const SYSTEM_GROUP_OWNER_EMAIL = "sterling-groups@sterlingtest.local";

export function isPropAccountEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(PROP_ACCOUNT_EMAIL_SUFFIX);
}

const PROP_FIRST_NAMES = [
  "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery",
  "Quinn", "Sydney", "Reese", "Cameron", "Drew", "Skyler", "Rowan", "Emerson",
  "Hayden", "Parker", "Blake", "Dakota", "Noah", "Maya", "Elena", "Marcus",
];

const PROP_LAST_NAMES = [
  "Smith", "Johnson", "Lee", "Brown", "Garcia", "Martinez", "Davis", "Rodriguez",
  "Wilson", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "White", "Harris",
  "Clark", "Lewis", "Young", "Walker", "Nguyen", "Patel", "Kim", "Brooks",
];

const PROP_BIOS = [
  "Here for the conversations and the people behind them.",
  "Sharing what I'm working on and learning from everyone else.",
  "Always up for a good question and a better answer.",
  "Building in public, one small update at a time.",
  "Curious about how people actually get things done.",
  "Showing up, asking questions, and passing along what works.",
  "Interested in practical ideas more than perfect ones.",
  "Happy to trade notes with anyone figuring it out too.",
];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function randomPropName(): string {
  return `${pick(PROP_FIRST_NAMES)} ${pick(PROP_LAST_NAMES)}`;
}

export function randomPropBio(): string {
  return pick(PROP_BIOS);
}

/** PostgREST `.or()` clause: keep null emails, drop prop accounts.
 * The pattern is quoted so dots in the domain aren't parsed as separators. */
export const EXCLUDE_PROP_ACCOUNT_EMAIL_OR = `email.is.null,email.not.ilike."${PROP_ACCOUNT_EMAIL_PATTERN}"`;
