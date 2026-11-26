export const meta = {
  name: 'mx-adversaries',
  description: 'Miscelaneous floor: mx-interrogate adversaries, each with its own lens in its own lane; only findings proven by a run survive',
  whenToUse: 'args: {key, target, lanes: [path...], lenses: ["correctness", "security", ...]}',
  phases: [{ title: 'Attack', detail: 'one lens per lane' }, { title: 'Confirm', detail: 'rerun each finding' }],
}
const W = '~/.omniloy-misc/.claude/skills/mx-mode/worker.md'
const a = args || {}
const lenses = a.lenses || ['correctness', 'concurrency and retries', 'security and data', 'does the evidence lie (wrong instance, stale build, blank page)']
if (!a.key || !a.target || !Array.isArray(a.lanes)) throw new Error('args: {key, target, lanes, lenses} required')
const F = { type: 'object', required: ['findings'], properties: { findings: { type: 'array', items: { type: 'object', required: ['claim', 'command'], properties: {
  claim: { type: 'string' }, command: { type: 'string' }, output: { type: 'string' }, expected: { type: 'string' } } } } } }
const V = { type: 'object', required: ['reproduced'], properties: { reproduced: { type: 'boolean' }, output: { type: 'string' } } }
const res = await pipeline(lenses.map((l, i) => ({ l, lane: a.lanes[i % a.lanes.length] })),
  ({ l, lane }) => agent(`Read ${W} before anything else.\nYou are an adversary with the lens: ${l}. Try to break: ${a.target}. ` +
    `Your lane is ${lane}; run every command with --cwd ${lane} through team-evidence run ${a.key} --kind self-check. ` +
    `Report only findings you proved by a run: the command, its output, and the output the intent requires. Never fix.`,
    { phase: 'Attack', label: l, schema: F, effort: 'high' }),
  (r, it) => parallel((r ? r.findings : []).map(f => () => agent(
    `Read ${W} before anything else.\nRerun exactly this in ${it.lane} and say whether the output again contradicts the intent.\n` +
    `Command: ${f.command}\nIntent requires: ${f.expected || '(see claim)'}\nClaim: ${f.claim}`,
    { phase: 'Confirm', label: `confirm: ${f.claim.slice(0, 40)}`, schema: V, effort: 'medium' }).then(v => ({ ...f, lens: it.l, survives: !!(v && v.reproduced) })))))
const all = res.filter(Boolean).flat()
log(`${all.filter(f => f.survives).length} of ${all.length} findings survived a rerun`)
return { survived: all.filter(f => f.survives), dropped: all.filter(f => !f.survives) }
