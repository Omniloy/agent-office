// Drafts: every outgoing message the team prepared in the person's name (Gmail, WhatsApp, Slack).
// Store: ~/.omniloy-biz/drafts.json, written by `team-draft`. Read, edit, open in the real app,
// send (Gmail, through the Gmail API, only on the person's click), ask the author. WhatsApp is sent in WhatsApp.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea, TextView } from "gpui-base";
import { exec, readTextFile, theme, home, run } from "herdr";

// Text the person can select and copy (plain divs are not selectable).
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sel = (id, s, color) => { const el = TextView.html(id, `<span>${esc(s).replace(/\n/g, "<br>")}</span>`).selectable(true); return color ? el.text_color(color) : el; };

const APP = { gmail: "Gmail", whatsapp: "WhatsApp", slack: "Slack" };
const ago = (iso) => {
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "now" : m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};
const BIN = () => `${home()}/.local/bin/team-draft`;

export default class TeamDrafts extends View {
  init(_props, cx) {
    this.drafts = []; this.people = {}; this.error = null; this.cur = null; this.filter = "all"; this.busy = {}; this.flash = {}; this.sure = {}; this.editing = {}; this.sig = null; this.signature = null;
    this.body = {}; this.subject = {}; this.question = {}; this.base = {};
    cx.timer.every(3000, (cx) => this.load(cx));
    // Drafts sent or deleted in Gmail itself drop off the list on their own.
    const sync = (cx) => cx.spawn(async (cx) => { try { await exec(BIN(), ["sync"], { timeout: 60000 }); } catch {} this.load(cx); });
    cx.timer.every(60000, sync); sync(cx);
    this.load(cx);
  }

  load(cx) {
    cx.spawn(async (cx) => {
      try {
        if (!this.peopleAt || Date.now() - this.peopleAt > 60000) {
          const people = {};
          for (const f of [".omniloy-biz", ".omniloy-team"]) {
            try { for (const p of JSON.parse(await readTextFile(`${home()}/${f}/team.json`)).personas ?? []) people[p.herdrName] = p; } catch {}
          }
          this.people = people; this.peopleAt = Date.now();
        }
        // `team-draft json` adds the link that opens each draft in its app.
        const r = await exec(BIN(), ["json"], { timeout: 10000 });
        const out = r.code === 0 ? JSON.parse(r.stdout) : {}, drafts = out.drafts ?? [];
        this.signature = out.signature ?? this.signature;
        for (const x of drafts) this.states(x, cx);
        const sig = JSON.stringify(drafts);
        if (sig !== this.sig) {
          this.sig = sig; this.drafts = drafts; this.error = r.code === 0 ? null : (r.stderr || "").trim().split("\n")[0];
          if (this.cur !== null && !drafts.some((x) => x.id === this.cur)) this.cur = null;
          if (this.cur === null && drafts.length) this.cur = drafts[0].id;
          cx.notify();
        }
      } catch (e) { const m = String(e.message || e); if (m !== this.error) { this.error = m; cx.notify(); } }
    });
  }

  // Text states live outside render. A draft the author rewrote replaces the text only if the person has not typed over it.
  states(x, cx) {
    const id = x.id;
    if (!this.body[id]) {
      const ta = TextareaState.new({ value: x.body, placeholder: "Message text", rows: 8 });
      ta.set_auto_grow(6, 22); ta.on("change", (_e, cx) => cx.notify());
      this.body[id] = ta; this.base[id] = { body: x.body, subject: x.subject };
      const su = InputState.new({ value: x.subject ?? "", placeholder: "Subject" }); su.on("change", (_e, cx) => cx.notify()); this.subject[id] = su;
      const q = InputState.new({ value: "", placeholder: "Ask about this draft…" });
      q.on("submit", (_e, cx) => this.ask(id, cx)); this.question[id] = q;
    } else {
      const b = this.base[id];
      if (x.body !== b.body) { if (this.body[id].value() === b.body) this.body[id].set_value(x.body); b.body = x.body; }
      if ((x.subject ?? "") !== (b.subject ?? "")) { if (this.subject[id].value() === (b.subject ?? "")) this.subject[id].set_value(x.subject ?? ""); b.subject = x.subject; }
    }
  }

  who(slug) { return this.people[slug] ?? { name: slug, color: "#888888", role: "" }; }
  first(slug) { return this.who(slug).name.split(" ")[0]; }
  dirty(x) { const t = this.body[x.id], s = this.subject[x.id]; return Boolean(t) && (t.value().trim() !== x.body.trim() || (x.channel === "gmail" && s.value() !== (x.subject ?? ""))); }

