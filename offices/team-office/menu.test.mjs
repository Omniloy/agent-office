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
