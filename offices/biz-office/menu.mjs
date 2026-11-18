// Parses the numbered menus shown by Claude Code and Codex in a terminal.
export function parseMenu(screen) {
  const lines = String(screen || '')
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/, ''));
  const option = /^\s*(?:[❯›>]\s*)?([1-9])\.\s+(.+?)\s*$/;
  // The menu is the last block of numbered lines on screen (the one with the cursor when there is one):
  // a numbered list in the agent's own message above it is not an option.
  const cursor = /^\s*[❯›>]\s*[1-9]\./;
  let at = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (cursor.test(lines[i])) { at = i; break; }
  if (at < 0) for (let i = lines.length - 1; i >= 0; i--) if (option.test(lines[i])) { at = i; break; }
  if (at < 0) return null;
  let first = at, last = at;
  const inMenu = (line) => option.test(line) || !line.trim() || /^\s{3,}\S/.test(line) || /^\s*[─━╌┄—_=]{3,}\s*$/.test(line);
  for (let i = at - 1; i >= 0 && inMenu(lines[i]); i--) if (option.test(lines[i])) first = i;
  for (let i = at + 1; i < lines.length && inMenu(lines[i]); i++) if (option.test(lines[i])) last = i;

  const options = [];
  for (const line of lines.slice(first, last + 1)) {
    const m = option.exec(line);
    if (m) options.push(`${m[1]}. ${m[2]}`);
  }
  if (!options.length || options[0][0] !== '1') return null;

  const question = [];
  for (let i = first - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) { if (question.length) break; continue; }
    if (/^[─━╌┄—_=]{3,}$/.test(line)) break;
    if (/^[☐☑□▣◻◼▪•]\s*/.test(line)) continue;
    if (/^[│┃┌└├┤┬┴┼╭╰╮╯]+/.test(line)) continue;
    question.unshift(line.replace(/^[│┃┌└├┤┬┴┼╭╰╮╯]+\s*/, '').trim());
  }
  const title = question.filter(Boolean).join(' ').trim();
  return title ? { question: title, options } : null;
}
