# Setting up the agent office on Linux: what differs from setup/SETUP.md

Use this file on a Linux computer (tested on Arch and Omarchy). Read `setup/SETUP.md` first: it is the guide for the
whole setup and every step you do not find below is the same on Linux. Follow it as written for steps 2, 4, 5, 6
(except the open command), 7 (except the token), 8, 11 and 12. This file replaces steps 1, 3, 9 and 10 and adds the
Linux notes that the other steps need.

The ground rules of `SETUP.md` hold, with one addition: the user types their sudo password in their own terminal.
You never see it.

## Step 1. Look, change nothing

Run these and keep the answers:

    uname -sm; grep PRETTY_NAME /etc/os-release; free -h | head -2
    which node npm claude codex tailscale hc herdr-app lsof; node --version
    ls -d ~/.omniloy-team ~/.omniloy-biz ~/.omniloy-admin ~/.omniloy-office ~/.config/herdr-app 2>/dev/null
    python3 setup/install.py --check

The rest of step 1 is the same as in `SETUP.md`: update or existing install, ports 4317, 4318 and 4340 free or ours
(`lsof -nP -iTCP:4317 -sTCP:LISTEN` works here once lsof is installed, see step 3).

## Step 3. Install what is missing (Linux)

Install these yourself, in this order, and verify each. Only stop for the user where a line says so.

1. **Homebrew**: not used on Linux. Skip it.
2. **Node 20 or newer**: `sudo pacman -S nodejs npm` on Arch, the distribution's package elsewhere, or nvm. The user
   types the sudo password. Verify: `node --version`.
3. **Herdr**: `curl -fsSL https://releases.herdr.dev/app/install.sh | sh`, then open it once from the application menu
   (there is no `open -a` on Linux) so it writes `~/.config/herdr-app` and installs its core. Verify: `hc ls` answers.
4. **Agent CLI(s)**: the same as step 4 of `SETUP.md`, including the sign-in rules.
5. **lsof**: `sudo pacman -S lsof` (the package is called `lsof` on other distributions too). Verify:
   `command -v lsof`. `office-restart` cannot find the owner of each port without it, and `install.py --check` says NO
   until it is there.
6. **PATH**: the same as step 5 of `SETUP.md`, but the shell file is `~/.bashrc` on most Linux setups (Omarchy uses
   bash). Add `export PATH="$HOME/.local/bin:$PATH"` to whichever of `~/.bashrc` or `~/.zshrc` the user uses, and tell
   them which one you changed.

## Step 6. Start the floors (Linux)

Same commands as `SETUP.md`. To open the addresses for the user use `xdg-open http://127.0.0.1:4317` (Dev) and
`xdg-open http://127.0.0.1:4318` (Business) instead of `open`.

## Step 7. Jira (Linux)

Same as `SETUP.md` step 7 except the token. There is no Keychain on Linux: the user creates the file
`~/.omniloy-team/jira-token` with mode 0600 that holds only the token:

    install -m 600 /dev/null ~/.omniloy-team/jira-token

and types the token into it in their own terminal. You never see the token. `install.py --check` verifies the file
exists with mode 0600. Then verify the connection as in `SETUP.md` step 7, point 3.

## Background services (Linux)

On Linux the installer writes systemd user units instead of launchd agents:

- `omniloy-artifacts` (the pages server on 4340), `omniloy-office-up` (runs `office-up` at login) and
  `omniloy-peer-link` (only useful with another computer, step 11).
- `omniloy-mail-round.timer` with its service, only when `mailRound` is in the config.

Check them with `systemctl --user list-units 'omniloy-*' --all`. Restart the pages server with
`systemctl --user restart omniloy-artifacts`. User services run only while the user's session is active; to keep them
running after logout the owner runs `loginctl enable-linger <user>` in their own terminal (it needs sudo).

## Step 9. Phone (Linux)

Only if the user chose the phone in step 2 of `SETUP.md`.

1. **Tailscale on Linux**: `sudo pacman -S tailscale`, then `sudo systemctl enable --now tailscaled` and
   `sudo tailscale up`. The user types these and signs in. Then `sudo tailscale set --operator=$USER` so that
   `tailscale serve` works without sudo. The CLI is `/usr/bin/tailscale`. Verify: `tailscale status`.
2. HTTPS on the tailnet, the `tailscale serve` doors, `remote.json` and the phone steps are the same as `SETUP.md`
   step 9, points 2 to 6. The doors are `tailscale serve --bg --https=4317 http://127.0.0.1:4317` and the same for
   4318 and 4340.
3. After `office-restart all`, restart the pages server with `systemctl --user restart omniloy-artifacts` instead of
   the `launchctl kickstart` line.

Never widen the door: the same rules as `SETUP.md`.

## Step 10. Voice (not on Linux yet)

The office microphone does not transcribe on Linux yet. Skip this step, tell the user, and offer dictation into the
chat box with an outside tool (for example Superwhisper). Do not install a voice engine on Linux without the user's
decision.

## Step 11. Another computer and the building link (Linux)

Same as `SETUP.md` step 11. The link is the systemd unit `omniloy-peer-link`, not `com.omniloy.peer-link`; the log is
the same file, `~/.omniloy-team/logs/peer-link.log`.

## Step 12. Hand over (Linux)

Same as `SETUP.md` step 12. Add to what is left for the user: the sudo steps they ran themselves, the Jira token file,
and `loginctl enable-linger` if they want the office after logout.

## Commands that differ, in one place

| macOS (`SETUP.md`) | Linux (this file) |
|---|---|
| `brew install node` | `sudo pacman -S nodejs npm` (or nvm) |
| `open -a Herdr` | open Herdr from the application menu |
| `open <url>` | `xdg-open <url>` |
| `brew install --cask tailscale` | `sudo pacman -S tailscale`, `sudo systemctl enable --now tailscaled` |
| `launchctl kickstart -k gui/$(id -u)/com.omniloy.artifacts` | `systemctl --user restart omniloy-artifacts` |
| Keychain `security add-generic-password` | `~/.omniloy-team/jira-token`, mode 0600 |
| `~/.zshrc` | `~/.bashrc` or `~/.zshrc`, whichever the user uses |
| voice step | skipped on Linux for now |
