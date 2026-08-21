/* ============================================================
 * app.js — 应用外壳：哈希路由 / 导航 / 顶栏 / 首次种子词库
 * ============================================================ */
import * as store from "./store.js";
import { ICONS, toast, h, icon } from "./ui.js";
import { render as renderDashboard } from "./modules/dashboard.js";
import { render as renderVocab } from "./modules/vocab.js";
import { render as renderPractice } from "./modules/practice.js";
import { render as renderWriting } from "./modules/writing.js";
import { render as renderSpeaking } from "./modules/speaking.js";
import { render as renderPlan } from "./modules/plan.js";
import { render as renderSettings } from "./modules/settings.js";
import { STARTER_VOCAB } from "./data/starter-vocab.js";
import education from "./data/topics/education.js";
import environment from "./data/topics/environment.js";
import technology from "./data/topics/technology.js";
import health from "./data/topics/health.js";
import society from "./data/topics/society.js";
import work from "./data/topics/work.js";
import economy from "./data/topics/economy.js";
import culture from "./data/topics/culture.js";
import science from "./data/topics/science.js";
import travel from "./data/topics/travel.js";
import government from "./data/topics/government.js";
import media from "./data/topics/media.js";

const ROUTES = {
  dashboard: { label: "进度看板", icon: "dashboard", render: renderDashboard },
  vocab: { label: "词汇", icon: "vocab", render: renderVocab },
  practice: { label: "真题模考", icon: "practice", render: renderPractice },
  writing: { label: "写作", icon: "writing", render: renderWriting },
  speaking: { label: "口语", icon: "speaking", render: renderSpeaking },
  plan: { label: "计划打卡", icon: "plan", render: renderPlan },
  settings: { label: "设置与数据", icon: "settings", render: renderSettings },
};

const app = {
  refreshChrome,
};

/* ---------- 首次启动：内置分话题词库种子（2000+ 词） ---------- */
const TOPIC_BANK = { education, environment, technology, health, society, work, economy, culture, science, travel, government, media };

function seedVocab() {
  // 已写入过 v2 词库则跳过（用户增删的词不受影响，只做一次合并）
  if (localStorage.getItem("ielts-workbench:seeded2")) return;
  const hasData = store.rawState().vocab.length > 0;
  // 词库完全为空：写入全部（入门词 + 12 话题）；已有数据（老用户/导入过）：只补话题词库，尊重用户删除
  const seedAll = !hasData && !localStorage.getItem("ielts-workbench:seeded");
  const entries = [];
  if (seedAll) for (const w of STARTER_VOCAB) entries.push({ ...w, category: "general" });
  for (const [cat, words] of Object.entries(TOPIC_BANK)) {
    for (const w of words) entries.push({ ...w, category: cat });
  }
  if (entries.length) store.seedBulk(entries);
  localStorage.setItem("ielts-workbench:seeded2", "1");
}

/* ---------- 导航 ---------- */
function buildNav() {
  const list = document.getElementById("nav-list");
  list.innerHTML = "";
  for (const [key, r] of Object.entries(ROUTES)) {
    if (key === "settings") continue;
    const li = h("li", null,
      h("a", { class: "nav-item", href: `#/${key}`, "data-nav": key, "aria-current": "page" },
        icon(r.icon), h("span", null, r.label),
        h("span", { class: "nav-count", id: `nav-count-${key}` })
      )
    );
    list.append(li);
  }
}

function navCounts() {
  const set = (key, n) => {
    const el = document.getElementById(`nav-count-${key}`);
    if (el) { el.textContent = n > 0 ? n : ""; el.hidden = n === 0; }
  };
  const v = store.vocabStats();
  set("vocab", v.total);
  set("practice", store.practiceStats().total);
  set("writing", store.writingList().length);
  set("speaking", store.speakingList().length);
  const planCount = Object.values(store.rawState().tasks).reduce((a, t) => a + t.length, 0);
  set("plan", planCount);
}

/* ---------- 顶栏：连续打卡 ---------- */
function refreshStreak() {
  const el = document.getElementById("global-streak");
  const n = store.streakDays();
  if (n > 0) {
    el.hidden = false;
    document.getElementById("global-streak-num").textContent = n;
  } else {
    el.hidden = true;
  }
}

function refreshChrome() {
  refreshStreak();
  navCounts();
}

/* 模块内派发的全局 chrome 刷新（如计划页打卡后联动顶栏连续天数） */
document.addEventListener("app-refresh-chrome", refreshChrome);

/* ---------- 导出 / 导入（顶栏） ---------- */
function wireTopbar() {
  document.getElementById("btn-export").addEventListener("click", () => {
    const name = `ielts-progress-${store.todayKey()}.json`;
    const blob = new Blob([store.exportJSON()], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast("进度已导出为 JSON 文件", "ok");
  });

  const fileInput = document.getElementById("import-file");
  document.getElementById("btn-import").addEventListener("click", () => {
    // 跳转到「设置与数据」页，由该页的导入面板统一处理（避免双重触发）
    location.hash = "#/settings";
    setTimeout(() => document.getElementById("import-btn")?.click(), 60);
  });
  fileInput.addEventListener("change", () => { fileInput.value = ""; });
}

/* ---------- 路由 ---------- */
function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, "");
  return ROUTES[hash] ? hash : "dashboard";
}

function renderRoute() {
  const key = currentRoute();
  const route = ROUTES[key];
  const main = document.getElementById("main");
  main.scrollTop = 0;
  route.render(main, app);
  document.querySelectorAll(".nav-item").forEach((el) => {
    const active = el.dataset.nav === key;
    el.classList.toggle("is-active", active);
    if (active) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  document.title = `${route.label} · IELTS 工作台`;
}

/* ---------- 启动 ---------- */
seedVocab();
buildNav();
wireTopbar();
refreshChrome();
window.addEventListener("hashchange", renderRoute);
renderRoute();

/* 暴露给控制台调试 */
window.__IELTS_WORKBENCH__ = { store, ICONS };
