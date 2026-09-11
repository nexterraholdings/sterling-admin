"use client";

import type { ReactNode } from "react";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
  Strikethrough,
  Table,
} from "lucide-react";

type ToolbarAction =
  | { kind: "wrap"; before: string; after?: string; placeholder?: string }
  | { kind: "prefix"; prefix: string }
  | { kind: "heading"; level: 1 | 2 | 3 }
  | { kind: "link" }
  | { kind: "image" }
  | { kind: "snippet"; snippet: string; cursorOffset?: number };

const GROUPS: Array<Array<{ title: string; icon: ReactNode; action: ToolbarAction }>> = [
  [
    { title: "Heading 1", icon: <Heading1 className="size-4" />, action: { kind: "heading", level: 1 } },
    { title: "Heading 2", icon: <Heading2 className="size-4" />, action: { kind: "heading", level: 2 } },
    { title: "Heading 3", icon: <Heading3 className="size-4" />, action: { kind: "heading", level: 3 } },
  ],
  [
    { title: "Bold (⌘B)", icon: <Bold className="size-3.5" />, action: { kind: "wrap", before: "**", placeholder: "bold" } },
    { title: "Italic (⌘I)", icon: <Italic className="size-3.5" />, action: { kind: "wrap", before: "*", placeholder: "italic" } },
    {
      title: "Strikethrough",
      icon: <Strikethrough className="size-3.5" />,
      action: { kind: "wrap", before: "~~", placeholder: "text" },
    },
    {
      title: "Inline code",
      icon: <Code className="size-3.5" />,
      action: { kind: "wrap", before: "`", placeholder: "code" },
    },
  ],
  [
    { title: "Link (⌘K)", icon: <Link2 className="size-3.5" />, action: { kind: "link" } },
    { title: "Image", icon: <ImageIcon className="size-3.5" />, action: { kind: "image" } },
    { title: "Quote", icon: <Quote className="size-3.5" />, action: { kind: "prefix", prefix: "> " } },
  ],
  [
    { title: "Bulleted list", icon: <List className="size-4" />, action: { kind: "prefix", prefix: "- " } },
    { title: "Numbered list", icon: <ListOrdered className="size-4" />, action: { kind: "prefix", prefix: "1. " } },
    { title: "Checklist", icon: <ListChecks className="size-4" />, action: { kind: "prefix", prefix: "- [ ] " } },
  ],
  [
    {
      title: "Code block",
      icon: <SquareCode className="size-3.5" />,
      action: { kind: "wrap", before: "```\n", after: "\n```", placeholder: "code" },
    },
    {
      title: "Table",
      icon: <Table className="size-3.5" />,
      action: {
        kind: "snippet",
        snippet: "\n| Column | Column |\n| --- | --- |\n|  |  |\n",
        cursorOffset: 3,
      },
    },
    { title: "Divider", icon: <Minus className="size-3.5" />, action: { kind: "snippet", snippet: "\n\n---\n\n" } },
  ],
];

export function MarkdownToolbar({ onAction }: { onAction: (action: ToolbarAction) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {GROUPS.map((group, gi) => (
        <div key={gi} className="flex items-center gap-0.5">
          {gi > 0 ? <span className="mx-1 hidden h-4 w-px bg-zinc-800 sm:block" /> : null}
          {group.map((item) => (
            <button
              key={item.title}
              type="button"
              title={item.title}
              aria-label={item.title}
              className="blog-toolbar-btn"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onAction(item.action)}
            >
              {item.icon}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export type { ToolbarAction };
