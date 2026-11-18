import fs from "node:fs";
import assert from 'node:assert/strict';
import { parseMenu } from './menu.mjs';

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
const real = parseMenu(fs.readFileSync(new URL('./fixtures/claude-permission.txt', import.meta.url), 'utf8'));
assert.equal(real.question, 'Do you want to proceed?');
assert.equal(real.options.length, 4);
assert.equal(real.options[3], '4. No');
console.log('real Claude permission screen: ok');
