// utils/mentionUtils.js
// Утилиты для обнаружения @упоминаний в полях ввода.

// Для textarea/input: возвращает { query, startIndex } если курсор стоит после @слова
export function getMentionAtCursor(value, cursorPos) {
  const before = value.slice(0, cursorPos);
  const match = before.match(/@(\w*)$/);
  if (!match) return null;
  return { query: match[1].toLowerCase(), startIndex: cursorPos - match[0].length };
}

// Для contentEditable: возвращает { query, node, nodeOffset, len }
export function getMentionInEditor() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return null;
  const node = range.startContainer;
  if (node.nodeType !== 3) return null; // только текстовые узлы
  const textBefore = node.textContent.slice(0, range.startOffset);
  const match = textBefore.match(/@(\w*)$/);
  if (!match) return null;
  return {
    query: match[1].toLowerCase(),
    node,
    nodeOffset: range.startOffset - match[0].length,
    len: match[0].length,
  };
}
