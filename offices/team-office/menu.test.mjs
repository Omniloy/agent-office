import fs from "node:fs";
import assert from 'node:assert/strict';
import { parseMenu as parseFull, menuInstance, maskSecrets } from './menu.mjs';
// The older checks look at the question and the options only; the context has its own checks at the end.
const parseMenu = (screen) => { const m = parseFull(screen); return m && { question: m.question, options: m.options }; };

const claude = parseMenu(`
 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and don't ask again for git commands in /Users/x/repo
   3. No, and tell Claude what to do differently (esc)
`);
assert.deepEqual(claude, {
  question: 'Do you want to proceed?',
  options: [
    '1. Yes',
    "2. Yes, and don't ask again for git commands in /Users/x/repo",
    '3. No, and tell Claude what to do differently (esc)',
  ],
});

const checkbox = parseMenu(`
 ☐ Repo
 Which repo should I use for this card?
 ❯ 1. omniloy-crm
      The CRM app
   2. omniwebsite
   3. Type something.
 ─────
   4. Chat about this
 Enter to select · ↑/↓ to navigate · Esc to cancel
`);
assert.deepEqual(checkbox, {
  question: 'Which repo should I use for this card?',
  options: ['1. omniloy-crm', '2. omniwebsite', '3. Type something.', '4. Chat about this'],
});

const codex = parseMenu(`
 What should I do with this change?
 › 1. Yes, proceed
   2. No, stop here
`);
assert.deepEqual(codex, {
  question: 'What should I do with this change?',
  options: ['1. Yes, proceed', '2. No, stop here'],
});

assert.equal(parseMenu('The agent is idle.\nNothing is waiting.'), null);
console.log('menu parser tests passed');

const withList = parseMenu(`
Here is my plan:
1. Read the card
2. Write the code

 Do you want to proceed?
 ❯ 1. Yes
   2. No
`);
assert.deepEqual(withList, { question: 'Do you want to proceed?', options: ['1. Yes', '2. No'] });
console.log('menu below a numbered list: ok');

const ordinaryList = parseMenu(`
Plan:
1. Do this
2. Do that
`);
assert.equal(ordinaryList, null);
console.log('ordinary numbered list is not a menu: ok');

const tenOptions = parseMenu(`
Which option should I use?
❯ 1. One
  2. Two
  3. Three
  4. Four
  5. Five
  6. Six
  7. Seven
  8. Eight
  9. Nine
  10. Ten
 Enter to select · ↑/↓ to navigate · Esc to cancel
`);
assert.equal(tenOptions, null);
console.log('menus with option 10 stay stuck: ok');

// A real Claude Code permission prompt as `hc read` returns it, with its hint lines and hc's note below.
const real = parseFull(fs.readFileSync(new URL('./fixtures/claude-permission.txt', import.meta.url), 'utf8'));
assert.equal(real.question, 'Do you want to proceed?');
assert.equal(real.options.length, 4);
assert.equal(real.options[3], '4. No');
assert.deepEqual(real.context, ['Bash command', 'Create empty hello.txt file in current directory', 'touch hello.txt']);
assert.equal(real.title, '¿Ejecutar `touch hello.txt`?');
console.log('real Claude permission screen: ok');

const indented = parseMenu(`
Here is my plan:
1. Read the file
2. Run the test
   Do you want to proceed?
 ❯ 1. Yes
   2. No
`);
assert.deepEqual(indented, { question: 'Do you want to proceed?', options: ['1. Yes', '2. No'] });
console.log('indented question after a list: ok');

// ---- what the agent asks: the context above the question, a readable title, secrets masked, ids that tell menus apart
const RULE = '─'.repeat(100), DASH = '╌'.repeat(100);
const claudeBash = (cmd, desc) => [
  ' ▐▛███▜▌   Claude Code v2.1.329', '▝▜█████▛▘  Opus 5.5 · Claude Team', '  ▘▘ ▝▝    ~/repo', '',
  '> Push the fix for SOC-123 to the shared branch', '',
  '⏺ I fixed the null check in parser.ts and the tests pass (42/42). Before I push I need your OK,',
  '  because this pushes to the shared branch release/2.4 that the QA team deploys from.', '',
  `⏺ Bash(${cmd})`, '', RULE, ' Bash command', ' Tip: auto mode handles these prompts for you — choose "switch to auto mode" below', ` ${desc}`, DASH, ` ${cmd}`, DASH,
  ' Do you want to proceed?', ' ❯ 1. Yes', "   2. Yes, and don't ask again for git push commands in /Users/x/repo",
  '   3. No, and tell Claude what to do differently (esc)', '', ' Esc to cancel · Tab to amend',
  '[hc] only its screen: it is blocked; history is not scrolled in this state'].join('\n');
