import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { runKnowledgePull } from "@/lib/knowledge/pull";

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

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runKnowledgePull(6);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge pull failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
