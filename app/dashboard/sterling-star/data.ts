// Shared with the client page. A "use server" module may only export async
// functions, so this array must live outside actions.ts or Next.js drops it
// from the client bundle ("APPLICATION_STATUSES is not iterable").
export const APPLICATION_STATUSES = ["new", "reviewing", "accepted", "declined"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type StarApplication = {
  id: string;
  full_name: string;
  email: string;
  socials: string;
  age: number;
  city: string;
  state: string;
  country: string;
  status: ApplicationStatus;
  notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};
