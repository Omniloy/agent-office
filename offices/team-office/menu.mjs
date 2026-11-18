// Parses the numbered menus shown by Claude Code and Codex in a terminal.
const hash = (text) => {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
};

export function terminalId(t) {
  return [t && t.pid, t && t.created_ms, t && t.address].filter((x) => x !== undefined && x !== null && x !== '').join(':') || 'unknown';
}

export function menuInstance(t, menu) {
  const terminal = terminalId(t), key = `${terminal}|${t && t.turn || ''}|${t && t.status_ms || ''}|${menu.question}\n${menu.options.join('\n')}`;
  return { ...menu, id: `m${hash(key)}`, terminalId: terminal };
}

export function parseMenu(screen) {
  const lines = String(screen || '')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/, ''))
    .filter((line) => !line.startsWith('[hc] ')); // hc's own note under a blocked screen
  const option = /^\s*(?:[❯›>]\s*)?([1-9])\.\s+(.+?)\s*$/;
  const numbered = /^\s*(?:[❯›>]\s*)?(\d+)\.\s+/;
  const footer = /^\s*(?:Enter|Return)\s+to\s+(?:select|choose)\b|\b(?:to\s+)?(?:navigate|select)\b.*(?:↑|↓|←|→)|\bEsc(?:ape)?\s+to\s+(?:cancel|go back)\b/i;
  // The menu is the last block of numbered lines on screen (the one with the cursor when there is one):
  // a numbered list in the agent's own message above it is not an option.
  const cursor = /^\s*[❯›>]\s*[1-9]\./;
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (cursor.test(lines[i])) { at = i; break; }
  if (at < 0) for (let i = lines.length - 1; i >= 0; i--) if (option.test(lines[i])) { at = i; break; }
  if (at < 0) return null;
  let first = at, last = at;
  const inMenu = (line) => numbered.test(line) || !line.trim() || /^\s{3,}\S/.test(line) || /^\s*[─━╌┄—_=]{3,}\s*$/.test(line);
  // Back from the cursor only as far as its option 1: anything above that (a question, a list in the agent's
  // message) is not part of the menu, even when it is indented like a description line.
  for (let i = at; i >= 0 && inMenu(lines[i]); i--) { const m = option.exec(lines[i]); if (m) { first = i; if (m[1] === '1') break; } }
  for (let i = at + 1; i < lines.length && inMenu(lines[i]); i++) if (option.test(lines[i])) last = i;

  const options = [];
  for (const line of lines.slice(first, last + 1)) {
    const m = option.exec(line);
    if (m) options.push(`${m[1]}. ${m[2]}`);
  }
  if (!options.length || options.some((o, i) => !o.startsWith(`${i + 1}. `))) return null; // 1, 2, 3… in order, no repeats
  let end = last; while (end + 1 < lines.length && inMenu(lines[end + 1])) end++;
  if (lines.slice(first, end + 1).some((line) => numbered.test(line) && Number(numbered.exec(line)[1]) > 9)) return null; // 10+: no single key picks it
  const after = lines.slice(last + 1);
  const hasFooter = after.some((line) => footer.test(line));
  // With the cursor on an option it is a live menu, whatever the app prints under it (status lines, hints).
  // Without one, only a menu footer and nothing else below makes it one.
  if (!cursor.test(lines[at]) && (!hasFooter || after.some((line) => line.trim() && !footer.test(line)))) return null;

  const question = [];
  for (let i = first - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) { if (question.length) break; continue; }
    if (/^[─━╌┄—_=]{3,}$/.test(line) || numbered.test(line)) break; // a rule or the agent's own list ends the question
    if (/^[☐☑□▣◻◼▪•]\s*/.test(line)) continue;
    if (/^[│┃┌└├┤┬┴┼╭╰╮╯]+/.test(line)) continue;
    question.unshift(line.replace(/^[│┃┌└├┤┬┴┼╭╰╮╯]+\s*/, '').trim());
  }
  const title = question.filter(Boolean).join(' ').trim();
  return title ? { question: title, options } : null;
}
