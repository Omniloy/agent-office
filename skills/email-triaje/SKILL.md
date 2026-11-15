---
name: email-triaje
description: "Triage of __OWNER__'s inbox and commercial follow-up: marks as read what does not need their action, says what needs an answer and why, and leaves drafts in their voice hanging from the thread, never sending. Use it for: check my email, email triage, what needs an answer, prepare the follow-up for X, write a draft for Y, email round every 2h."
---

# Inbox triage and commercial follow-up (__OWNER__)

Tested procedure for: "check my email and mark as read whatever does not need my action",
"tell me what needs an answer", "prepare the follow-up for X", "write a draft for Y".

In this team email is handled with the tools of the **Google Workspace** connector, if
connected (the account is `gmailAccount` in `~/.omniloy-biz/team.json`):
`search_gmail_messages`, `get_gmail_thread_content`, `get_gmail_messages_content_batch`,
`batch_modify_gmail_message_labels`, `draft_gmail_message`, `get_events`. Load them with
ToolSearch. Working folder: `~/.omniloy-biz/`.
**Never use `send_gmail_message`.** If you do not have the connector, say so and stop:
without Gmail there is nothing to triage, and __OWNER__ must be told.

## 0. Before anything else

- **Voice profile**: `~/.omniloy-biz/voice/email-voice-profile.md` must exist. If it does
  not, draft nothing: open a request to __OWNER__
  (`team-ask request --from <you> --to __OWNER_ID__`) to authorise building it with the
  `email-voice-profile` skill (it reads their sent mail), and meanwhile do only triage and
  the pending list. Never improvise their voice.
- **__OWNER__'s fixed rules**: answer in __LANGUAGE__; **every email written in their name
  is drafted with the voice profile, without exception, including internal ones and
  one-liners**; every email carries their signature at the end (see section 3); **never use
  an em dash or an en dash**; drafts are created but **never sent** unless they ask. Do not
  add anyone in copy on your own initiative: keep whoever was already on the thread
  (`reply_all`) and add someone only if __OWNER__ asks for it at that moment.

## 1. Triage of unread mail

Download the metadata of all unread messages to a working file
(`~/.omniloy-biz/drafts/unread.json`, not to memory): page through
`search_gmail_messages(query="is:unread", page_size=100, include_headers=true)` until
`next_page_token` runs out; keep id, threadId, from, subject, date, labels.

Classify each one into a `kind` and act:

| kind | criterion | action |
|---|---|---|
| list/newsletter | `List-Id` header or unsubscribe footer | read |
| auto-reply | subject starts with "Automatic reply", "Out of office" or the equivalent in __LANGUAGE__ | read, **but read the body**: return dates change the plan (see section 4) |
| calendar | subject starts with Accepted/Declined/Invitation/Updated invitation/Cancelled/Appointment booked, or the equivalent in __LANGUAGE__ | read |
| jira | subject contains `[JIRA]` | read |
| cold outreach | unknown sender selling something | read |
| app/notification | vendor domain, `no-reply@`, `noreply@`, `notify`, `billing`, `invoice`, `support@`, or an invoice/receipt subject | read |
| person | everything else | **do not touch yet** |

Mark in bulk with `batch_modify_gmail_message_labels(message_ids=[...], remove_label_ids=["UNREAD"])`.

Group the `person` ones by `threadId` and **read the whole thread** (`get_gmail_thread_content`).
Also mark as read the threads where: __OWNER__ is only in CC and the matter is already
resolved or someone else is handling it (billing a colleague runs, threads a colleague closed
with a thank-you), or the last message is a forward for reference with no question. Never
mark as read an email where someone asks __OWNER__ something directly. When in doubt, do
not mark it.

Always close by confirming how many remain unread: count the real ids of a paged
`is:unread` search; Gmail's estimates lie.

## 2. What needs an answer

For each surviving thread, before claiming it needs an answer: read the whole thread and
look at who wrote the last message. If it is __OWNER__'s, nobody is waiting on them, unless
it has gone weeks without a reply, in which case what is due is a follow-up, not an answer.

Research the best answer before listing, not after: search Gmail for context (earlier
quotes, who decided what and when), cross-check with the calendar if connected, and find
contradictions (for example, someone already turned down by email who keeps receiving the
next step of the process). That is the value added over a list of subjects.

