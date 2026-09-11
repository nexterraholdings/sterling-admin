"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { EmptyState, formatShortDate } from "@/components/admin/ui";
import { deletePost, updatePost, type BlogPost } from "./actions";
import { blogCoverUrl } from "./cover";

const STATUS_BADGE: Record<BlogPost["status"], string> = {
  published: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25",
  draft: "bg-zinc-800 text-zinc-400 ring-zinc-700",
};

type Filter = "all" | "published" | "draft";

export function BlogListView({
  initialPosts,
  loadError,
}: {
  initialPosts: BlogPost[];
  loadError: string | null;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return posts.filter((post) => {
      if (filter !== "all" && post.status !== filter) return false;
      if (!needle) return true;
      return (
        post.title.toLowerCase().includes(needle) ||
        post.slug.toLowerCase().includes(needle) ||
        (post.excerpt ?? "").toLowerCase().includes(needle)
      );
    });
  }, [filter, posts, query]);

  function toggleStatus(post: BlogPost) {
    const nextStatus = post.status === "published" ? "draft" : "published";
    setPendingId(post.id);
    startTransition(async () => {
      try {
        const updated = await updatePost(post.id, {
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt ?? "",
          body_markdown: post.body_markdown,
          cover_image_url: post.cover_image_url ?? "",
          author_name: post.author_name,
          status: nextStatus,
        });
        setPosts((prev) => prev.map((p) => (p.id === post.id ? updated : p)));
        toast.success(nextStatus === "published" ? "Post published" : "Post moved to draft");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to update post");
      } finally {
        setPendingId(null);
      }
    });
  }

  function remove(post: BlogPost) {
    if (!confirm(`Delete “${post.title}”? This cannot be undone.`)) return;
    setPendingId(post.id);
    startTransition(async () => {
      try {
        await deletePost(post.id);
        setPosts((prev) => prev.filter((p) => p.id !== post.id));
        toast.success("Post deleted");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Failed to delete post");
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">Content</p>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">Blog</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Write in Markdown, preview the public page, then publish to sterlingtheapp.com/blog.
            </p>
          </div>
          <Link
            href="/dashboard/blog/new"
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
          >
            <Plus className="size-4" />
            New post
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, slugs, excerpts"
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-900 py-2.5 pl-10 pr-3 text-sm text-zinc-50 outline-none placeholder:text-zinc-600 focus:border-emerald-500/40"
          />
        </label>
        <div className="flex rounded-2xl border border-zinc-800 bg-zinc-900 p-1">
          {(["all", "published", "draft"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold capitalize ${
                filter === value ? "bg-zinc-800 text-zinc-50" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {loadError ? (
        <EmptyState title="Could not load posts" hint={loadError} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={posts.length === 0 ? "No posts yet" : "No matching posts"}
          hint={posts.length === 0 ? "Create your first post to get the blog started." : "Try a different search or filter."}
          action={
            posts.length === 0 ? (
              <Link
                href="/dashboard/blog/new"
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-900"
              >
                New post
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visible.map((post) => {
            const busy = isPending && pendingId === post.id;
            return (
              <article
                key={post.id}
                className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/80 transition hover:border-zinc-700"
              >
                <Link href={`/dashboard/blog/${post.id}`} className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={blogCoverUrl(post.cover_image_url)} alt="" className="aspect-[1200/630] w-full object-cover" />
                </Link>
                <div className="space-y-3 p-5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${STATUS_BADGE[post.status]}`}
                    >
                      {post.status === "published" ? "Published" : "Draft"}
                    </span>
                    <p className="truncate text-xs text-zinc-500">
                      {post.status === "published" && post.published_at
                        ? `Published ${formatShortDate(post.published_at)}`
                        : `Updated ${formatShortDate(post.updated_at)}`}
                      {` · ${post.author_name}`}
                    </p>
                  </div>
                  <Link href={`/dashboard/blog/${post.id}`} className="block">
                    <h2 className="font-serif text-xl font-semibold tracking-tight text-zinc-50 hover:text-white">
                      {post.title}
                    </h2>
                    {post.excerpt ? (
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-400">{post.excerpt}</p>
                    ) : null}
                    <p className="mt-2 font-mono text-[11px] text-zinc-600">/blog/{post.slug}</p>
                  </Link>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link
                      href={`/dashboard/blog/${post.id}`}
                      className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggleStatus(post)}
                      className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                    >
                      {post.status === "published" ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(post)}
                      className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/15 disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
