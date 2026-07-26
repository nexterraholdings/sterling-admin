import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import type { DiscussionHubTab } from "@/lib/discussions/types";

const TABS = new Set<DiscussionHubTab>([
  "feed",
  "updates",
  "events",
  "media",
  "resources",
  "wiki",
  "people",
  "polls",
  "live_chat",
]);

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  await getCurrentAdmin();
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
        const { data, error } = await supabaseAdmin.rpc("get_area_discussion_top_level_comments", {
          p_discussion_id: id,
          p_limit: limit,
          p_offset: offset,
        });
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
      case "events": {
        const { data, error } = await supabaseAdmin.rpc("get_discussion_events", {
          p_discussion_id: id,
          p_limit: limit,
          p_offset: offset,
        });
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
        const { data, error } = await supabaseAdmin.rpc("get_discussion_wiki_sections", {
          p_discussion_id: id,
          p_limit: limit,
          p_offset: offset,
        });
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
        const { data, error } = await supabaseAdmin.rpc("get_discussion_poll_history", {
          p_discussion_id: id,
          p_limit: limit,
          p_offset: offset,
          p_search: null,
        });
        if (error) throw new Error(error.message);
        const payload = data as { items?: unknown[] } | unknown[] | null;
        const items = Array.isArray(payload) ? payload : (payload?.items ?? []);
        return NextResponse.json({ tab, items, offset, limit });
      }
      case "live_chat": {
        const { data, error } = await supabaseAdmin
          .from("discussion_live_chat_messages")
          .select("id,discussion_id,author_id,body,created_at,is_hidden")
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
