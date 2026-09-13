import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin, OPERATOR_ROLES } from "@/app/dashboard/lib/dal";
import type { DiscussionHubTab } from "@/lib/discussions/types";

const TABS = new Set<DiscussionHubTab>([
  "feed",
  "updates",
  "media",
  "resources",
  "wiki",
  "people",
  "polls",
]);

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  await requireAdmin(OPERATOR_ROLES);
  const { id } = await params;
  const tab = (req.nextUrl.searchParams.get("tab") ?? "feed") as DiscussionHubTab;
  const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") ?? "0") || 0);
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? "25") || 25));

  if (!TABS.has(tab)) {
    return NextResponse.json({ error: `Invalid tab: ${tab}` }, { status: 400 });
  }

  try {
    switch (tab) {
      case "feed": {
        // The mobile-facing RPC requires auth.uid() (a real user session), which
        // the service-role admin client never has. Query the table directly
        // instead — service_role already bypasses RLS, so no bypass RPC is needed.
        const { data, error } = await supabaseAdmin
          .from("area_discussion_comments")
          .select("id,body,image_url,gif_preview_url,created_at,is_hidden,is_pinned")
          .eq("discussion_id", id)
          .is("parent_id", null)
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw new Error(error.message);
        return NextResponse.json({ tab, items: data ?? [], offset, limit });
      }
      case "updates": {
        const { data, error } = await supabaseAdmin
          .from("discussion_updates")
          .select("*")
          .eq("discussion_id", id)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw new Error(error.message);
        return NextResponse.json({ tab, items: data ?? [], offset, limit });
      }
      case "media": {
        const { data, error } = await supabaseAdmin
          .from("discussion_media")
          .select("*")
          .eq("discussion_id", id)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw new Error(error.message);
        return NextResponse.json({ tab, items: data ?? [], offset, limit });
      }
      case "resources": {
        const { data, error } = await supabaseAdmin
          .from("discussion_resources")
          .select("*")
          .eq("discussion_id", id)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw new Error(error.message);
        return NextResponse.json({ tab, items: data ?? [], offset, limit });
      }
      case "wiki": {
        // Same auth.uid() issue as "feed" — read the table directly.
        const { data, error } = await supabaseAdmin
          .from("discussion_wiki_sections")
          .select("*")
          .eq("discussion_id", id)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw new Error(error.message);
        return NextResponse.json({ tab, items: data ?? [], offset, limit });
      }
      case "people": {
        const [participantsRes, modsRes] = await Promise.all([
          supabaseAdmin
            .from("area_discussion_participants")
            .select("user_id,first_engaged_at")
            .eq("discussion_id", id)
            .order("first_engaged_at", { ascending: true })
            .range(offset, offset + limit - 1),
          supabaseAdmin
            .from("area_discussion_moderators")
            .select("user_id,capabilities,created_at")
            .eq("discussion_id", id)
            .order("created_at", { ascending: true }),
        ]);
        if (participantsRes.error) throw new Error(participantsRes.error.message);
        if (modsRes.error) throw new Error(modsRes.error.message);
        const userIds = [
          ...new Set([
            ...(participantsRes.data ?? []).map((p: { user_id: string }) => String(p.user_id)),
            ...(modsRes.data ?? []).map((m: { user_id: string }) => String(m.user_id)),
          ]),
        ];
        const { data: profiles } = userIds.length
          ? await supabaseAdmin.from("profiles").select("id,full_name,username,avatar_url").in("id", userIds)
          : { data: [] };
        return NextResponse.json({
          tab,
          participants: participantsRes.data ?? [],
          moderators: modsRes.data ?? [],
          profiles: profiles ?? [],
          offset,
          limit,
        });
      }
      case "polls": {
        // Same auth.uid() issue as "feed" — read the table directly.
        const { data, error } = await supabaseAdmin
          .from("discussion_polls")
          .select("*")
          .eq("discussion_id", id)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw new Error(error.message);
        return NextResponse.json({ tab, items: data ?? [], offset, limit });
      }
      default:
        return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load hub tab";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
