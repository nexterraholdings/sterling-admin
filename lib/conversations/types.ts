import type { PropTraits } from "@/lib/prop-voice";

export type ConversationSettings = {
  enabled: boolean;
  dailyCallBudget: number;
  activeStartHour: number;
  activeEndHour: number;
};

export type ConversationUsage = {
  calls: number;
  promptTokens: number;
  completionTokens: number;
};

export type ConversationTopic = {
  groupId: string;
  title: string;
  topic: string;
};

export type ConversationGroupMember = {
  userId: string;
  name: string;
  username: string | null;
};

export type ConversationGroup = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  hubId: string;
  hubTitle: string | null;
  propMemberCount: number;
  enabled: boolean;
  autoContinue: boolean;
  topic: string;
  rules: string[];
  swear: boolean;
  swearRate: "rare" | "sometimes" | "often";
  grammar: number;
  abbrev: number;
  weekDays: number;
  weekStartHour: number;
  weekEndHour: number;
  weekEveryMinutes: number;
  callsPerDay: number;
  postsPerDay: number;
  repliesPerPost: number;
  members: ConversationGroupMember[];
};

export type ConversationQueueItem = {
  id: string;
  groupTitle: string;
  authorName: string;
  kind: "start_post" | "reply";
  runAt: string;
};

export type ConversationFolder = {
  id: string;
  name: string;
  parentId: string | null;
};

export type ConversationPersona = {
  userId: string;
  name: string;
  username: string | null;
  personality: string;
  /** Null follows the conversation run. */
  swear: boolean | null;
  swearRate: "rare" | "sometimes" | "often";
  /** Null follows the conversation run. */
  grammar: number | null;
  /** Null follows the conversation run. */
  abbrev: number | null;
  behavior: string;
  traits: PropTraits;
  folderId: string | null;
  avatarUrl: string | null;
  bio: string;
};

export type ConversationLogEntry = {
  id: string;
  groupId: string;
  commentId: string | null;
  groupTitle: string;
  authorName: string;
  kind: "start_post" | "reply";
  status: "done" | "failed";
  body: string;
  error: string | null;
  finishedAt: string | null;
};

export type RunAccountMoment = {
  at: string;
  decision: "jumped_in" | "stayed_out";
  subject: string;
  pace: string;
};

export type RunAccount = {
  userId: string;
  name: string;
  pace: string;
  lastSpokeAt: string | null;
  moment: RunAccountMoment | null;
};

export type ConversationRunLine = {
  id: string;
  authorId: string;
  authorName: string;
  groupTitle: string;
  kind: "start_post" | "reply";
  status: "pending" | "running" | "done" | "failed" | "skipped";
  runAt: string;
  body: string;
  error: string | null;
};

export type ConversationActiveRun = {
  groupId: string;
  groupTitle: string;
  topic: string;
  accountIds: string[];
  accountNames: string[];
  posts: number;
  repliesPerPost: number;
  repliesQueued: number;
  pace: string;
  autoContinue: boolean;
  postsPerDay: number;
  rules: string[];
  swear: boolean;
  swearRate: "rare" | "sometimes" | "often";
  grammar: number;
  abbrev: number;
  weekDays: number;
  weekStartHour: number;
  weekEndHour: number;
  weekEveryMinutes: number;
  callsPerDay: number;
  sent: number;
  waiting: number;
  running: number;
  failed: number;
  total: number;
  nextAt: string | null;
  lines: ConversationRunLine[];
  interacting: boolean;
  accounts: RunAccount[];
};

export type RegionRunGroup = {
  groupId: string;
  title: string;
  included: boolean;
  interacting: boolean;
  propMemberCount: number;
};

export type RegionRunAccount = RunAccount & {
  included: boolean;
  groupTitles: string[];
  /** Where this prop lives. Null when none of its groups has a hub. */
  home: {
    hubId: string;
    place: string;
    languages: string[];
    /** "set" by an admin, or taken from the hub where most of its groups are. */
    source: "set" | "groups";
    languagesSet: boolean;
  } | null;
  /** Home place when this region is more than 60 miles from home; the prop writes as a visitor. */
  visitorFrom: string | null;
};

export type RegionRun = {
  hubId: string;
  title: string;
  objective: string;
  /** Week hours and daily caps count in this zone. */
  timeZone: string;
  language: string;
  place: string;
  /** "region" when set on this run, otherwise taken from the nearest listed city. */
  localeSource: "region" | "nearest" | "default";
  paused: boolean;
  interacting: boolean;
  groups: RegionRunGroup[];
  accounts: RegionRunAccount[];
  snapshot: ConversationActiveRun;
};

export type ConversationDashboard = {
  settings: ConversationSettings;
  usage: ConversationUsage;
  topics: ConversationTopic[];
  groups: ConversationGroup[];
  folders: ConversationFolder[];
  personas: ConversationPersona[];
  queue: ConversationQueueItem[];
  log: ConversationLogEntry[];
  activeRuns: ConversationActiveRun[];
  regionRuns: RegionRun[];
};

export const TOPIC_DIRECTIONS = [
  { id: "informational", label: "Informational", hint: "Specific and useful.", line: "Tone: informational. Share something specific and useful." },
  { id: "personal", label: "Personal", hint: "A small detail from their own day.", line: "Tone: personal. Use a small detail from the speaker's own day." },
  { id: "sentimental", label: "Sentimental", hint: "Warm and a little nostalgic.", line: "Tone: sentimental. Warm and a little nostalgic, still like a text." },
  { id: "aggressive", label: "Aggressive", hint: "Blunt and ready to disagree.", line: "Tone: aggressive. Blunt and willing to disagree. No slurs or threats." },
  { id: "casual", label: "Casual", hint: "Ordinary texting.", line: "Tone: casual. Ordinary and unperformed." },
  { id: "curious", label: "Curious", hint: "Lead with a question.", line: "Tone: curious. Lead with a real question." },
  { id: "funny", label: "Funny", hint: "A light joke.", line: "Tone: funny. A light joke, not a mean one." },
  { id: "skeptical", label: "Skeptical", hint: "Doubt it and ask what the catch is.", line: "Tone: skeptical. Doubt it and ask what the catch is." },
] as const;

export type ManualRunRequest = {
  groupId: string;
  topic: string;
  useGroupSubject: boolean;
  direction: string;
  note: string;
  accountIds: string[];
  posts: number;
  repliesPerPost: number;
  joinExisting: boolean;
  maxCalls: number;
  durationMinutes: number;
  startNow: boolean;
  natural: boolean;
  postEveryMin: number;
  postEveryMax: number;
  keepGoing: boolean;
  postsPerDay: number;
  swear: boolean;
  swearRate: "rare" | "sometimes" | "often";
  grammar: number;
  abbrev: number;
  week: boolean;
  weekDays: number;
  weekStartHour: number;
  weekEndHour: number;
  weekEveryMinutes: number;
  callsPerDay: number;
};

export type ConversationTickResult = {
  skipped: "off" | "quiet_hours" | "budget" | null;
  planned: number;
  published: number;
  calls: number;
  notes: string[];
};
