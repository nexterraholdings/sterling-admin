"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin, MARKETING_ROLES } from "@/app/dashboard/lib/dal";
import { logAdminAction } from "@/app/dashboard/lib/audit-log";
import { DEFAULT_BLOG_COVER } from "./cover";

export type BlogPostStatus = "draft" | "published";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body_markdown: string;
  cover_image_url: string | null;
  author_name: string;
  status: BlogPostStatus;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BlogPostInput = {
  title: string;
  slug?: string;
  excerpt: string;
  body_markdown: string;
  cover_image_url: string;
  author_name: string;
  status: BlogPostStatus;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function blogErrorMessage(message: string): string {
  if (/PGRST205|Could not find the table 'public.blog_posts'/i.test(message)) {
    return "The blog_posts table is missing. Run supabase/sql/blog_posts.sql against this project's database.";
  }
  return message;
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "post";
  let query = supabaseAdmin.from("blog_posts").select("slug").like("slug", `${root}%`);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw new Error(blogErrorMessage(error.message));

  const taken = new Set((data ?? []).map((row: { slug: string }) => row.slug));
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

export async function listPosts(): Promise<{ posts: BlogPost[]; error: string | null }> {
  await requireAdmin(MARKETING_ROLES);
  try {
    const { data, error } = await supabaseAdmin
      .from("blog_posts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return { posts: [], error: blogErrorMessage(error.message) };
    return { posts: (data ?? []) as BlogPost[], error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load posts";
    return { posts: [], error: blogErrorMessage(message) };
  }
}

export async function getPost(id: string): Promise<BlogPost | null> {
  await requireAdmin(MARKETING_ROLES);
  try {
    const { data, error } = await supabaseAdmin.from("blog_posts").select("*").eq("id", id).maybeSingle();
    if (error) return null;
    return (data ?? null) as BlogPost | null;
  } catch {
    return null;
  }
}

export async function createPost(input: BlogPostInput): Promise<BlogPost> {
  const admin = await requireAdmin(MARKETING_ROLES);
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");

  const slug = await uniqueSlug(input.slug?.trim() || title);
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .insert({
      slug,
      title,
      excerpt: input.excerpt.trim() || null,
      body_markdown: input.body_markdown,
      cover_image_url: DEFAULT_BLOG_COVER,
      author_name: input.author_name.trim() || "Sterling Team",
      status: input.status,
      published_at: input.status === "published" ? now : null,
      created_by: admin.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(blogErrorMessage(error.message));

  await logAdminAction({
    category: "admin",
    action: "create_blog_post",
    detail: `"${title}" (${input.status})`,
    targetType: "blog_post",
    targetId: data.id,
    actorId: admin.id,
    actorLabel: admin.email,
  });

  return data as BlogPost;
}

export async function updatePost(id: string, input: BlogPostInput): Promise<BlogPost> {
  const admin = await requireAdmin(MARKETING_ROLES);
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");

  const existing = await supabaseAdmin.from("blog_posts").select("slug,status,published_at").eq("id", id).single();
  if (existing.error) throw new Error(blogErrorMessage(existing.error.message));

  const desiredSlug = input.slug?.trim() || title;
  const slug =
    desiredSlug === existing.data.slug ? existing.data.slug : await uniqueSlug(desiredSlug, id);

  const publishing = input.status === "published" && existing.data.status !== "published";
  const published_at = input.status === "published" ? (existing.data.published_at ?? new Date().toISOString()) : existing.data.published_at;

  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .update({
      slug,
      title,
      excerpt: input.excerpt.trim() || null,
      body_markdown: input.body_markdown,
      cover_image_url: DEFAULT_BLOG_COVER,
      author_name: input.author_name.trim() || "Sterling Team",
      status: input.status,
      published_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(blogErrorMessage(error.message));

  await logAdminAction({
    category: "admin",
    action: publishing ? "publish_blog_post" : "update_blog_post",
    detail: `"${title}" (${input.status})`,
    targetType: "blog_post",
    targetId: id,
    actorId: admin.id,
    actorLabel: admin.email,
  });

  return data as BlogPost;
}

export async function deletePost(id: string): Promise<void> {
  const admin = await requireAdmin(MARKETING_ROLES);
  const { data: existing } = await supabaseAdmin.from("blog_posts").select("title").eq("id", id).maybeSingle();

  const { error } = await supabaseAdmin.from("blog_posts").delete().eq("id", id);
  if (error) throw new Error(blogErrorMessage(error.message));

  await logAdminAction({
    category: "admin",
    action: "delete_blog_post",
    detail: existing?.title ?? id,
    targetType: "blog_post",
    targetId: id,
    actorId: admin.id,
    actorLabel: admin.email,
  });
}
