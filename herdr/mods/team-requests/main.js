// Requests: what the team agents need from the person (requests) and what they
// left as messages (notes). Store: ~/.omniloy-team/requests.json, written by `team-ask`.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView } from "gpui-base";
import { exec, readTextFile, theme, home, run, setShared } from "herdr";

// Text the person can select and copy (plain divs are not selectable).
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const refOf = (u) => { // a GitHub or Jira address reads as what it is: "PR #412 · repo", "SOC-472"
  let m = /^https?:\/\/github\.com\/[^/\s]+\/([^/\s]+)\/(pull|issues|commit|actions\/runs)\/([0-9a-f]+)/i.exec(u);
  if (m) return m[2] === 'pull' ? `PR #${m[3]} · ${m[1]}` : m[2] === 'issues' ? `Issue #${m[3]} · ${m[1]}` : m[2] === 'commit' ? `Commit ${m[3].slice(0, 7)} · ${m[1]}` : `Run ${m[3]} · ${m[1]}`;
  m = /^https?:\/\/[^/\s]+\.atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/.exec(u);
  return m ? m[1] : '';
};
// Addresses become links the system browser opens: [text](url) and bare ones.
const linked = (s) => {
  const held = [], hold = (h) => `\u0000${held.push(h) - 1}\u0000`;
  const a = (url, label) => hold(`<a href="${url}">${label}</a>`);
  return esc(s)
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, url) => a(url, text))
    .replace(/https?:\/\/[^\s<)\]]*[^\s<)\].,;:!?]/g, (url) => a(url, refOf(url) || url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")))
    .replace(/\u0000(\d+)\u0000/g, (_m, i) => held[i]).replace(/\n/g, "<br>");
};
const sel = (id, s, color) => { const el = TextView.html(id, `<span>${linked(s)}</span>`).selectable(true).on_link_click((url) => { exec("open", [url]); }); return color ? el.text_color(color) : el; };

