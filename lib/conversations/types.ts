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
  hubTitle: string | null;
  propMemberCount: number;
  enabled: boolean;
  autoContinue: boolean;
  topic: string;
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

export type ConversationRunLine = {
  id: string;
  authorId: string;
  authorName: string;
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
  sent: number;
  waiting: number;
  running: number;
  failed: number;
  total: number;
  nextAt: string | null;
  lines: ConversationRunLine[];
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
};

export type ConversationTickResult = {
  skipped: "off" | "quiet_hours" | "budget" | null;
  planned: number;
  published: number;
  calls: number;
  notes: string[];
};
