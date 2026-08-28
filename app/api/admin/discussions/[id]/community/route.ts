import { NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";

type Ctx = { params: Promise<{ id: string }> };

/** Hubs are location-pinned and are no longer linked to communities. */
export async function POST(_req: Request, _ctx: Ctx) {
  await requireAdmin(OPERATOR_ROLES);
  return NextResponse.json(
    { error: "Hubs are not linked to communities" },
    { status: 410 },
  );
}
