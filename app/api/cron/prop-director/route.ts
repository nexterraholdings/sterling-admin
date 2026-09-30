import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { runCasting } from "@/lib/conversations/casting";
import { loadDirectorSettings, runDirector } from "@/lib/conversations/director";
import { runGroupProposals } from "@/lib/conversations/prop-groups";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length).trim();
  const left = Buffer.from(token);
  const right = Buffer.from(secret);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function failed(error: unknown): { error: string } {
  return { error: error instanceof Error ? error.message : "failed" };
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const startedAt = Date.now();
    const settings = await loadDirectorSettings();
    const director = await runDirector({ maxMs: 12_000 });
    // Casting can make one model call of up to 22 seconds, so it only starts with that much time left.
    const casting = Date.now() - startedAt < 22_000 ? await runCasting({ maxMs: 6_000 }).catch(failed) : null;
    // A new group proposal can take 30 seconds between Gemini and the Groq fallback.
    const proposal = settings.mode !== "off" && Date.now() - startedAt < 20_000 ? await runGroupProposals().catch(failed) : null;
    return NextResponse.json({ director, casting, proposal });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Director run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