  call(id, args, cx, done) {
    this.busy[id] = true; cx.notify();
    return cx.spawn(async (cx) => {
      let ok = false;
      try { const r = await exec(BIN(), args, { timeout: 30000 }); ok = r.code === 0; if (!ok) this.error = (r.stderr || r.stdout).trim().split("\n")[0]; else this.error = null; }
      catch (e) { this.error = String(e.message || e); }
      delete this.busy[id]; if (ok && done) done(cx); this.sig = null; this.load(cx); cx.notify();
    });
  }
  save(x, cx, then) {
    const text = this.body[x.id].value().trim(); if (!text) return;
    const args = ["edit", String(x.id), "--body", text];
    if (x.channel === "gmail") args.push("--subject", this.subject[x.id].value());
    this.call(x.id, args, cx, (cx) => {
      this.base[x.id] = { body: text, subject: this.subject[x.id].value() };
      this.flash[x.id] = x.channel === "gmail" ? "Saved. The Gmail draft now says this." : "Saved."; this.editing[x.id] = false;
      if (then) then(cx);
    });
  }
  send(x, cx) {
    const go = (cx) => this.call(x.id, ["send", String(x.id), "--by-owner"], cx);
    if (this.dirty(x)) this.save(x, cx, go); else go(cx);
  }
  // The message as the recipient will see it: paragraphs, then the signature with its links.
  preview(x, t) {
    const text = this.body[x.id].value(), sig = this.signature, lines = text.replace(/\s+$/, "").split("\n");
    const squash = (s) => s.replace(/[\s|]+/g, " ").trim();
    let body = text, hasSig = false;
    if (sig && lines.length >= 3) {
      const want = [sig.name, sig.title, sig.links.map((l) => `${l.label}: ${l.url}`).join(" ")].map(squash);
      if (lines.slice(-3).map(squash).every((l, i) => l === want[i])) { hasSig = true; body = lines.slice(0, -3).join("\n"); }
    }
    const paras = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    return v_flex().id(`dr-prev-${x.id}`).w_full().px(10).py(9).gap(9).rounded(6).border_1().border_color(t.input).bg(t.background).text_size(12).text_color(t.foreground)
      .child(div().w_full().child(sel(`dr-p-${x.id}`, paras.join("\n\n"))))
      .when(hasSig, (e) => e.child(v_flex().gap(1)
        .child(div().font_semibold().child(sig.name))
        .child(div().child(sig.title))
        .child(h_flex().gap(sig.appSeparator.trim() ? 5 : 6).items_center().children(sig.links.flatMap((l, i) => [
          ...(i && sig.appSeparator.trim() ? [div().text_color(t.muted).child(sig.appSeparator.trim())] : []),
          div().id(`dr-l-${x.id}-${i}`).text_color(t.accent).underline().cursor_pointer().on_click((_e, cx) => { cx.stop_propagation(); exec("open", [l.url]); }).child(l.label)])))));
  }
  ask(id, cx) {
    const q = this.question[id], v = q.value().trim(); if (!v) return;
    this.call(id, ["ask", String(id), v], cx, () => q.set_value(""));
  }
  openExternal(x, cx) {
    // Saving first means the WhatsApp link carries the text as it is on screen.
    const go = async () => { const r = await exec(BIN(), ["show", String(x.id)], { timeout: 10000 }); try { const link = JSON.parse(r.stdout).link; if (link) exec("open", [link]); } catch {} };
    if (this.dirty(x)) this.save(x, cx, () => { go(); }); else go();
  }

