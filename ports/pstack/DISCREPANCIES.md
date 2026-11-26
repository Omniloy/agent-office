# Source check: what we compared and what differed

We were asked to rely on primary sources (her GitHub, her article and her talk) because a pasted copy of her
article might have been altered. This is what we found, checked on 2026-11-25.

1. **"Grok @Bot" and the `x.ai/bot/...` links are genuine.** The raw data of her article "The Complete Guide to
   pstack Pt. 1" (https://x.com/poteto/article/2094457600259842065) has "Grok @Bot" 9 times and links
   `https://x.ai/bot/plugin/9717366` (pstack as a Grok Bot plugin) and `https://x.ai/bot/93gOz3op1UQdBdbekQFLK`
   (Dr Eggbot). "@Bot" is the product's X handle; her bio says she works on Grok Bot. On this point the pasted copy
   matches her article.
2. **The pstack repo never links to x.ai.** It installs from the `cursor/plugins` marketplace. We install nothing
   from x.ai: mstack is built only from the MIT source on GitHub.
3. **Dr Eggbot is in no repo.** Only her paragraph describes it (it can make an engineer bot that runs
   `/create-verification-skill` and sets up a daily `/maintain-verification-skill` routine). `mx-bot-maker`
   rebuilds that described behaviour and says so in its header.
4. **"Gardener"** comes from her post of 2026-08-20 (https://x.com/poteto/status/2090546476464451907) and Pt. 1. The
   word is not in the talk; we credit it to the post.
5. **An error in our own notes, not in her article:** an extracted link list gave the "Loops You Can Trust" id with
   an extra digit (`20698243862833193438`). The real id is `2069824386283319343`
   (https://x.com/poteto/status/2069824386283319343).
6. **PR counts differ across her posts** (2,000, 2,462, 2,500 and 3,000 a month for her; 11,000 for the team). They
   come from different months and sources; this is not tampering. Our docs quote none of them.
7. **Model slugs.** pstack's `claude-opus-5-5-*-fast`, `claude-fable-5-2-high` and `gemini-4-neon-xhigh` are Cursor
   router slugs. Ours are a model plus an effort level, plus a Codex read-only seat as the second vendor.
8. **Talk facts** ("All Code Is Slop (Except Mine)", AI Engineer, https://www.youtube.com/watch?v=O_zcc6Xl12g),
   checked against the transcript: TLA+ for notifications across devices (about 10:50), Lean for a virtualization
   library's flicker (about 11:08), Bombadil caught UI bugs (about 11:48), `/statechart` (about 13:07). The captions
   write TLA+ as "TA plus".
