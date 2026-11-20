# Setting up the agent office: guide for the installing agent

You are an agent (Claude Code, Codex or similar) and a person asked you to set up this repo on their Mac. Follow
this guide from the top. It is written for you, not for them: talk to them in their language, in short plain
sentences, and only about what they need to decide or do.

## Ground rules

1. **Ask, do not assume.** Every item marked **ASK** is the user's decision. Ask the open ones together, early, so
   they are not interrupted ten times. Recommend an option when you have a reason.
2. **Do the work yourself.** The user asked you to set this up: install the programs it needs (Node, Herdr, the
   agent CLIs, Tailscale) and run the sign-in commands yourself, saying in one line what you are installing as you
   go. Hand something to the user only when you cannot do it: a command that needs their Mac password, a sign-in
   that needs their browser or a code on their phone, or a secret. Then give them the exact command to paste in
   their terminal (in Claude Code they can type `! <command>` in the prompt) and continue when they say it is done.
   Downloads over 1 GB (voice) still get a question first.
3. **Secrets are the user's hands only.** Tokens and passwords are typed by the user in their own terminal. You
   never ask them to paste a secret in the chat, and you never print, log or write one to a file.
4. **Do not start the team's agents without a go-ahead.** Each person on a floor is an agent session that spends
   the user's subscription.
5. **Verify each step** with the command given, and tell the user what you verified and what you could not.
   Never say "should work".
6. **Stop on anything surprising**: an existing install you did not expect, a port in use by something else, a
   refusal from a security tool. Say what you found and ask.
7. This package is built for **macOS** (it uses launchd and the Keychain). On Linux or Windows, tell the user it
   is not supported yet and stop, unless they only want a second machine (step 11).

## Step 1. Look, change nothing

Run these and keep the answers:

    uname -sm; sw_vers -productVersion; sysctl -n hw.memsize
    which node npm brew claude codex tailscale hc herdr-app; node --version
    ls -d ~/.omniloy-team ~/.omniloy-biz ~/.omniloy-admin ~/.omniloy-office ~/.config/herdr-app 2>/dev/null
    python3 setup/install.py --check

- If `~/.omniloy-office/install.json` exists, this is an **update**: go to "Updating an existing install".
- If team folders exist but `install.json` does not, stop and ask: someone set this up by hand, and the installer
  will keep their team folders but replace apps, tools and panels.
- Check ports 4317, 4318 and 4340 are free or already ours: `lsof -nP -iTCP:4317 -sTCP:LISTEN` (same for the
  others). If another program holds one, stop and ask.

## Step 2. Ask the decisions

Ask these in one go (use your question tool if you have one). Skip what step 1 already answered.

| # | ASK | Notes for you |
|---|---|---|
| 1 | Their first name as the agents should call them, and the language to answer them in | The id is the first name in lowercase letters (`ana`). It cannot be one of: lucia, daniel, marta, kenji, irene, pablo, elena, zeus. If it clashes, add an initial (`danielr`). |
| 2 | Which agent CLI the team runs on: Claude Code, Codex, or both | Offer only what makes sense from step 1. See "Claude Code, Codex or both" below. |
| 3 | Which floors they want people on from day one: Dev, Business, or both | Both floors are always installed; this only decides who you start in step 8. |
| 4 | Do they use Jira for the dev work? | If yes: site URL, their Atlassian email, and for each project a name, the Jira project key and the GitHub repos (`org/repo`). If no: cards live locally and Jira steps are skipped. |
| 5 | Business floor: which Gmail account should it triage, and how often? | Only if they want the Business floor now. It needs the Gmail connector in their agent CLI. Default rounds: every 2 hours, 08:00 to 20:00, Monday to Friday. Goes in `gmailAccount` and `mailRound` in the config. No rounds wanted: leave `mailRound` out. |
| 6 | Do they want the office on their phone? | Needs Tailscale (free for personal use; a company network needs an invite from its admin). |
| 7 | Do they want to talk to the office by voice? | Local transcription. On Apple Silicon with 16 GB it downloads about 2 GB. |
| 8 | Is there another computer (a server, a second Mac) whose terminals they want inside Herdr? | Needs ssh access to it already working. If that computer has its own agent office, the two can also show up to each other as buildings (step 11). |

