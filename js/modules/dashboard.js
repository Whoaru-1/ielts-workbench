/* ============================================================
 * dashboard.js — 看板：倒计时 / 今日任务 / 模块概览 / 操作日志
 * ============================================================ */
import * as store from "../store.js";
import { h, panel, statCard, emptyState, badge, icon } from "../ui.js";

export function render(root, app) {
  root.innerHTML = "";
  const s = store.settings();

  /* ---- 倒计时 + 目标 ---- */
  const cdRaw = store.countdown();
  const cd = cdRaw == null ? null : Math.max(0, cdRaw);
  const cdSub = cdRaw == null ? "未设置考试日期" : cdRaw < 0 ? "考试日已过，请在设置中更新" : `考试日 ${store.fmtDate(s.examDate)}`;
  const stats = [
    statCard("考试倒计时", cd == null ? "—" : `${cd} 天`, cdSub, cd != null && cd <= 30 ? "warn" : ""),
    statCard("目标分数", s.targetBand, "写作 / 口语以估分为准", "acc"),
    statCard("连续打卡", `${store.streakDays()} 天`, "坚持就是胜利", store.streakDays() > 0 ? "ok" : ""),
    statCard("累计练习", `${store.practiceStats().total} 次`, store.practiceStats().avgBand ? `平均估分 ${store.practiceStats().avgBand}` : "暂无练习记录"),
  ];
  const statPanel = h("section", { class: "panel" }, h("div", { class: "stat-grid" }, stats));

  /* ---- 今日任务 ---- */
  const today = store.todayKey();
  const tasks = store.tasksOf(today);
  const met = store.dayMet(today);
  const taskPanel = panel({
    title: "今日任务",
    dot: true,
    actions: badge(met ? "今日已达标" : "未达标", met ? "ok" : "warn"),
    body: taskBody(today, tasks, app),
  });

  /* ---- 模块概览 ---- */
  const v = store.vocabStats();
  const p = store.practiceStats();
  const w = store.writingList().length;
  const sp = store.speakingList().length;
  const planDone = Object.values(store.rawState().tasks).reduce((a, t) => a + t.filter((x) => x.done).length, 0);
  const modules = [
    ["词汇", `${v.mastered}/${v.total} 已掌握`, v.total ? Math.round((v.mastered / v.total) * 100) : 0],
    ["真题模考", `${p.total} 次练习`, p.total ? Math.round((p.total / 12) * 100) : 0],
    ["写作", `${w} 篇记录`, w ? 100 : 0],
    ["口语", `${sp} 条记录`, sp ? 100 : 0],
    ["计划打卡", `${planDone} 个任务`, planDone ? 100 : 0],
  ];
  const modulePanel = panel({
    title: "模块概览",
    body: h("div", { class: "tbl-wrap" },
      h("table", { class: "tbl" },
        h("thead", null, h("tr", null, h("th", null, "模块"), h("th", null, "进度"), h("th", null, "数值"))),
        h("tbody", null, modules.map(([name, val, pct]) =>
          h("tr", null,
            h("td", null, name),
            h("td", null, h("div", { class: "bar", role: "progressbar", "aria-valuenow": pct, "aria-label": `${name} ${pct}%` },
              h("div", { class: "bar-fill", style: `--p:${Math.min(100, pct) / 100}` }))),
            h("td", { class: "num" }, val)
          )
        ))
      )
    ),
  });

  /* ---- 操作日志 ---- */
  const logs = store.logEntries(10);
  const logPanel = panel({
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
    h("div", { class: "page" },
      h("div", { class: "page-head" },
        h("h1", { class: "page-title" }, "进度看板", h("span", { class: "t-sub" }, "今天该做什么，一目了然")),
        h("div", { class: "page-actions" }, h("a", { class: "btn btn-primary btn-sm", href: "#/plan" }, icon("plan"), "去打卡"))
      ),
      statPanel, taskPanel, modulePanel, logPanel
    )
  );
}

function taskBody(today, tasks, app) {
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

  // 任务变化会联动看板的统计、模块概览、日志与顶栏连续打卡，整体重渲 + 刷新 chrome
  const fullRefresh = () => { render(document.getElementById("main"), app); app.refreshChrome(); };
  rerender();
  wrap.append(list, h("div", { class: "task-add" }, input, addBtn));
  return wrap;
}