const push = parseFull(claudeBash('git push origin fix/SOC-123:release/2.4', 'Push the parser fix to the shared release branch'));
assert.equal(push.question, 'Do you want to proceed?');
assert.deepEqual(push.context, ['Bash command', 'Push the parser fix to the shared release branch', 'git push origin fix/SOC-123:release/2.4']);
assert.equal(push.command, 'git push origin fix/SOC-123:release/2.4');
assert.equal(push.title, '¿Ejecutar `git push origin fix/SOC-123:release/2.4`?');
assert.equal(push.options.length, 3);
assert.equal(push.said, 'I fixed the null check in parser.ts and the tests pass (42/42). Before I push I need your OK, because this pushes to the shared branch release/2.4 that the QA team deploys from.');
console.log('Claude Bash prompt keeps the command: ok');

const pr = parseFull(claudeBash('gh pr create --base release/2.4 --title "SOC-123 parser null check"', 'Open the pull request'));
const term = { pid: 42, created_ms: 1, address: 't1', turn: 3, status_ms: 1000 };
assert.notEqual(menuInstance(term, push).id, menuInstance(term, pr).id, 'two "Do you want to proceed?" with different commands are two menus');
assert.equal(menuInstance(term, push).id, menuInstance(term, parseFull(claudeBash('git push origin fix/SOC-123:release/2.4', 'Push the parser fix to the shared release branch'))).id);
console.log('the id tells two proceed prompts apart: ok');

const edit = parseFull(`
⏺ Update(src/parser.ts)

${RULE}
 Edit file
 src/parser.ts
${DASH}
 12 -  if (x == null) return;
 12 +  if (x === null || x === undefined) return;
${DASH}
 Do you want to make this edit to parser.ts?
 ❯ 1. Yes
   2. Yes, allow all edits during this session (shift+tab)
   3. No, and tell Claude what to do differently (esc)
`);
assert.equal(edit.title, '¿Editar src/parser.ts?');
assert.equal(edit.file, 'src/parser.ts');
assert.ok(edit.context.includes('12 +  if (x === null || x === undefined) return;'));
console.log('Claude Edit prompt: ok');

const mcp = parseFull(`
${RULE}
 Tool use

   atlassian - createJiraIssue(project: "SOC", summary: "Parser crashes on null") (MCP)
   Create a new Jira issue

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and don't ask again for atlassian - createJiraIssue commands in /Users/x/repo
   3. No, and tell Claude what to do differently (esc)
`);
assert.equal(mcp.title, '¿Usar atlassian · createJiraIssue?');
console.log('Claude MCP prompt: ok');

const codexRun = parseFull(`
• I fixed the parser. Pushing so QA can test it.

  Would you like to run the following command?

  Reason: push the fix so QA can test it

  $ git push origin fix/SOC-123

› 1. Yes, proceed (y)
  2. Yes, and don't ask again for this command (a)
  3. No, and tell Codex what to do differently (esc)

  Press enter to confirm or esc to cancel
`);
assert.equal(codexRun.question, 'Would you like to run the following command?');
assert.deepEqual(codexRun.context, ['Reason: push the fix so QA can test it', '$ git push origin fix/SOC-123']);
assert.equal(codexRun.title, '¿Ejecutar `git push origin fix/SOC-123`?');
assert.equal(codexRun.said, 'I fixed the parser. Pushing so QA can test it.');
console.log('Codex command prompt: ok');

const secret = parseFull(claudeBash('curl -H "Authorization: Bearer abcdef0123456789xyz" https://api.x.io?token=s3cr3tvalue123 -d password=hunter2', 'Call the API'));
const all = JSON.stringify(secret);
for (const bad of ['abcdef0123456789xyz', 's3cr3tvalue123', 'hunter2']) assert.ok(!all.includes(bad), `secret leaked: ${bad}`);
assert.match(secret.title, /^¿Ejecutar `curl /);
assert.equal(maskSecrets('export OPENAI_API_KEY=sk-proj-AbCdEf1234567890'), 'export OPENAI_API_KEY=••••');
assert.equal(maskSecrets('git push origin fix/SOC-123:release/2.4'), 'git push origin fix/SOC-123:release/2.4');
assert.equal(maskSecrets('ghp_A1b2C3d4E5f6G7h8I9j0'), '••••');
assert.equal(maskSecrets('mysql -u root -pS3cret!'), 'mysql -u root -p••••');
console.log('secrets are masked: ok');
