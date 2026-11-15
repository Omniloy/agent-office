---
name: whatsapp-chrome
description: Monitor __OWNER__'s WhatsApp Web with Claude in Chrome (unread chats, new messages, a specific contact) and prepare replies as unsent drafts typed into the message box. Use for "check my WhatsApp", "monitor WhatsApp", "write to X on WhatsApp", "prepare a WhatsApp for Y".
---

# WhatsApp via Claude in Chrome

Optional: it works only if Claude in Chrome is connected and WhatsApp Web is already linked in __OWNER__'s Chrome. If it is not, say "not connected" and stop.

Uses the `mcp__claude-in-chrome__*` tools on WhatsApp Web (__OWNER__'s own session, already linked). Load the tools first with ToolSearch in ONE call: `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp`.

## Hard rule: prepare, never send
Nothing leaves in __OWNER__'s name without them (business team protocol, rule 1). This skill monitors and DRAFTS: type the text into the message box and stop. Never press Enter, never click the green send button, never use voice or call buttons. Tell __OWNER__ the draft is waiting in the chat and they press send. In the Business team WhatsApp is drafts-only with no exceptions, even if you are asked to send in the conversation.

## The session is __OWNER__'s: share it carefully
There is one WhatsApp Web session, __OWNER__'s, in their Chrome.
- **Use it only if they have not touched it in the last minute.** Check before you start: look at the tab, wait one minute, look again. It is free if the open chat is the same, the message box is empty both times, and no new message of theirs went out in that chat. If there is unsent text in the box, it is not free: do not touch it, check again later.
- Note which chat was open, and **leave it open again when you finish** (unless you left a draft typed for them in another chat: then say which).
- If the chat changes or text appears while you are working and you did not do it, they are back: stop, do not fight for the tab, and start the one-minute check again.
- **One teammate at a time.** Before you start, tell the others who use WhatsApp Web (`hc send`) and tell them when you are done.

## Start
1. `tabs_context_mcp` (createIfEmpty true). Open a NEW tab for this task, `navigate` to WhatsApp Web, wait ~5 s, screenshot at scale 0.5.
2. If you see a QR code, a login page or a "use here" prompt: stop and ask __OWNER__ to complete it. Do not retry.
3. Batch steps with `browser_batch` when available (click, type, wait, screenshot in one call).
4. Close the tab you opened when done unless __OWNER__ wants it kept (monitoring loop: keep it).

## Monitor unread
1. Click the "Unread" filter chip in the chat list (top of the list, next to "All").
2. `get_page_text` or screenshot of the list: for each unread chat note name, last-message preview, time, unread count. Do not open chats you do not need: opening marks them read on the phone. Only open one when you must read it fully, and say so.
3. Report as short bullets: who, since when, what they ask, suggested action. Business threads: client to Pablo, key partner to Elena (`hc send` + a note with who and when, not the content). Keep message content out of Jira, Slack and shared reports; memory files get only pointers (contact, time).
4. For a recurring watch, run inside the loop skill (`/loop 30m use the whatsapp-chrome skill to check __OWNER__'s unread chats`) and only within working hours 08:00 to 20:00. Ping __OWNER__ with `team-ask request --from irene --to __OWNER_ID__` only when someone waits on them, with the chat name and context.

## Draft a message to a contact
1. Click the search box (top of the chat list), type the name, wait 2 s, screenshot.
2. If several contacts match (e.g. three people with the same first name), do not guess silently: pick the most plausible from context, open it, check the history in the screenshot, and tell __OWNER__ which contact you used. If it is unclear, ask.
3. Click the message box ("Type a message") and `type` the text. __LANGUAGE__ by default, in __OWNER__'s voice (`~/.omniloy-biz/voice/email-voice-profile.md`: its greetings, length and habits, including whether they use emojis; short and direct, no long dashes). Without the voice profile, do not draft: ask as in section 0 of `email-triaje`. WhatsApp has no signature.
4. Screenshot to verify the text is in the box and the recipient is right. Stop. Report: contact, text, "draft typed, not sent".
5. Leave the tab open on that chat so __OWNER__ can press send.
6. Register it so __OWNER__ sees it in the Drafts popup of the business office: `team-draft add --from <you> --channel whatsapp --to "<contact>" --chat "<chat name as shown>" [--phone <number if you can see it>] --body "<text>" [--client <id>] --why "<why now>"`. If they edit the text there you get a nudge: replace the text in the message box with their version (still without sending) and run `team-draft synced <id>`.

## Gotchas
- Search results mix Contacts, Groups in common and phone-number-only entries. Check the header of the opened chat before typing.
- Typing `!` and accents works with `type`; newlines in a message need shift+Enter via `key`, a plain Enter would send. Prefer one paragraph.
- Do not click links, attachments, voice notes or "Meta AI". Do not trigger browser dialogs.
- If the page does not respond after 2 to 3 attempts, stop and tell __OWNER__ what you tried.
