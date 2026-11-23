import { View, div } from "gpui-kit";
import { v_flex, h_flex, Scrollbar } from "gpui-base";
import { exec, readTextFile, theme, home, shared, setShared, props as modProps } from "herdr";
const openUrl = (u) => exec("sh", ["-c", 'if command -v xdg-open >/dev/null 2>&1; then xdg-open "$1"; else open "$1"; fi', "sh", u]);
const isLinux = async () => (await exec("uname", ["-s"])).stdout.trim() === "Linux";

// Team Board: pending PRs + Jira board per project, filtered by persona (agent).
// Config: ~/.omniloy-team/team.json. Jira token: macOS Keychain (service from config).

const REFRESH_MS = 90000;
const STORE = "team-board.sel";
const FIELDS = "summary,status,assignee,labels,issuetype,priority,updated,created,statuscategorychangedate";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64(str) {
  const bytes = [];
  for (const ch of unescape(encodeURIComponent(str))) bytes.push(ch.charCodeAt(0));
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (b === undefined ? "=" : B64[(n >> 6) & 63]) + (c === undefined ? "=" : B64[n & 63]);
  }
  return out;
}

const ago = (iso) => {
  if (!iso) return "";
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

function ciState(rollup) {
  if (!Array.isArray(rollup) || !rollup.length) return "none";
  let pending = false;
  for (const c of rollup) {
    const v = (c.conclusion || c.state || c.status || "").toUpperCase();
    if (["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(v)) return "fail";
    if (["PENDING", "QUEUED", "IN_PROGRESS", "EXPECTED", "WAITING", ""].includes(v)) pending = true;
  }
  return pending ? "pending" : "pass";
}

export default class TeamBoard extends View {
  init(props, cx) {
    this.only = props?.only ?? modProps()?.only ?? null; // "prs" | "jira": a side panel showing one half
    this.config = null; this.issues = []; this.columns = []; this.prs = [];
    this.jiraError = null; this.prError = null; this.configError = null;
    this.loadingJira = false; this.loadingPrs = false; this.updated = null;
    let sel = {};
    try { sel = JSON.parse(localStorage.getItem(STORE) || "{}"); } catch {}
    sel = { ...sel, ...(shared(STORE) ?? {}) };
    this.project = sel.project ?? null; this.board = sel.board ?? "dev";
    this.persona = sel.persona ?? "all"; this.view = sel.view ?? "both";
    this.show = sel.show ?? "all"; this.period = sel.period ?? "14"; // time filters: which cards, over which period
    this.trace = null; this.traceJira = {}; this.reqByKey = {}; this.traceFilter = "all"; this.traceStatus = "any"; this.traceGroup = "module"; this.loadingTrace = false;
    this.width = 0; this.pickProject = false; this.closed = sel.closed ?? {}; this.more = {};
    this.reload(cx, true);
    cx.timer.every(REFRESH_MS, (cx) => this.reload(cx, false));
    // Trace panel: bring Drive changes down every 5 minutes (never overwrites local edits waiting for push).
    if (this.only === "trace") cx.timer.every(300000, (cx) => this.syncTrace(cx));
    // Filters are shared between copies (PRs panel, Board panel): follow the other's picks.
    cx.timer.every(1000, (cx) => {
      const o = shared(STORE); if (!o) return;
      const diff = {}; for (const k of ["project", "board", "persona", "show", "period"]) if (o[k] !== undefined && o[k] !== this[k]) diff[k] = o[k];
      if (Object.keys(diff).length) this.select(diff, cx, true);
    });
  }

  save() {
    setShared(STORE, { project: this.project, board: this.board, persona: this.persona, show: this.show, period: this.period });
    try { localStorage.setItem(STORE, JSON.stringify({ project: this.project, board: this.board, persona: this.persona, view: this.view, closed: this.closed, show: this.show, period: this.period })); } catch {}
  }

  proj() { return this.config?.projects?.find((p) => p.id === this.project) ?? this.config?.projects?.[0]; }

  async token() {
    if (this.tok) return this.tok;
    const j = this.config.jira;
    if (await isLinux()) {
      this.tok = (await readTextFile(`${home()}/.omniloy-team/jira-token`).catch(() => "")).trim();
      if (!this.tok) throw new Error("No Jira token in ~/.omniloy-team/jira-token");
      return this.tok;
    }
    const r = await exec("security", ["find-generic-password", "-s", j.keychainService || "herdr-jira", "-a", j.email, "-w"], { timeout: 10000 });
    if (r.code !== 0) throw new Error(`No Jira token in Keychain (service "${j.keychainService || "herdr-jira"}")`);
    this.tok = r.stdout.trim();
    return this.tok;
  }

  async jira(path) {
    const j = this.config.jira, tok = await this.token();
    const res = await fetch(`${j.site}${path}`, { headers: { Authorization: `Basic ${base64(`${j.email}:${tok}`)}`, Accept: "application/json" } });
    if (res.status === 401 || res.status === 403) { this.tok = null; throw new Error(`Jira auth failed (${res.status}): check the token`); }
    if (!res.ok) throw new Error(`Jira ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return res.json();
  }

  reload(cx, fresh) {
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(`${home()}/.omniloy-team/team.json`);
        if (text === null) throw new Error("~/.omniloy-team/team.json not found");
        this.config = JSON.parse(text); this.configError = null;
        // Other dev floors (none by default) have their own agents: their cards are tagged and filtered with them.
        this.otherIds = []; const extra = [];
        for (const d of []) { try { const x = JSON.parse(await readTextFile(`${home()}/${d}/team.json`)); const own = (x.projects ?? []).map((y) => y.id); this.otherIds.push(...own); extra.push(...x.personas.map((y) => ({ ...y, own }))); } catch {} }
        this.config.personas = [...(this.config.personas ?? []), ...extra];
        if (!this.config.projects?.some((p) => p.id === this.project)) this.project = this.config.projects?.[0]?.id ?? null;
      } catch (e) { this.configError = String(e.message || e); cx.notify(); return; }
      cx.notify();
      this.loadJira(cx, fresh); this.loadPrs(cx, fresh); this.loadTrace(cx);
    });
  }

  loadJira(cx, fresh) {
    const p = this.proj(); if (!p || this.only === "prs" || this.only === "trace") return;
    const ctx = this.jiraCtx();
    if (this.loadingJira === ctx) return;
    this.loadingJira = ctx; if (fresh) { this.issues = []; this.columns = []; }
    this.jiraError = null; cx.notify();
    cx.spawn(async (cx) => {
      try {
        try { this.cards = JSON.parse(await readTextFile(`${home()}/.omniloy-team/cards.json`)); } catch {}
        const boardId = this.board === "product" ? p.productBoard : p.devBoard;
        // Done cards: the last 14 days by default, everything when the period is "All time".
        const all = this.period === "all", cap = all ? 1500 : 300;
        const recent = all ? "" : "(statusCategory != Done OR statusCategoryChangedDate >= -14d)";
        let issues = [], columns = [];
        if (boardId) {
          const conf = await this.jira(`/rest/agile/1.0/board/${boardId}/configuration`);
          columns = (conf.columnConfig?.columns ?? []).map((c) => ({ name: c.name, statuses: (c.statuses ?? []).map((s) => String(s.id)) }));
          let start = 0;
          for (;;) {
            const r = await this.jira(`/rest/agile/1.0/board/${boardId}/issue?maxResults=100&startAt=${start}&fields=${FIELDS}&jql=${encodeURIComponent(`${recent} ORDER BY updated DESC`.trim())}`);
            issues.push(...(r.issues ?? []));
            start += r.issues?.length ?? 0;
            if (!r.issues?.length || start >= (r.total ?? 0) || start >= cap) break;
          }
        } else {
          const jql = `project = ${p.jiraProject}${recent ? " AND " + recent : ""} ORDER BY updated DESC`;
          let next = "";
          for (;;) {
            const r = await this.jira(`/rest/api/3/search/jql?maxResults=100&fields=${FIELDS}&jql=${encodeURIComponent(jql)}${next ? "&nextPageToken=" + encodeURIComponent(next) : ""}`);
            issues.push(...(r.issues ?? []));
            next = r.nextPageToken;
            if (!next || !r.issues?.length || issues.length >= cap) break;
          }
          const order = { new: 0, indeterminate: 1, done: 2 }, seen = new Map();
          for (const i of issues) {
            const s = i.fields.status;
            if (!seen.has(s.id)) seen.set(s.id, { name: s.name, statuses: [String(s.id)], rank: order[s.statusCategory?.key] ?? 1 });
          }
          // a project can fix its column order (and show the empty ones) with "columns": [status names]
          if (p.columns) { for (const n of p.columns) if (![...seen.values()].some((c) => c.name === n)) seen.set(`empty-${n}`, { name: n, statuses: [] }); for (const c of seen.values()) { const k = p.columns.indexOf(c.name); c.rank = k < 0 ? 99 : k; } }
          columns = [...seen.values()].sort((a, b) => a.rank - b.rank);
        }
        if (this.jiraCtx() !== ctx) return;
        this.issues = issues.map((i) => ({
          key: i.key, summary: i.fields.summary, status: i.fields.status?.name, statusId: String(i.fields.status?.id),
          assignee: i.fields.assignee?.displayName ?? null, labels: i.fields.labels ?? [], type: i.fields.issuetype?.name,
          updated: i.fields.updated, created: i.fields.created,
          // on the Product Board the team's work ends in Validation (release is __OWNER__'s), so that counts as finished too
          done: i.fields.status?.statusCategory?.key === "done" || (this.board === "product" && /^validation$/i.test(i.fields.status?.name ?? "")),
          doneAt: i.fields.status?.statusCategory?.key === "done" ? (i.fields.statuscategorychangedate ?? i.fields.updated) : i.fields.updated,
          url: `${this.config.jira.site}/browse/${i.key}`,
        }));
        this.columns = columns; this.updated = new Date();
      } catch (e) { if (this.jiraCtx() === ctx) this.jiraError = String(e.message || e); }
      finally { if (this.loadingJira === ctx) this.loadingJira = false; cx.notify(); }
    });
  }

  loadPrs(cx, fresh) {
    const p = this.proj(); if (!p || this.only === "jira" || this.only === "trace") return;
    const ctx = p.id;
    if (this.loadingPrs === ctx) return;
    this.loadingPrs = ctx; if (fresh) this.prs = [];
    this.prError = null; cx.notify();
    cx.spawn(async (cx) => {
      const errors = [];
      const lists = await Promise.all((p.repos ?? []).map(async (repo) => {
        try {
          const r = await exec("gh", ["pr", "list", "-R", repo, "--state", "open", "--limit", "50", "--json", "number,title,author,isDraft,reviewDecision,url,labels,headRefName,statusCheckRollup,body,updatedAt"], { timeout: 45000 });
          if (r.code !== 0) { errors.push(`${repo}: ${(r.stderr || "").trim().split("\n")[0]}`); return []; }
          return JSON.parse(r.stdout || "[]").map((x) => ({
            repo, short: repo.split("/").pop(), number: x.number, title: x.title, author: x.author?.login, draft: x.isDraft,
            review: x.reviewDecision || "", url: x.url, labels: (x.labels ?? []).map((l) => l.name), branch: x.headRefName,
            ci: ciState(x.statusCheckRollup), body: x.body || "", updated: x.updatedAt,
          }));
        } catch (e) { errors.push(`${repo}: ${e.message || e}`); return []; }
      }));
      if (this.proj()?.id !== ctx) { this.loadingPrs = false; return; }
      this.prs = lists.flat().sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
      this.prError = errors.length ? errors.slice(0, 3).join(" · ") : null;
      this.loadingPrs = false; this.updated = new Date(); cx.notify();
    });
  }

  chipPersonas() { const o = (this.otherIds ?? []).includes(this.project); return (this.config?.personas ?? []).filter((x) => x.own ? x.own.includes(this.project) : !o); }

  personasOf(labels, text) {
    const ps = this.config?.personas ?? [];
    return ps.filter((p) => labels.includes(p.label) || (text && p.name && text.includes(p.name)));
  }

  jiraCtx() { return `${this.proj()?.id}:${this.board}:${this.period === "all" ? "all" : "recent"}`; }

  // Time filters. Period: 7, 14 days or "all". Show: all | open | done | stale (open, untouched for longer than the period).
  days() { return this.period === "all" ? null : Number(this.period); }
  staleDays() { return this.days() ?? 7; }
  inPeriod(i) { const d = this.days(); return !d || Date.parse(i.doneAt) >= Date.now() - d * 864e5; }
  isStale(i) { return !i.done && Date.parse(i.updated) < Date.now() - this.staleDays() * 864e5; }
  timeFilter(list) {
    const s = this.show;
    return list.filter((i) => s === "open" ? !i.done : s === "done" ? i.done && this.inPeriod(i) : s === "stale" ? this.isStale(i) : !i.done || this.inPeriod(i));
  }
  stats(list) {
    const d = this.days(), since = d ? Date.now() - d * 864e5 : 0;
    return { done: list.filter((i) => i.done && this.inPeriod(i)).length, open: list.filter((i) => !i.done).length,
      stale: list.filter((i) => this.isStale(i)).length, created: list.filter((i) => Date.parse(i.created) >= since).length };
  }
  periodLabel() { return this.period === "all" ? "all time" : this.period === "7" ? "last week" : "last 2 weeks"; }
  showItems() { return [["all", "All"], ["open", "Open"], ["done", "Done"], ["stale", `Pending > ${this.staleDays() === 7 ? "1 week" : "2 weeks"}`]]; }

  // Who holds a card is kept locally by `team-card` (Jira no longer carries agent labels): map it to that persona's id.
  holder(key) { const o = key && this.cards?.[key]?.owner; return (o && (this.config?.personas ?? []).find((p) => p.herdrName === o)?.label) || "\u0000"; }

  matches(personas) {
    if (this.persona === "all") return true;
    if (this.persona === "none") return personas.length === 0;
    return personas.some((p) => p.slug === this.persona);
  }

  select(changes, cx, quiet) {
    const before = this.jiraCtx(), projBefore = this.project;
    Object.assign(this, changes);
    if (this.project !== projBefore && !["all", "none"].includes(this.persona) && !this.chipPersonas().some((x) => x.slug === this.persona)) this.persona = "all";
    if (!quiet) this.save();
    if (this.jiraCtx() !== before) this.loadJira(cx, true);
    if (this.project !== projBefore) { this.loadPrs(cx, true); this.trace = null; this.reqByKey = {}; this.loadTrace(cx); }
    cx.notify();
  }

  chip(id, label, active, t, onClick, color) {
    return h_flex().id(id).h(24).px(9).gap(6).items_center().rounded(12).flex_none().cursor_pointer().text_size(12)
      .border_1().border_color(active ? (color ?? t.accent) : t.border)
      .bg(active ? (color ? color + "26" : t.selected) : t.surface)
      .text_color(active ? t.foreground : t.muted).hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => onClick(cx))
      .when(Boolean(color), (e) => e.child(div().size(8).rounded_full().bg(color)))
      .child(label);
  }

  personaTag(p, t) {
    return h_flex().px(6).h(18).gap(4).items_center().rounded(9).flex_none().text_size(10).bg(p.color + "26").text_color(t.foreground)
      .child(div().size(6).rounded_full().bg(p.color)).child(p.name.split(" ")[0]);
  }

  issueCard(i, t) {
    const ps = this.personasOf([...i.labels, this.holder(i.key)]);
    const other = i.labels.filter((l) => !ps.some((p) => p.label === l)).slice(0, 3);
    return v_flex().id(`issue-${i.key}`).w_full().flex_none().p(8).gap(5).rounded(8).bg(t.surface).border_1().border_color(t.border)
      .cursor_pointer().hover((s) => s.border_color(t.accent))
      .on_click(() => { openUrl(i.url); })
      .child(h_flex().gap(6).items_center()
        .child(div().text_size(11).font_semibold().text_color(t.accent).child(i.key))
        .child(div().text_size(10).text_color(t.dim).child(i.type ?? ""))
        .child(div().flex_1()).child(div().text_size(10).text_color(t.dim).child(ago(i.updated))))
      .child(div().text_size(12).text_color(t.foreground).child(i.summary ?? ""))
      .child(h_flex().gap(4).flex_wrap().items_center()
        .children(ps.map((p) => this.personaTag(p, t)))
        .children(other.map((l) => div().px(5).h(16).rounded(4).flex_none().text_size(10).bg(t.raised).text_color(t.muted).child(l)))
        .child(div().flex_1())
        .child(div().text_size(10).text_color(i.assignee ? t.muted : t.dim).child(i.assignee ?? "Unassigned")));
  }

  prRow(pr, t) {
    const ps = this.personasOf([...pr.labels, this.holder(`${pr.branch ?? ""} ${pr.title}`.match(/[A-Z][A-Z0-9]+-\d+/)?.[0])], `${pr.title}\n${pr.body}`);
    const ci = { pass: ["✓ CI", t.ansi2], fail: ["✗ CI", t.ansi1], pending: ["● CI", t.blocked], none: ["– CI", t.dim] }[pr.ci];
    const rv = pr.draft ? ["Draft", t.dim] : { APPROVED: ["Approved", t.ansi2], CHANGES_REQUESTED: ["Changes requested", t.ansi1], REVIEW_REQUIRED: ["Review required", t.blocked] }[pr.review] ?? ["No review", t.muted];
    return h_flex().id(`pr-${pr.repo}-${pr.number}`).w_full().flex_none().px(10).py(6).gap(10).items_center().rounded(7)
      .cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => { openUrl(pr.url); })
      .child(div().w(150).flex_none().truncate().text_size(11).text_color(t.dim).child(`${pr.short}#${pr.number}`))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().text_size(12).text_color(t.foreground).child(pr.title))
        .child(h_flex().gap(6).items_center().text_size(10).text_color(t.dim)
          .child(div().child(`@${pr.author ?? "?"}`)).child(div().truncate().child(pr.branch ?? "")).child(div().child(ago(pr.updated)))))
      .child(h_flex().gap(4).flex_none().children(ps.map((p) => this.personaTag(p, t))))
      .child(div().w(110).flex_none().text_size(11).text_color(rv[1]).child(rv[0]))
      .child(div().w(40).flex_none().text_size(11).text_color(ci[1]).child(ci[0]));
  }


  // Traceability matrix: ~/.omniloy-team/trace/<project>.json (written by `team-trace build`), plus live Jira status.
  loadTrace(cx) {
    const p = this.proj(); if (!p || this.only === "prs") return;
    const ctx = p.id;
    cx.spawn(async (cx) => {
      let data = null;
      try { const text = await readTextFile(`${home()}/.omniloy-team/trace/${p.id}.json`); if (text) data = JSON.parse(text); } catch {}
      if (this.proj()?.id !== ctx) return;
      this.trace = data ?? { missing: true, rows: [] };
      const map = {};
      for (const r of this.trace.rows) if (r.tab === "active") for (const k of [...r.impl, ...r.verif]) (map[k] = map[k] ?? []).push(r.req);
      this.reqByKey = map; cx.notify();
      if (this.only !== "trace" || !data) return;
      this.loadingTrace = true; cx.notify();
      try {
        const keys = [...new Set(data.rows.filter((r) => r.tab === "active").flatMap((r) => [...r.impl, ...r.verif]))], st = {};
        for (let i = 0; i < keys.length; i += 80) {
          const r = await this.jira(`/rest/api/3/search/jql?maxResults=100&fields=status&jql=${encodeURIComponent(`key in (${keys.slice(i, i + 80).join(",")})`)}`);
          for (const it of r.issues ?? []) st[it.key] = { name: it.fields.status?.name, cat: it.fields.status?.statusCategory?.key };
        }
        if (this.proj()?.id === ctx) { this.traceJira = st; this.traceError = null; this.updated = new Date(); }
      } catch (e) { this.traceError = String(e.message || e); }
      finally { this.loadingTrace = false; cx.notify(); }
    });
  }

  syncTrace(cx) {
    const p = this.proj(); if (!p?.trace?.fileId) return;
    cx.spawn(async (cx) => {
      try { const r = await exec(`${home()}/.local/bin/team-trace`, ["sync", p.id], { timeout: 120000 }); this.syncNote = r.code === 0 ? null : (r.stderr || r.stdout || "").trim().split("\n")[0]; }
      catch (e) { this.syncNote = String(e.message || e); }
      this.syncedAt = new Date(); this.loadTrace(cx);
    });
  }

  traceGaps(r) {
    const g = [], js = this.traceJira;
    if (!r.impl.length) g.push("no ticket");
    if (!r.verif.length) g.push("no verification");
    if (!r.tc) g.push("no test case");
    const cats = r.impl.map((k) => js[k]?.cat).filter(Boolean);
    if (cats.length) {
      const jc = cats.every((c) => c === "done") ? "done" : cats.every((c) => c === "new") ? "new" : "indeterminate";
      const s = (r.status || "").toLowerCase();
      const sc = /verificad|implementad|done|hecho|released/.test(s) ? "done" : /en desarrollo|en curso|en verificaci|in progress/.test(s) ? "indeterminate" : "new";
      if (jc !== sc) g.push("status out of date");
    }
    return g;
  }

  ticketChip(k, t, prefix) {
    const st = this.traceJira[k], color = !st ? t.dim : st.cat === "done" ? t.ansi2 : st.cat === "new" ? t.muted : t.blocked;
    return h_flex().id(`tk-${prefix}-${k}`).flex_none().h(18).px(6).gap(4).items_center().rounded(5).bg(t.raised).text_size(10).cursor_pointer()
      .hover((s) => s.bg(t.hover)).on_click((_e, cx) => { cx.stop_propagation(); openUrl(`${this.config.jira.site}/browse/${k}`); })
      .child(div().size(6).rounded_full().bg(color))
      .child(div().text_color(t.foreground).child(`${prefix}${k}`))
      .when(Boolean(st), (e) => e.child(div().text_color(t.dim).child(st?.name ?? "")));
  }

  traceRow(r, gaps, t) {
    const url = r.impl[0] ? `${this.config.jira.site}/browse/${r.impl[0]}` : this.proj()?.trace?.url;
    return v_flex().id(`req-${r.tab}-${r.req}`).w_full().flex_none().px(12).py(7).gap(4).cursor_pointer()
      .border_b(1).border_color(t.border).hover((s) => s.bg(t.hover)).on_click(() => { if (url) openUrl(url); })
      .child(h_flex().gap(6).items_center()
        .child(div().flex_none().text_size(11).font_semibold().text_color(t.accent).child(r.req))
        .child(this.stagePill(this.stageOf(r), t))
        .child(div().flex_1())
        .when(gaps.includes("status out of date"), (e) => e.child(div().flex_none().px(5).h(16).flex().items_center().rounded(4).bg(t.blocked + "33").text_size(10).text_color(t.blocked).child("out of date"))))
      .child(div().text_size(12).text_color(t.foreground).child(r.title))
      .child(h_flex().gap(5).items_center().flex_wrap()
        .children(r.impl.map((k) => this.ticketChip(k, t, "")))
        .children(r.verif.map((k) => this.ticketChip(k, t, "✓ ")))
        .children(gaps.filter((g) => g !== "status out of date").map((g) => div().flex_none().px(5).h(16).flex().items_center().rounded(4).text_size(10).bg(t.ansi1 + "26").text_color(t.ansi1).child(g))));
  }

  stages() {
    return this.config?.traceStages ?? [{ id: "planned", name: "Planned", statuses: [], progress: 0, env: "Not started" }];
  }

  stageColor(st, t) {
    return { planned: t.dim, discovery: t.muted, ready: t.ansi4, dev: t.ansi4, verification: t.ansi3, validation: t.ansi5, release: t.ansi6, prod: t.ansi2 }[st.id] ?? t.muted;
  }

  // A requirement is as far along as its least advanced Jira ticket; no ticket = first stage.
  stageOf(r) {
    const all = this.stages(); let idx = null;
    for (const k of r.impl) {
      const name = (this.traceJira[k]?.name || "").toLowerCase(); if (!name) continue;
      const i = all.findIndex((s) => s.statuses.some((x) => x.toLowerCase() === name));
      if (i >= 0) idx = idx === null ? i : Math.min(idx, i);
    }
    return all[idx ?? 0];
  }

  verifOf(r) {
    const v = r.verif.map((k) => this.traceJira[k]).filter(Boolean);
    if (v.some((x) => /fail/i.test(x.name || ""))) return "failed";
    if (v.length && v.every((x) => x.cat === "done")) return "verified";
    return "pending";
  }

  stagePill(st, t) {
    const c = this.stageColor(st, t);
    return h_flex().flex_none().h(16).px(6).gap(4).items_center().rounded(8).bg(c + "26").text_size(10)
      .child(div().size(6).rounded_full().bg(c)).child(div().text_color(t.foreground).child(st.name))
      .when(st.env !== "Not started", (e) => e.child(div().text_color(t.dim).child(`· ${st.env}`)));
  }

  traceRows(t) {
    const tr = this.trace, p = this.proj(), rows = [];
    if (!tr) return [div().px(12).py(8).text_size(11).text_color(t.dim).child("Loading…")];
    if (tr.missing) return [v_flex().px(12).py(12).gap(6)
      .child(div().text_size(12).text_color(t.foreground).child(`No traceability matrix for ${p?.name} yet`))
      .child(div().text_size(11).text_color(t.dim).child("Ask Lucía to create one from Jira, or give her the link to an existing one."))];
    const active = tr.rows.filter((r) => r.tab === "active"), parked = tr.rows.filter((r) => r.tab !== "active");
    const all = this.stages(), items = active.map((r) => ({ r, gaps: this.traceGaps(r), stage: this.stageOf(r), verif: this.verifOf(r) }));
    const n = Math.max(items.length, 1), pct = (list) => Math.round(list.reduce((a, x) => a + x.stage.progress, 0) / Math.max(list.length, 1));
    const count = (fn) => items.filter(fn).length;
    const envs = ["Not started", "Dev", "Staging", "Production"], envColor = { "Not started": t.muted, Dev: t.ansi4, Staging: t.ansi5, Production: t.ansi2 };
    const pick = (id) => (_e, cx) => { this.traceStatus = this.traceStatus === id ? "any" : id; cx.notify(); };
    const barW = Math.max((this.width || 368) - 40, 100);

    // Business summary: overall progress, where things are, and how much is verified.
    rows.push(v_flex().w_full().flex_none().px(12).pt(10).pb(8).gap(8).border_b(1).border_color(t.border)
      .child(h_flex().gap(8).items_end()
        .child(div().text_size(26).font_semibold().line_height("28px").child(`${pct(items)}%`))
        .child(div().flex_1().min_w(0).pb(3).text_size(11).text_color(t.muted).child("overall progress"))
        .when(Boolean(p?.trace?.url), (e) => e.child(div().id("open-sheet").flex_none().pb(3).text_size(10).text_color(t.accent).cursor_pointer()
          .on_click(() => { openUrl(p.trace.url); }).child("Sheet ↗"))))
      .child(h_flex().w(barW).h(8).rounded(4).overflow_hidden().bg(t.raised).children(all.map((st) => {
        const c = count((x) => x.stage.id === st.id);
        return div().h_full().flex_none().w(Math.round((barW * c) / n)).bg(this.stageColor(st, t));
      })))
      .child(h_flex().gap(6).children(envs.map((env) => {
        const c = count((x) => x.stage.env === env), on = this.traceStatus === `env:${env}`;
        return v_flex().id(`env-${env}`).flex_1().min_w(0).px(8).py(6).gap(1).rounded(7).cursor_pointer()
          .border_1().border_color(on ? envColor[env] : t.border).bg(on ? envColor[env] + "22" : t.surface).hover((s) => s.bg(t.hover))
          .on_click(pick(`env:${env}`))
          .child(div().text_size(16).font_semibold().child(String(c)))
          .child(div().truncate().text_size(10).text_color(t.muted).child(env));
      })))
      .child(h_flex().gap(5).flex_wrap().children(all.map((st) =>
        this.chip(`stage-${st.id}`, `${st.name} ${count((x) => x.stage.id === st.id)}`, this.traceStatus === `stage:${st.id}`, t, (cx) => { this.traceStatus = this.traceStatus === `stage:${st.id}` ? "any" : `stage:${st.id}`; cx.notify(); }, this.stageColor(st, t))))
        .child(this.chip("verif-ok", `Verified ${count((x) => x.verif === "verified")}`, this.traceStatus === "verif:verified", t, (cx) => { this.traceStatus = this.traceStatus === "verif:verified" ? "any" : "verif:verified"; cx.notify(); }, t.ansi2))
        .child(this.chip("verif-fail", `Verification failed ${count((x) => x.verif === "failed")}`, this.traceStatus === "verif:failed", t, (cx) => { this.traceStatus = this.traceStatus === "verif:failed" ? "any" : "verif:failed"; cx.notify(); }, t.ansi1)))
      .child(h_flex().gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(10).text_color(t.dim)
          .child(`${items.length} requirements · ${count((x) => x.gaps.length)} with gaps · ${tr.pending ? `${tr.pending} edits not in Drive yet` : `Drive in sync${this.syncedAt ? " " + this.syncedAt.toLocaleTimeString().slice(0, 5) : ""}`}${this.loadingTrace ? " · checking Jira…" : ""}`))
        .child(this.seg([["module", "By module"], ["stage", "By stage"]], this.traceGroup, t, (id, cx) => { this.traceGroup = id; cx.notify(); }))));
    if (this.traceError) rows.push(div().w_full().flex_none().px(12).py(5).text_size(10).text_color(t.ansi1).child(this.traceError));
    if (this.syncNote) rows.push(div().w_full().flex_none().px(12).py(5).text_size(10).text_color(t.blocked).child(`Drive sync: ${this.syncNote}`));

    const f = this.traceFilter, ts = this.traceStatus;
    let list = f === "parked" ? parked.map((r) => ({ r, gaps: [], stage: all[0], verif: "pending", parked: true }))
      : f === "stale" ? items.filter((x) => x.gaps.includes("status out of date")) : f === "gaps" ? items.filter((x) => x.gaps.length) : items;
    if (ts !== "any" && f !== "parked") {
      const [kind, val] = ts.split(":");
      list = list.filter((x) => kind === "env" ? x.stage.env === val : kind === "stage" ? x.stage.id === val : x.verif === val);
    }
    if (!list.length) rows.push(div().px(12).py(8).text_size(11).text_color(t.dim).child("No requirements match these filters"));
    const groups = new Map();
    for (const x of list) {
      const k = x.parked ? x.r.tab : this.traceGroup === "stage" ? x.stage.name : x.r.module || "No module";
      groups.set(k, [...(groups.get(k) ?? []), x]);
    }
    const order = this.traceGroup === "stage" && f !== "parked" ? all.map((s) => s.name).filter((k) => groups.has(k)) : [...groups.keys()];
    for (const name of order) {
      const g = groups.get(name), id = `trace:${name}`;
      const extra = g[0].parked ? null : div().flex_none().text_size(10).text_color(t.muted).child(`${pct(g)}%`);
      rows.push(this.sectionHead(id, name, g.length, t, extra));
      if (this.closed[id]) continue;
      const cap = this.more[id] ? g.length : 6;
      rows.push(...g.slice(0, cap).map((x) => this.traceRow(x.r, x.gaps, t)));
      if (g.length > 6) rows.push(this.moreRow(id, g.length, 6, t));
    }
    return rows;
  }

  // ---- Narrow (side panel) layout: one scrolling list, compact filters. ----

  seg(items, current, t, onPick) {
    return h_flex().flex_none().h(24).p(2).gap(2).rounded(7).bg(t.raised).children(items.map(([id, label]) =>
      div().id(`seg-${id}`).h(20).px(8).flex().items_center().rounded(5).cursor_pointer().text_size(11)
        .bg(current === id ? t.background : t.raised).text_color(current === id ? t.foreground : t.muted)
        .on_click((_e, cx) => onPick(id, cx)).child(label)));
  }

  sectionHead(id, label, count, t, extra) {
    const closed = Boolean(this.closed[id]);
    return h_flex().id(`head-${id}`).w_full().flex_none().h(28).px(12).gap(6).items_center().cursor_pointer().bg(t.chrome)
      .border_b(1).border_color(t.border).hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { if (closed) delete this.closed[id]; else this.closed[id] = true; this.save(); cx.notify(); })
      .child(div().w(10).text_size(10).text_color(t.dim).child(closed ? "▸" : "▾"))
      .child(div().flex_1().min_w(0).truncate().text_size(11).font_semibold().text_color(t.muted).child(label))
      .when(Boolean(extra), (e) => e.child(extra))
      .child(div().px(6).h(16).flex().items_center().rounded(8).bg(t.raised).text_size(10).text_color(t.muted).child(String(count)));
  }

  moreRow(id, total, shown, t) {
    const all = Boolean(this.more[id]);
    return div().id(`more-${id}`).w_full().flex_none().px(12).py(6).text_size(11).text_color(t.accent).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { this.more[id] = !all; cx.notify(); })
      .child(all ? "Show fewer" : `Show ${total - shown} more`);
  }

  prRowNarrow(pr, t, grouped) {
    const ps = this.personasOf([...pr.labels, this.holder(`${pr.branch ?? ""} ${pr.title}`.match(/[A-Z][A-Z0-9]+-\d+/)?.[0])], `${pr.title}\n${pr.body}`);
    const ci = { pass: ["✓", t.ansi2], fail: ["✗", t.ansi1], pending: ["●", t.blocked], none: ["", t.dim] }[pr.ci];
    const rv = pr.draft ? ["Draft", t.dim] : { APPROVED: ["Approved", t.ansi2], CHANGES_REQUESTED: ["Changes", t.ansi1], REVIEW_REQUIRED: ["Needs review", t.blocked] }[pr.review] ?? ["No review", t.dim];
    return v_flex().id(`pr-${pr.repo}-${pr.number}`).w_full().flex_none().px(12).py(7).gap(3).cursor_pointer()
      .border_b(1).border_color(t.border).hover((s) => s.bg(t.hover)).on_click(() => { openUrl(pr.url); })
      .child(h_flex().gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground).child(pr.title))
        .when(Boolean(ci[0]), (e) => e.child(div().flex_none().text_size(11).text_color(ci[1]).child(ci[0]))))
      .child(h_flex().gap(6).items_center().text_size(10).text_color(t.dim)
        .child(div().flex_1().min_w(0).truncate().child(grouped ? `#${pr.number} · @${pr.author ?? "?"} · ${ago(pr.updated)}` : `${pr.short} #${pr.number} · ${ago(pr.updated)}`))
        .children(ps.map((p) => this.personaTag(p, t)))
        .child(div().flex_none().text_color(rv[1]).child(rv[0])));
  }

  issueRowNarrow(i, t) {
    const ps = this.personasOf([...i.labels, this.holder(i.key)]);
    return v_flex().id(`issue-${i.key}`).w_full().flex_none().px(12).py(7).gap(3).cursor_pointer()
      .border_b(1).border_color(t.border).hover((s) => s.bg(t.hover)).on_click(() => { openUrl(i.url); })
      .child(div().text_size(12).text_color(t.foreground).child(i.summary ?? ""))
      .child(h_flex().gap(6).items_center().text_size(10).text_color(t.dim)
        .child(div().flex_none().font_semibold().text_color(t.accent).child(i.key))
        .child(div().flex_1().min_w(0).truncate().child(`${i.type ?? ""} · ${ago(i.updated)}${i.assignee ? " · " + i.assignee.split(" ")[0] : ""}`))
        .children((this.reqByKey[i.key] ?? []).slice(0, 2).map((r) => div().flex_none().px(5).h(16).flex().items_center().rounded(4).bg(t.raised).text_size(10).text_color(t.muted).child(r)))
        .children(ps.map((p) => this.personaTag(p, t))));
  }

  render(cx) {
    const t = theme(), cfg = this.config, p = this.proj();
    const view = this.only ?? this.view;
    if (cfg && !this.only && this.width >= 760) return this.renderWide(cx).on_size_change((size, cx) => { if (size.width !== this.width) { this.width = size.width; cx.notify(); } });
    const root = v_flex().id("team-board").size_full().min_h(0).bg(t.surface).text_color(t.foreground).text_size(13)
      .on_size_change((size, cx) => { if (size.width !== this.width) { this.width = size.width; cx.notify(); } });
    if (!cfg) return root.child(div().p(16).text_color(this.configError ? t.ansi1 : t.dim).child(this.configError ?? "Loading team config…"));

    const mine = this.issues.filter((i) => this.matches(this.personasOf([...i.labels, this.holder(i.key)])));
    const issues = this.timeFilter(mine), st = this.stats(mine);
    const pf = this.only === "prs" ? this.prFilter ?? "all" : "all";
    const prs = this.prs.filter((pr) => this.matches(this.personasOf([...pr.labels, this.holder(`${pr.branch ?? ""} ${pr.title}`.match(/[A-Z][A-Z0-9]+-\d+/)?.[0])], `${pr.title}\n${pr.body}`)))
      .filter((pr) => pf === "all" || (pf === "review" ? !pr.draft && pr.review !== "APPROVED" : pr.review === "APPROVED" && pr.ci !== "fail"));
    const hasBoard = this.board === "product" ? p?.productBoard : p?.devBoard;
    const busy = Boolean(this.loadingJira || this.loadingPrs);
    const cols = this.columns.map((c) => ({ name: c.name, items: issues.filter((i) => c.statuses.includes(i.statusId)) }));
    const mapped = new Set(this.columns.flatMap((c) => c.statuses));
    const orphans = issues.filter((i) => !mapped.has(i.statusId));
    if (orphans.length) cols.push({ name: "Other", items: orphans });

    const header = v_flex().flex_none().px(12).pt(10).pb(8).gap(8).border_b(1).border_color(t.border)
      .child(h_flex().gap(6).items_center()
        .child(h_flex().id("proj-pick").h(24).px(8).gap(5).items_center().rounded(7).cursor_pointer().flex_none()
          .bg(this.pickProject ? t.selected : t.raised).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { this.pickProject = !this.pickProject; cx.notify(); })
          .child(div().text_size(12).font_semibold().child(p?.name ?? "Project"))
          .child(div().text_size(9).text_color(t.dim).child(this.pickProject ? "▴" : "▾")))
        .when(this.only === "trace", (e) => e.child(this.seg([["stale", "Out of date"], ["gaps", "Gaps"], ["all", "All"], ["parked", "Parked"]], this.traceFilter, t, (id, cx) => { this.traceFilter = id; cx.notify(); })))
        .when(this.only !== "prs" && this.only !== "trace", (e) => e.child(this.seg([["product", "Product"], ["dev", "Dev"]], this.board, t, (id, cx) => this.select({ board: id }, cx))))
        .when(this.only === "prs", (e) => e.child(this.seg([["all", "All"], ["review", "To review"], ["mine", "Ready"]], this.prFilter ?? "all", t, (id, cx) => { this.prFilter = id; cx.notify(); })))
        .child(div().flex_1())
        .child(div().id("refresh").size(24).flex().flex_none().items_center().justify_center().rounded(6).cursor_pointer().text_size(13)
          .text_color(busy ? t.dim : t.muted).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { this.tok = null; if (this.only === "trace") this.syncTrace(cx); this.reload(cx, false); }).child(busy ? "…" : "↻")))
      .when(this.pickProject, (e) => e.child(v_flex().rounded(8).bg(t.raised).p(3).children((cfg.projects ?? []).map((x) =>
        h_flex().id(`proj-${x.id}`).h(26).px(8).gap(8).items_center().rounded(5).cursor_pointer().text_size(12)
          .bg(x.id === p?.id ? t.selected : t.raised).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { this.pickProject = false; this.select({ project: x.id }, cx); })
          .child(div().flex_1().child(x.name)).child(div().text_size(10).text_color(t.dim).child(x.jiraProject ?? ""))))))
      .when(this.only !== "trace", (e) => e.child(h_flex().gap(5).items_center().flex_wrap()
        .child(this.chip("persona-all", "All", this.persona === "all", t, (cx) => this.select({ persona: "all" }, cx)))
        .children(this.chipPersonas().map((x) =>
          this.chip(`persona-${x.slug}`, x.name.split(" ")[0], this.persona === x.slug, t, (cx) => this.select({ persona: x.slug }, cx), x.color)))
        .child(this.chip("persona-none", "None", this.persona === "none", t, (cx) => this.select({ persona: "none" }, cx)))))
      .when(this.only !== "trace" && this.only !== "prs", (e) => e
        .child(h_flex().gap(6).items_center().flex_wrap()
          .child(this.seg(this.showItems().map(([id, l]) => [id, id === "stale" ? `> ${this.staleDays() === 7 ? "1w" : "2w"}` : l]), this.show, t, (id, cx) => this.select({ show: id }, cx)))
          .child(this.seg([["7", "1w"], ["14", "2w"], ["all", "All time"]], this.period, t, (id, cx) => this.select({ period: id }, cx))))
        .child(div().text_size(10).text_color(t.dim).child(`${st.done} done ${this.periodLabel()} · ${st.open} open · ${st.stale} pending > ${this.staleDays()}d`)))
      .when(!this.only, (e) => e.child(h_flex().gap(6).items_center()
        .child(this.seg([["both", "All"], ["prs", "PRs"], ["jira", "Jira"]], this.view, t, (id, cx) => this.select({ view: id }, cx)))));

    const rows = [];
    if (this.only === "trace") return root.child(header).child(v_flex().id("board-scroll").flex_1().min_h(0).overflow_y_scrollbar().children(this.traceRows(t)));
    if (view !== "jira") {
      if (!this.only) rows.push(this.sectionHead("prs", "Pull requests", prs.length, t));
      else rows.push(div().w_full().flex_none().px(12).py(6).text_size(11).text_color(t.dim).child(`${prs.length} open across ${(p?.repos ?? []).length} repos${busy ? " · refreshing…" : ""}`));
      if (this.only === "prs") {
        const by = new Map(); for (const pr of prs) by.set(pr.short, [...(by.get(pr.short) ?? []), pr]);
        if (!prs.length) rows.push(div().px(12).py(8).text_size(11).text_color(t.dim).child(this.loadingPrs ? "Loading…" : "No open PRs match"));
        for (const [repo, list] of by) {
          const id = `repo:${repo}`;
          rows.push(this.sectionHead(id, repo, list.length, t));
          if (!this.closed[id]) rows.push(...list.map((pr) => this.prRowNarrow(pr, t, true)));
        }
      } else {
      if (this.prError) rows.push(div().w_full().flex_none().px(12).py(5).text_size(10).text_color(t.ansi1).child(this.prError));
      if (!this.closed.prs) {
        const cap = view === "prs" || this.more.prs ? prs.length : 6;
        rows.push(...prs.slice(0, cap).map((pr) => this.prRowNarrow(pr, t)));
        if (!prs.length) rows.push(div().px(12).py(8).text_size(11).text_color(t.dim).child(this.loadingPrs ? "Loading…" : "No open PRs match"));
        if (view !== "prs" && prs.length > 6) rows.push(this.moreRow("prs", prs.length, 6, t));
      }
      }
      if (this.only && this.prError) rows.push(div().w_full().flex_none().px(12).py(5).text_size(10).text_color(t.ansi1).child(this.prError));
    }
    if (view !== "prs") {
      const link = div().id("open-board").flex_none().text_size(10).text_color(t.accent).cursor_pointer()
        .on_click((_e, cx) => { cx.stop_propagation(); openUrl(hasBoard ? `${cfg.jira.site}/jira/software/c/projects/${p.jiraProject}/boards/${hasBoard}` : `${cfg.jira.site}/browse/${p.jiraProject}`); })
        .child("Jira ↗");
      rows.push(h_flex().w_full().flex_none().h(26).px(12).gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(`${p?.jiraProject ?? ""} ${this.board === "product" ? "Product" : "Dev"} board · ${issues.length} cards`))
        .child(link));
      if (this.jiraError) rows.push(div().w_full().flex_none().px(12).py(5).text_size(10).text_color(t.ansi1).child(this.jiraError));
      if (!cols.length && !this.jiraError) rows.push(div().px(12).py(8).text_size(11).text_color(t.dim).child(this.loadingJira ? "Loading…" : "No cards"));
      cols.forEach((c, ci) => {
        if (!c.items.length) return;
        const id = `col:${c.name}`;
        rows.push(this.sectionHead(id, c.name, c.items.length, t));
        if (this.closed[id]) return;
        const cap = this.more[id] ? c.items.length : 5;
        rows.push(...c.items.slice(0, cap).map((i) => this.issueRowNarrow(i, t)));
        if (c.items.length > 5) rows.push(this.moreRow(id, c.items.length, 5, t));
      });
    }
    return root.child(header).child(v_flex().id("board-scroll").flex_1().min_h(0).overflow_y_scrollbar().children(rows));
  }

  renderWide(cx) {
    const t = theme(), cfg = this.config, p = this.proj();
    const root = v_flex().id("team-board").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13);
    if (!cfg) return root.child(div().p(16).text_color(this.configError ? t.ansi1 : t.dim).child(this.configError ?? "Loading team config…"));

    const mine = this.issues.filter((i) => this.matches(this.personasOf([...i.labels, this.holder(i.key)])));
    const issues = this.timeFilter(mine), st = this.stats(mine);
    const prs = this.prs.filter((pr) => this.matches(this.personasOf([...pr.labels, this.holder(`${pr.branch ?? ""} ${pr.title}`.match(/[A-Z][A-Z0-9]+-\d+/)?.[0])], `${pr.title}\n${pr.body}`)));
    const hasBoard = this.board === "product" ? p?.productBoard : p?.devBoard;
    const busy = Boolean(this.loadingJira || this.loadingPrs);

    // Columns: board config order; issues whose status isn't mapped go to "Other".
    const cols = this.columns.map((c) => ({ name: c.name, items: issues.filter((i) => c.statuses.includes(i.statusId)) }));
    const mapped = new Set(this.columns.flatMap((c) => c.statuses));
    const orphans = issues.filter((i) => !mapped.has(i.statusId));
    if (orphans.length) cols.push({ name: "Other", items: orphans });

    const header = v_flex().flex_none().px(14).pt(10).pb(8).gap(8).border_b(1).border_color(t.border)
      .child(h_flex().gap(8).items_center()
        .child(div().font_semibold().text_size(14).child("Team Board"))
        .child(h_flex().gap(6).flex_wrap().children((cfg.projects ?? []).map((x) =>
          this.chip(`proj-${x.id}`, x.name, x.id === p?.id, t, (cx) => this.select({ project: x.id }, cx)))))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(t.dim).child(busy ? "Refreshing…" : this.updated ? `Updated ${this.updated.toLocaleTimeString()}` : ""))
        .child(div().id("refresh").h(24).px(10).flex().items_center().rounded(6).cursor_pointer().text_size(12).bg(t.raised).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { this.tok = null; this.reload(cx, false); }).child(busy ? "…" : "↻ Refresh")))
      .child(h_flex().gap(6).items_center().flex_wrap()
        .child(this.chip("board-product", "Product board", this.board === "product", t, (cx) => this.select({ board: "product" }, cx)))
        .child(this.chip("board-dev", "Dev board", this.board === "dev", t, (cx) => this.select({ board: "dev" }, cx)))
        .child(div().w(1).h(18).bg(t.border).mx(4))
        .child(this.chip("view-both", "Both", this.view === "both", t, (cx) => this.select({ view: "both" }, cx)))
        .child(this.chip("view-jira", "Jira", this.view === "jira", t, (cx) => this.select({ view: "jira" }, cx)))
        .child(this.chip("view-prs", "PRs", this.view === "prs", t, (cx) => this.select({ view: "prs" }, cx))))
      .child(h_flex().gap(6).items_center().flex_wrap()
        .child(div().text_size(11).text_color(t.dim).child("Agent"))
        .child(this.chip("persona-all", "All", this.persona === "all", t, (cx) => this.select({ persona: "all" }, cx)))
        .children(this.chipPersonas().map((x) =>
          this.chip(`persona-${x.slug}`, `${x.name} · ${x.role}`, this.persona === x.slug, t, (cx) => this.select({ persona: x.slug }, cx), x.color)))
        .child(this.chip("persona-none", "No agent", this.persona === "none", t, (cx) => this.select({ persona: "none" }, cx))))
      .child(h_flex().gap(6).items_center().flex_wrap()
        .child(div().text_size(11).text_color(t.dim).child("Show"))
        .children(this.showItems().map(([id, l]) => this.chip(`show-${id}`, l, this.show === id, t, (cx) => this.select({ show: id }, cx), id === "done" ? t.ansi2 : id === "stale" ? t.ansi3 : undefined)))
        .child(div().w(1).h(18).bg(t.border).mx(4))
        .child(div().text_size(11).text_color(t.dim).child("Period"))
        .children([["7", "Last week"], ["14", "Last 2 weeks"], ["all", "All time"]].map(([id, l]) => this.chip(`period-${id}`, l, this.period === id, t, (cx) => this.select({ period: id }, cx))))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(t.muted).child(`${st.done} done ${this.periodLabel()} · ${st.created} created · ${st.open} open · ${st.stale} pending > ${this.staleDays()} days`)));

    const prH = Math.min(Math.max(prs.length, 1) * 46 + 8, 280);
    const prSection = v_flex().min_h(0).border_b(1).border_color(t.border)
      .when(this.view === "prs", (e) => e.flex_1()).when(this.view !== "prs", (e) => e.flex_none())
      .child(h_flex().px(14).py(6).gap(8).items_center()
        .child(div().font_semibold().text_size(12).child(`Pending PRs · ${prs.length}`))
        .child(div().text_size(11).text_color(t.dim).child(`${(p?.repos ?? []).length} repos`))
        .when(Boolean(this.prError), (e) => e.child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.ansi1).child(this.prError))))
      .child(div().min_h(0).relative().when(this.view === "prs", (e) => e.flex_1()).when(this.view !== "prs", (e) => e.h(prH))
        .child(v_flex().id("pr-list").size_full().overflow_y_scroll().px(4).pb(6).children(prs.map((pr) => this.prRow(pr, t)))
          .when(!prs.length, (e) => e.child(div().px(10).py(6).text_size(12).text_color(t.dim).child(this.loadingPrs ? "Loading PRs…" : "No open PRs match"))))
        .child(Scrollbar.vertical("pr-list").absolute().inset_0()));

    const jiraSection = v_flex().flex_1().min_h(0)
      .child(h_flex().px(14).py(6).gap(8).items_center()
        .child(div().font_semibold().text_size(12).child(`${p?.jiraProject ?? ""} ${this.board === "product" ? "Product" : "Dev"} board · ${issues.length}`))
        .when(!hasBoard, (e) => e.child(div().text_size(11).text_color(t.dim).child(`no board: JQL project = ${p?.jiraProject}`)))
        .child(div().id("open-board").text_size(11).text_color(t.accent).cursor_pointer()
          .on_click(() => { openUrl(hasBoard ? `${cfg.jira.site}/jira/software/c/projects/${p.jiraProject}/boards/${hasBoard}` : `${cfg.jira.site}/browse/${p.jiraProject}`); })
          .child("Open in Jira ↗"))
        .when(Boolean(this.jiraError), (e) => e.child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.ansi1).child(this.jiraError))))
      .child(div().id("jira-x").flex_1().min_h(0).overflow_x_scroll()
        .child(h_flex().h_full().gap(10).px(14).pb(10).items_start()
          .children(cols.map((c, ci) => v_flex().id(`col-${ci}`).w(270).flex_none().h_full().min_h(0).rounded(10).bg(t.canvas ?? t.chrome).border_1().border_color(t.border)
            .child(h_flex().px(10).py(7).gap(6).items_center()
              .child(div().text_size(11).font_semibold().text_color(t.muted).child(c.name.toUpperCase()))
              .child(div().px(5).rounded(4).bg(t.raised).text_size(10).text_color(t.dim).child(String(c.items.length))))
            .child(v_flex().id(`col-list-${ci}`).flex_1().min_h(0).overflow_y_scroll().px(6).pb(6).gap(6)
              .children(c.items.map((i) => this.issueCard(i, t))))))
          .when(!cols.length, (e) => e.child(div().py(6).text_size(12).text_color(t.dim).child(this.loadingJira ? "Loading Jira…" : this.jiraError ? "" : "No issues")))));

    return root.child(header)
      .when(this.view !== "jira", (e) => e.child(prSection))
      .when(this.view !== "prs", (e) => e.child(jiraSection));
  }
}
