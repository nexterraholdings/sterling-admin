import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import {
  fetchOverride,
  saveOverride,
  clearOverride,
  type NewsCandidate,
} from "@/app/dashboard/news/actions";
import { getTodayUtcDate } from "@/app/dashboard/news/date";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state");
  const date = searchParams.get("date");

  if (!state) {
    return NextResponse.json({ error: "state is required" }, { status: 400 });
  }

  await requireAdmin(OPERATOR_ROLES);

  try {
    const override = await fetchOverride({
      state,
      dateUtc: date || getTodayUtcDate(),
    });
    return NextResponse.json({ override });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch override" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  await requireAdmin(OPERATOR_ROLES);

  const body = await req.json();
  const { date_utc, state, reason, ...candidateFields } = body ?? {};

  if (!date_utc || !state || !candidateFields.title || !candidateFields.article_url) {
    return NextResponse.json(
      { error: "date_utc, state, title, and article_url are required" },
      { status: 400 }
    );
  }

  const candidate: NewsCandidate = {
    article_id: candidateFields.article_id ?? null,
    article_url: candidateFields.article_url,
    title: candidateFields.title,
    description: candidateFields.description ?? null,
    content: candidateFields.content ?? null,
    source: candidateFields.source ?? null,
    image_url: candidateFields.image_url ?? null,
    published_at: candidateFields.published_at ?? null,
  };

  try {
    const override = await saveOverride({ dateUtc: date_utc, state, candidate, reason });
    return NextResponse.json({ override });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save override" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  await requireAdmin(OPERATOR_ROLES);

  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state");
  const date = searchParams.get("date");

  if (!state || !date) {
    return NextResponse.json({ error: "state and date are required" }, { status: 400 });
  }

  try {
    await clearOverride({ dateUtc: date, state });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to clear override" }, { status: 500 });
  }
}
