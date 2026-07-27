export function stripBoldMarkup(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1");
}

export function wrapSelectionWithBold(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  placeholder = "bold text",
): { next: string; selectStart: number; selectEnd: number } {
  if (selectionStart === selectionEnd) {
    const next = `${value.slice(0, selectionStart)}**${placeholder}**${value.slice(selectionEnd)}`;
    const selectStart = selectionStart + 2;
    const selectEnd = selectStart + placeholder.length;
    return { next, selectStart, selectEnd };
  }
  const selected = value.slice(selectionStart, selectionEnd);
  const next = `${value.slice(0, selectionStart)}**${selected}**${value.slice(selectionEnd)}`;
  return {
    next,
    selectStart: selectionStart,
    selectEnd: selectionEnd + 4,
  };
}
