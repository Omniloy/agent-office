// Agent limits: per account (Claude work, Claude personal, Codex) session/weekly
// usage, time to reset, and spend. Accounts come from ~/.omniloy-team/team.json.
// Open: herdr-app do tab.new --name Limits --mod agent-limits
//   or: herdr-app do pane.split --direction right --mod agent-limits

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, home, readTextFile, theme } from "herdr";

const POLL_MS = 3 * 60 * 1000; // refetch
const TICK_MS = 60 * 1000;     // recompute countdowns only

const DEFAULT_ACCOUNTS = [
  { id: "claude", name: "Claude", kind: "claude", configDir: "~/.claude" },
  { id: "codex", name: "Codex", kind: "codex", home: "~/.codex" },
];

const expand = (p) => (p ?? "").replace(/^~(?=$|\/)/, home());
const user = () => home().split("/").filter(Boolean).pop();

function until(ts, now) {
  if (ts == null) return null;
  const ms = ts - now;
  if (ms <= 0) return "reset due";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
function ago(ts, now) {
  const m = Math.round((now - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}
const money = (minor, cur, exp = 2) =>
  minor == null ? "—" : `${(minor / 10 ** exp).toFixed(exp)} ${cur ?? ""}`.trim();

// ---------- Claude ----------
async function claudeService(configDir) {
  const dir = expand(configDir);
  if (dir === `${home()}/.claude`) return "Claude Code-credentials";
  const r = await exec("sh", ["-c", 'printf %s "$1" | (sha256sum 2>/dev/null || shasum -a 256)', "sh", dir]);
  return `Claude Code-credentials-${r.stdout.trim().slice(0, 8)}`;
}

async function claudeToken(configDir) {
  const service = await claudeService(configDir);
  let raw = null;
  const linux = (await exec("uname", ["-s"])).stdout.trim() === "Linux";
  const r = linux ? null : await exec("security", ["find-generic-password", "-s", service, "-a", user(), "-w"]).catch(() => null);
  if (r && r.code === 0) raw = r.stdout;
  if (!raw) raw = await readTextFile(`${expand(configDir)}/.credentials.json`).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw).claudeAiOauth ?? null;
  } catch {
    return null;
  }
}

async function loadClaude(acc) {
  const cred = await claudeToken(acc.configDir);
  if (!cred?.accessToken) return { state: "logout", note: `Not logged in. Run ${acc.id === "claude-personal" ? "claude-personal" : "claude"} and /login.` };
  const plan = [cred.subscriptionType, (cred.rateLimitTier ?? "").replace(/^default_claude_/, "")].filter(Boolean).join(" · ");
  if (cred.expiresAt && cred.expiresAt < Date.now())
    return { state: "expired", plan, note: "Token expired. Open that Claude to refresh it." };
  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: { Authorization: `Bearer ${cred.accessToken}`, "anthropic-beta": "oauth-2025-04-20" },
  });
  if (res.status === 401) return { state: "expired", plan, note: "Token rejected. Open that Claude to refresh it." };
  if (!res.ok) return { state: "error", plan, note: `Usage API ${res.status}` };
  const u = await res.json();
  const rows = [];
  const ts = (s) => (s ? Date.parse(s) : null);
  if (u.five_hour) rows.push({ label: "Session (5h)", pct: u.five_hour.utilization ?? 0, reset: ts(u.five_hour.resets_at) });
  else rows.push({ label: "Session (5h)", pct: null, reset: null, note: "not reported" });
  if (u.seven_day) rows.push({ label: "Weekly", pct: u.seven_day.utilization ?? 0, reset: ts(u.seven_day.resets_at) });
  for (const [k, name] of [["seven_day_opus", "Weekly · Opus"], ["seven_day_sonnet", "Weekly · Sonnet"]])
    if (u[k]) rows.push({ label: name, pct: u[k].utilization ?? 0, reset: ts(u[k].resets_at), sub: true });
  for (const l of u.limits ?? [])
    if (l.kind === "weekly_scoped" && l.scope?.model?.display_name)
      rows.push({ label: `Weekly · ${l.scope.model.display_name}`, pct: l.percent ?? 0, reset: ts(l.resets_at), sub: true });

  const sp = u.spend;
  const ex = u.extra_usage;
  let spend;
  if (sp) {
    const cur = sp.used?.currency ?? sp.limit?.currency;
    spend = {
      used: money(sp.used?.amount_minor, cur, sp.used?.exponent),
      limit: sp.limit ? money(sp.limit.amount_minor, cur, sp.limit.exponent) : "no cap",
      pct: sp.percent ?? 0,
      status: sp.enabled ? "extra usage on" : `extra usage off${sp.disabled_reason ? ` (${sp.disabled_reason.replace(/_/g, " ")})` : ""}`,
    };
  } else if (ex) {
    spend = {
      used: ex.used_credits != null ? `${ex.used_credits} ${ex.currency ?? ""}` : "—",
      limit: ex.monthly_limit != null ? `${ex.monthly_limit / 100} ${ex.currency ?? ""}` : "no cap",
      pct: ex.utilization ?? 0,
      status: ex.is_enabled ? "extra usage on" : "extra usage off",
    };
  }
  const breakdown = (u.seven_day_breakdown?.rows ?? []).filter((r) => r.percent > 0).map((r) => `${r.display_name} ${r.percent}%`).join(" · ");
  return { state: "ok", plan, rows, spend, breakdown, asOf: Date.now() };
}

