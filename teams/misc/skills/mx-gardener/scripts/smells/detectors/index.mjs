// The gardener's detectors. Each has an id, a severity, and a "what to do instead" message.
// Line detectors look at one added line; diff detectors look at the whole change (files, card, kit, team).
// They are deliberately simple and deterministic: a finding is a candidate for a person to classify (fix, dismiss, ask),
// never a verdict.

const CODE = /\.(m?[jt]sx?|cjs|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|cs|php|vue|svelte)$/;
const UI = /(\.(tsx|jsx|vue|svelte|css|scss|html)$)|(^|\/)(components?|pages|views|ui|screens)\//;
const PROTOCOL = /(lock|queue|retry|sync|handoff|hand-off|claim|hold|lease|mutex|semaphore|scheduler|inbox|outbox)/i;
const isComment = (s) => /^\s*(\/\/|#|\*|\/\*|<!--)/.test(s) || /\s(\/\/|#)\s/.test(s);

export const LINE = [
  { id: 'suppression', severity: 'high',
    test: (s, f) => /eslint-disable|@ts-ignore|@ts-expect-error|#\s*noqa|#\s*type:\s*ignore|--no-verify|# pylint: disable|@SuppressWarnings/.test(s),
    fix: 'Look up the rule. If it protects correctness, fix the code instead and delete the suppression; keep it only for a faulty, pedantic or style-only rule, with the reason in the PR.' },
  { id: 'escape-cast', severity: 'high',
    test: (s, f) => /\.(tsx?|mts|cts)$/.test(f) && (/\bas\s+any\b/.test(s) || /\bas\s+unknown\s+as\b/.test(s) || /:\s*any\b(?!\w)/.test(s)),
    fix: 'Parse the value at the boundary into a real type (mx-principles type-system-discipline) instead of casting it away.' },
  { id: 'timer-workaround', severity: 'medium',
    test: (s) => /setTimeout\s*\([^)]*,\s*0\s*\)/.test(s) || /setTimeout\s*\(\s*(\(\)|function)[^,]*,\s*0\b/.test(s) || /\brequestAnimationFrame\s*\(/.test(s) || /\brequestIdleCallback\s*\(/.test(s) || /queueMicrotask\s*\(/.test(s),
    fix: 'A timer that waits for state to settle hides an ordering bug. Find who owns the state and order the update there (mx-principles fix-root-causes).' },
  { id: 'justification-comment', severity: 'medium',
    test: (s) => isComment(s) && (/\b(workaround|hack|hacky|for now|temporary|temporarily|do not remove|don't remove|too risky|fine for now)\b/i.test(s) || /\bIMPORTANT\b/.test(s)),
    fix: 'Send it to mx-comment-sicko. A comment that defends code is a confession: make the behaviour obvious in code, or prove the external constraint and keep only that.' },
  { id: 'defensive-noise', severity: 'low',
    test: (s, f) => CODE.test(f) && (/catch\s*(\(\s*\w*\s*\))?\s*\{\s*\}/.test(s) || /(\?\.[\w$]+){3,}/.test(s) || /except\s*(Exception)?\s*:\s*pass\b/.test(s)),
    fix: 'A guard is a fix only when the state it handles is legitimate at this boundary. Trust internal types; validate once at the edge (mx-principles boundary-discipline).' },
];

export const DIFF = [
  { id: 'repeat-helper', severity: 'medium',
    fix: 'A helper with this name already exists. Reuse or move the existing one instead of writing another copy.',
    run: (ctx) => ctx.newFunctions.filter((fn) => ctx.definitions(fn.name).length > 1).map((fn) => ({ file: fn.file, line: fn.line, text: `${fn.name} is also defined at ${ctx.definitions(fn.name).filter((d) => !(d.file === fn.file && d.line === fn.line)).map((d) => `${d.file}:${d.line}`).join(', ')}` })) },
  { id: 'tier-mismatch', severity: 'high',
    fix: 'This diff touches coordination code or code a formal check covers, and the card does not claim V4. Raise the card\'s verification: line, or explain on the card why V4 does not apply.',
    run: (ctx) => {
      if (!ctx.card) return [];
      const tiers = ctx.card.tiers; if (tiers.includes('V4')) return [];
      return ctx.files.filter((f) => CODE.test(f) && (PROTOCOL.test(f) || ctx.formalCovered(f))).map((f) => ({ file: f, line: 0, text: `${ctx.card.key} claims ${tiers.join('+') || 'no tier'}` }));
    } },
  { id: 'map-drift', severity: 'medium',
    fix: 'A UI file changed that no feature file\'s sources: covers. Add it to the right feature file (or a new one) so the map stays the verification source.',
    run: (ctx) => ctx.kit ? ctx.files.filter((f) => UI.test(f) && !ctx.mapped(f)).map((f) => ({ file: f, line: 0, text: 'not in any feature sources:' })) : [] },
  { id: 'no-behavior-abuse', severity: 'high',
    fix: 'A card labeled no-behavior changed source files. Drop the label and verify it, or split the behaviour change into its own card.',
    run: (ctx) => ctx.card && ctx.card.noBehavior ? ctx.files.filter((f) => CODE.test(f) && !/(^|\/)(tests?|__tests__|spec)\//.test(f) && !/\.(test|spec)\./.test(f)).map((f) => ({ file: f, line: 0, text: `${ctx.card.key} is labeled no-behavior` })) : [] },
  { id: 'gate-override', severity: 'high',
    fix: 'Every use of the board gate override is listed. Check the owner wrote it on the card, and turn the reason into a check if it repeats.',
    run: (ctx) => ctx.overrides.map((o) => ({ file: 'board/gate-overrides.jsonl', line: 0, text: `${o.key} -> ${o.to}: ${o.reason}`, card: o.key })) },
];

export const ALL = [...LINE, ...DIFF].map((d) => d.id);
export const FUNC = [/^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/, /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, /^\s*def\s+([A-Za-z_]\w*)\s*\(/];