### Claude Code, Codex or both

- **Only Claude Code installed or wanted**: everyone runs on `claude`.
- **Only Codex**: everyone runs on `codex`. Tell the user one difference: the office chat shows a Codex agent's
  screen text instead of its message log. Email rounds work the same on both (step 8).
- **Both**: recommend Claude Code for Lucía, Daniel, Marta, Irene, Pablo, Elena and Zeus, and Codex for Kenji, then
  ask if they want a different split. Put the exceptions in `assign` in the config.
- **Neither installed**: ask which they have a subscription for, and install it in step 3.
- If the user has the Claude in Chrome extension, after the install add `"--chrome"` right after `"claude"` in
  `runtimes.claude.argv` of each `team.json`: Marta verifies in the browser with it.

## Step 3. Install what is missing

Install these yourself, in this order, and verify each. Only stop for the user where a line says so.

1. **Homebrew** (only if you need it for Node or Tailscale and it is missing): the official command from
   https://brew.sh. It asks for the Mac password, which you cannot type: give the user the command to paste.
   If they would rather not install Homebrew, install Node from the official installer package or with nvm instead.
2. **Node 20 or newer**: `brew install node`. Verify: `node --version`.
3. **Herdr**: `curl -fsSL https://releases.herdr.dev/app/install.sh | sh`, then open it once (`open -a Herdr`) so
   it writes `~/.config/herdr-app` and installs its core. Verify: `hc ls` answers (if `hc` is not found, the
   installer in step 4 links it; rerun this check after).
4. **Agent CLI(s)** chosen in ASK 2, if missing. Use the vendor's current official instructions; at the time of
   writing: Claude Code `curl -fsSL https://claude.ai/install.sh | bash`, Codex `npm install -g @openai/codex`.
   **Sign in**: check first whether it is already signed in (`claude auth status` or a quick
   `claude -p "say ok"`; `codex login status`). If not, start the sign-in yourself (`claude auth login`,
   `codex login`): it opens the browser and the user only has to approve there. If your environment cannot open
   a browser or the command needs an interactive screen you do not have, give the user the one command to paste
   in their terminal. The same goes for `gh auth login` if the dev floor will work with GitHub and `gh auth status`
   says it is not signed in. Verify each sign-in with its status command before moving on.
5. Make sure `~/.local/bin` is on PATH for new shells: if `echo $PATH` lacks it, add
   `export PATH="$HOME/.local/bin:$PATH"` to `~/.zshrc` (tell the user you did).

## Step 4. Write the config and run the installer

Copy `setup/office.config.example.json` to `office.config.json` in the repo root (it is git-ignored) and fill it
from the answers. Leave out what does not apply: no Jira means no `jira` key and `"projects": []`; no phone means
no `tailscale` key (you add it in step 9). `runtimes` lists only the CLIs that are installed.

    python3 setup/install.py --config office.config.json --dry-run    # read what it would do
    python3 setup/install.py --config office.config.json
    python3 setup/install.py --check

Read the `NOTE:` lines the installer prints and act on them. The check will still say NO for the floors answering
until step 6; everything above that should be ok.

What the installer did (so you can tell the user): apps in `~/.omniloy-office`, tools in `~/.local/bin`, the three
team folders, role instructions in `~/.claude/agents`, skills, Herdr panels and layout, and two background
services (`com.omniloy.artifacts`, and `com.omniloy.office-up` which runs `office-up` at login: it starts the floors and the watchdog, and brings back the
people who were running when the Mac went down, each in their own previous conversation, so they pick up where they were).

## Step 5. Herdr layout

    herdr-app do layout.switch --name omniloy

The window gets a tab bar with Requests, Drafts, PRs, Board, Trace and Limits on the right. If the command is
refused, tell the user to pick the "omniloy" layout from Herdr's layout menu. The team spaces ("Dev Team",
"Business Team", "Olimpo") are created by the launchers in step 8; do not create them by hand.

