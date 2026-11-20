#!/bin/bash
# setup/backup-live.sh: before an update, a copy of everything the installer can touch, plus rollback.sh to go back
# in one command (bash ~/office-backup-<date>/rollback.sh). Run in the owner's shell; it reads only ~.
set -e
B=~/office-backup-$(date +%Y%m%d-%H%M%S); mkdir -p "$B"
tar -C ~ -czf "$B/omniloy-office.tgz" --exclude='node_modules' --exclude='.token*' --exclude='backups' .omniloy-office
tar -C ~ -czf "$B/local-bin.tgz" .local/bin
tar -C ~ -czf "$B/herdr-app.tgz" .config/herdr-app/mods .config/herdr-app/layouts
tar -C ~ -czf "$B/claude-agents.tgz" .claude/agents $(cd ~ && ls .claude/settings.json 2>/dev/null)
tar -C ~ -czf "$B/launchagents.tgz" $(cd ~ && ls Library/LaunchAgents/com.omniloy.*.plist)
tar -C ~ -czf "$B/team-config.tgz" $(cd ~ && ls .omniloy-{team,crm,web,lab,admin}/{team.json,PROTOCOL.md,HANDBOOK.md} 2>/dev/null)
cat > "$B/rollback.sh" <<'RB'
#!/bin/bash
# Vuelve a dejar la oficina como estaba antes de instalar (apps, herramientas, paneles, roles y servicios).
B=$(cd "$(dirname "$0")" && pwd); U=$(id -u)
set -e
mv ~/.omniloy-office/team-office ~/.omniloy-office/team-office.failed-$(date +%H%M%S)
mkdir ~/.omniloy-office/team-office
mv ~/.omniloy-office/team-office.failed-*/node_modules ~/.omniloy-office/team-office/ 2>/dev/null || true
tar -C ~ -xzf "$B/omniloy-office.tgz"
rm -rf ~/.local/bin.rollback && mv ~/.local/bin ~/.local/bin.rollback && tar -C ~ -xzf "$B/local-bin.tgz"
for x in hc herdr-app; do [ -e ~/.local/bin/$x ] || { [ -e ~/.local/bin.rollback/$x ] && cp -P ~/.local/bin.rollback/$x ~/.local/bin/; }; done
tar -C ~ -xzf "$B/herdr-app.tgz"; tar -C ~ -xzf "$B/claude-agents.tgz"; tar -C ~ -xzf "$B/team-config.tgz"
rm -f ~/.omniloy-office/installed.json
for l in watchdog office-up; do
  if [ -e ~/Library/LaunchAgents/com.omniloy.$l.plist ] && ! tar -tzf "$B/launchagents.tgz" | grep -q "com.omniloy.$l.plist"; then
    launchctl bootout gui/$U/com.omniloy.$l 2>/dev/null || true; rm -f ~/Library/LaunchAgents/com.omniloy.$l.plist; fi
done
tar -C ~ -xzf "$B/launchagents.tgz"
launchctl print gui/$U/com.omniloy.offices >/dev/null 2>&1 || launchctl bootstrap gui/$U ~/Library/LaunchAgents/com.omniloy.offices.plist 2>/dev/null || true
for l in artifacts peer-link; do launchctl bootout gui/$U/com.omniloy.$l 2>/dev/null || true; launchctl bootstrap gui/$U ~/Library/LaunchAgents/com.omniloy.$l.plist || true; done
[ -n "$ROLLBACK_NO_RESTART" ] || /usr/bin/python3 ~/.local/bin/office-restart all   # (variable only for the sandbox test)
echo "Vuelta atrás hecha. Recarga las páginas de la oficina. Lo nuevo apartado: ~/.omniloy-office/team-office.failed-*, ~/.local/bin.rollback"
RB
chmod +x "$B/rollback.sh"
for f in "$B"/*.tgz; do tar -tzf "$f" >/dev/null && echo "ok $(basename $f)"; done
echo "Copia en $B  ·  para volver atrás: bash $B/rollback.sh"
