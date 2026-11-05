/* ============================================================
 * dashboard.js — 看板：倒计时大泡泡 / 今日任务 / 模块气泡 / 操作日志
 * 布局：6 栏 bento —— 倒计时(3) + 小统计(3)，今日任务(3) + 模块(3)，日志(6)
 * ============================================================ */
import * as store from "../store.js";
import { h, panel, emptyState, badge, icon } from "../ui.js";

export function render(root, app) {
  root.innerHTML = "";
  const s = store.settings();

  /* ---- 倒计时大泡泡 ---- */
  const cdRaw = store.countdown();
  const cd = cdRaw == null ? null : Math.max(0, cdRaw);
  const cdSub = cdRaw == null
    ? "定下考试日，倒计时就会开始"
    : cdRaw < 0
      ? "考试日已过，去设置里更新新的考试日"
      : `考试日 · ${store.fmtDate(s.examDate)} · 目标 ${s.targetBand} 分`;
  const countdown = h("section", { class: `countdown-card${cd == null ? " is-empty" : ""}` },
    h("div", { class: "cd-head" },
      h("span", { class: "cd-k" }, icon("calendar"), "考试倒计时"),
      cd != null && cd <= 30 ? badge(cd <= 7 ? "最后冲刺" : "进入冲刺", "warn") : null
    ),
    h("div", { class: "cd-figure" },
      h("span", { class: "cd-num" }, cd == null ? "未设置" : cd),
      cd == null ? null : h("span", { class: "cd-unit" }, "天")
    ),
    h("p", { class: "cd-meta" }, cdSub),
    h("a", { class: "cd-link", href: "#/settings" }, cdRaw == null ? "去设置考试日期" : "调整考试日期与目标", icon("arrowUp"))
  );

  /* ---- 三颗小统计气泡 ---- */
  const streak = store.streakDays();
  const p = store.practiceStats();
  const minis = [
    { k: "目标分数", v: s.targetBand, d: "写作 / 口语以估分为准", kind: "acc" },
    { k: "连续打卡", v: `${streak} 天`, d: streak > 0 ? "今天也继续" : "从今天开始", kind: streak > 0 ? "ok" : "" },
    { k: "累计练习", v: `${p.total} 次`, d: p.avgBand ? `平均估分 ${p.avgBand}` : "暂无练习记录", kind: "" },
  ];
  const miniStats = h("div", { class: "mini-stats" }, minis.map((m) =>
    h("div", { class: "mini" },
      h("span", { class: "mini-k" }, m.k),
      h("span", { class: "mini-v" }, m.v),
      h("span", { class: `mini-d ${m.kind}` }, m.d)
    )
  ));

  /* ---- 今日任务 ---- */
  const today = store.todayKey();
  const met = store.dayMet(today);
  const taskPanel = panel({
    className: "cell-tasks",
    title: "今日任务",
    dot: true,
    actions: badge(met ? "今日已达标" : "未达标", met ? "ok" : "warn"),
    flush: true,
    body: taskBody(today, app),
  });

  /* ---- 模块气泡（可点击进入） ---- */
  const v = store.vocabStats();
  const w = store.writingList().length;
  const sp = store.speakingList().length;
  const mat = store.materialStats();
  const agentReady = (() => {
    try { return Boolean(JSON.parse(localStorage.getItem("ielts-workbench:agent-config-v1") || "{}").apiKey); }
    catch { return false; }
  })();
  const planDone = Object.values(store.rawState().tasks).reduce((a, t) => a + t.filter((x) => x.done).length, 0);
  const tiles = [
    { key: "vocab", name: "词汇", icon: "vocab", value: `${v.mastered}/${v.total} 已掌握`, pct: v.total ? (v.mastered / v.total) * 100 : 0 },
    { key: "practice", name: "真题模考", icon: "practice", value: `${p.total} 次练习`, pct: (p.total / 12) * 100 },
    { key: "writing", name: "写作", icon: "writing", value: `${w} 篇记录`, pct: w ? 100 : 0 },
    { key: "speaking", name: "口语", icon: "speaking", value: `${sp} 条记录`, pct: sp ? 100 : 0 },
    { key: "materials", name: "个人素材", icon: "material", value: `${mat.total} 条素材 · ${mat.topicCount} 个主题`, pct: mat.total ? 100 : 0 },
    { key: "agent", name: "AI 助手", icon: "agent", value: agentReady ? "模型已配置 · 可调用工具" : "待配置 API Key", pct: agentReady ? 100 : 0 },
    { key: "plan", name: "计划打卡", icon: "plan", value: `${planDone} 个任务已完成`, pct: planDone ? 100 : 0 },
  ];
  const modulePanel = panel({
    className: "cell-modules",
    title: "模块概览",
    body: h("div", { class: "bubble-grid" }, tiles.map((t) =>
      h("a", { class: "bubble-tile", href: `#/${t.key}`, "aria-label": `${t.name} · ${t.value}` },
        h("span", { class: "bt-orb" }, icon(t.icon)),
        h("span", { class: "bt-main" },
          h("span", { class: "bt-top" },
            h("span", { class: "bt-name" }, t.name),
            h("span", { class: "bt-arrow" }, icon("arrowUp"))
          ),
          h("span", { class: "bt-val" }, t.value),
          h("span", { class: "bt-bar", role: "progressbar", "aria-valuenow": Math.round(Math.min(100, t.pct)), "aria-label": `${t.name} ${Math.round(Math.min(100, t.pct))}%` },
            h("span", { class: "bt-fill", style: `--p:${Math.min(100, t.pct) / 100}` })
          )
        )
      )
    )),
  });

  /* ---- 操作日志 ---- */
  const logs = store.logEntries(10);
  const logPanel = panel({
    className: "cell-log",
    title: "最近操作",
    body: logs.length === 0
      ? emptyState("box", "还没有操作记录", "在任意模块添加内容后，这里会出现活动日志。")
      : h("div", { class: "consolelog" }, logs.map((l) =>
          h("div", { class: "cl-line" },
            h("span", { class: "cl-time" }, store.fmtTime(l.at)),
            h("span", { class: `cl-tag ${l.kind}` }, store.moduleLabel(l.module)),
            h("span", { class: "cl-msg" }, l.msg)
          )
        )),
  });

  root.append(
    h("div", { class: "page dashboard-page" },
      h("div", { class: "page-head" },
        h("h1", { class: "page-title" }, "进度看板", h("span", { class: "t-sub" }, "今天该做什么，一目了然")),
        h("div", { class: "page-actions" }, h("a", { class: "btn btn-primary", href: "#/plan" }, icon("plan"), "去打卡"))
      ),
      h("div", { class: "bento" },
        countdown,
        miniStats,
        taskPanel,
        modulePanel,
        logPanel
      )
    )
  );
}