## Step 6. Start the floors

    office-restart all
    office-restart status
    python3 setup/install.py --check

Open http://127.0.0.1:4317 (Dev) and http://127.0.0.1:4318 (Business) for the user (`open <url>`). Everyone shows
as offline until step 8: that is expected.

## Step 7. Jira (only if ASK 4 was yes)

1. The user creates an API token at https://id.atlassian.com/manage-profile/security/api-tokens.
2. The user stores it in the Keychain **in their own terminal** (it prompts for the token, nothing is echoed):

       security add-generic-password -s herdr-jira -a <their Atlassian email> -w

3. Verify without printing anything secret: `team-jira search "project = <KEY> ORDER BY updated DESC" 3`.
4. Board ids (`productBoard`, `devBoard`) in `~/.omniloy-team/team.json` are optional; leave them `null` unless the
   user wants the two-board flow described in the Dev protocol. Tell them Lucía can fill them in later.

If the search fails with 401, the email or token is wrong: ask the user to repeat step 2. Never ask for the token.

## Step 8. Start the people (go-ahead required)

Tell the user what will start and that each is an agent session, then, for what they chose in ASK 3:

    omniloy-admin start        # Zeus, the superadmin: recommended always
    omniloy-team start         # Dev floor: lucia daniel marta kenji   (or name some: omniloy-team start lucia daniel)
    omniloy-biz start          # Business floor: irene pablo elena

Verify: `omniloy-team ls` shows them running, Herdr shows the new spaces, and the office shows them at their desks
within a few seconds. Each agent reads its protocol and reports a short status; nobody changes code or tickets
until the user gives a task.

**Business floor needs connectors.** Before starting it, check that the agent CLI has Gmail connected (and
optionally Calendar and Slack): for Claude Code, `claude mcp list` or the connectors the user enabled in their
Claude account. If Gmail is missing, connect it if you can, otherwise tell the user where to enable it. Without
Gmail there is nothing to triage: say so and leave the floor installed but not started.

**Email rounds.** With `mailRound` in the config, the installer added a background job (`com.omniloy.mail-round`)
that tells Irene when a round is due: every N hours, inside the working hours, only while she is running and not
in the middle of something. It works the same on Claude Code and Codex. After starting the Business floor:

    team-mail-round --status      # the schedule and when the next round is due
    team-mail-round --now         # optional: ask for a round right now to see it work

Irene does the first round herself when she starts. Each round triages unread mail, marks as read only what needs
nothing from the user, and leaves drafts for what needs an answer; it never sends. Tell the user where the results
appear: "For you" in the office for questions, and the Drafts panel for prepared answers. To change the schedule
later, edit `mailRound` in `~/.omniloy-biz/team.json` (no restart needed); remove it to stop the rounds. Drafting in the user's voice needs a voice profile built from their sent mail
(the `email-voice-profile` skill): Irene asks for that consent herself. `~/.omniloy-biz/signature.json` holds the
signature the drafts end with: fill name, title and links with the user.

## Step 9. Phone (only if ASK 6 was yes)

1. **Tailscale on the Mac**: `brew install --cask tailscale` or the Mac App Store. The user opens it and signs in;
   to join a company network they accept the admin's invite. Verify: `tailscale status` (the CLI may be
   `/Applications/Tailscale.app/Contents/MacOS/Tailscale`).
2. HTTPS must be enabled for the tailnet (admin console: DNS > MagicDNS on, HTTPS certificates on). If
   `tailscale serve` complains, this is why; on a company network only the admin can switch it on.
3. Open the doors, one per port (the servers keep listening on 127.0.0.1 only):

       tailscale serve --bg --https=4317 http://127.0.0.1:4317
       tailscale serve --bg --https=4318 http://127.0.0.1:4318
       tailscale serve --bg --https=4340 http://127.0.0.1:4340

4. Who may come in: write `~/.omniloy-team/remote.json` as
   `{"host": "<this Mac's name>.<tailnet>.ts.net", "logins": ["<the user's Tailscale login>"]}`.
   Host: `tailscale status --json` (field `Self.DNSName`, without the final dot). Login: the account they signed in
   with. Add it to `office.config.json` under `tailscale` too, so updates keep it. Then `office-restart all` and
   `launchctl kickstart -k gui/$(id -u)/com.omniloy.artifacts`.
