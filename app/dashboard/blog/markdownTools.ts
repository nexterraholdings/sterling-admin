export type TextSelection = {
  start: number;
  end: number;
};

export type TextEdit = {
  value: string;
  selection: TextSelection;
};

function lineBounds(value: string, start: number, end: number) {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const after = value.indexOf("\n", end);
  const lineEnd = after === -1 ? value.length : after;
  return { lineStart, lineEnd };
}

export function wrapSelection(
  value: string,
  selection: TextSelection,
  before: string,
  after = before,
  placeholder = "text"
): TextEdit {
  const selected = value.slice(selection.start, selection.end);
  const inner = selected || placeholder;
  const next = value.slice(0, selection.start) + before + inner + after + value.slice(selection.end);
  const innerStart = selection.start + before.length;
  return {
    value: next,
    selection: { start: innerStart, end: innerStart + inner.length },
  };
}

export function prefixLines(
  value: string,
  selection: TextSelection,
  prefix: string
): TextEdit {
  const { lineStart, lineEnd } = lineBounds(value, selection.start, selection.end);
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const allPrefixed = lines.every((line) => line.startsWith(prefix) || line.trim() === "");
  const nextLines = lines.map((line) => {
    if (line.trim() === "") return line;
    return allPrefixed ? line.slice(prefix.length) : `${prefix}${line}`;
  });
  const nextBlock = nextLines.join("\n");
  return {
    value: value.slice(0, lineStart) + nextBlock + value.slice(lineEnd),
    selection: { start: lineStart, end: lineStart + nextBlock.length },
  };
}

const HEADING_RE = /^(#{1,6})\s+/;

export function toggleHeading(
  value: string,
  selection: TextSelection,
  level: 1 | 2 | 3
): TextEdit {
  const { lineStart, lineEnd } = lineBounds(value, selection.start, selection.end);
  const line = value.slice(lineStart, lineEnd);
  const match = line.match(HEADING_RE);
  const currentLevel = match ? match[1].length : 0;
  const stripped = line.replace(HEADING_RE, "");
  const nextLine = currentLevel === level ? stripped : `${"#".repeat(level)} ${stripped}`;
  return {
    value: value.slice(0, lineStart) + nextLine + value.slice(lineEnd),
    selection: { start: lineStart + nextLine.length, end: lineStart + nextLine.length },
  };
}

export function insertSnippet(
  value: string,
  selection: TextSelection,
  snippet: string,
  cursorOffset?: number
): TextEdit {
  const next = value.slice(0, selection.start) + snippet + value.slice(selection.end);
  const pos = selection.start + (cursorOffset ?? snippet.length);
  return { value: next, selection: { start: pos, end: pos } };
}

export function indentSelection(value: string, selection: TextSelection, outdent: boolean): TextEdit {
  const { lineStart, lineEnd } = lineBounds(value, selection.start, selection.end);
  const block = value.slice(lineStart, lineEnd);
  const nextBlock = block
    .split("\n")
    .map((line) => (outdent ? line.replace(/^ {1,2}/, "") : `  ${line}`))
    .join("\n");
  return {
    value: value.slice(0, lineStart) + nextBlock + value.slice(lineEnd),
    selection: { start: lineStart, end: lineStart + nextBlock.length },
  };
}

export function wordCount(text: string): number {
  const words = text.trim().match(/\S+/g);
  return words?.length ?? 0;
}

export function readingMinutes(text: string): number {
  return Math.max(1, Math.round(wordCount(text) / 200));
}
