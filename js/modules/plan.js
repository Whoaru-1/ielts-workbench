/* ============================================================
 * plan.js — 学习计划与打卡：今日任务 / 连续打卡格子图
 * ============================================================ */
import * as store from "../store.js";
import { h, panel, badge, icon } from "../ui.js";

export function render(root, app) {
  root.innerHTML = "";
  const page = h("div", { class: "page" });
  const today = store.todayKey();

  page.append(
    h("div", { class: "page-head" },
      h("h1", { class: "page-title" }, "计划打卡", h("span", { class: "t-sub" }, "每日任务 + 连续打卡，把习惯可视化")),
      h("div", { class: "page-actions" }, h("span", { id: "plan-streak-badge", class: "badge" }))
    )
  );

  /* 今日任务 */
  const taskPanel = panel({ title: `今日任务 · ${today}`, dot: true, body: h("div", { id: "plan-tasks" }) });
  page.append(taskPanel);

  /* 近 14 天打卡格子 */
  const gridPanel = panel({ title: "近 14 天打卡", body: h("div", { id: "plan-grid" }) });
  page.append(gridPanel);

  /* 手动打卡 */
  const checkinPanel = panel({ title: "手动打卡", body: h("div", { id: "plan-checkin", class: "checkin-box" }) });
  page.append(checkinPanel);

  root.append(page);

  /* ---- 区域渲染 ---- */
  const refresh = () => {
    const streak = document.getElementById("plan-streak-badge");
    if (!streak) return; // 已离开本页
    const n = store.streakDays();
    streak.textContent = `连续 ${n} 天`;
    streak.className = `badge ${n > 0 ? "ok" : ""}`;

    document.getElementById("plan-tasks").replaceChildren(...renderTasks());
    document.getElementById("plan-grid").replaceChildren(...renderGrid());
    document.getElementById("plan-checkin").replaceChildren(...renderCheckin());
  };
  // 注册局部刷新事件；离开页面时清理，避免重复监听
  if (planRefreshListener) document.removeEventListener("plan-refresh", planRefreshListener);
  planRefreshListener = refresh;
  document.addEventListener("plan-refresh", planRefreshListener);
  refresh();
}

let planRefreshListener = null;

function renderTasks() {
  const today = store.todayKey();
  const list = h("ul", { class: "task-list" });
  const cur = store.tasksOf(today);
  if (cur.length === 0) {
    list.append(h("li", { class: "task-empty" }, "今天还没有任务。添加几个小任务，勾完即达标。"));
  }
  for (const t of cur) {
    list.append(h("li", { class: `task-item${t.done ? " done" : ""}` },
      h("label", { class: "checkbox task-check" },
        h("input", { type: "checkbox", checked: t.done, onchange: () => { store.toggleTask(today, t.id); planRefresh(); } }),
        h("span", null, t.text)
      ),
      h("button", { class: "icon-btn danger", title: "删除任务", onclick: () => { store.deleteTask(today, t.id); planRefresh(); } }, icon("trash"))
    ));
  }
  const input = h("input", { class: "input", placeholder: "新任务，例如：精听 1 篇 Section 3", "aria-label": "新任务内容" });
  const addBtn = h("button", { class: "btn btn-primary btn-sm", onclick: () => {
    if (!input.value.trim()) return;
    store.addTask(input.value);
    input.value = "";
    planRefresh();
  } }, icon("plus"), "添加");
  return [list, h("div", { class: "task-add" }, input, addBtn)];
}

function renderGrid() {
  const grid = store.weekGrid(14);
  return [
    h("div", { class: "bg-meta" }, "达标日：勾完当天全部任务，或手动打卡。绿色 = 达标，琥珀 = 部分完成。"),
    h("div", { class: "bg-rows" },
      grid.map((g) =>
        h("div", { class: "bg-row" },
          h("span", { class: "bg-label" }, g.key.slice(5)),
          h("span", { class: `bg-cell${g.met ? " met" : g.taskCount > 0 ? " partial" : ""}`, title: `${g.key} · ${g.doneCount}/${g.taskCount} 任务` }),
          h("span", { class: "bg-label", style: "width:auto" }, g.met ? "✓" : (g.taskCount > 0 ? `${g.doneCount}/${g.taskCount}` : ""))
        )
      )
    ),
  ];
}

function renderCheckin() {
  const today = store.todayKey();
  if (store.dayMet(today)) {
    return [h("div", { class: "checkin-done" }, icon("check"), "今天已达标，继续保持！")];
  }
  return [
    h("div", { class: "btn-row" },
      h("button", { class: "btn btn-primary", onclick: () => { store.checkIn(today); planRefresh(); } }, icon("flame"), "今日打卡"),
      h("span", { class: "checkin-hint" }, "即使任务没做完，也可以手动打卡记录今日学习")
    ),
  ];
}

/** 触发本模块局部刷新（任务/格子/徽章/打卡区） */
function planRefresh() {
  document.dispatchEvent(new CustomEvent("plan-refresh"));
  // 顶栏全局连续打卡同步
  const ev = new CustomEvent("app-refresh-chrome");
  document.dispatchEvent(ev);
}
