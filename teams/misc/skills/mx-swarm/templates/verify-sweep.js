export const meta = {
  name: 'mx-verify-sweep',
  description: 'Miscelaneous floor: one read-only source reader per feature file of a verification kit (mx-maintain-verification-skill source wave)',
  whenToUse: 'args: {kit, repo, sha, features: ["a.md", ...]}',
  phases: [{ title: 'Read', detail: 'one read-only helper per feature file' }],
}
const W = '~/.omniloy-misc/.claude/skills/mx-mode/worker.md'
const SCHEMA = { type: 'object', required: ['feature', 'summary', 'entryPoints', 'drift', 'recipe'], properties: {
  feature: { type: 'string' }, summary: { type: 'string' },
  entryPoints: { type: 'array', items: { type: 'string' } },
  drift: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, source: { type: 'string' } } } },
  recipe: { type: 'string' } } }
const a = args || {}
if (!a.kit || !a.repo || !Array.isArray(a.features)) throw new Error('args: {kit, repo, sha, features: [...]} required')
phase('Read')
const out = await parallel(a.features.map((f, i) => () => agent(
  `Read ${W} before anything else.\nRead-only: do not edit files, do not start the app, do not write anywhere.\n` +
  `Feature file: ${a.kit}/references/features/${f}. Source checkout: ${a.repo} at ${a.sha || 'HEAD'}.\n` +
  `Explain how this user-facing feature works from source. Flag likely drift between the feature file and the source, ` +
  `with the source path and line. Give one live-verification recipe that uses the kit's control CLI commands.`,
  { label: `read ${f}`, schema: SCHEMA, effort: 'low', agentType: 'Explore' })))
const got = out.filter(Boolean)
const missing = a.features.filter(f => !got.some(g => g.feature === f || g.feature.endsWith(f)))
if (missing.length) log(`no result for: ${missing.join(', ')} (respawn once, then record as a gap)`)
return { results: got, missing, table: got.map(g => `| ${g.feature} | ${g.drift.length ? g.drift.length + ' drift' : 'clean'} | ${g.recipe.slice(0, 80)} |`).join('\n') }