Deliver **short bullets**, one per matter: who is waiting for what, since when, and the
concrete recommended action with the fact that justifies it. No filler.

## 3. Writing the drafts

1. Body in a text file at `~/.omniloy-biz/drafts/<client>.txt`, one paragraph per line,
   blank line between paragraphs, no HTML.
2. Apply the voice profile, always: its openers, its short sentences, the way it reopens
   stalled threads, a close with a concrete action and its sign-off. Anything specific to
   __LANGUAGE__ (greetings, closing formulas, punctuation habits) comes from the voice
   profile, not from this skill. No empty courtesies or enthusiastic adjectives. If
   something does not fit the profile, reread the profile first; do not improvise a tone.
3. **The long dash is forbidden.** Neither an em dash nor an en dash, in any email and in
   any position: not for asides, not for bullets, not to explain a figure. Always replace
   it with a comma, a colon, parentheses or a new sentence. In bullets, use "-" at the start
   of the line and a colon to explain the fact ("Supplier name: city, certified since 2019").
4. **Always close with their signature**, after the sign-off and a blank line: exactly the
   three plain-text lines defined in `~/.omniloy-biz/signature.json` (name, title, and one
   line with the links as `Label: url` separated by a space). If the lines are missing or
   differ, the renderer in step 5 prints the exact lines it expects.
5. **Run the file through the renderer**, which is the safety net for points 3 and 4:

   ```bash
   python3 ~/.claude/skills/email-triaje/scripts/render_draft.py ~/.omniloy-biz/drafts/<client>.txt
   ```

   If it aborts (a long dash, HTML in the body, or a missing signature), fix the file and
   repeat. If it passes, it prints the HTML with the real signature (name in bold and short
   links, no URLs in sight). `--allow-em-dash` exists only for quoted third-party text; do
   not use it for your own prose.
6. Create the draft **hanging from the original thread**, not as a new email, with the HTML as is:
   `draft_gmail_message(thread_id=<thread>, reply_all=true, body=<HTML>, body_format="html",
   include_signature=false)`. `include_signature=false` is mandatory: the signature is
   already in the body and with `true` it would come out twice if __OWNER__ has a signature
   in Gmail. Use `to=` only when the real recipient is not whoever wrote the last message,
   and `cc=` only if __OWNER__ asked for it.
7. **Register it in the drafts list** so __OWNER__ sees it, edits it and opens it from the office:
   `team-draft add --from <you> --channel gmail --to "<To>" --cc "<CC>" --subject "<subject>" --body-file ~/.omniloy-biz/drafts/<client>.txt --thread <thread> --draft-id <id of the draft> --client <id> --why "<why, and why now>"`.
   If they edit it or send it from the panel, the app updates or sends the Gmail draft directly: you only get a notice, do not create another draft. The signature comes from `~/.omniloy-biz/signature.json` and in this app's emails the links are separated by a space, **with no vertical bar**.
8. **Verify the recipients** by reading the draft you created: To, CC and subject. If you got
   it wrong, create the right one and tell __OWNER__ about the leftover draft so they delete
   it (there is no tool to delete drafts).
9. Show the full text and say what you left out on purpose and why.

## 4. Checks that avoid embarrassment

- **Holidays**: follow-ups sent in holiday periods bring auto-replies. Read them and adjust
  expectations: if the other person is back on a given date, there will be no answer before
  it and what is due is a phone call or waiting. Say so explicitly in the summary.
- **Time slots**: any slot you propose, cross-check it first with the calendar, if connected
  (`get_events` for the period, paging to the end: a single page is not exhaustive). If the
  calendar is not connected, propose no slot and say why.
- **"Did they write through another channel?"**: before claiming silence, search the other
  person's domain, `in:spam`, `in:drafts`, and the calendar events and "Appointment booked"
  messages of the period. Only Gmail and Calendar can be inspected; WhatsApp and phone
  cannot: say so.
- **Old drafts**: search `in:drafts`. There is often an unsent draft from weeks ago that
  answers exactly what is being asked. Look for it before writing a new one.

## 5. When you finish

Give the number of emails cleaned per category, the list of what is pending, and where the
drafts are (in Gmail, unsent). Keep only pointers in memory (where the voice profile lives,
new preferences), never the content of the emails.
