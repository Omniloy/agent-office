---
name: email-voice-profile
description: Build (or refresh) a voice profile of how the user writes email, from their own sent Gmail. The profile is what email-triaje consumes to draft email that sounds like them.
---

# Email voice profile

Use this when the user asks you to learn how they write email ("learn my voice",
"build my email voice profile", "study my sent mail so you can draft for me") or when
`email-triaje` needs a profile that doesn't exist yet.

**Only with __OWNER__'s explicit go.** Sent mail is private: run this only when __OWNER__ has asked for it or approved a request to build the profile. Use the Google Workspace connector, if connected (`search_gmail_messages` with `in:sent`, `get_gmail_messages_content_batch`); the account is `gmailAccount` in `~/.omniloy-biz/team.json`. Without Gmail there is no profile to build: say so and stop. The profile and corpus stay in `~/.omniloy-biz/voice/` on this Mac; never copy their content into Jira, Slack, reports or memory files.

## 1. Pull the corpus

Retrieve up to 300 of the user's sent messages.
Strip quoted replies and `--`-delimited signatures, drop automated and trivial messages,
and write one JSON line per email to `~/.omniloy-biz/voice/corpus/corpus.jsonl`, tagged `internal` or
`external` by recipient domain. Record corpus stats; if fewer than ~50 usable emails
survive, tell the user the profile will be rough and ask whether to continue.

## 2. Study it

Read a deliberate spread, not just the top of the file: oldest and newest, internal
and external, one-liners and long emails. You are looking for what is _distinctive_:
patterns a generic professional emailer would not share.

Watch for a signature block: only `--`-delimited signatures are stripped, so a plain
signature (name / title / phone) survives at the end of many bodies. Treat a verbatim
recurring trailing block as the signature, not a chosen sign-off, and note it in the
profile as such: drafts take the signature from `~/.omniloy-biz/signature.json` through
the renderer, never from the voice.

## 3. Write the profile

Write `~/.omniloy-biz/voice/email-voice-profile.md` with exactly these sections,
every claim backed by observed frequency ("uses 'Best,' in 80% of external mail"),
with 2 or 3 verbatim example lines each:

- **Language**: the language or languages they write in, and with whom. Everything
  language-specific that drafts must follow (greetings, closing formulas, punctuation
  habits) is recorded here and in the sections below; the drafting skills carry none of it.
- **Register map**: how tone shifts by audience (internal vs external, familiar vs
  cold), and how their length tracks the situation.
- **Openers & sign-offs**: actual greetings and closings with rough frequencies,
  including when they use none.
- **Rhythm**: sentence length, paragraph shape, how they open and end a body, use of
  fragments, lists, links.
- **Vocabulary & phrases**: recurring words, pet phrases, how they hedge, how they say
  yes and no.
- **Punctuation & formatting quirks**: ellipses, casing, emoji, bolding. Whatever the
  corpus shows, drafts never use em dashes or en dashes.
- **Hard rules**: things true of nearly every email ("never opens with 'I hope this
  finds you well'", "always lowercase to teammates").
- **Anti-patterns**: what they never do, plus the generic-AI tells to avoid
  (enthusiastic adjectives, "I'd be happy to", bullet-point answers to plain questions).

## 4. Validate before declaring done

Hold out 3 real threads the profile wasn't built from. For each, draft the user's
reply using only the profile, then compare with what they actually sent. Nothing is
created in Gmail and nothing is sent: the comparison stays in your working files. Where
the real email diverges, tighten the profile: usually a missing hard rule or register
distinction. Record `validated: <date>` at the top of the profile once the drafts read
as plausibly theirs.

Show the user the finished profile and ask what feels wrong; their corrections go in
as hard rules. Re-run this skill any time they want it refreshed: it overwrites the
corpus and profile in place.
