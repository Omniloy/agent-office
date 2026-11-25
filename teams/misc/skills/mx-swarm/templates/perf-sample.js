export const meta = {
  name: 'mx-perf-sample',
  description: 'Miscelaneous floor: N alternating baseline/treatment perf samples through team-evidence, one worker per lane',
  whenToUse: 'args: {key, claim, lanes: {baseline, treatment}, command, n}',
  phases: [{ title: 'Sample', detail: 'alternate baseline and treatment' }],
}
const W = '~/.omniloy-misc/.claude/skills/mx-mode/worker.md'
const a = args || {}
if (!a.key || !a.command || !a.lanes) throw new Error('args: {key, claim, lanes: {baseline, treatment}, command, n>=5} required')
const n = Math.max(5, a.n || 5)
const SCHEMA = { type: 'object', required: ['verdict', 'samples'], properties: { verdict: { type: 'string', enum: ['PASS', 'ISSUES', 'BLOCKED'] },
  samples: { type: 'array', items: { type: 'object', properties: { arm: { type: 'string' }, ms: { type: 'number' }, run: { type: 'string' } } } }, findings: { type: 'array', items: { type: 'string' } } } }
phase('Sample')
// one worker runs all samples serially so the arms alternate on the same machine state (her benchmark rule)
const r = await agent(
  `Read ${W} before anything else.\nRun ${n} rounds. In each round run the baseline then the treatment (alternate the order every round):\n` +
  `  team-evidence run ${a.key} --kind baseline --claim ${a.claim || 1} --tier V0 --cwd ${a.lanes.baseline} -- ${a.command}\n` +
  `  team-evidence run ${a.key} --kind treatment --claim ${a.claim || 1} --tier V0 --cwd ${a.lanes.treatment} -- ${a.command}\n` +
  `Record each run id and its duration (ms in the run's argv.json). Do not run anything else on this machine meanwhile.`,
  { label: 'perf samples', schema: SCHEMA, effort: 'high' })
return r