function taskBody(today, app) {
  const wrap = h("div", {});
  const list = h("ul", { class: "task-list" });

  const rerender = () => {
    list.innerHTML = "";
    const cur = store.tasksOf(today);
    if (cur.length === 0) {
      list.append(h("li", { class: "task-empty" }, "今天还没有任务，先在下方添加一个吧。"));
    }
    for (const t of cur) {
      list.append(h("li", { class: `task-item${t.done ? " done" : ""}` },
        h("label", { class: "checkbox task-check" },
          h("input", { type: "checkbox", checked: t.done, onchange: () => { store.toggleTask(today, t.id); fullRefresh(); } }),
          h("span", null, t.text)
        ),
        h("button", { class: "icon-btn danger", title: "删除任务", onclick: () => { store.deleteTask(today, t.id); fullRefresh(); } }, icon("trash"))
      ));
    }
  };

  const input = h("input", { class: "input", placeholder: "添加今日任务，例如：背 30 个单词", "aria-label": "新任务内容" });
  const addBtn = h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => {
    if (!input.value.trim()) return;
    store.addTask(input.value);
    input.value = "";
    fullRefresh();
  } }, icon("plus"), "添加");

  // 任务变化会联动看板的统计、模块概览、日志与顶部连续打卡，整体重渲 + 刷新 chrome
  const fullRefresh = () => { render(document.getElementById("main"), app); app.refreshChrome(); };
  rerender();
  wrap.append(list, h("div", { class: "task-add" }, input, addBtn));
  return wrap;
}
