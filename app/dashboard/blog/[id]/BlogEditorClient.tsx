"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  ArrowLeft,
  Columns2,
  ExternalLink,
  Eye,
  PenLine,
  Settings2,
  Trash2,
} from "lucide-react";
import { createPost, deletePost, updatePost, type BlogPost, type BlogPostStatus } from "../actions";
import { blogCoverUrl } from "../cover";
import { MarkdownToolbar, type ToolbarAction } from "../MarkdownToolbar";
import {
  indentSelection,
  insertSnippet,
  prefixLines,
  readingMinutes,
  toggleHeading,
  wordCount,
  wrapSelection,
  type TextSelection,
} from "../markdownTools";

const fieldCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/15";

type ViewMode = "write" | "split" | "preview";
type PromptKind = "link" | "image";

function formatDate(iso: string | null): string {
  if (!iso) return "Unpublished";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function BlogEditorClient({ post }: { post: BlogPost | null }) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelectionRef = useRef<TextSelection | null>(null);
  const [id, setId] = useState(post?.id ?? null);
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const coverImageUrl = blogCoverUrl(post?.cover_image_url);
  const [authorName, setAuthorName] = useState(post?.author_name ?? "Sterling Team");
  const [body, setBody] = useState(post?.body_markdown ?? "");
  const [status, setStatus] = useState<BlogPostStatus>(post?.status ?? "draft");
  const [publishedAt, setPublishedAt] = useState(post?.published_at ?? null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("split");
  const [prompt, setPrompt] = useState<{ kind: PromptKind; label: string; value: string } | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify({
      title: post?.title ?? "",
      slug: post?.slug ?? "",
      excerpt: post?.excerpt ?? "",
      coverImageUrl: blogCoverUrl(post?.cover_image_url),
      authorName: post?.author_name ?? "Sterling Team",
      body: post?.body_markdown ?? "",
    })
  );

  const isNew = id === null;
  const dirty = useMemo(
    () => JSON.stringify({ title, slug, excerpt, coverImageUrl, authorName, body }) !== savedSnapshot,
    [authorName, body, coverImageUrl, excerpt, savedSnapshot, slug, title]
  );

  const words = wordCount(`${title} ${body}`);
  const minutes = readingMinutes(`${title} ${body}`);

  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setView("write");
  }, []);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const applyEdit = useCallback((next: string, selection: TextSelection) => {
    setBody(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selection.start, selection.end);
    });
  }, []);

  const currentSelection = useCallback((): TextSelection => {
    const el = textareaRef.current;
    return { start: el?.selectionStart ?? body.length, end: el?.selectionEnd ?? body.length };
  }, [body.length]);

  const runToolbar = useCallback(
    (action: ToolbarAction) => {
      const selection = currentSelection();
      if (action.kind === "wrap") {
        const edit = wrapSelection(body, selection, action.before, action.after, action.placeholder);
        applyEdit(edit.value, edit.selection);
        return;
      }
      if (action.kind === "prefix") {
        const edit = prefixLines(body, selection, action.prefix);
        applyEdit(edit.value, edit.selection);
        return;
      }
      if (action.kind === "heading") {
        const edit = toggleHeading(body, selection, action.level);
        applyEdit(edit.value, edit.selection);
        return;
      }
      if (action.kind === "snippet") {
        const edit = insertSnippet(body, selection, action.snippet, action.cursorOffset);
        applyEdit(edit.value, edit.selection);
        return;
      }
      if (action.kind === "link") {
        pendingSelectionRef.current = selection;
        const selected = body.slice(selection.start, selection.end);
        setPrompt({ kind: "link", label: selected ? "Link URL" : "Link text and URL next", value: "https://" });
        return;
      }
      if (action.kind === "image") {
        pendingSelectionRef.current = selection;
        setPrompt({ kind: "image", label: "Image URL", value: "https://" });
      }
    },
    [applyEdit, body, currentSelection]
  );

  function confirmPrompt() {
    if (!prompt) return;
    const selection = pendingSelectionRef.current ?? currentSelection();
    const url = prompt.value.trim();
    if (!url) {
      setPrompt(null);
      pendingSelectionRef.current = null;
      return;
    }
    if (prompt.kind === "link") {
      const selected = body.slice(selection.start, selection.end) || "link text";
      const edit = wrapSelection(body, selection, "[", `](${url})`, selected);
      applyEdit(edit.value, edit.selection);
    } else {
      const alt = body.slice(selection.start, selection.end) || "image";
      const snippet = `![${alt}](${url})`;
      const edit = insertSnippet(body, selection, snippet);
      applyEdit(edit.value, edit.selection);
    }
    setPrompt(null);
    pendingSelectionRef.current = null;
  }

  const closePrompt = () => {
    setPrompt(null);
    pendingSelectionRef.current = null;
  };

  const save = useCallback(async (nextStatus: BlogPostStatus) => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      const input = {
        title,
        slug,
        excerpt,
        body_markdown: body,
        cover_image_url: coverImageUrl,
        author_name: authorName,
        status: nextStatus,
      };
      const saved = isNew ? await createPost(input) : await updatePost(id, input);
      setId(saved.id);
      setSlug(saved.slug);
      setStatus(saved.status);
      setPublishedAt(saved.published_at);
      setSavedSnapshot(
        JSON.stringify({
          title: saved.title,
          slug: saved.slug,
          excerpt: saved.excerpt ?? "",
          coverImageUrl: blogCoverUrl(saved.cover_image_url),
          authorName: saved.author_name,
          body: saved.body_markdown,
        })
      );
      toast.success(nextStatus === "published" ? "Published" : "Draft saved");
      if (isNew) router.replace(`/dashboard/blog/${saved.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save post");
    } finally {
      setSaving(false);
    }
  }, [authorName, body, coverImageUrl, excerpt, id, isNew, router, slug, title]);

  async function remove() {
    if (!id) return;
    if (!confirm(`Delete “${title || "this post"}”? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deletePost(id);
      toast.success("Post deleted");
      router.push("/dashboard/blog");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete post");
      setDeleting(false);
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save("draft");
      }
      if (meta && event.key === "Enter") {
        event.preventDefault();
        void save("published");
      }
      if (!meta || document.activeElement !== textareaRef.current) return;
      if (event.key.toLowerCase() === "b") {
        event.preventDefault();
        runToolbar({ kind: "wrap", before: "**", placeholder: "bold" });
      }
      if (event.key.toLowerCase() === "i") {
        event.preventDefault();
        runToolbar({ kind: "wrap", before: "*", placeholder: "italic" });
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        runToolbar({ kind: "link" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runToolbar, save]);

  const showWrite = view === "write" || view === "split";
  const showPreview = view === "preview" || view === "split";
  const publicUrl = slug ? `https://sterlingtheapp.com/blog/${slug}` : null;

  return (
    <div className="-m-4 flex h-[calc(100dvh-4.85rem)] flex-col bg-zinc-950 sm:-m-6 sm:h-[calc(100dvh-5.35rem)] lg:-m-8">
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900/90 px-3 py-2.5 backdrop-blur sm:px-5">
        <button
          type="button"
          onClick={() => router.push("/dashboard/blog")}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-50"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Posts</span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                status === "published"
                  ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25"
                  : "bg-zinc-800 text-zinc-400 ring-zinc-700"
              }`}
            >
              {status === "published" ? "Published" : "Draft"}
            </span>
            {dirty ? <span className="text-[11px] font-medium text-amber-300">Unsaved</span> : null}
          </div>
          <p className="truncate text-sm font-medium text-zinc-200">{title || "Untitled post"}</p>
        </div>

        <div className="flex items-center rounded-xl border border-zinc-800 bg-zinc-950 p-0.5">
          {(
            [
              ["write", PenLine, "Write"],
              ["split", Columns2, "Split"],
              ["preview", Eye, "Preview"],
            ] as const
          ).map(([mode, Icon, label]) => (
            <button
              key={mode}
              type="button"
              title={label}
              onClick={() => setView(mode)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                view === mode ? "bg-zinc-800 text-zinc-50" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-700 hover:text-zinc-50"
        >
          <Settings2 className="size-4" />
          <span className="hidden sm:inline">Details</span>
        </button>
        <button
          type="button"
          disabled={saving || deleting}
          onClick={() => void save("draft")}
          className="hidden rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 sm:inline-flex"
        >
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          disabled={saving || deleting}
          onClick={() => void save("published")}
          className="rounded-xl bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-40"
        >
          {saving ? "Saving…" : status === "published" ? "Update" : "Publish"}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden max-lg:flex-col">
        {showWrite ? (
          <section className={`flex min-h-0 min-w-0 flex-1 flex-col ${showPreview ? "border-zinc-800 max-lg:border-b lg:border-r" : ""}`}>
            <div className="shrink-0 border-b border-zinc-800 px-4 py-2 sm:px-6">
              <MarkdownToolbar onAction={runToolbar} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={blogCoverUrl(coverImageUrl)} alt="" className="mb-7 aspect-[1200/630] w-full rounded-2xl object-cover" />
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Post title"
                  className="w-full border-0 bg-transparent font-serif text-4xl font-semibold tracking-tight text-zinc-50 outline-none placeholder:text-zinc-700 sm:text-5xl"
                />
                <textarea
                  ref={textareaRef}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Tab") return;
                    event.preventDefault();
                    const selection = currentSelection();
                    const edit = indentSelection(body, selection, event.shiftKey);
                    applyEdit(edit.value, edit.selection);
                  }}
                  placeholder="Start writing. Use the toolbar or Markdown — **bold**, headings, lists, and images all work."
                  className="mt-6 min-h-[55vh] w-full resize-none border-0 bg-transparent font-serif text-lg leading-8 text-zinc-200 outline-none placeholder:text-zinc-700"
                  spellCheck
                />
              </div>
            </div>
          </section>
        ) : null}

        {showPreview ? (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-950">
            <div className="shrink-0 border-b border-zinc-800 px-5 py-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              Public preview
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <article className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
                <p className="text-sm font-medium text-zinc-500">
                  {formatDate(publishedAt)} · {authorName}
                </p>
                <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
                  {title || "Untitled post"}
                </h1>
                {excerpt ? <p className="mt-4 text-lg leading-7 text-zinc-400">{excerpt}</p> : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={blogCoverUrl(coverImageUrl)} alt="" className="mt-8 aspect-[1200/630] w-full rounded-2xl object-cover" />
                <div className="blog-prose prose prose-invert mt-8 max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noreferrer">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {body || "*Nothing to preview yet.*"}
                  </ReactMarkdown>
                </div>
              </article>
            </div>
          </section>
        ) : null}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-900/80 px-4 py-2 text-xs text-zinc-500 sm:px-5">
        <p>
          {words.toLocaleString()} words · {minutes} min read · {body.length.toLocaleString()} characters
        </p>
        <p className="hidden sm:block">⌘S draft · ⌘Enter publish · ⌘B / ⌘I / ⌘K</p>
      </footer>

      {settingsOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={() => setSettingsOpen(false)}>
          <aside
            className="flex h-full w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-900 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-zinc-50">Post details</p>
                <p className="text-xs text-zinc-500">Slug, excerpt, cover, and author</p>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)} className="text-sm text-zinc-400 hover:text-zinc-100">
                Done
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-400">Slug</span>
                <input className={fieldCls} value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="auto-from-title" />
                {publicUrl ? (
                  <a
                    href={status === "published" ? publicUrl : undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-300/90 hover:underline"
                  >
                    {publicUrl.replace("https://", "")}
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span className="mt-1 block text-xs text-zinc-600">Leave blank to generate from the title.</span>
                )}
              </label>
              <label className="block">
                <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-zinc-400">
                  Excerpt
                  <span className={excerpt.length > 160 ? "text-amber-300" : "text-zinc-600"}>{excerpt.length}/160</span>
                </span>
                <textarea
                  rows={4}
                  className={`${fieldCls} resize-none`}
                  value={excerpt}
                  onChange={(event) => setExcerpt(event.target.value)}
                  placeholder="One or two sentences for the blog index and SEO."
                />
              </label>
              <div className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-400">Cover</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={blogCoverUrl(coverImageUrl)} alt="" className="aspect-[1200/630] w-full rounded-xl object-cover" />
                <span className="mt-2 block text-xs text-zinc-600">Using the world hubs background for now.</span>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-zinc-400">Author</span>
                <input className={fieldCls} value={authorName} onChange={(event) => setAuthorName(event.target.value)} />
              </label>
            </div>
            {!isNew ? (
              <div className="border-t border-zinc-800 p-5">
                <button
                  type="button"
                  disabled={deleting || saving}
                  onClick={() => void remove()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 py-2.5 text-sm font-medium text-rose-300 hover:bg-rose-500/15 disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                  {deleting ? "Deleting…" : "Delete post"}
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}

      {prompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={closePrompt}>
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-sm font-semibold text-zinc-50">{prompt.label}</p>
            <input
              autoFocus
              className={`${fieldCls} mt-3`}
              value={prompt.value}
              onChange={(event) => setPrompt({ ...prompt, value: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") confirmPrompt();
                if (event.key === "Escape") closePrompt();
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={closePrompt} className="rounded-xl px-3 py-2 text-sm text-zinc-400">
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPrompt}
                className="rounded-xl bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-emerald-950"
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
