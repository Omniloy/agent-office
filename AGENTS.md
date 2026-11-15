# For the agent reading this repo

This repo installs an "agent office" on a Mac: teams of coding agents that run in the Herdr app, each with a role,
a protocol and tools, plus 3D office web apps to watch and talk to them (also from a phone).

**If the user asks you to set it up, configure it, install it or update it: follow `setup/SETUP.md` from the top,
in order.** It tells you what to check, what to ask the user, what to install and how to verify each step.
Do not improvise the install from the folder names: the files here contain placeholders that only
`setup/install.py` fills in.

Rules that hold for the whole setup:
- Ask the user before every decision listed in `setup/SETUP.md` and before installing any program.
- Secrets (API tokens, passwords, page tokens) are typed by the user in their own terminal. You never see, print,
  log or store them.
- Never start the team's agents without the user's go-ahead: each one is a paid agent session.
- Say plainly what you did, what you verified and what you could not verify.