5. **On the phone**: install Tailscale, sign in with the same account, open `https://<host>:4317/` in Safari,
   Share > Add to Home Screen, open it from the new icon, and in More switch notifications on.
6. Verify from the Mac: `curl -s -o /dev/null -w "%{http_code}" https://<host>:4317/` gives 200. You cannot test the
   phone itself: ask the user to confirm it opens.

Never widen the door: no `tailscale funnel`, no listening on 0.0.0.0, no extra logins the user did not name.

## Step 10. Voice (only if ASK 7 was yes)

Follow `~/.omniloy-office/team-office/voice/SETUP.md` on this Mac. It picks the engine from the hardware (Apple
Silicon with 16 GB: Qwen3-ASR through mlx; weaker machines: Whisper on CPU), installs it as a background service
on 127.0.0.1:4330 and tests it. Say the download size before starting. When `install.py --check` shows the voice
line ok, tell the user to open More > Voice in the office and switch the Speak button on for that device.

## Step 11. Another computer in Herdr (only if ASK 8 was yes)

1. The machine must be a named host in `~/.ssh/config` that the user can already reach with `ssh <name>`
   without a password prompt. If it is not, help them add the `Host` entry; creating keys or accounts on the
   server is their call.
2. `hc machine add <name>`, then `hc machine ls`. If it says the machine needs a login, the user runs
   `hc machine login <name>` in their terminal. Herdr installs its core on that machine.
3. In Herdr, a new space can now be created on that machine (New space, pick the machine). Its terminals keep
   running there when the Mac sleeps.
4. The office teams themselves run on the Mac where this repo is installed. Agents started in a space on the
   other machine are ordinary Herdr agents: they appear in Herdr, not at a desk in the office.

### Two offices as two buildings

If the other computer runs its own agent office (this repo installed there too), the two show up to each other as
**buildings**: zoom out past the building view to the city, tap the other building, and visit its floors as a guest.
A guest sees the room but no screens, chats or cards, and can write only to that floor's lead: the message becomes
a request there and the answer comes back. Agents of the two buildings can talk the same way once both owners agree.

1. Both computers have the office installed and their floors running, and step 11 above is done on the computer
   that links (machine added in Herdr, `ssh <name>` works without a prompt). Nothing else is opened: every floor
   has a guest listener on its port + 1000 on 127.0.0.1 only, and the link is ssh tunnels between those.
2. Give each building a name, on each computer: `team-peer me --name "Ana's office" --owner Ana`.
3. The link itself is `com.omniloy.peer-link`, installed by `install.py` (it runs
   `~/.omniloy-office/team-office/peer-link.mjs`, log `~/.omniloy-team/logs/peer-link.log`). It looks at Herdr's
   connected machines every 30 seconds and links to each one that has an office. Only the computer whose Herdr
   lists the other machine needs it; the link works in both directions.
4. Verify: `team-peer ls` on both sides names the other building and its floors, and the log says `linked to
   <machine>`. In the office, the city view shows the other building.
5. Connecting agents is the two owners' decision (**ASK**), never yours: one side presses Connect in the
   Connections screen (under More on the phone, in the top bar on a computer) or runs `team-peer request <building>`;
   the other side gets a request in the office and accepts (`team-peer accept <building>`). After that:
   - `team-peer pause <building>` / `resume` stops and restarts the exchange without disconnecting;
   - `team-peer disconnect <building>` ends it;
   - `team-peer floor <building> <your floor port> on|off share|noshare` decides, per floor of yours, whether its
     agents may talk with that building and whether its open requests are shown to (and answerable by) a visitor
     from it. The same switches are in the Connections screen.
6. Phone: with step 9 done, each foreign floor's door (ports from 7100 up, printed in the log) is also served
   through Tailscale with the same `remote.json` check as the offices.