const ago = (iso) => {
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "now" : m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

export default class TeamRequests extends View {
  init(_props, cx) {
    this.items = []; this.team = null; this.error = null; this.inputs = {}; this.sending = {}; this.showDone = false; this.filter = "all";
    cx.timer.every(3000, (cx) => this.load(cx));
    this.load(cx);
  }

  load(cx) {
    cx.spawn(async (cx) => {
      try {
        if (!this.team || !this.teamAt || Date.now() - this.teamAt > 60000) {
          const dev = JSON.parse(await readTextFile(`${home()}/.omniloy-team/team.json`));
          let biz = null; try { biz = JSON.parse(await readTextFile(`${home()}/.omniloy-biz/team.json`)); } catch {}
          const mar = { personas: [], leads: [] }; for (const d of [".omniloy-misc"]) { try { const x = JSON.parse(await readTextFile(`${home()}/${d}/team.json`)); mar.personas.push(...x.personas); mar.leads.push(x.lead); } catch {} }
          const temps = []; for (const d of [".omniloy-team", ".omniloy-biz", ".omniloy-misc"]) { try { temps.push(...JSON.parse(await readTextFile(`${home()}/${d}/temps.json`))); } catch {} }
          mar.personas.push(...temps);
          this.team = { ...dev, personas: [...dev.personas, ...(biz?.personas ?? []), ...(mar?.personas ?? [])], leads: [dev.lead ?? "lucia", biz?.lead, ...mar.leads].filter(Boolean) };
          this.teamAt = Date.now();
        }
        const text = await readTextFile(`${home()}/.omniloy-team/requests.json`);
        const items = text ? JSON.parse(text).items ?? [] : [];
        const sig = JSON.stringify(items);
        for (const x of items) if (x.status === "open" && x.kind === "request" && (x.to ?? "__OWNER_ID__") === "__OWNER_ID__") this.makeInput(x.id);
        if (sig !== this.sig) { this.sig = sig; this.items = items; this.error = null; cx.notify(); }
      } catch (e) { const m = String(e.message || e); if (m !== this.error) { this.error = m; cx.notify(); } }
    });
  }

  persona(name) { return this.team?.personas?.find((p) => p.herdrName === name) ?? { name, role: "", color: "#888888" }; }

  ask(args, id, cx) {
    this.sending[id] = true; cx.notify();
    cx.spawn(async (cx) => {
      try { const r = await exec(`${home()}/.local/bin/team-ask`, args, { timeout: 30000 }); if (r.code !== 0) this.error = (r.stderr || r.stdout).trim().split("\n")[0]; }
      catch (e) { this.error = String(e.message || e); }
      delete this.sending[id]; this.load(cx); cx.notify();
    });
  }

  input(id) { return this.inputs[id]; }

  makeInput(id) {
    if (!this.inputs[id]) {
      const st = InputState.new({ value: "", placeholder: "Write an answer…" });
      st.on("submit", (_e, cx) => { const v = st.value().trim(); if (v) this.ask(["answer", String(id), v], id, cx); });
      this.inputs[id] = st;
    }
    return this.inputs[id];
  }

  btn(id, label, t, onClick, primary) {
    return h_flex().id(id).h(24).px(9).flex_none().items_center().rounded(6).cursor_pointer().text_size(11)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground)
      .hover((s) => s.opacity(0.85)).on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); }).child(label);
  }

  card(x, t) {
    const p = this.persona(x.from), open = x.status === "open", isReq = x.kind === "request", busy = Boolean(this.sending[x.id]);
    const site = this.team?.jira?.site;
    return v_flex().id(`rq-${x.id}`).w_full().flex_none().px(12).py(10).gap(6).border_b(1).border_color(t.border)
      .child(h_flex().gap(6).items_center()
        .child(div().size(8).flex_none().rounded_full().bg(p.color))
        .child(div().flex_none().text_size(12).font_semibold().child(p.name.split(" ")[0]))
        .child(div().flex_1().min_w(0).truncate().text_size(10).text_color(t.dim).child(`${p.role}${x.via ? ` · via ${this.persona(x.via).name.split(" ")[0]}` : ""} · ${ago(x.created)}`))
        .when(Boolean(x.ticket), (e) => e.child(div().id(`rq-t-${x.id}`).flex_none().px(5).h(16).flex().items_center().rounded(4).bg(t.raised).text_size(10).text_color(t.accent).cursor_pointer()
          .on_click(() => { if (site) exec("open", [`${site}/browse/${x.ticket}`]); }).child(x.ticket)))
        .child(div().flex_none().px(5).h(16).flex().items_center().rounded(4).text_size(10)
          .bg(isReq && open ? t.blocked + "33" : t.raised).text_color(isReq && open ? t.blocked : t.muted)
          .child(isReq ? (open ? "needs you" : x.status) : open ? "message" : x.status)))
      .child(div().text_size(13).text_color(t.foreground).child(sel(`rq-ti-${x.id}`, x.title)))
      .when(Boolean(x.body), (e) => e.child(div().text_size(11).text_color(t.muted).child(sel(`rq-bo-${x.id}`, x.body, t.muted))))
      .when(Boolean(x.answer), (e) => e.child(div().text_size(11).text_color(t.ansi2).child(sel(`rq-an-${x.id}`, `You: ${x.answer}`, t.ansi2))))
      .when(open && isReq && !busy, (e) => e
        .when(x.options.length > 0, (e2) => e2.child(h_flex().gap(5).flex_wrap().children(x.options.map((o, i) =>
          this.btn(`rq-o-${x.id}-${i}`, o, t, (cx) => this.ask(["answer", String(x.id), o], x.id, cx), i === 0)))))
        .child(h_flex().gap(5).items_center()
          .when(Boolean(this.input(x.id)), (e3) => e3.child(Input.new(this.input(x.id)).flex_1().min_w(0).h(28).px(8).rounded(6).border_1().border_color(t.input).bg(t.background).text_size(12).text_color(t.foreground)))
          .child(this.btn(`rq-send-${x.id}`, "Send", t, (cx) => { const v = (this.input(x.id)?.value() ?? "").trim(); if (v) this.ask(["answer", String(x.id), v], x.id, cx); }, x.options.length === 0))))
      .when(open && !busy, (e) => e.child(h_flex().gap(10).items_center().text_size(10).text_color(t.accent)
        .child(div().id(`rq-go-${x.id}`).cursor_pointer().on_click(() => { run("tab.select", { id: `${["irene", "pablo", "elena"].includes(x.from) ? "biz" : "team"}-${x.from}` }); }).child(`Open ${p.name.split(" ")[0]}'s terminal`))
        .when(!isReq, (e2) => e2.child(div().id(`rq-read-${x.id}`).cursor_pointer().on_click((_e, cx) => this.ask(["read", String(x.id)], x.id, cx)).child("Mark as read")))))
      .when(busy, (e) => e.child(div().text_size(11).text_color(t.dim).child("Sending…")));
  }

  render(cx) {
    const t = theme();
    const mine = this.items.filter((x) => (x.to ?? "__OWNER_ID__") === "__OWNER_ID__"), withLucia = this.items.filter((x) => x.to && x.to !== "__OWNER_ID__" && x.status === "open").length;
    const open = mine.filter((x) => x.status === "open");
    const reqs = open.filter((x) => x.kind === "request"), notes = open.filter((x) => x.kind === "note");
    const done = mine.filter((x) => x.status === "answered" || x.status === "read").slice(-15).reverse();
    const counts = `${reqs.length}:${notes.length}`;
    if (counts !== this.counts) { this.counts = counts; setShared("team.requests.open", reqs.length); setShared("team.requests.notes", notes.length); }
    const who = this.filter, pass = (x) => who === "all" || x.from === who;
    const names = [...new Set(open.map((x) => x.from))];
    const chip = (id, label, color) => h_flex().id(`rf-${id}`).h(22).px(8).gap(5).flex_none().items_center().rounded(11).cursor_pointer().text_size(11)
      .border_1().border_color(who === id ? (color ?? t.accent) : t.border).bg(who === id ? t.selected : t.surface).text_color(who === id ? t.foreground : t.muted)
      .on_click((_e, cx) => { this.filter = id; cx.notify(); })
      .when(Boolean(color), (e) => e.child(div().size(7).rounded_full().bg(color))).child(label);
    const head = (label, n) => h_flex().w_full().flex_none().h(26).px(12).gap(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(div().flex_1().text_size(11).font_semibold().text_color(t.muted).child(label))
      .child(div().px(6).h(16).flex().items_center().rounded(8).bg(t.raised).text_size(10).text_color(t.muted).child(String(n)));
    const rows = [];
    if (this.error) rows.push(div().px(12).py(6).text_size(10).text_color(t.ansi1).child(this.error));
    if (withLucia) rows.push(div().w_full().flex_none().px(12).py(6).text_size(10).text_color(t.dim).child(`The team leads are handling ${withLucia} more`));
    rows.push(head("Needs your answer", reqs.filter(pass).length));
    rows.push(...reqs.filter(pass).map((x) => this.card(x, t)));
    if (!reqs.filter(pass).length) rows.push(div().px(12).py(10).text_size(11).text_color(t.dim).child("Nothing is waiting for you"));
    rows.push(head("Messages for you", notes.filter(pass).length));
    rows.push(...notes.filter(pass).map((x) => this.card(x, t)));
    if (!notes.filter(pass).length) rows.push(div().px(12).py(10).text_size(11).text_color(t.dim).child("No new messages"));
    rows.push(h_flex().id("rq-done").w_full().flex_none().h(26).px(12).gap(6).items_center().bg(t.chrome).border_b(1).border_color(t.border).cursor_pointer()
      .on_click((_e, cx) => { this.showDone = !this.showDone; cx.notify(); })
      .child(div().w(10).text_size(10).text_color(t.dim).child(this.showDone ? "▾" : "▸"))
      .child(div().flex_1().text_size(11).font_semibold().text_color(t.muted).child("Answered and read"))
      .child(div().px(6).h(16).flex().items_center().rounded(8).bg(t.raised).text_size(10).text_color(t.muted).child(String(done.length))));
    if (this.showDone) rows.push(...done.filter(pass).map((x) => this.card(x, t)));
    return v_flex().id("team-requests").size_full().min_h(0).bg(t.surface).text_color(t.foreground).text_size(13)
      .child(h_flex().flex_none().px(12).pt(10).pb(8).gap(5).items_center().flex_wrap().border_b(1).border_color(t.border)
        .child(div().flex_none().pr(4).text_size(13).font_semibold().child("Requests"))
        .child(chip("all", "All"))
        .children(names.map((n) => chip(n, this.persona(n).name.split(" ")[0], this.persona(n).color))))
      .child(v_flex().id("rq-scroll").flex_1().min_h(0).overflow_y_scrollbar().children(rows));
  }
}
