import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import { listAdminGroups } from "@/lib/groups/db";
import { mapSeededHubRpcError } from "@/lib/seeded-hubs/types";

export async function GET(req: NextRequest) {
  await requireAdmin(OPERATOR_ROLES);

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || null;
  const hubId = searchParams.get("hubId")?.trim() || null;
  const includeArchived = searchParams.get("includeArchived") === "1";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "20") || 20));
  const sort = searchParams.get("sort") ?? "-created_at";

  try {
    const payload = await listAdminGroups({
      search,
      hubId,
      includeArchived,
      sort,
      page,
      pageSize,
    });
    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch groups";
    return NextResponse.json({ error: mapSeededHubRpcError(message) }, { status: 500 });
  }
}
