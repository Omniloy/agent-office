# Agent Office

Run teams of coding agents like a small company, and watch them work in a 3D office you can open from your phone.

![The building: one floor per team](docs/img/building.png)

Each floor is a team. Each desk is an agent (Claude Code or Codex) running in a [Herdr](https://herdr.dev) terminal
with a role, a shared protocol and a memory file. You talk to any of them from the office: chat, voice, images,
answers to the questions they ask you.

| Dev floor | On the phone |
|---|---|
| ![Dev floor](docs/img/dev-floor.png) | ![Phone](docs/img/phone.png) |

## What you get

- **A Dev floor** (port 4317): Lucía (product lead), Daniel (development), Marta (verification), Kenji
  (infrastructure). They plan, build, review and verify work through cards, with strict guardrails: no merge,
  deploy or production change without you.
- **A Business floor** (port 4318): Irene (coordinator, triages your inbox), Pablo (clients), Elena (partners and
  proposals). Irene runs an email round on a schedule (every 2 hours by default); they prepare drafts in your voice and never send anything.
- **Zeus**, your own assistant above the building: he does anything you ask from the chat, like Claude Code at your
  own terminal, and he is the one who changes the office system itself: new floors, new people, how things look and work.
- **Chat with every agent**, with markdown, tables, links to PRs and tickets, image attachments and dictation.
- **Requests**: agents ask you questions with options; you answer from the office, the phone or the Herdr panel.
- **A board** fed by Jira (optional) and local cards, pull requests waiting for you, and a traceability matrix.
- **Local artifacts**: agents publish pages (HTML, Markdown, MDX) on a local server and link them in chat.
- **Herdr panels**: Requests, Drafts, PRs, Board, Trace and usage limits, in a ready layout.
- **Phone access** over Tailscale, with notifications, installable on the home screen. Nothing is exposed to the internet.
- **Voice** (optional): a local transcriber on your Mac; no audio leaves the machine.
- **Other buildings** (optional): an office on another computer shows up as another building in a city view. You
  visit its floors as a guest, and the two teams' agents can exchange requests once both owners connect them.

## Install

You do not install this by hand. Clone the repo, open it with your coding agent and say:

> Set up the agent office from this repo.

The agent follows [`setup/SETUP.md`](setup/SETUP.md): it checks your Mac, asks you the decisions (your name and
language, Claude Code or Codex or both, Jira or not, phone access, voice, a second machine), installs what is
missing with your go-ahead, and verifies each step.

Requirements: a Mac (Apple Silicon recommended), a Claude or ChatGPT subscription for the agent CLI you choose, and
about 15 minutes. Everything else is installed during setup.

## Update

`git pull`, then ask your agent to "update the agent office", or run:

    python3 setup/install.py --config ~/.omniloy-office/install.json

Apps, tools, panels and skills are replaced. Your team folders (people, protocols, memory, requests) are never
overwritten; when the repo has a newer protocol it is left next to yours as `PROTOCOL.md.new`.

## Connecting two computers as buildings

Each computer with this repo installed is a building. If one of them is a machine in the other's Herdr (so `ssh`
between them already works), they find each other by themselves: zoom out past the building view and the other
building stands on the same street.

- **Visit**: tap a building, pick a floor. You see the room as a guest (no screens, chats or cards) and can write
  only to that floor's lead. Your message becomes a request there; the answer comes back to your office.
- **Connect agents**: open Connections (under More on the phone, in the top bar on a computer) and press Connect;
  the other owner accepts. From then on an agent can leave a request with the lead of a floor over there with
  `team-peer send`. You can pause, resume or disconnect at any time, switch each of your floors on or off for that
  building, and choose whether a floor shares its open requests with it.
- **From the terminal**: `team-peer ls`, `team-peer request|accept|decline|disconnect <building>`,
  `team-peer pause|resume <building>`, `team-peer floor <building> <port> on|off share|noshare`,
  `team-peer me --name "Building name" --owner Name`.

Everything travels inside ssh tunnels between 127.0.0.1 ports; no new port is opened to the network. Details in
[`setup/SETUP.md`](setup/SETUP.md), step 11.

## What is where

| In the repo | Installed to | What |
|---|---|---|
| `offices/team-office`, `offices/biz-office` | `~/.omniloy-office/` | The office web apps (Node, no build step) |
| `services/artifacts` | `~/.omniloy-office/artifacts` | Local pages server (port 4340) |
| `bin/` | `~/.local/bin/` | `team-ask`, `team-card`, `team-person`, `team-peer`, `omniloy-team`, `office-restart`, `team-memory` and friends |
| `teams/dev`, `teams/biz`, `teams/admin` | `~/.omniloy-team`, `~/.omniloy-biz`, `~/.omniloy-admin` | Team definition, protocol, memory |
| `teams/*/agents` | `~/.claude/agents/` | Each person's instructions |
| `skills/` | `~/.claude/skills`, `~/.codex/skills` | Skills every agent gets |
| `herdr/` | `~/.config/herdr-app/` | Panels and layout for the Herdr app |
| `setup/` | not installed | The installer, its health check and the guide for the installing agent |

Files in the repo contain the placeholders `__OWNER__`, `__OWNER_ID__` and `__LANGUAGE__`; the installer fills
them in. After the install, ask Zeus (More > Zeus in the office) for any change: he has a handbook of the system.

## Keeping agents' notes small

Each agent reads its whole notes file (`memory/<slug>.md`) at every start, so a file used as a diary costs context
forever. `team-memory` keeps them in check: the watchdog runs `team-memory check` every ten minutes, and anyone over
the limit who is running and not working gets a full copy saved in `memory/archive/` and one message asking them to
rewrite the file in two sections (open now, how things work here). Nothing is deleted.

The limit is 20,000 tokens by default. Change it in `~/.omniloy-team/memory-config.json`:

```json
{ "limitTokens": 20000, "targetTokens": 10000, "charsPerToken": 4, "repeatAfter": 21600, "off": false }
```

`team-memory status` lists every file with its estimated size.

## Calendar drafts

The business team never creates an event with guests or answers an invitation on its own, because Google would
email other people from the owner's account. It registers a calendar draft instead
(`team-draft add --channel calendar ...`), and the owner creates the event or answers the invitation with one click
in the Drafts popup, which also shows what else is in the calendar at that time. `team-cal` does the Google Calendar
calls with the sign-in the Google Workspace connector already holds (it needs the calendar permission).

## Safety

- The servers listen on 127.0.0.1 only. The phone comes in through Tailscale, and only the Tailscale logins you
  list in `~/.omniloy-team/remote.json` are let in.
- Another building reaches a floor only through an ssh tunnel to its guest listener (127.0.0.1). A visitor sees the
  room and can write to the floor's lead, nothing else; agents of two buildings talk only after both owners connect them.
- Agents never merge, deploy, change production, or send messages in your name. The business floor makes drafts.
- Tokens live in the macOS Keychain or in each tool's own sign-in; they are not in this repo or in any file it writes.