  btn(id, label, t, onClick, primary) {
    return h_flex().id(id).h(24).px(9).flex_none().items_center().rounded(6).cursor_pointer().text_size(11)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground)
      .hover((s) => s.opacity(0.85)).on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); }).child(label);
  }
  badge(x, t) {
    const c = x.channel === "whatsapp" ? t.ansi2 : x.channel === "gmail" ? t.ansi4 : t.ansi5;
    return div().flex_none().px(5).h(16).flex().items_center().rounded(4).bg(c + "33").text_color(c).text_size(10).font_semibold().child(APP[x.channel] ?? x.channel);
  }

  row(x, t) {
    const p = this.who(x.from), on = this.cur === x.id, talk = x.talk ?? [];
    const reply = talk.length > 0 && talk[talk.length - 1].who !== "__OWNER_ID__";
    const head = v_flex().id(`dr-${x.id}`).w_full().flex_none().px(12).py(9).gap(4).cursor_pointer().bg(on ? t.selected : t.surface)
      .on_click((_e, cx) => { this.cur = on ? null : x.id; cx.notify(); })
      .child(h_flex().gap(6).items_center()
        .child(this.badge(x, t))
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_semibold().child(x.to))
        .child(div().flex_none().text_size(10).text_color(t.dim).child(ago(x.created))))
      .child(div().w_full().truncate().text_size(12).text_color(t.muted).child(x.subject || x.body.split("\n").find((l) => l.trim()) || ""))
      .child(h_flex().gap(6).items_center().text_size(10).text_color(t.dim)
        .child(div().size(7).flex_none().rounded_full().bg(p.color))
        .child(div().flex_none().child(`${this.first(x.from)}${x.client ? ` · ${x.client}` : ""}`))
        .when(Boolean(x.edited), (e) => e.child(div().flex_none().px(5).h(15).flex().items_center().rounded(4).bg(t.ansi3 + "33").text_color(t.ansi3).child("edited by you")))
        .when(reply, (e) => e.child(div().flex_none().px(5).h(15).flex().items_center().rounded(4).bg(t.ansi5 + "33").text_color(t.ansi5).child("reply for you"))));
    const wrap = v_flex().w_full().flex_none().border_b(1).border_color(t.border).child(head);
    return on ? wrap.child(this.detail(x, t)) : wrap;
  }

  detail(x, t) {
    const id = x.id, app = APP[x.channel] ?? x.channel, author = this.first(x.from), busy = Boolean(this.busy[id]), dirty = this.dirty(x), talk = x.talk ?? [], editing = Boolean(this.editing[id]) || dirty, canSend = x.channel === "gmail" && Boolean(x.draftId);
    const meta = (k, v) => h_flex().gap(8).items_start().child(div().w(38).flex_none().text_size(10).text_color(t.dim).child(k)).child(div().flex_1().min_w(0).text_size(11).text_color(t.muted).child(sel(`dr-m-${id}-${k}`, v, t.muted)));
    const field = (el) => el.w_full().px(8).rounded(6).border_1().border_color(t.input).bg(t.background).text_size(12).text_color(t.foreground);
    const confirm = (key, label, sureLabel, args) => this.btn(`dr-${key}-${id}`, this.sure[id] === key ? sureLabel : label, t, (cx) => {
      if (this.sure[id] !== key) { this.sure[id] = key; cx.notify(); return; }
      delete this.sure[id]; this.call(id, args, cx);
    });
    return v_flex().w_full().px(12).pb(12).pt(2).gap(7).bg(t.selected)
      .child(meta("To", x.to))
      .when(Boolean(x.cc), (e) => e.child(meta("Cc", x.cc)))
      .when(Boolean(x.why), (e) => e.child(meta("Why", x.why)))
      .when(x.channel === "gmail" && editing, (e) => e.child(field(Input.new(this.subject[id])).h(28)))
      .when(x.channel === "gmail" && !editing && Boolean(x.subject), (e) => e.child(meta("Subject", x.subject)))
      .child(editing ? field(Textarea.new(this.body[id])).py(6) : this.preview(x, t))
      .when(!x.synced, (e) => e.child(div().text_size(10).text_color(t.ansi3).child(x.syncError ? `Gmail was not updated: ${x.syncError}` : `${app} still has the earlier text. Copy gives you your version now.`)))
      .when(Boolean(this.flash[id]) && !dirty, (e) => e.child(div().text_size(10).text_color(t.ansi2).child(this.flash[id])))
      .when(busy, (e) => e.child(div().text_size(10).text_color(t.dim).child("Working…")))
      .when(!busy, (e) => e
        .child(h_flex().gap(5).flex_wrap()
          .when(canSend, (e2) => e2.child(this.btn(`dr-send-${id}`, this.sure[id] === "send" ? `Yes, send to ${x.to.split("<")[0].trim().split(" ")[0] || "them"} now` : dirty ? "Save and send" : "Send", t, (cx) => {
            if (this.sure[id] !== "send") { this.sure[id] = "send"; cx.notify(); return; }
            delete this.sure[id]; this.send(x, cx);
          }, true)))
          .when(dirty, (e2) => e2.child(this.btn(`dr-save-${id}`, "Save changes", t, (cx) => this.save(x, cx))))
          .when(!editing, (e2) => e2.child(this.btn(`dr-edit-${id}`, "Edit", t, (cx) => { this.editing[id] = true; cx.notify(); })))
          .when(editing && !dirty, (e2) => e2.child(this.btn(`dr-view-${id}`, "Preview", t, (cx) => { this.editing[id] = false; cx.notify(); })))
          .when(Boolean(x.link), (e2) => e2.child(this.btn(`dr-open-${id}`, `Open in ${app}`, t, (cx) => this.openExternal(x, cx), !canSend && !dirty)))
          .child(this.btn(`dr-copy-${id}`, this.flash[id] === "Copied" ? "Copied" : "Copy", t, (cx) => {
            const text = this.body[id].value();
            if (typeof cx.write_to_clipboard === "function") cx.write_to_clipboard(text); else exec("sh", ["-c", 'printf %s "$1" | pbcopy', "copy", text]);
            this.flash[id] = "Copied"; cx.notify();
          })))
        .child(h_flex().gap(5).flex_wrap()
          .child(confirm("sent", "Mark as sent", "Yes, I sent it", ["sent", String(id), "--by-owner"]))
          .child(confirm("discard", "Discard", "Yes, discard it", ["discard", String(id), "--by-owner"]))))
      .when(talk.length > 0, (e) => e.child(v_flex().gap(4).pt(2).children(talk.map((m, i) =>
        div().id(`dr-talk-${id}-${i}`).w_full().px(8).py(5).rounded(6).bg(m.who === "__OWNER_ID__" ? t.raised : t.background).text_size(11).text_color(t.foreground)
          .child(sel(`dr-talk-t-${id}-${i}`, `${m.who === "__OWNER_ID__" ? "You" : this.first(m.who)}: ${m.text}`))))))
      .child(h_flex().gap(5).items_center()
        .child(field(Input.new(this.question[id])).flex_1().min_w(0).h(28))
        .child(this.btn(`dr-ask-${id}`, `Ask ${author}`, t, (cx) => this.ask(id, cx))))
      .child(div().id(`dr-term-${id}`).text_size(10).text_color(t.accent).cursor_pointer()
        .on_click(() => { run("tab.select", { id: `${["irene", "pablo", "elena"].includes(x.from) ? "biz" : "team"}-${x.from}` }); }).child(`Open ${author}'s terminal`));
  }

  render(_cx) {
    const t = theme(), all = this.drafts, chans = [...new Set(all.map((x) => x.channel))];
    const list = all.filter((x) => this.filter === "all" || x.channel === this.filter);
    const chip = (id, label) => h_flex().id(`df-${id}`).h(22).px(8).flex_none().items_center().rounded(11).cursor_pointer().text_size(11)
      .border_1().border_color(this.filter === id ? t.accent : t.border).bg(this.filter === id ? t.selected : t.surface).text_color(this.filter === id ? t.foreground : t.muted)
      .on_click((_e, cx) => { this.filter = id; cx.notify(); }).child(label);
    const rows = [];
    if (this.error) rows.push(div().px(12).py(6).text_size(10).text_color(t.ansi1).child(this.error));
    rows.push(...list.map((x) => this.row(x, t)));
    if (!list.length) rows.push(div().px(12).py(14).text_size(11).text_color(t.dim).child(all.length ? "No drafts on this channel" : "No drafts waiting. When someone on the team prepares a message for you, it appears here."));
    return v_flex().id("team-drafts").size_full().min_h(0).bg(t.surface).text_color(t.foreground).text_size(13)
      .child(h_flex().flex_none().px(12).pt(10).pb(8).gap(5).items_center().flex_wrap().border_b(1).border_color(t.border)
        .child(div().flex_none().pr(4).text_size(13).font_semibold().child("Drafts"))
        .child(chip("all", `All ${all.length}`))
        .children(chans.length > 1 ? chans.map((c) => chip(c, `${APP[c] ?? c} ${all.filter((x) => x.channel === c).length}`)) : []))
      .child(div().flex_none().px(12).py(5).text_size(10).text_color(t.dim).border_b(1).border_color(t.border).child("Email sends from here when you press Send. WhatsApp opens the chat for you to send."))
      .child(v_flex().id("dr-scroll").flex_1().min_h(0).overflow_y_scrollbar().children(rows));
  }
}
