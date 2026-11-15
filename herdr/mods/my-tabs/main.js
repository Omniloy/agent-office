import { View, div, svg, image } from "gpui-kit";
import { h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings, nextCommand, agents, notify, playSound, readTextFile, home } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init(_props, cx) {
    // Keys: my-tabs.board / my-tabs.limits toggle that side panel.
    cx.spawn(async (cx) => {
      for (;;) {
        const id = await nextCommand();
        if (id === "requests-show") { run("layout.select", { stack: "panel-body", child: "requests" }); run("layout.show", { id: "panel" }); continue; }
        if (!["requests", "drafts", "prs", "board", "trace", "limits"].includes(id)) continue;
        const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
        if (panel && !panel.hidden && body?.active === id) run("layout.hide", { id: "panel" });
        else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        cx.notify();
      }
    });
    this.agentStatus = {}; this.seenRequests = null; this.openRequests = 0;
    // Team inbox: a toast and the "needs you" sound when an agent leaves a request or a message.
    const checkInbox = (cx) => cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(`${home()}/.omniloy-team/requests.json`);
        const open = (text ? JSON.parse(text).items ?? [] : []).filter((x) => x.status === "open" && (x.to ?? "__OWNER_ID__") === "__OWNER_ID__");
        const fresh = this.seenRequests ? open.filter((x) => !this.seenRequests.has(x.id)) : [];
        this.seenRequests = new Set(open.map((x) => x.id));
        const n = open.filter((x) => x.kind === "request").length;
        if (n !== this.openRequests) { this.openRequests = n; cx.notify(); }
        for (const x of fresh) {
          const who = x.from.charAt(0).toUpperCase() + x.from.slice(1);
          if (x.kind === "request") playSound("blocked");
          notify({ title: x.kind === "request" ? `${who} needs your answer` : `Message from ${who}`, body: x.title, level: x.kind === "request" ? "warning" : "info", timeout: x.kind === "request" ? 20000 : 10000, action: { name: "my-tabs.requests-show", args: {} } });
        }
      } catch {}
    });
    cx.timer.every(4000, checkInbox); checkInbox(cx);
    // Drafts waiting to be sent: just the count on the Drafts button.
    this.openDrafts = 0;
    const checkDrafts = (cx) => cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(`${home()}/.omniloy-biz/drafts.json`);
        const n = (text ? JSON.parse(text).drafts ?? [] : []).filter((x) => x.status === "open").length;
        if (n !== this.openDrafts) { this.openDrafts = n; cx.notify(); }
      } catch {}
    });
    cx.timer.every(4000, checkDrafts); checkDrafts(cx);
    this.pressed = null;
    this.scroll = ScrollHandle.new();
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    // Team alert: Lucía finishing her job gets its own toast and sound (Herdr itself
    // alerts when any agent needs the person, with the "blocked" sound).
    for (const ag of agents()) {
      const before = this.agentStatus[ag.address]; this.agentStatus[ag.address] = ag.status;
      // Sounds only for pinned agents (Herdr's own sounds for every agent are off in settings.json).
      const lucia = ag.tab === "team-lucia";
      if (ag.pinned && !lucia && before === "working" && ag.status === "done") playSound("done");
      if (ag.pinned && before && before !== "blocked" && ag.status === "blocked") playSound("blocked");
      if (lucia && before === "working" && (ag.status === "done" || ag.status === "idle")) {
        if (ag.pinned) playSound("sounds/lucia-done.mp3");
        notify({ title: "Lucía finished her job", body: "Product · open her tab to read the report", level: "success", timeout: 15000, action: { name: "agent.focus", args: { terminal: ag.address } } });
      }
    }
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const active = shown.findIndex(tab => tab.active);
    const selected = shown[active]?.id;
    if (selected !== this.selected || active !== this.selectedIndex) {
      this.selected = selected;
      this.selectedIndex = active;
      if (active >= 0) this.scroll.scroll_to_item(active);
    }
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      return h_flex().id(`tab-${c.id}`).h(29).px(10).gap(7).rounded(7).items_center().flex_none().text_size(12.8)
        // A rename or status dot on this or an earlier tab can push the active one out.
        .when(i <= active, el => el.on_size_change((_size, cx) => { this.scroll.scroll_to_item(active); cx.notify(); }))
        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    // Files and Changes are deliberately not offered here: only the team panels.
    const enabled = ["requests", "drafts", "prs", "board", "trace", "limits"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().track_scroll(this.scroll)
        .on_size_change((_size, cx) => { if (active >= 0) { this.scroll.scroll_to_item(active); cx.notify(); } })
        .children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .child(panelButton("requests", this.openRequests ? `Requests ${this.openRequests}` : "Requests", "mods/team-requests/inbox.svg"))
      .child(panelButton("drafts", this.openDrafts ? `Drafts ${this.openDrafts}` : "Drafts", "mods/team-drafts/draft.svg"))
      .child(panelButton("prs", "PRs", "mods/team-board/pr.svg"))
      .child(panelButton("board", "Board", "mods/team-board/board.svg"))
      .child(panelButton("trace", "Trace", "mods/team-board/trace.svg"))
      .child(panelButton("limits", "Limits", "mods/agent-limits/gauge.svg"))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/my-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/my-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/my-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
