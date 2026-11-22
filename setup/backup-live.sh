#!/bin/bash
# setup/backup-live.sh: before an update, a copy of everything the installer can touch, plus rollback.sh to go back
# in one command (bash ~/office-backup-<date>/rollback.sh). Run in the owner's shell; it only reads what it copies.
#   bash setup/backup-live.sh [SKILLS_HOME]     SKILLS_HOME: the folder given to install.py --skills-home, if any
set -e
REPO=$(cd "$(dirname "$0")/.." && pwd); SK=${1:+$(cd "$1" && pwd)}
B=~/office-backup-$(date +%Y%m%d-%H%M%S); mkdir -p "$B"
tar -C ~ -czf "$B/omniloy-office.tgz" --exclude='node_modules' --exclude='.token*' --exclude='backups' .omniloy-office
tar -C ~ -czf "$B/local-bin.tgz" .local/bin
tar -C ~ -czf "$B/herdr-app.tgz" .config/herdr-app/mods .config/herdr-app/layouts
tar -C ~ -czf "$B/claude-agents.tgz" .claude/agents $(cd ~ && ls .claude/settings.json 2>/dev/null)
tar -C ~ -czf "$B/launchagents.tgz" $(cd ~ && ls Library/LaunchAgents/com.omniloy.*.plist)
tar -C ~ -czf "$B/team-config.tgz" $(cd ~ && ls .omniloy-{team,crm,web,lab,admin}/{team.json,PROTOCOL.md,HANDBOOK.md} 2>/dev/null)
# Single paths the installer can create or replace outside the folders above: the phone door and each office skill
# (in every runtime's skills folder and in SKILLS_HOME). paths.txt lists them all; rollback sets aside whatever is
# there now and puts back the ones that existed (a link stays a link), so something new the install made goes away too.
: > "$B/paths.txt"
for p in "$HOME/.omniloy-team/remote.json"; do echo "$p" >> "$B/paths.txt"; done
for n in $(ls "$REPO/skills"); do
  for d in "$HOME/.claude/skills" "$HOME/.agents/skills" "$HOME/.codex/skills" ${SK:+"$SK"}; do echo "$d/$n" >> "$B/paths.txt"; done
done
( while IFS= read -r p; do [ -e "$p" ] || [ -L "$p" ] && echo "${p#/}"; done < "$B/paths.txt" ) > "$B/paths-present.txt"
tar -C / -czf "$B/paths.tgz" -T "$B/paths-present.txt"
cat > "$B/rollback.sh" <<'RB'
#!/bin/bash
# Vuelve a dejar la oficina como estaba antes de instalar (apps, herramientas, paneles, roles y servicios).
B=$(cd "$(dirname "$0")" && pwd); U=$(id -u)
set -e
T=$(date +%H%M%S)
for app in team-office artifacts; do   # the apps as the install left them, set aside whole (a new file would stay otherwise)
  [ -d ~/.omniloy-office/$app ] || continue
  mv ~/.omniloy-office/$app ~/.omniloy-office/$app.failed-$T; mkdir ~/.omniloy-office/$app
  mv ~/.omniloy-office/$app.failed-$T/node_modules ~/.omniloy-office/$app/ 2>/dev/null || true
done
tar -C ~ -xzf "$B/omniloy-office.tgz"
rm -rf ~/.local/bin.rollback && mv ~/.local/bin ~/.local/bin.rollback && tar -C ~ -xzf "$B/local-bin.tgz"
for x in hc herdr-app; do [ -e ~/.local/bin/$x ] || { [ -e ~/.local/bin.rollback/$x ] && cp -P ~/.local/bin.rollback/$x ~/.local/bin/; }; done
tar -C ~ -xzf "$B/herdr-app.tgz"; tar -C ~ -xzf "$B/claude-agents.tgz"; tar -C ~ -xzf "$B/team-config.tgz"
A="$B/set-aside-$(date +%H%M%S)"   # the skills and the phone door as the install left them, moved out of the way
while IFS= read -r p; do if [ -e "$p" ] || [ -L "$p" ]; then mkdir -p "$A$(dirname "$p")"; mv "$p" "$A$p"; fi; done < "$B/paths.txt"
tar -C / -xzf "$B/paths.tgz"
rm -f ~/.omniloy-office/installed.json
for l in watchdog office-up; do
  if [ -e ~/Library/LaunchAgents/com.omniloy.$l.plist ] && ! tar -tzf "$B/launchagents.tgz" | grep -q "com.omniloy.$l.plist"; then
    launchctl bootout gui/$U/com.omniloy.$l 2>/dev/null || true; rm -f ~/Library/LaunchAgents/com.omniloy.$l.plist; fi
done
tar -C ~ -xzf "$B/launchagents.tgz"
launchctl print gui/$U/com.omniloy.offices >/dev/null 2>&1 || launchctl bootstrap gui/$U ~/Library/LaunchAgents/com.omniloy.offices.plist 2>/dev/null || true
for l in artifacts peer-link; do launchctl bootout gui/$U/com.omniloy.$l 2>/dev/null || true; launchctl bootstrap gui/$U ~/Library/LaunchAgents/com.omniloy.$l.plist || true; done
[ -n "$ROLLBACK_NO_RESTART" ] || /usr/bin/python3 ~/.local/bin/office-restart all   # (variable only for the sandbox test)
echo "Vuelta atrás hecha. Recarga las páginas de la oficina. Lo nuevo apartado: ~/.omniloy-office/{team-office,artifacts}.failed-*, ~/.local/bin.rollback, $A"
RB
chmod +x "$B/rollback.sh"
for f in "$B"/*.tgz; do tar -tzf "$f" >/dev/null && echo "ok $(basename $f)"; done
echo "Copia en $B  ·  para volver atrás: bash $B/rollback.sh"
