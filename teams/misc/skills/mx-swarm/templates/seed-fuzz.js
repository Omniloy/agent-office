export const meta = {
  name: 'mx-seed-fuzz',
  description: 'Miscelaneous floor: parallel Bombadil or property runs, one seed or time slice per lane',
  whenToUse: 'args: {key, claim, tier, lanes: [path...], command (with {seed} and {lane}), seeds: [n...]}',
  phases: [{ title: 'Fuzz', detail: 'one seed per lane' }],
}
const W = '~/.omniloy-misc/.claude/skills/mx-mode/worker.md'
const a = args || {}
if (!a.key || !Array.isArray(a.lanes) || !a.command) throw new Error('args: {key, claim, tier, lanes, command, seeds} required')
const seeds = a.seeds || a.lanes.map((_, i) => i + 1)
const SCHEMA = { type: 'object', required: ['verdict', 'method'], properties: { verdict: { type: 'string', enum: ['PASS', 'ISSUES', 'BLOCKED'] },
  sha: { type: 'string' }, method: { type: 'string' }, findings: { type: 'array', items: { type: 'string' } }, artifacts: { type: 'array', items: { type: 'string' } } } }
phase('Fuzz')
const res = await parallel(seeds.map((s, i) => () => {
  const lane = a.lanes[i % a.lanes.length]
  const cmd = a.command.replaceAll('{seed}', String(s)).replaceAll('{lane}', lane)
  return agent(`Read ${W} before anything else.\nYour lane: ${lane} (only local or dev origins; never production).\n` +
    `Run exactly: team-evidence run ${a.key} --kind treatment --claim ${a.claim || 1} --tier ${a.tier || 'V3'} --cwd ${lane} -- ${cmd}\n` +
    `Exit 2 from Bombadil means a property was violated: report ISSUES with the trace path. Do not fix anything.`,
    { label: `seed ${s}`, schema: SCHEMA, effort: 'high' })
}))
return res.map((r, i) => ({ seed: seeds[i], ...(r || { verdict: 'BLOCKED', method: 'no result (respawn once, then a gap)' }) }))
