// Parses the numbered menus shown by Claude Code and Codex in a terminal.
const hash = (text) => {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
};

export function terminalId(t) {
  return [t && t.pid, t && t.created_ms, t && t.address].filter((x) => x !== undefined && x !== null && x !== '').join(':') || 'unknown';
}

// What is on screen decides the id: the context (the command, the file) is part of it, so two "Do you want to
// proceed?" in a row (a git push, then a gh pr create) are two different menus.
export function menuInstance(t, menu) {
  const terminal = terminalId(t), key = `${terminal}|${t && t.turn || ''}|${t && t.status_ms || ''}|${menu.question}\n${(menu.context || []).join('\n')}\n${menu.options.join('\n')}`;
  return { ...menu, id: `m${hash(key)}`, terminalId: terminal };
}

// Secrets never leave the screen: the context goes to the office page, the phone's lock screen and requests.json.
const SECRET_NAME = String.raw`(?:api[_-]?key|access[_-]?key|secret(?:[_-]?key)?|client[_-]?secret|token|auth(?:orization)?|pass(?:word|wd)?|pwd|private[_-]?key|session|cookie|credentials?)`;
export function maskSecrets(text) {
  return String(text ?? '')
    .replace(/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+\/=-]{6,}/gi, '$1 ••••')
    .replace(new RegExp(String.raw`(\b[\w.-]*${SECRET_NAME}[\w.-]*\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&;,]+)`, 'gi'), '$1••••')
    .replace(new RegExp(String.raw`(--?${SECRET_NAME}[\w-]*(?:=|\s+))("[^"]*"|'[^']*'|\S+)`, 'gi'), '$1••••')
    .replace(/(\s-p)(?=\S{4,})\S+/g, '$1••••') // mysql -pSECRET
    .replace(/(:\/\/[^\s:@\/]+:)[^\s@\/]+@/g, '$1••••@') // https://user:pass@host
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}/g, 'sk-••••')
    .replace(/\b(?:gh[pousr]_|github_pat_|glpat-|xox[abposr]-|AKIA|ASIA|AIza)[A-Za-z0-9_-]{8,}/g, '••••')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '••••') // a JWT
    .replace(/\b[0-9a-f]{32,}\b/gi, '••••') // long hex: keys, hashes
    .replace(/[A-Za-z0-9+\/_-]{40,}={0,2}/g, (m) => (/\d/.test(m) && /[a-z]/.test(m) && /[A-Z]/.test(m) && (m.match(/\//g) || []).length < 3 ? '••••' : m)); // long base64
}

const clipLine = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// A title that says what is being approved: "¿Ejecutar `git push origin …`?", "¿Editar src/x.ts?".
export function menuTitle(menu) {
  const q = String(menu.question || ''), ctx = menu.context || [], head = ctx[0] || '';
  const cmd = menu.command || (ctx.find((l) => /^\$\s+\S/.test(l)) || '').replace(/^\$\s+/, '');
  if (cmd && (/^(Bash|Shell|Run) command|^Bash\(/i.test(head) || /run the following command|run this command|ejecutar/i.test(q) || /^\$\s/.test(ctx.find((l) => /^\$\s/.test(l)) || ''))) return `¿Ejecutar \`${clipLine(cmd.replace(/\s+/g, ' '), 90)}\`?`;
  const file = (menu.file || '').trim();
  if (/^(Edit|Update) file/i.test(head) && file) return `¿Editar ${clipLine(file, 100)}?`;
  if (/^(Create|Write) file/i.test(head) && file) return `¿Crear ${clipLine(file, 100)}?`;
  if (/^Overwrite file/i.test(head) && file) return `¿Sobrescribir ${clipLine(file, 100)}?`;
  if (/^Read file/i.test(head) && file) return `¿Leer ${clipLine(file, 100)}?`;
  const mcp = ctx.map((l) => /^([\w.-]+)\s+-\s+([\w.-]+)\(.*\(MCP\)\s*$/.exec(l) || /^([\w.-]+)\s+-\s+([\w.-]+)\s*\(MCP\)/.exec(l)).find(Boolean);
  if (mcp) return `¿Usar ${mcp[1]} · ${mcp[2]}?`;
  if (/^(Fetch|Web ?fetch)/i.test(head) && ctx[1]) return `¿Abrir ${clipLine(ctx[1].replace(/^https?:\/\//, ''), 90)}?`;
  if (/make the following edits|apply (these|the following) (changes|edits)/i.test(q)) { const f = ctx.find((l) => /[\w-]+\.[a-z0-9]{1,6}\b/i.test(l) && !/\s{2,}/.test(l)); if (f) return `¿Editar ${clipLine(f.replace(/^[•\-\s]+/, ''), 100)}?`; }
  return q;
}

// The block above the options: in a Claude Code permission prompt, the box from its top rule (─) down (tool,
// description, the command or the diff between ╌ rules); in Codex, the question and what follows it ("Reason:",
// "$ command"). Without a box, only what sits between the question and the options counts: the agent's own
// message above it is not part of the menu.
function menuContext(lines, first) {
  const block = []; let boxed = false;
  for (let i = first - 1, n = 0; i >= 0 && n < 34; i--, n++) {
    const raw = lines[i], l = raw.trim();
    if (/^[─━]{20,}$/.test(l)) { boxed = true; break; } // the top of Claude's permission box
    if (/^(⏺|•|❯|>)\s/.test(l) && block.length) break; // the transcript above it
    block.unshift(raw);
  }
  const rule = (l) => /^[╌┄]{3,}$/.test(l.trim());
  const keep = (l) => l.trim() && !rule(l) && !/^Tip:/.test(l.trim()) && !/^[☐☑✔✓□▣◻◼]\s*\S/.test(l.trim()) && !/^←.*→$/.test(l.trim());
  const clean = (l) => l.replace(/^\s*[│┃]\s?/, '').replace(/\s*[│┃]\s*$/, '').trim();
  let qi = -1; for (let i = block.length - 1; i >= 0; i--) if (keep(block[i]) && /\?\s*$/.test(block[i])) { qi = i; break; }
  let body = boxed ? block.filter((_, i) => i !== qi) : qi >= 0 ? block.slice(qi + 1) : [];
  // the command (or the diff) is what sits between the two ╌ rules of the box
  let command = '';
  const r = block.map((l, i) => (rule(l) ? i : -1)).filter((i) => i >= 0);
  if (boxed && r.length >= 2) command = block.slice(r[0] + 1, r[1]).map(clean).filter(Boolean).join('\n');
  body = body.filter(keep).map(clean).filter(Boolean);
  const head = body[0] || '';
  const file = /^(Edit|Update|Create|Write|Overwrite|Read) file/i.test(head) ? (body[1] || '') : '';
  return { context: body.slice(0, 14), command: command && /command/i.test(head) ? command : '', file };
}

// The agent's own last words above its question ("⏺ I fixed … before I push I need your OK"), from the screen:
// the nearest message bullet that is not a tool call, with its wrapped lines.
function screenSaid(lines, first) {
  for (let i = first - 1, n = 0; i >= 0 && n < 40; i--, n++) {
    const m = /^\s*(?:⏺|•)\s+(.+)$/.exec(lines[i]);
    if (!m) continue;
    if (/^[\w.-]+\(.*\)\s*$|^(Ran|Read|Edited|Explored|Searched|Updated|Wrote|Called|Worked)\b/.test(m[1].trim())) continue; // a tool call, not words
    const out = [m[1].trim()];
    for (let k = i + 1; k < first && /^\s{2,}\S/.test(lines[k]) && !/^\s*[⎿─━╌]/.test(lines[k]); k++) out.push(lines[k].trim());
    const t = out.join(' ');
    return t.length > 300 ? `${t.slice(0, 299)}…` : t;
  }
  return '';
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
  let title = question.filter(Boolean).join(' ').trim();
  const ctx = menuContext(lines, first);
  // Codex puts the question above its context: "Would you like to run the following command?", then "$ git push".
  // The line right above the options is then the command, not the question.
  if (title && !/\?\s*$/.test(title)) {
    const q = [...lines.slice(Math.max(0, first - 34), first)].reverse().map((l) => l.trim()).find((l) => /\?$/.test(l) && !numbered.test(l) && !/^(⏺|•|❯|>)\s/.test(l));
    if (q && ctx.context.length) title = q.replace(/^[│┃]\s*/, '');
  }
  if (!title) return null;
  const out = { question: maskSecrets(title), options: options.map(maskSecrets), context: ctx.context.filter((l) => l !== title).map(maskSecrets) };
  if (ctx.command) out.command = maskSecrets(ctx.command);
  if (ctx.file) out.file = ctx.file;
  const said = screenSaid(lines, first); if (said) out.said = maskSecrets(said);
  out.title = menuTitle(out);
  return out;
}
