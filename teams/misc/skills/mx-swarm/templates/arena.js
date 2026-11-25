export const meta = {
  name: 'mx-arena',
  description: 'Miscelaneous floor: arena candidates in their own lanes (opus high, opus xhigh) and a hidden-rubric judge; the Codex candidate and Codex judge run as Lane B commands by the coordinator',
  whenToUse: 'args: {key, task, lanes: {high, xhigh}, rubric}',
  phases: [{ title: 'Compete', detail: 'one candidate per lane' }],
}
const W = '~/.omniloy-misc/.claude/skills/mx-mode/worker.md'
const a = args || {}
if (!a.task || !a.lanes || !a.lanes.high || !a.lanes.xhigh) throw new Error('args: {key, task, lanes: {high, xhigh}, rubric} required')
const S = { type: 'object', required: ['verdict', 'summary'], properties: { verdict: { type: 'string', enum: ['PASS', 'ISSUES', 'BLOCKED'] },
  sha: { type: 'string' }, summary: { type: 'string' }, artifacts: { type: 'array', items: { type: 'string' } } } }
phase('Compete')
const [high, xhigh] = await parallel(['high', 'xhigh'].map(e => () => agent(
  `Read ${W} before anything else.\nTask: ${a.task}\nWork only in ${a.lanes[e]} (cd there for every command). Commit your result there; do not push. ` +
  `Run your own checks through team-evidence run ${a.key} --kind self-check --cwd ${a.lanes[e]}.`,
  { label: `candidate opus ${e}`, schema: S, effort: e })))
// The rubric stays hidden from candidates. Judging is cross-vendor: the coordinator runs
// codex exec -s read-only -C <lane> "<rubric + both diffs>" itself, with the Codex candidate's lane included.
return { candidates: { high, xhigh }, judgeWith: 'codex exec -s read-only (run by the coordinator)', rubric: a.rubric ? 'kept for the judge' : 'missing' }