The installer and its services are for macOS. On a Linux computer the same files work, but you place them and keep
them running yourself: the floors (`PORT=4317 node server.mjs` in the app folder) under a service, and, only if
that computer is the one whose Herdr lists the other machine, `node peer-link.mjs` too, for example as a systemd
user unit with `ExecStart=<node> %h/.omniloy-office/team-office/peer-link.mjs`, `Restart=always` and
`~/.local/bin` on its `PATH`. A computer whose floors are not the default two lists them in
`~/.omniloy-team/floors.json`: `[{ "name": "Dev", "port": 4317, "dir": ".omniloy-team" }]`.

## Step 12. Hand over

Run `python3 setup/install.py --check` one last time and give the user a short summary:

- what is installed and running, with the addresses (Dev http://127.0.0.1:4317, Business http://127.0.0.1:4318,
  and the phone address if set up);
- who is started and on which CLI;
- what you could not verify (always: the real phone, and whether agents are signed in to their connectors);
- what is left for them: any sign-in, the Jira token, the signature, the voice switch;
- that from now on they ask **Zeus** (More > Zeus in the office, or the figure above the building) for changes to
  the office: new people, new floors, how things look and work.

## Updating an existing install

    git pull
    python3 setup/install.py --config ~/.omniloy-office/install.json --dry-run
    python3 setup/install.py --config ~/.omniloy-office/install.json
    office-restart all

Team folders are never overwritten. If the installer says a `PROTOCOL.md.new` or `HANDBOOK.md.new` was left next
to the user's file, show the user what changed and merge it only with their yes. The protocol sections that follow
the repo are never changed without a yes either: the installer asks when run in a terminal, otherwise it leaves
`PROTOCOL.md.proposed` next to the file (show the user the diff; `--protocol-sections` applies them).
Every file it replaces is copied first to `~/.omniloy-office/backups/<date>/` (same path under the home folder).
A live file that was edited by hand since the last install is not replaced: the run ends with exit code 1, the
list, and a diff of each in that backups folder. Bring the edits worth keeping into the repo, then rerun; `--force`
replaces them anyway (after the backup). The first update with this check counts every differing file as edited.
npm dependencies are installed again when an app's `package.json` or `package-lock.json` changed.
People who are running keep their old instructions until their next session.

## When something goes wrong

| What you see | What to do |
|---|---|
| `office-restart` says a floor DID NOT COME BACK | Run it by hand to read the error: `cd ~/.omniloy-office/team-office && PORT=4317 node server.mjs`. Usual causes: Node older than 20, `npm install` did not run (no `node_modules`), the port is taken. |
| After a reboot or a crash a floor is down, the watchdog stopped, or people sit at a plain shell | `office-up` (safe to run any time; `office-up --dry` shows what it would do). It runs by itself at login once Herdr answers. If a fresh shift was started after the crash, `office-up --before <time of the crash>` after stopping them resumes the conversation from before it. |
| The office says "Herdr is not answering" | The Herdr app is closed or `hc` is not on PATH for the server. Open Herdr; check `hc ls`; `office-restart all`. |
| Everyone is offline after `omniloy-team start` | `omniloy-team ls`. A FAILED line shows the CLI's error: not signed in, or the CLI is not on PATH inside Herdr. |
| `team-jira` says Jira is not set up | Expected without Jira. With Jira: `jira.site` and `jira.email` in `~/.omniloy-team/team.json`, then step 7. |
| Owner id clashes with a persona | Pick another id in the config and rerun the installer before anything is started. |
| The user's name was installed wrong | Fix `owner` in the config, delete nothing, rerun the installer: tools, apps and role files are rewritten. The three `PROTOCOL.md` and `team.json` files are kept, so edit the name in those by hand. |
| An Intel Mac or 8 GB of memory | Everything works except the preferred voice engine; the voice guide picks a lighter one. |
| `team-peer ls` says "No other buildings found" | The other machine must be `connected` in `hc machine ls` and have `~/.omniloy-team/building.json` (written when its floors start). Read `~/.omniloy-team/logs/peer-link.log`; `ssh <name>` must work without a prompt. |
| A security tool blocks a command | Do not work around it. Tell the user what was blocked. |
