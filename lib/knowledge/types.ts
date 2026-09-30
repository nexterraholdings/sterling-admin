export type KnowledgeApproval = "review" | "auto";
export type KnowledgeStatus = "new" | "approved" | "rejected";
export type KnowledgeVerdict = "approve" | "reject";
/** Where a watch pulls from. `x` needs XAI_API_KEY with credits; `events` needs TICKETMASTER_API_KEY. */
export type KnowledgeFeed = "news" | "weather" | "sports" | "events" | "x";
export type KnowledgeSource = "x" | "web" | "news" | "weather" | "sports" | "events";

export const KNOWLEDGE_FEEDS: KnowledgeFeed[] = ["news", "weather", "sports", "events", "x"];
export const DEFAULT_FEEDS: KnowledgeFeed[] = ["news", "weather"];

export type KnowledgeWatch = {
  id: string;
  hubId: string;
  hubTitle: string;
  place: string;
  label: string;
  feeds: KnowledgeFeed[];
  searchTerms: string;
  xHandles: string[];
  teams: string[];
  everyMinutes: number;
  approval: KnowledgeApproval;
  enabled: boolean;
  lastPulledAt: string | null;
  lastError: string | null;
};

export type KnowledgeItem = {
  id: string;
  watchId: string | null;
  hubId: string;
  hubTitle: string;
  source: KnowledgeSource;
  claim: string;
  sourceUrl: string;
  author: string;
  imageUrl: string | null;
  postedAt: string | null;
  fetchedAt: string;
  expiresAt: string;
  status: KnowledgeStatus;
  verdict: KnowledgeVerdict | null;
  reason: string;
  decidedBy: string;
  usedCount: number;
};

export type KnowledgePull = {
  id: string;
  hubTitle: string;
  ok: boolean;
  itemsFound: number;
  itemsKept: number;
  xPostsFetched: number;
  error: string | null;
  createdAt: string;
};

export type KnowledgeHubOption = {
  id: string;
  title: string;
  place: string;
};

export type KnowledgeDashboard = {
  /** False until supabase/sql/knowledge_hub.sql has been run. */
  schemaReady: boolean;
  xaiConfigured: boolean;
  ticketmasterConfigured: boolean;
  /** Epoch ms when the server loaded this snapshot. */
  loadedAt: number;
  hubs: KnowledgeHubOption[];
  watches: KnowledgeWatch[];
  items: KnowledgeItem[];
  pulls: KnowledgePull[];
};

export type KnowledgeWatchInput = {
  hubId: string;
  label: string;
  feeds: KnowledgeFeed[];
  searchTerms: string;
  xHandles: string[];
  teams: string[];
  everyMinutes: number;
  approval: KnowledgeApproval;
  enabled: boolean;
};

/** What an opening post is allowed to talk about. */
export type KnowledgeFact = {
  id: string;
  claim: string;
  author: string;
  sourceUrl: string;
  source?: string;
};

export type KnowledgePullOutcome = {
  watchId: string;
  hubTitle: string;
  ok: boolean;
  found: number;
  kept: number;
  approved: number;
  rejected: number;
  error: string | null;
};