// ---------- Codex ----------
const SCAN = `cd "$1" 2>/dev/null || exit 3
for f in $(ls -t sessions/*/*/*/rollout-*.jsonl 2>/dev/null | head -30); do
  l=$(grep '"rate_limits"' "$f" | tail -1)
  if [ -n "$l" ]; then stat -c %Y "$f" 2>/dev/null || stat -f %m "$f"; printf '%s\\n' "$l"; exit 0; fi
done
exit 4`;

function findKey(o, key) {
  if (!o || typeof o !== "object") return null;
  if (key in o) return o[key];
  for (const v of Object.values(o)) {
    const r = findKey(v, key);
    if (r) return r;
  }
  return null;
}
const windowName = (m) => (m === 300 ? "Session (5h)" : m === 10080 ? "Weekly" : m >= 1440 ? `${Math.round(m / 1440)}d window` : `${Math.round(m / 60)}h window`);

async function loadCodex(acc) {
  const dir = expand(acc.home ?? "~/.codex");
  const auth = await readTextFile(`${dir}/auth.json`).catch(() => null);
  if (!auth) return { state: "logout", note: "Not logged in. Run codex login." };
  const r = await exec("sh", ["-c", SCAN, "sh", dir]);
  if (r.code !== 0) return { state: "error", note: "No Codex session with limits yet. Run any codex prompt." };
  const [mtime, ...rest] = r.stdout.split("\n");
  let rl;
  try {
    rl = findKey(JSON.parse(rest.join("\n")), "rate_limits");
  } catch {
    return { state: "error", note: "Could not parse Codex session log" };
  }
  const rows = [];
  for (const w of [rl?.primary, rl?.secondary].filter(Boolean))
    rows.push({ label: windowName(w.window_minutes), pct: w.used_percent ?? 0, reset: w.resets_at ? w.resets_at * 1000 : null, mins: w.window_minutes });
  rows.sort((a, b) => (a.mins ?? 0) - (b.mins ?? 0));
  if (!rows.some((x) => x.mins === 300)) rows.unshift({ label: "Session (5h)", pct: null, reset: null, note: "not on this plan" });
  const c = rl?.credits;
  const spend = c
    ? { used: c.unlimited ? "unlimited" : `${c.balance ?? 0} credits left`, limit: c.has_credits ? "credits on" : "no credits", pct: null, status: rl.spend_control_reached ? "spend cap reached" : rl.rate_limit_reached_type ? `limited: ${rl.rate_limit_reached_type}` : "within limits" }
    : null;
  return { state: "ok", plan: rl?.plan_type ?? "", rows, spend, asOf: Number(mtime) * 1000, stale: true };
}

// ---------- View ----------
export default class Limits extends View {
  init(_props, cx) {
    this.accounts = DEFAULT_ACCOUNTS;
    this.data = {};
    this.loading = false;
    this.refresh(cx);
    cx.timer.every(POLL_MS, (cx) => this.refresh(cx));
    cx.timer.every(TICK_MS, (cx) => cx.notify());
  }

  refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const raw = await readTextFile(`${home()}/.omniloy-team/team.json`).catch(() => null);
        const acc = raw ? JSON.parse(raw).accounts : null;
        if (Array.isArray(acc) && acc.length) this.accounts = acc;
      } catch {}
      await Promise.all(
        this.accounts.map(async (a) => {
          try {
            this.data[a.id] = a.kind === "codex" ? await loadCodex(a) : await loadClaude(a);
          } catch (e) {
            this.data[a.id] = { state: "error", note: String(e?.message ?? e).slice(0, 120) };
          }
          cx.notify();
        }),
      );
      this.loading = false;
      this.fetched = Date.now();
      cx.notify();
    });
  }

  bar(t, pct) {
    const p = Math.max(0, Math.min(100, pct ?? 0));
    const color = p >= 90 ? t.blocked : p >= 70 ? t.done : t.working;
    return div().h(6).w_full().rounded(3).bg(t.raised).child(div().h(6).rounded(3).bg(color).w(`${p}%`));
  }

  row(t, r, now, i) {
    return v_flex().id(`row-${i}`).gap(4).pl(r.sub ? 10 : 0)
      .child(h_flex().justify_between().text_size(r.sub ? 11.5 : 12.5)
        .child(h_flex().gap(8).items_center()
          .child(div().text_color(r.sub ? t.muted : t.foreground).child(r.label))
          .when(!!r.note, (el) => el.child(div().text_size(11).text_color(t.dim).child(`· ${r.note}`))))
        .child(h_flex().gap(10).flex_none()
          .child(div().text_color(t.foreground).font_semibold().child(r.pct == null ? "n/a" : `${Math.round(r.pct)}%`))
          .when(!!r.reset, (el) => el.child(div().text_color(t.dim).w(80).child(`↻ ${until(r.reset, now)}`)))))
      .when(r.pct != null, (el) => el.child(this.bar(t, r.pct)));
  }

  card(t, a, now) {
    const d = this.data[a.id];
    const head = h_flex().justify_between().items_center()
      .child(div().text_size(14).font_semibold().text_color(t.foreground).child(a.name))
      .child(div().text_size(11).text_color(t.dim).child(d?.plan ?? ""));
    let body;
    if (!d) body = div().text_color(t.dim).text_size(12).child("Loading…");
    else if (d.state !== "ok")
      body = div().text_size(12).text_color(d.state === "error" ? t.blocked : t.muted).child(d.note ?? d.state);
    else {
      body = v_flex().gap(10)
        .children(d.rows.map((r, i) => this.row(t, r, now, `${a.id}-${i}`)))
        .when(!!d.spend, (el) => el.child(
          v_flex().gap(2).pt(6).border_t(1).border_color(t.border).text_size(12)
            .child(h_flex().justify_between()
              .child(div().text_color(t.muted).child("Spend"))
              .child(div().text_color(t.foreground).child(d.spend.pct != null ? `${d.spend.used} / ${d.spend.limit}` : `${d.spend.used} · ${d.spend.limit}`)))
            .child(div().text_size(11).text_color(t.dim).child(d.spend.status))))
        .when(!!d.breakdown, (el) => el.child(div().text_size(11).text_color(t.dim).child(`This week: ${d.breakdown}`)))
        .child(div().text_size(10.5).text_color(t.dim).child(d.stale ? `From last Codex session · ${ago(d.asOf, now)}` : `Updated ${ago(d.asOf, now)}`));
    }
    return v_flex().id(`card-${a.id}`).gap(10).p(12).rounded(8).bg(t.background).border(1).border_color(t.border).child(head).child(body);
  }

  render(cx) {
    const t = theme();
    const now = Date.now();
    return v_flex().id("root").size_full().bg(t.surface).p(12).gap(12).overflow_y_scrollbar()
      .child(h_flex().justify_between().items_center()
        .child(div().text_size(15).font_semibold().text_color(t.foreground).child("Agent limits"))
        .child(div().id("refresh").px(10).py(4).rounded(6).text_size(12).bg(t.raised).text_color(t.foreground)
          .hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.refresh(cx))
          .child(this.loading ? "Refreshing…" : "Refresh")))
      .children(this.accounts.map((a) => this.card(t, a, now)));
  }
}
