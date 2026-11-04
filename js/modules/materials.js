/* ============================================================
 * materials.js — 个人素材：输入生成 / 相近归纳 / 素材库 / 详情 / 真题匹配
 * 依赖：js/data/material-engine.js（契约见 docs/materials-spec.md 第 2 节）
 *       js/data/material-seeds.js（{title, input} 演示输入）
 *       js/data/question-bank.js（口语真题索引）
 *
 * 引擎与演示数据用动态 import：任一侧文件尚未就绪时，页面给出中文提示，
 * 不会拖垮整个应用（不白屏）。
 * ============================================================ */
import * as store from "../store.js";
import { h, panel, badge, icon, emptyState, toast, slicePage, pager, PER_PAGE, statCard, download } from "../ui.js";
import { QUESTION_BANK } from "../data/question-bank.js";

let engine = {};
try {
  engine = await import("../data/material-engine.js");
} catch (err) {
  console.warn("[materials] material-engine.js 未就绪", err);
}

let seedSource = {};
try {
  seedSource = await import("../data/material-seeds.js");
} catch (err) {
  console.warn("[materials] material-seeds.js 未就绪", err);
}

const fn = (name) => (typeof engine[name] === "function" ? engine[name] : null);

/* ---------- 小工具 ---------- */

function S(v) { return typeof v === "string" ? v : v == null ? "" : String(v); }
function A(v) { return Array.isArray(v) ? v : []; }
function clamp01(n) { if (!Number.isFinite(n)) return 0; return Math.min(1, Math.max(0, n)); }
function scoreOf(v, d = 0.5) { const n = Number(v); return Number.isFinite(n) ? clamp01(n) : d; }
function countWords(text) {
  const m = S(text).match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g);
  return m ? m.length : 0;
}
function pct(score) { return Math.round(clamp01(Number(score)) * 100); }

/* ---------- 引擎元数据（带兜底，保证下拉/筛选永远可用） ---------- */

const FALLBACK_TYPES = [
  { id: "person", label: "人物" },
  { id: "place", label: "地点" },
  { id: "object", label: "物品" },
  { id: "event", label: "事件" },
  { id: "activity", label: "活动" },
  { id: "media", label: "媒体" },
  { id: "idea", label: "想法" },
];

const FALLBACK_TOPICS = [
  { id: "education", label: "教育" }, { id: "environment", label: "环境" },
  { id: "technology", label: "科技" }, { id: "health", label: "健康" },
  { id: "society", label: "社会" }, { id: "work", label: "工作" },
  { id: "economy", label: "经济" }, { id: "culture", label: "文化" },
  { id: "science", label: "科学" }, { id: "travel", label: "旅行" },
  { id: "government", label: "政府" }, { id: "media", label: "媒体" },
];

function metaList(raw, fallback) {
  let items = [];
  if (Array.isArray(raw) && raw.length) items = raw;
  else if (raw && typeof raw === "object") {
    items = Object.entries(raw).map(([id, v]) => (typeof v === "string" ? { id, label: v } : { id, ...v }));
  }
  if (!items.length) items = fallback;
  const seen = new Set();
  return items
    .map((t) => {
      if (typeof t === "string") return { id: t, label: t };
      const id = S(t.id || t.key || t.value || t.slug);
      const label = S(t.label || t.cn || t.name || t.zh || id);
      return { ...t, id, label };
    })
    .filter((t) => t.id && !seen.has(t.id) && seen.add(t.id));
}

const TYPES = metaList(engine.TYPES, FALLBACK_TYPES);
const TOPICS = metaList(engine.TOPICS, FALLBACK_TOPICS);
const TYPE_LABEL = new Map(TYPES.map((t) => [t.id, t.label]));
const TOPIC_LABEL = new Map(TOPICS.map((t) => [t.id, t.label]));

function typeLabelOf(id) { return TYPE_LABEL.get(S(id)) || "想法"; }
function topicLabelOf(id) { return TOPIC_LABEL.get(S(id)) || "通用"; }

function titleFromRaw(raw) {
  const t = S(raw).replace(/\s+/g, " ").trim();
  if (!t) return "未命名素材";
  return t.length > 20 ? `${t.slice(0, 20)}…` : t;
}

function fmtWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return S(iso).slice(0, 10);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function fmtWhenTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return S(iso).slice(0, 10);
  return `${fmtWhen(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function confLevel(c) {
  if (c >= 0.72) return { label: "高", kind: "ok" };
  if (c >= 0.5) return { label: "中", kind: "acc" };
  return { label: "低", kind: "warn" };
}

function collectSeeds(mod) {
  if (!mod) return [];
  const tries = [mod.MATERIAL_SEEDS, mod.SEEDS, mod.seeds, mod.materialSeeds, mod.default];
  for (const t of tries) {
    if (Array.isArray(t)) return t;
    if (t && typeof t === "object") {
      for (const v of Object.values(t)) if (Array.isArray(v)) return v;
    }
  }
  for (const v of Object.values(mod)) {
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
  }
  return [];
}

const SEEDS = collectSeeds(seedSource);

/* ---------- 数据规整（兼容引擎字段缺失或历史数据） ---------- */

function normalizeTopics(list) {
  const out = [];
  for (const t of A(list)) {
    if (typeof t === "string") out.push({ id: t, label: topicLabelOf(t), score: 0.5 });
    else if (t && typeof t === "object") {
      const id = S(t.id || t.key || t.topic);
      out.push({ id, label: S(t.label || t.cn || t.zh) || topicLabelOf(id), score: scoreOf(t.score, 0.5) });
    }
  }
  return out.filter((t) => t.id).slice(0, 3);
}

function normalizeKeywords(list) {
  const out = [];
  for (const k of A(list)) {
    if (typeof k === "string") out.push({ zh: k, en: "" });
    else if (k && typeof k === "object") {
      const zh = S(k.zh || k.cn || k.term || k.word);
      const en = S(k.en || k.english);
      if (zh || en) out.push({ zh, en });
    }
  }
  return out.slice(0, 16);
}

function normalizeLexical(list) {
  return A(list)
    .map((l) => (typeof l === "string"
      ? { term: l, cn: "", example: "" }
      : { term: S(l && (l.term || l.word || l.en)), cn: S(l && (l.cn || l.zh || l.meaning)), example: S(l && l.example) }))
    .filter((l) => l.term)
    .slice(0, 12);
}

function normalizeUpgrades(list) {
  return A(list)
    .map((u) => (Array.isArray(u)
      ? { from: S(u[0]), to: S(u[1]) }
      : { from: S(u && (u.from || u[0])), to: S(u && (u.to || u[1])) }))
    .filter((u) => u.from && u.to)
    .slice(0, 8);
}

function normalizeDraft(d, raw, fallbackTitle) {
  const src = d && typeof d === "object" ? d : {};
  const english = {
    p1: S(src.english && src.english.p1),
    p2: S(src.english && src.english.p2),
    p3: S(src.english && src.english.p3),
  };
  const wc = src.wordCount || {};
  const countOf = (key) => {
    const n = Number(wc[key]);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : countWords(english[key]);
  };
  return {
    title: S(src.title) || S(fallbackTitle) || titleFromRaw(raw),
    type: S(src.type) || "idea",
    typeLabel: S(src.typeLabel) || typeLabelOf(src.type),
    rawInput: S(src.rawInput) || S(raw),
    points: A(src.points).map(S).map((x) => x.trim()).filter(Boolean).slice(0, 8),
    keywords: normalizeKeywords(src.keywords),
    topics: normalizeTopics(src.topics),
    english,
    lexical: normalizeLexical(src.lexical),
    collocations: A(src.collocations).map(S).filter(Boolean).slice(0, 12),
    frames: A(src.frames).map(S).filter(Boolean).slice(0, 8),
    outline: A(src.outline).map(S).filter(Boolean).slice(0, 8),
    upgrades: normalizeUpgrades(src.upgrades),
    confidence: Number.isFinite(Number(src.confidence)) ? clamp01(Number(src.confidence)) : 0.5,
    wordCount: { p1: countOf("p1"), p2: countOf("p2"), p3: countOf("p3") },
  };
}

function readMaterial(m) {
  const safe = m && typeof m === "object" ? m : {};
  const base = normalizeDraft(safe, S(safe.rawInput), S(safe.title));
  return {
    ...safe,
    ...base,
    id: safe.id,
    createdAt: safe.createdAt,
    updatedAt: safe.updatedAt,
    mergedFrom: A(safe.mergedFrom)
      .filter((x) => x && (x.title || x.at))
      .map((x) => ({ title: S(x.title), at: S(x.at) })),
    mergeNote: S(safe.mergeNote),
  };
}

/* ---------- 相近素材 / 真题匹配（带缓存，避免每次筛选都重算） ---------- */

const matchCache = new Map();

function matchFor(m, limit = 6) {
  if (!m || !m.id) return [];
  const key = `${m.id}|${m.updatedAt || ""}|${limit}`;
  if (matchCache.has(key)) return matchCache.get(key);
  const mq = fn("matchQuestions");
  let out = [];
  if (mq) {
    try {
      const res = mq(readMaterial(m), QUESTION_BANK, limit);
      if (Array.isArray(res)) out = res.filter((q) => q && q.question);
    } catch (err) {
      console.warn("[materials] matchQuestions failed", err);
    }
  }
  matchCache.set(key, out);
  if (matchCache.size > 400) {
    const first = matchCache.keys().next().value;
    if (first) matchCache.delete(first);
  }
  return out;
}

function findSimilar(draft) {
  const sm = fn("similarMaterials");
  if (!sm) return [];
  try {
    const hits = sm(draft, store.materialsList(), 0.45);
    return A(hits)
      .filter((hit) => hit && hit.material && hit.material.id && Number.isFinite(Number(hit.score)) && Number(hit.score) >= 0.45)
      .map((hit) => ({ ...hit, score: Number(hit.score) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } catch (err) {
    console.warn("[materials] similarMaterials failed", err);
    return [];
  }
}

let pairCache = { sig: "", pairs: [] };

function scanPairs(list) {
  const sm = fn("similarMaterials");
  const sim = fn("similarity");
  const pairs = [];
  const seen = new Set();
  if (sm) {
    for (let i = 0; i < list.length; i++) {
      let hits = [];
      try { hits = sm(list[i], list.slice(i + 1), 0.45); } catch (err) { continue; }
      for (const hit of A(hits)) {
        const b = hit && hit.material;
        const score = Number(hit && hit.score);
        if (!b || !b.id || !Number.isFinite(score) || score < 0.45) continue;
        const key = [list[i].id, b.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ key, a: list[i], b, score, reasons: A(hit.reasons).map(S).filter(Boolean) });
      }
    }
  } else if (sim) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        try {
          const score = Number(sim(list[i], list[j]));
          if (!Number.isFinite(score) || score < 0.45) continue;
          const key = [list[i].id, list[j].id].sort().join("|");
          if (seen.has(key)) continue;
          seen.add(key);
          pairs.push({ key, a: list[i], b: list[j], score, reasons: [] });
        } catch (err) { /* 忽略单条失败 */ }
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  return pairs.slice(0, 30);
}

function getPairs() {
  const list = store.materialsList();
  const sig = list.map((m) => `${m.id}:${m.updatedAt || ""}`).join("|");
  if (sig !== pairCache.sig) pairCache = { sig, pairs: scanPairs(list) };
  return pairCache.pairs;
}

function earlierOf(a, b) {
  const ta = Date.parse(a.createdAt || a.updatedAt || "") || 0;
  const tb = Date.parse(b.createdAt || b.updatedAt || "") || 0;
  if (ta && tb) return ta <= tb ? a : b;
  return a;
}

function pairScore(a, b) {
  const sim = fn("similarity");
  if (!sim || !a || !b) return null;
  try {
    const n = Number(sim(a, b));
    return Number.isFinite(n) ? clamp01(n) : null;
  } catch (err) {
    return null;
  }
}

/* ---------- 复制 / 导出 ---------- */

function copyWithFeedback(text, okMessage = "已复制", failMessage = "复制失败，请手动选中文本") {
  const value = S(text);
  if (!value.trim()) { toast("没有可复制的内容", "warn"); return; }
  const fallback = () => {
    try {
      const ta = document.createElement("textarea");
      ta.className = "mat-copy-buffer";
      ta.value = value;
      ta.setAttribute("readonly", "");
      document.body.append(ta);
      ta.select();
      const ok = typeof document.execCommand === "function" ? document.execCommand("copy") : false;
      ta.remove();
      toast(ok ? okMessage : failMessage, ok ? "ok" : "warn");
    } catch (err) {
      toast(failMessage, "warn");
    }
  };
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(value).then(() => toast(okMessage, "ok")).catch(fallback);
  } else {
    fallback();
  }
}

function markdownFor(m) {
  const lines = [];
  lines.push(`# ${m.title}`, "");
  lines.push(`- 类型：${m.typeLabel || typeLabelOf(m.type)}`);
  if (m.topics.length) lines.push(`- 主题：${m.topics.map((t) => `${t.label}（${pct(t.score)}%）`).join("、")}`);
  lines.push(`- 置信度：${pct(m.confidence)}%`);
  lines.push(`- 更新时间：${fmtWhenTime(m.updatedAt)}`, "");
  lines.push("## 中文要点", "");
  if (m.points.length) m.points.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  else lines.push("（暂无）");
  lines.push("", "## 英文素材", "");
  for (const key of ["p1", "p2", "p3"]) {
    lines.push(`### ${key.toUpperCase()}（${m.wordCount[key]} 词）`, "", m.english[key] || "（暂无）", "");
  }
  const addList = (title, arr) => {
    if (!arr.length) return;
    lines.push(`## ${title}`, "");
    arr.forEach((x) => lines.push(`- ${x}`));
    lines.push("");
  };
  addList("高分搭配", m.collocations);
  addList("句式框架", m.frames);
  addList("中文提纲", m.outline);
  if (m.lexical.length) {
    lines.push("## 进阶词汇", "");
    m.lexical.forEach((l) => lines.push(`- **${l.term}**${l.cn ? ` ${l.cn}` : ""}${l.example ? `：${l.example}` : ""}`));
    lines.push("");
  }
  if (m.upgrades.length) {
    lines.push("## 词汇升级", "");
    m.upgrades.forEach((u) => lines.push(`- ${u.from} → ${u.to}`));
    lines.push("");
  }
  lines.push("## 原文", "", m.rawInput || "（暂无）", "");
  return lines.join("\n");
}

/* ---------- 首次进入：素材库为空时写入演示素材（交由 store.seedMaterials 判空） ---------- */

function ensureSeeded() {
  try {
    if (store.materialsList().length) return 0;
    const analyzeF = fn("analyze");
    if (!analyzeF || !SEEDS.length) return 0;
    const drafts = [];
    for (const item of SEEDS) {
      const seed = typeof item === "string" ? { input: item } : (item || {});
      const input = S(seed.input || seed.rawInput || seed.text || seed.raw).trim();
      if (!input) continue;
      try {
        const draft = normalizeDraft(analyzeF(input), input, seed.title);
        if (seed.title) draft.title = S(seed.title);
        drafts.push(draft);
      } catch (err) {
        console.warn("[materials] 演示素材分析失败，已跳过一条", err);
      }
    }
    if (!drafts.length) return 0;
    return store.seedMaterials(drafts);
  } catch (err) {
    console.warn("[materials] 演示素材写入失败", err);
    return 0;
  }
}

/* ---------- 模块级视图状态 ---------- */

const view = {
  mode: "list",          // list | detail
  detailId: null,
  query: "",
  topic: "all",
  type: "all",
  sort: "recent",        // recent | topic
  page: 1,
  detailTab: "p2",       // p1 | p2 | p3
  detailFlags: {},
  suggestOpen: false,
  suggestKeep: {},
  suggestConfirm: "",
  manualOpen: false,
  manual: { a: "", b: "", keep: "a", confirm: false },
};

const composer = {
  input: "",
  title: "",
  type: "auto",
  autoMerge: true,
  preview: null,         // { draft, hits, matches, savedId, savedTitle, savedMerged }
  error: "",
};

/* ============================================================
 * 页面入口
 * ============================================================ */

export function render(root, app) {
  root.innerHTML = "";
  const page = h("div", { class: "page mat-page" });
  root.append(page);

  view.mode = "list";
  view.detailId = null;
  view.detailFlags = {};
  view.manualOpen = false;

  /* 引擎未就绪：给出中文降级页，避免白屏 */
  if (!fn("analyze")) {
    page.append(listHeader(false));
    page.append(panel({
      title: "素材引擎",
      body: emptyState(
        "material",
        "素材引擎尚未就绪",
        "缺少 js/data/material-engine.js 或导出不完整。刷新页面可重试；其他模块不受影响。"
      ),
    }));
    return;
  }

  let seeded = 0;
  try { seeded = ensureSeeded(); } catch (err) { console.warn(err); }
  if (seeded > 0) {
    app.refreshChrome();
    setTimeout(() => toast(`已载入 ${seeded} 条演示素材，试着写一条相近的内容，看看自动归纳`, "ok"), 260);
  }

  let previewSlotRef = null;
  let composerErrorRef = null;

  /* ---------- 顶层重绘 ---------- */

  function paint() {
    page.replaceChildren();
    try {
      if (view.mode === "detail") {
        const raw = store.getMaterial(view.detailId);
        if (raw) {
          page.append(buildDetail(raw));
          return;
        }
        view.mode = "list";
        view.detailId = null;
      }
      page.append(buildList());
    } catch (err) {
      console.error("[materials] 页面渲染失败", err);
      page.append(panel({
        title: "个人素材",
        body: emptyState("material", "页面渲染失败", "可能是本地数据格式异常。可以先刷新页面重试；其他模块不受影响。"),
      }));
    }
  }

  function buildList() {
    const frag = document.createDocumentFragment();
    frag.append(listHeader(true));
    frag.append(statsSection());
    frag.append(composerSection());
    const pairs = getPairs();
    if (pairs.length) frag.append(suggestionBar(pairs));
    if (view.manualOpen) {
      const m = manualPanel();
      if (m) frag.append(m);
    }
    frag.append(listPanel());
    return frag;
  }

  /* ---------- 页头 / 统计 ---------- */

  function listHeader(showActions) {
    return h("div", { class: "page-head mat-head" },
      h("h1", { class: "page-title" }, "素材库",
        h("span", { class: "t-sub" }, "把零散的中文笔记变成 P1 / P2 / P3 口语素材；主题相近的素材自动归纳，原文全部保留。")
      ),
      showActions
        ? h("div", { class: "page-actions" },
          h("button", { class: "btn btn-primary btn-sm", type: "button", "aria-label": "新建素材，跳到输入框", onclick: () => focusComposer() },
            icon("plus"), "新建素材"),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", "aria-label": "手动合并两条素材", onclick: () => toggleManual() },
            icon("spark"), "手动合并")
        )
        : null
    );
  }

  function statsSection() {
    const list = store.materialsList();
    const topics = new Set();
    const questionIds = new Set();
    let merged = 0;
    for (const m of list) {
      for (const t of A(m.topics)) if (t && (t.id || t.label)) topics.add(t.id || t.label);
      if (A(m.mergedFrom).length) merged++;
      for (const q of matchFor(m, 6)) if (q && q.id) questionIds.add(q.id);
    }
    return h("div", { class: "stat-grid mat-stats" },
      statCard("素材总数", String(list.length), list.length ? "保存在本地浏览器" : "先写第一条素材"),
      statCard("覆盖主题", String(topics.size), `共 ${TOPICS.length} 个话题维度`),
      statCard("已归纳", String(merged), merged ? "相近素材已合并" : "等待相近素材", merged ? "ok" : ""),
      statCard("关联真题", String(questionIds.size), "口语 P1 / P2 / P3")
    );
  }

  /* ---------- 输入面板（页面主角） ---------- */

  function composerSection() {
    const input = h("textarea", {
      class: "textarea mat-input",
      id: "mat-input",
      rows: 7,
      placeholder: "例：外婆的针线盒 / 大学骑行 / 社区图书馆志愿者。\n写下细节：什么时候、和谁、发生了什么、你为什么记得它。中文或英文都行。",
      "aria-label": "输入素材原文",
      oninput: (e) => {
        composer.input = e.target.value;
        updateCount();
        if (composer.error) clearComposerError();
      },
      onkeydown: (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          generate(false);
        }
      },
    });
    input.value = composer.input;

    const count = h("span", { class: "mat-count" });
    const updateCount = () => { count.textContent = `${composer.input.trim().length} 字`; };
    updateCount();

    const title = h("input", {
      class: "input", id: "mat-title", type: "text",
      placeholder: "可选，如「外婆的针线盒」", "aria-label": "素材标题（可选）",
      oninput: () => {
        composer.title = title.value;
        if (composer.preview) renderPreviewInto();
      },
    });
    title.value = composer.title;

    const typeSel = h("select", { class: "select", id: "mat-type", "aria-label": "素材类型" },
      h("option", { value: "auto" }, "自动识别"),
      ...TYPES.map((t) => h("option", { value: t.id }, t.label))
    );
    typeSel.value = TYPES.some((t) => t.id === composer.type) ? composer.type : "auto";
    typeSel.addEventListener("change", () => {
      composer.type = typeSel.value;
      if (composer.preview) renderPreviewInto();
    });

    const auto = h("input", { type: "checkbox", "aria-label": "主题相近时自动归纳" });
    auto.checked = composer.autoMerge;
    auto.addEventListener("change", () => {
      composer.autoMerge = auto.checked;
      if (composer.preview) renderPreviewInto();
    });

    const err = h("div", { class: "mat-error", role: "alert", hidden: true });
    if (composer.error) { err.textContent = composer.error; err.hidden = false; }
    composerErrorRef = err;

    const previewSlot = h("div", { class: "mat-preview-slot" });
    previewSlotRef = previewSlot;

    const section = h("section", { class: "mat-composer", "aria-labelledby": "mat-composer-title" },
      h("div", { class: "mat-composer-head" },
        h("div", { class: "mat-eyebrow" }, "PERSONAL MATERIAL · 本地生成"),
        h("h2", { class: "mat-composer-title", id: "mat-composer-title" }, "把一段经历，变成口语素材"),
        h("p", { class: "mat-composer-sub" },
          "写中文也可以。引擎会在本地识别主题与类型，生成 P1 / P2 / P3 英文素材，并匹配相关口语真题。")
      ),
      h("div", { class: "mat-composer-form" },
        h("div", { class: "field" },
          h("label", { for: "mat-input" }, "素材原文"),
          input
        ),
        h("div", { class: "mat-composer-meta" },
          h("div", { class: "field" }, h("label", { for: "mat-title" }, "标题（可选）"), title),
          h("div", { class: "field" }, h("label", { for: "mat-type" }, "类型"), typeSel)
        ),
        h("div", { class: "mat-composer-row" },
          h("label", { class: "checkbox mat-check" }, auto, "主题相近时自动归纳"),
          h("span", { class: "mat-check-hint" }, "命中已有素材时，保留那一条并把新内容并进去"),
          count
        ),
        err,
        h("div", { class: "mat-composer-actions" },
          h("button", { class: "btn btn-primary mat-generate", type: "button", "aria-label": "分析并保存素材", onclick: () => generate(false) },
            icon("spark"), "生成素材"),
          h("button", { class: "btn btn-ghost", type: "button", "aria-label": "仅生成预览，不保存", onclick: () => generate(true) },
            icon("search"), "仅预览"),
          h("span", { class: "mat-hint" }, "⌘ / Ctrl + Enter 生成")
        )
      ),
      previewSlot
    );

    renderPreviewInto(previewSlot);
    return section;
  }

  function focusComposer() {
    const el = page.querySelector(".mat-input");
    if (!el) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try { el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }); } catch (err) { /* 忽略 */ }
    el.focus({ preventScroll: true });
  }

  function showComposerError(msg) {
    composer.error = msg;
    if (composerErrorRef) {
      composerErrorRef.textContent = msg;
      composerErrorRef.hidden = false;
    }
  }

  function clearComposerError() {
    composer.error = "";
    if (composerErrorRef) {
      composerErrorRef.textContent = "";
      composerErrorRef.hidden = true;
    }
  }

  function composerOverrides(draft) {
    const out = { ...draft };
    const t = composer.title.trim();
    if (t) out.title = t;
    if (composer.type !== "auto") {
      out.type = composer.type;
      out.typeLabel = typeLabelOf(composer.type);
    }
    return out;
  }

  function generate(previewOnly) {
    clearComposerError();
    const raw = composer.input.trim();
    if (!raw) {
      showComposerError("请先输入一段内容：一段经历、一个人、一个地方，或任何想聊的想法。");
      toast("素材原文不能为空", "warn");
      focusComposer();
      return;
    }
    const analyzeF = fn("analyze");
    if (!analyzeF) {
      showComposerError("素材引擎尚未加载，暂时无法生成。刷新页面后再试。");
      toast("素材引擎未就绪", "bad");
      return;
    }
    let draft;
    try {
      draft = normalizeDraft(analyzeF(raw), raw);
    } catch (err) {
      console.warn("[materials] analyze failed", err);
      showComposerError("解析失败：引擎暂时无法处理这段输入。可以换一种说法，或稍后再试。");
      toast("解析失败，请稍后重试", "bad");
      return;
    }

    const overridden = composerOverrides(draft);

    let hits = [];
    try { hits = findSimilar(overridden); } catch (err) { console.warn(err); }

    let matches = [];
    const mq = fn("matchQuestions");
    if (mq) {
      try {
        const res = mq(overridden, QUESTION_BANK, 6);
        if (Array.isArray(res)) matches = res.filter((q) => q && q.question);
      } catch (err) {
        console.warn("[materials] preview matchQuestions failed", err);
      }
    }

    composer.preview = { draft: overridden, hits, matches, savedId: null, savedTitle: "", savedMerged: false };
    if (previewOnly) {
      renderPreviewInto();
    } else {
      saveComposerPreview();
    }
  }

  function saveComposerPreview() {
    const p = composer.preview;
    if (!p || p.savedId) return;
    const draft = composerOverrides(p.draft);

    let best = null;
    try { best = findSimilar(draft)[0] || null; } catch (err) { console.warn(err); }

    let saved = null;
    let mergedFlag = false;
    let mergeError = false;
    let mergeScore = 0;

    if (composer.autoMerge && best) {
      const mf = fn("mergeMaterials");
      if (mf) {
        try {
          let merged = mf(best.material, draft);
          if (!merged || typeof merged !== "object") throw new Error("mergeMaterials 返回空");
          merged = {
            ...merged,
            id: best.material.id,
            createdAt: best.material.createdAt || merged.createdAt,
          };
          saved = store.saveMaterial(merged);
          mergedFlag = true;
          mergeScore = Number(best.score) || 0;
        } catch (err) {
          console.warn("[materials] mergeMaterials failed", err);
          mergeError = true;
        }
      }
    }

    if (!saved) {
      try { saved = store.saveMaterial({ ...draft }); } catch (err) { console.warn("[materials] save failed", err); }
    }
    if (!saved) {
      showComposerError("保存失败：本地存储暂时不可用，请检查浏览器是否禁用了 localStorage。");
      toast("保存失败", "bad");
      return;
    }

    p.draft = draft;
    p.savedId = saved.id;
    p.savedTitle = saved.title;
    p.savedMerged = mergedFlag;
    p.savedMergeError = mergeError;
    pairCache = { sig: "", pairs: [] };
    matchCache.clear();
    app.refreshChrome();
    if (mergedFlag) toast(`已归纳到「${saved.title}」（相似度 ${pct(mergeScore)}%）`, "ok");
    else if (mergeError) toast("自动归纳失败，已另存为一条新素材", "warn");
    else toast(`已保存「${saved.title}」`, "ok");
    paint();
  }

  function resetComposer() {
    composer.input = "";
    composer.title = "";
    composer.type = "auto";
    composer.preview = null;
    composer.error = "";
    paint();
    requestAnimationFrame(() => {
      const el = page.querySelector(".mat-input");
      if (el) el.focus({ preventScroll: true });
    });
  }

  function copyPolish(draft) {
    const f = fn("buildPolishPrompt");
    if (!f) { toast("润色提示词暂不可用", "warn"); return; }
    try {
      copyWithFeedback(f(draft), "润色提示词已复制", "复制失败，请手动选中提示词");
    } catch (err) {
      console.warn(err);
      toast("提示词生成失败", "bad");
    }
  }

  /* ---------- 预览 ---------- */

  function renderPreviewInto(slot = previewSlotRef) {
    if (!slot) return;
    slot.replaceChildren();
    if (!composer.preview) return;
    try {
      slot.append(buildPreview(composer.preview));
    } catch (err) {
      console.warn("[materials] preview render failed", err);
      slot.append(h("div", { class: "mat-error" }, "预览渲染失败，请重新生成。"));
    }
  }

  function buildPreview(p) {
    const d = p.draft;
    const conf = clamp01(d.confidence);
    const level = confLevel(conf);
    const totalWords = d.wordCount.p1 + d.wordCount.p2 + d.wordCount.p3;
    const best = p.hits && p.hits[0];
    const displayTitle = composer.title.trim() || d.title;
    const displayType = composer.type !== "auto" ? typeLabelOf(composer.type) : (d.typeLabel || typeLabelOf(d.type));
    const bestTitle = best ? (S(best.material.title) || "未命名素材") : "";

    const steps = [
      { label: "识别主题", detail: d.topics.length ? d.topics.map((t) => t.label).join(" / ") : "通用", ok: d.topics.length > 0 },
      { label: "提取关键词", detail: d.keywords.length ? `${d.keywords.length} 个关键词` : "未提取到", ok: d.keywords.length > 0 },
      { label: "生成英文", detail: totalWords ? `P1 ${d.wordCount.p1} · P2 ${d.wordCount.p2} · P3 ${d.wordCount.p3} 词` : "未生成", ok: totalWords > 0 },
      { label: "匹配真题", detail: `${p.matches.length} 道相关真题`, ok: p.matches.length > 0 },
    ];

    const confClass = level.kind === "ok" ? "mat-conf-ok" : level.kind === "warn" ? "mat-conf-low" : "mat-conf-mid";

    const similarBlock = best
      ? h("div", { class: "mat-similar" },
        h("div", { class: "mat-similar-top" },
          icon("spark"),
          h("span", null, "发现主题相近的素材「", bestTitle, "」"),
          badge(`相似度 ${pct(best.score)}%`, best.score >= 0.62 ? "warn" : "acc")
        ),
        best.reasons && best.reasons.length
          ? h("div", { class: "mat-similar-reasons" }, best.reasons.join(" · "))
          : null,
        h("div", { class: "mat-similar-note" },
          composer.autoMerge
            ? "已勾选自动归纳：保存时会并进这一条，保留它的标题，原文全部追加。"
            : "未勾选自动归纳：保存时会新建一条素材。"),
        h("button", { class: "link-btn", type: "button", onclick: () => openDetail(best.material.id) }, "查看这条素材")
      )
      : null;

    let actions;
    if (p.savedId) {
      actions = h("div", { class: "mat-saved" },
        h("div", { class: "mat-saved-text" },
          icon("check"),
          h("span", null, p.savedMerged ? `已归纳进「${p.savedTitle}」` : `已保存「${p.savedTitle}」`, "，可以继续写，或打开详情细看。")
        ),
        h("div", { class: "btn-row" },
          h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: () => openDetail(p.savedId) }, "查看详情"),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: resetComposer }, "再写一条")
        )
      );
    } else {
      const mergeLabel = composer.autoMerge && best ? "保存并归纳" : "保存素材";
      actions = h("div", { class: "mat-preview-actions" },
        h("button", {
          class: "btn btn-primary", type: "button",
          "aria-label": composer.autoMerge && best ? `保存并自动归纳到 ${bestTitle}` : "保存素材",
          onclick: saveComposerPreview,
        }, icon("check"), mergeLabel),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => copyPolish(d) }, "复制润色提示词"),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: resetComposer }, "清空")
      );
    }

    return h("div", { class: "mat-preview", "aria-live": "polite" },
      h("div", { class: "mat-preview-head" },
        h("div", { class: "mat-preview-titlewrap" },
          h("div", { class: "mat-preview-eyebrow" }, "生成预览"),
          h("h3", { class: "mat-preview-title" }, displayTitle)
        ),
        h("div", { class: "mat-preview-badges" },
          badge(displayType, "acc"),
          badge(`置信度 ${pct(conf)}%`, level.kind)
        )
      ),
      h("div", { class: "mat-steps" },
        steps.map((s) => h("div", { class: `mat-step ${s.ok ? "mat-step-ok" : "mat-step-warn"}` },
          h("span", { class: "mat-step-dot" }, s.ok ? icon("check") : "!"),
          h("span", { class: "mat-step-label" }, s.label),
          h("span", { class: "mat-step-detail" }, s.detail)
        ))
      ),
      h("div", { class: "mat-topic-row" },
        h("span", { class: "mat-label" }, "主题"),
        ...(d.topics.length
          ? d.topics.map((t) => h("span", { class: "mat-chip" }, t.label, h("b", { class: "mat-chip-score" }, `${pct(t.score)}%`)))
          : [h("span", { class: "mat-chip mat-chip-muted" }, "通用")])
      ),
      d.keywords.length
        ? h("div", { class: "mat-topic-row" },
          h("span", { class: "mat-label" }, "关键词"),
          ...d.keywords.slice(0, 8).map((k) => h("span", { class: "mat-keyword" },
            k.zh || k.en,
            k.zh && k.en ? h("em", null, k.en) : null
          ))
        )
        : null,
      h("div", { class: "mat-conf" },
        h("div", { class: "mat-conf-top" },
          h("span", null, "识别置信度"),
          h("b", null, `${pct(conf)}%`),
          badge(`${level.label}置信`, level.kind)
        ),
        h("div", { class: "mat-conf-track" },
          h("span", { class: `mat-conf-fill ${confClass}`, style: `width:${Math.max(4, pct(conf))}%` })
        )
      ),
      conf < 0.5
        ? h("p", { class: "mat-note mat-warn" }, "置信度偏低：建议补充具体的时间、人物、地点或细节，生成结果会更准确。")
        : null,
      similarBlock,
      h("p", { class: "mat-preview-note" },
        "本地引擎生成 · 素材骨架，建议按自己的经历微调。全程不联网，也不会把内容上传到任何服务器。"),
      actions
    );
  }

  /* ---------- 归纳建议条 ---------- */

  function suggestionBar(pairs) {
    const body = h("div", { class: "mat-suggest-body" });
    if (view.suggestOpen) {
      body.append(...pairs.map((pair, i) => pairCard(pair, i)));
    }
    return h("section", { class: "mat-suggest", "aria-label": "主题相近素材建议" },
      h("div", { class: "mat-suggest-top" },
        h("div", { class: "mat-suggest-main" },
          h("span", { class: "mat-suggest-icon" }, icon("spark")),
          h("div", { class: "mat-suggest-copy" },
            h("div", { class: "mat-suggest-title" }, `发现 ${pairs.length} 组主题相近的素材`),
            h("div", { class: "mat-suggest-sub" }, "合并后只保留一条，另一条的全部原文会自动并入，不会丢失。")
          )
        ),
        h("button", {
          class: "btn btn-ghost btn-sm", type: "button",
          "aria-expanded": String(view.suggestOpen),
          onclick: () => { view.suggestOpen = !view.suggestOpen; paint(); },
        }, view.suggestOpen ? "收起" : "查看")
      ),
      view.suggestOpen ? body : null
    );
  }

  function pairCard(pair, index) {
    const { key, a, b, score } = pair;
    const fallbackKeep = earlierOf(a, b);
    let keepId = view.suggestKeep[key];
    if (keepId !== a.id && keepId !== b.id) keepId = fallbackKeep.id;
    const confirming = view.suggestConfirm === key;
    const name = `mat-suggest-keep-${index}`;
    const keepTitle = keepId === a.id ? a.title : b.title;
    const absorbTitle = keepId === a.id ? b.title : a.title;

    return h("div", { class: "mat-pair" },
      h("div", { class: "mat-pair-head" },
        h("div", { class: "mat-pair-title" },
          h("span", null, a.title),
          h("span", { class: "mat-pair-vs" }, "↔"),
          h("span", null, b.title)
        ),
        badge(`相似度 ${pct(score)}%`, score >= 0.62 ? "warn" : "acc")
      ),
      h("div", { class: "mat-pair-reasons" },
        pair.reasons && pair.reasons.length
          ? pair.reasons.join(" · ")
          : "两条素材的主题与关键词有较多重叠，可以考虑归纳成一条。"),
      h("div", { class: "mat-pair-choose" },
        h("label", { class: "mat-radio" },
          h("input", {
            type: "radio", name, value: a.id, checked: keepId === a.id,
            onchange: () => {
              view.suggestKeep[key] = a.id;
              if (view.suggestConfirm === key) paint();
            },
          }),
          h("span", null, `保留「${a.title}」`)
        ),
        h("label", { class: "mat-radio" },
          h("input", {
            type: "radio", name, value: b.id, checked: keepId === b.id,
            onchange: () => {
              view.suggestKeep[key] = b.id;
              if (view.suggestConfirm === key) paint();
            },
          }),
          h("span", null, `保留「${b.title}」`)
        ),
        h("button", {
          class: "btn btn-primary btn-sm", type: "button",
          onclick: () => {
            let chosen = view.suggestKeep[key];
            if (chosen !== a.id && chosen !== b.id) chosen = keepId;
            view.suggestKeep[key] = chosen;
            view.suggestConfirm = key;
            paint();
          },
        }, icon("spark"), "合并这两条")
      ),
      confirming
        ? h("div", { class: "mat-confirm" },
          h("span", null, `将只保留「${keepTitle}」，「${absorbTitle}」的原文并入。`),
          h("button", {
            class: "btn btn-primary btn-sm", type: "button",
            onclick: () => {
              const saved = performMerge(keepId, keepId === a.id ? b.id : a.id);
              if (!saved) return;
              view.suggestConfirm = "";
              view.suggestKeep = {};
              paint();
            },
          }, "确认合并"),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { view.suggestConfirm = ""; paint(); } }, "取消")
        )
        : null
    );
  }

  /* ---------- 手动合并 ---------- */

  function toggleManual() {
    if (store.materialsList().length < 2) {
      toast("至少需要两条素材才能手动合并", "warn");
      return;
    }
    view.manualOpen = !view.manualOpen;
    paint();
  }

  function manualPanel() {
    const list = store.materialsList();
    if (list.length < 2) return null;
    const ms = view.manual || (view.manual = { a: "", b: "", keep: "a", confirm: false });
    const ids = new Set(list.map((m) => m.id));
    if (!ids.has(ms.a)) ms.a = list[0].id;
    if (!ids.has(ms.b) || ms.b === ms.a) {
      const other = list.find((m) => m.id !== ms.a);
      ms.b = other ? other.id : "";
    }

    const aSel = h("select", { class: "select", "aria-label": "选择素材 A" },
      ...list.map((m) => h("option", { value: m.id }, `${m.title}（${typeLabelOf(m.type)}）`)));
    aSel.value = ms.a;
    const bSel = h("select", { class: "select", "aria-label": "选择素材 B" },
      ...list.map((m) => h("option", { value: m.id }, `${m.title}（${typeLabelOf(m.type)}）`)));
    bSel.value = ms.b;

    const simLine = h("div", { class: "mat-manual-score" });
    const updateSim = () => {
      const s = pairScore(store.getMaterial(ms.a), store.getMaterial(ms.b));
      if (s == null) {
        simLine.textContent = "合并会保留两边的全部原文。";
        return;
      }
      const note = s >= 0.62 ? "高度相近，建议合并" : s >= 0.45 ? "可以归纳" : "差异较大，仍可手动合并";
      simLine.textContent = `当前两条相似度 ${pct(s)}%（${note}）`;
    };
    aSel.addEventListener("change", () => {
      ms.a = aSel.value;
      if (ms.b === ms.a) {
        const other = list.find((m) => m.id !== ms.a);
        if (other) { ms.b = other.id; bSel.value = other.id; }
      }
      if (ms.confirm) { ms.confirm = false; paint(); return; }
      updateSim();
    });
    bSel.addEventListener("change", () => {
      ms.b = bSel.value;
      if (ms.confirm) { ms.confirm = false; paint(); return; }
      updateSim();
    });
    updateSim();

    const keep = ms.keep === "b" ? "b" : "a";
    const keepId = keep === "b" ? ms.b : ms.a;
    const absorbId = keep === "b" ? ms.a : ms.b;

    const body = h("div", { class: "mat-editor-inner" },
      h("div", { class: "mat-manual-grid" },
        h("div", { class: "field" }, h("label", null, "素材 A"), aSel),
        h("div", { class: "field" }, h("label", null, "素材 B"), bSel)
      ),
      simLine,
      h("div", { class: "mat-merge-keep" },
        h("label", { class: "mat-radio" },
          h("input", {
            type: "radio", name: "mat-manual-keep", value: "a", checked: keep === "a",
            onchange: () => { ms.keep = "a"; if (ms.confirm) paint(); },
          }),
          h("span", null, "保留 A")
        ),
        h("label", { class: "mat-radio" },
          h("input", {
            type: "radio", name: "mat-manual-keep", value: "b", checked: keep === "b",
            onchange: () => { ms.keep = "b"; if (ms.confirm) paint(); },
          }),
          h("span", null, "保留 B")
        )
      ),
      ms.confirm
        ? h("div", { class: "mat-confirm" },
          h("span", null, `将只保留「${(store.getMaterial(keepId) || {}).title || "?"}」，另一条原文并入。`),
          h("button", {
            class: "btn btn-primary btn-sm", type: "button",
            onclick: () => {
              if (ms.a === ms.b) { toast("请选择两条不同的素材", "warn"); return; }
              const nowKeep = ms.keep === "b" ? ms.b : ms.a;
              const nowAbsorb = ms.keep === "b" ? ms.a : ms.b;
              const saved = performMerge(nowKeep, nowAbsorb);
              if (!saved) return;
              view.manualOpen = false;
              view.manual = { a: "", b: "", keep: "a", confirm: false };
              paint();
            },
          }, "确认合并"),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { ms.confirm = false; paint(); } }, "取消")
        )
        : null,
      h("div", { class: "btn-row" },
        !ms.confirm
          ? h("button", {
            class: "btn btn-primary", type: "button",
            onclick: () => {
              if (ms.a === ms.b) { toast("请选择两条不同的素材", "warn"); return; }
              ms.confirm = true;
              paint();
            },
          }, icon("spark"), "合并")
          : null,
        h("button", { class: "btn btn-ghost", type: "button", onclick: () => { view.manualOpen = false; ms.confirm = false; paint(); } }, "取消")
      )
    );

    return panel({
      title: "手动合并两条素材",
      actions: h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { view.manualOpen = false; paint(); } }, "收起"),
      body,
    });
  }

  /* ---------- 合并执行（建议条 / 手动 / 详情共用） ---------- */

  function performMerge(keepId, absorbId) {
    if (!keepId || !absorbId || keepId === absorbId) {
      toast("请选择两条不同的素材", "warn");
      return null;
    }
    const keep = store.getMaterial(keepId);
    const absorb = store.getMaterial(absorbId);
    if (!keep || !absorb) {
      toast("素材不存在，可能已被删除", "warn");
      return null;
    }
    const mf = fn("mergeMaterials");
    if (!mf) {
      toast("引擎暂不支持合并，请稍后重试", "bad");
      return null;
    }
    try {
      let merged = mf(keep, absorb);
      if (!merged || typeof merged !== "object") throw new Error("mergeMaterials 返回空");
      merged = {
        ...merged,
        id: keep.id,
        createdAt: keep.createdAt || merged.createdAt,
      };
      const saved = store.saveMaterial(merged);
      if (absorb.id !== saved.id) store.deleteMaterial(absorb.id);
      pairCache = { sig: "", pairs: [] };
      matchCache.clear();
      app.refreshChrome();
      toast(`已归纳合并，保留「${saved.title}」`, "ok");
      return saved;
    } catch (err) {
      console.warn("[materials] merge failed", err);
      toast("合并失败：引擎暂时无法处理这两条素材", "bad");
      return null;
    }
  }

  /* ---------- 素材列表 ---------- */

  function listPanel() {
    const all = store.materialsList();

    const q = h("input", {
      class: "input", type: "search",
      placeholder: "搜索标题 / 原文 / 要点 / 关键词…", "aria-label": "搜索素材",
      oninput: () => { view.query = q.value; view.page = 1; renderListBody(); },
    });
    q.value = view.query;

    const topicCounts = new Map();
    const typeCounts = new Map();
    for (const m of all) {
      for (const t of A(m.topics)) topicCounts.set(t.id, (topicCounts.get(t.id) || 0) + 1);
      typeCounts.set(m.type, (typeCounts.get(m.type) || 0) + 1);
    }
    const knownTopicIds = new Set(TOPICS.map((t) => t.id));
    const extraTopics = [...topicCounts.keys()].filter((id) => id && !knownTopicIds.has(id));
    const topicOptions = [
      ...TOPICS.map((t) => ({ ...t, count: topicCounts.get(t.id) || 0 })),
      ...extraTopics.map((id) => ({ id, label: topicLabelOf(id), count: topicCounts.get(id) || 0 })),
    ];
    if (view.topic !== "all" && !topicOptions.some((t) => t.id === view.topic)) view.topic = "all";

    const topicSel = h("select", { class: "select", "aria-label": "按主题筛选" },
      h("option", { value: "all" }, "全部主题"),
      ...topicOptions.map((t) => h("option", { value: t.id }, `${t.label}${t.count ? ` (${t.count})` : ""}`))
    );
    topicSel.value = view.topic;
    topicSel.addEventListener("change", () => { view.topic = topicSel.value; view.page = 1; renderListBody(); });

    const knownTypeIds = new Set(TYPES.map((t) => t.id));
    const typeOptions = [
      ...TYPES.map((t) => ({ ...t, count: typeCounts.get(t.id) || 0 })),
      ...[...typeCounts.keys()].filter((id) => id && !knownTypeIds.has(id)).map((id) => ({ id, label: typeLabelOf(id), count: typeCounts.get(id) || 0 })),
    ];
    if (view.type !== "all" && !typeOptions.some((t) => t.id === view.type)) view.type = "all";

    const typeSel = h("select", { class: "select", "aria-label": "按类型筛选" },
      h("option", { value: "all" }, "全部类型"),
      ...typeOptions.map((t) => h("option", { value: t.id }, `${t.label}${t.count ? ` (${t.count})` : ""}`))
    );
    typeSel.value = view.type;
    typeSel.addEventListener("change", () => { view.type = typeSel.value; view.page = 1; renderListBody(); });

    const sortSel = h("select", { class: "select", "aria-label": "排序方式" },
      h("option", { value: "recent" }, "最近更新"),
      h("option", { value: "topic" }, "按主题")
    );
    sortSel.value = view.sort;
    sortSel.addEventListener("change", () => { view.sort = sortSel.value; view.page = 1; renderListBody(); });

    const countNode = h("span", { class: "mat-list-count" });
    const listBody = h("div", { class: "mat-list-body" });

    function renderListBody() {
      const list = applyFilters(store.materialsList());
      const { items, page: cur, pages } = slicePage(list, view.page, PER_PAGE);
      view.page = cur;
      countNode.textContent = `${list.length} 条素材${all.length && list.length !== all.length ? ` / 共 ${all.length} 条` : ""}`;
      listBody.replaceChildren();
      if (!list.length) {
        listBody.append(h("div", { class: "mat-empty-pad" },
          all.length
            ? emptyState("search", "没有符合条件的素材", "换个搜索词，或把主题 / 类型筛选调回「全部」。")
            : emptyState("material", "素材库还是空的", "在上面的输入框写一段经历，点「生成素材」就会出现在这里。")
        ));
        return;
      }
      listBody.append(h("div", { class: "mat-cards" }, items.map(cardNode)));
      const pg = pager({
        page: view.page, pages,
        onChange: (p) => { view.page = p; renderListBody(); root.scrollTop = 0; },
      });
      if (pg) listBody.append(pg);
    }

    function applyFilters(source) {
      const query = view.query.trim().toLowerCase();
      const out = source.filter((m) => {
        if (view.topic !== "all" && !A(m.topics).some((t) => t.id === view.topic)) return false;
        if (view.type !== "all" && m.type !== view.type) return false;
        if (!query) return true;
        return searchText(m).includes(query);
      });
      if (view.sort === "topic") {
        out.sort((a, b) => {
          const ta = topicLabelOf(A(a.topics)[0] && A(a.topics)[0].id);
          const tb = topicLabelOf(A(b.topics)[0] && A(b.topics)[0].id);
          return ta.localeCompare(tb, "zh") || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
        });
      }
      return out;
    }

    function cardNode(raw) {
      const m = readMaterial(raw);
      const matches = matchFor(raw, 6);
      const points = m.points.slice(0, 2);
      const merged = m.mergedFrom.length > 0;
      const open = () => openDetail(m.id);
      return h("article", {
        class: "mat-card", role: "button", tabindex: 0,
        "aria-label": `查看素材：${m.title}`,
        onclick: open,
        onkeydown: (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
        },
      },
        h("div", { class: "mat-card-top" },
          badge(m.typeLabel || typeLabelOf(m.type), "acc"),
          merged ? badge("已归纳", "ok") : null,
          badge(`${pct(m.confidence)}%`, confLevel(m.confidence).kind)
        ),
        h("h3", { class: "mat-card-title" }, m.title),
        points.length
          ? h("div", { class: "mat-card-points" }, points.map((p) => h("div", { class: "mat-card-point" }, p)))
          : h("div", { class: "mat-card-point" }, "暂无中文要点"),
        m.topics.length
          ? h("div", { class: "mat-card-topics" }, m.topics.slice(0, 3).map((t) => h("span", { class: "mat-chip" }, t.label)))
          : null,
        h("div", { class: "mat-card-foot" },
          h("span", null, `更新 ${fmtWhen(m.updatedAt)}`),
          h("span", null, `· ${matches.length} 道真题`),
          h("span", null, `· ${m.points.length} 条要点`),
          h("span", { class: "mat-card-arrow" }, "→")
        )
      );
    }

    renderListBody();

    return h("section", { class: "panel mat-list" },
      h("div", { class: "toolbar mat-filter" },
        h("div", { class: "toolbar-search" }, icon("search"), q),
        topicSel, typeSel, sortSel
      ),
      h("div", { class: "mat-list-head" },
        h("span", null, "素材列表"),
        countNode
      ),
      listBody
    );
  }

  function searchText(m) {
    const parts = [S(m.title), S(m.rawInput), typeLabelOf(m.type)];
    for (const p of A(m.points)) parts.push(S(p));
    for (const k of A(m.keywords)) parts.push(S(k && k.zh), S(k && k.en));
    for (const t of A(m.topics)) parts.push(topicLabelOf(t && t.id), S(t && t.label));
    for (const c of A(m.collocations)) parts.push(S(c));
    return parts.join(" ").toLowerCase();
  }

  /* ============================================================
   * 详情
   * ============================================================ */

  function openDetail(id) {
    const m = store.getMaterial(id);
    if (!m) { toast("素材不存在，可能已被删除", "warn"); paint(); return; }
    view.mode = "detail";
    view.detailId = id;
    view.detailTab = "p2";
    view.detailFlags = {};
    paint();
    root.scrollTop = 0;
  }

  function backToList() {
    view.mode = "list";
    view.detailId = null;
    view.detailFlags = {};
    paint();
    root.scrollTop = 0;
  }

  function buildDetail(raw) {
    const m = readMaterial(raw);
    const flags = view.detailFlags || (view.detailFlags = {});
    const frag = document.createDocumentFragment();
    frag.append(detailHeader(m, flags));
    if (flags.deleteConfirm) frag.append(deleteConfirm(m, flags));
    if (flags.editor === "raw") frag.append(rawEditor(m, flags));
    if (flags.editor === "append") frag.append(appendEditor(m, flags));
    if (flags.editor === "merge") frag.append(mergeEditor(m, flags));
    frag.append(h("div", { class: "mat-detail-grid" },
      h("div", { class: "mat-detail-main" },
        pointsPanel(m, flags),
        englishPanel(m),
        questionsPanel(m),
        polishPanel(m)
      ),
      h("div", { class: "mat-detail-side" },
        topicsPanel(m),
        vocabPanel(m),
        collocationsPanel(m),
        framesPanel(m),
        outlinePanel(m),
        sourcesPanel(m)
      )
    ));
    return frag;
  }

  function detailHeader(m, flags) {
    const level = confLevel(m.confidence);
    return h("div", { class: "page-head mat-detail-head" },
      h("div", { class: "mat-detail-titlewrap" },
        h("button", { class: "mat-back", type: "button", onclick: backToList },
          icon("arrowUp"), h("span", null, "返回素材列表")),
        h("h1", { class: "page-title mat-detail-title" }, m.title),
        h("div", { class: "mat-meta" },
          badge(m.typeLabel || typeLabelOf(m.type), "acc"),
          ...m.topics.slice(0, 3).map((t) => h("span", { class: "mat-chip" }, t.label)),
          badge(`置信度 ${pct(m.confidence)}%`, level.kind),
          m.mergedFrom.length ? badge(`已归纳 ${m.mergedFrom.length} 条`, "ok") : null,
          h("span", { class: "mat-meta-text" }, `更新于 ${fmtWhenTime(m.updatedAt)}`)
        )
      ),
      h("div", { class: "page-actions mat-detail-actions" },
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => toggleDetailEditor("raw") }, icon("edit"), "编辑原文"),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => toggleDetailEditor("append") }, icon("plus"), "追加内容"),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => toggleDetailEditor("merge") }, icon("spark"), "合并到其他素材"),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => exportMaterial(m) }, icon("download"), "导出"),
        h("button", {
          class: "btn btn-danger btn-sm", type: "button",
          onclick: () => { flags.deleteConfirm = true; flags.editor = ""; paint(); },
        }, icon("trash"), "删除")
      )
    );
  }

  function toggleDetailEditor(kind) {
    const flags = view.detailFlags || (view.detailFlags = {});
    flags.deleteConfirm = false;
    flags.editor = flags.editor === kind ? "" : kind;
    flags.mergeConfirm = false;
    paint();
  }

  function deleteConfirm(m, flags) {
    return h("div", { class: "mat-danger", role: "alert" },
      icon("trash"),
      h("div", { class: "mat-danger-text" }, `删除「${m.title}」后无法恢复，确定要删除吗？`),
      h("div", { class: "btn-row" },
        h("button", {
          class: "btn btn-danger btn-sm", type: "button",
          onclick: () => {
            try {
              store.deleteMaterial(m.id);
              pairCache = { sig: "", pairs: [] };
              matchCache.clear();
              app.refreshChrome();
              toast(`已删除「${m.title}」`, "ok");
              view.mode = "list";
              view.detailId = null;
              view.detailFlags = {};
              paint();
            } catch (err) {
              console.warn(err);
              toast("删除失败，请稍后重试", "bad");
            }
          },
        }, "确认删除"),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { flags.deleteConfirm = false; paint(); } }, "取消")
      )
    );
  }

  function rawEditor(m, flags) {
    const titleInput = h("input", { class: "input", type: "text", placeholder: "素材标题", "aria-label": "素材标题" });
    titleInput.value = m.title;
    const ta = h("textarea", { class: "textarea mat-edit-textarea", rows: 8, "aria-label": "素材原文" });
    ta.value = m.rawInput;
    const run = () => {
      const raw = ta.value.trim();
      if (!raw) { toast("原文不能为空", "warn"); ta.focus(); return; }
      try {
        const saved = regenerateMaterial(m, raw, titleInput.value);
        flags.editor = "";
        flags.deleteConfirm = false;
        view.detailId = saved.id;
        app.refreshChrome();
        toast(`已重新生成「${saved.title}」`, "ok");
        paint();
      } catch (err) {
        console.warn(err);
        toast("重新生成失败：引擎暂时无法处理这段原文", "bad");
      }
    };
    return panel({
      title: "编辑原文并重新生成",
      body: h("div", { class: "mat-editor-inner" },
        h("div", { class: "field" }, h("label", null, "标题"), titleInput),
        h("div", { class: "field" }, h("label", null, "原文（中文或英文均可）"), ta),
        h("p", { class: "mat-editor-note" }, "重新生成会按新原文刷新英文素材、主题与真题匹配；中文要点会被替换，合并来源与历史保留。"),
        h("div", { class: "btn-row" },
          h("button", { class: "btn btn-primary", type: "button", onclick: run }, icon("spark"), "重新生成"),
          h("button", { class: "btn btn-ghost", type: "button", onclick: () => { flags.editor = ""; paint(); } }, "取消")
        )
      )
    });
  }

  function appendEditor(m, flags) {
    const ta = h("textarea", { class: "textarea mat-edit-textarea", rows: 5, placeholder: "补充新的细节：一次对话、一个转折、一个感受…", "aria-label": "追加内容" });
    const run = () => {
      const text = ta.value.trim();
      if (!text) { toast("请先写下要追加的内容", "warn"); ta.focus(); return; }
      const raw = `${m.rawInput || ""}\n\n【追加】\n${text}`;
      try {
        const saved = regenerateMaterial(m, raw, m.title);
        flags.editor = "";
        view.detailId = saved.id;
        app.refreshChrome();
        toast("已追加内容并重新生成", "ok");
        paint();
      } catch (err) {
        console.warn(err);
        toast("追加失败：引擎暂时无法重新生成", "bad");
      }
    };
    return panel({
      title: "追加内容",
      body: h("div", { class: "mat-editor-inner" },
        h("p", { class: "mat-editor-note" }, "新内容会追加到原文末尾，并重新生成英文素材与真题匹配；旧内容不会丢。"),
        h("div", { class: "field" }, h("label", null, `追加到「${m.title}」`), ta),
        h("div", { class: "btn-row" },
          h("button", { class: "btn btn-primary", type: "button", onclick: run }, icon("plus"), "追加并重新生成"),
          h("button", { class: "btn btn-ghost", type: "button", onclick: () => { flags.editor = ""; paint(); } }, "取消")
        )
      )
    });
  }

  function mergeEditor(m, flags) {
    const others = store.materialsList().filter((x) => x.id !== m.id);
    if (!others.length) {
      return panel({
        title: "合并到其他素材",
        body: emptyState("material", "没有可合并的素材", "素材库里至少要有两条素材才能合并。"),
      });
    }
    const scored = others
      .map((o) => ({ o, score: pairScore(m, o) }))
      .sort((a, b) => (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score));
    const targetId = scored.some((x) => x.o.id === flags.mergeTarget) ? flags.mergeTarget : scored[0].o.id;
    const keep = flags.mergeKeep === "other" ? "other" : "this";
    const target = store.getMaterial(targetId) || scored[0].o;
    const keepM = keep === "this" ? m : readMaterial(target);
    const absorbM = keep === "this" ? readMaterial(target) : m;
    const confirming = !!flags.mergeConfirm;

    const rows = scored.map(({ o, score }) => h("label", { class: "mat-merge-row" },
      h("input", {
        type: "radio", name: "mat-merge-target", value: o.id, checked: o.id === targetId,
        onchange: () => { flags.mergeTarget = o.id; if (flags.mergeConfirm) paint(); },
      }),
      h("span", { class: "mat-merge-title" }, S(o.title)),
      badge(typeLabelOf(o.type), "acc"),
      score == null ? null : h("span", { class: "mat-merge-score" }, `相似度 ${pct(score)}%`)
    ));

    const body = h("div", { class: "mat-editor-inner" },
      h("p", { class: "mat-editor-note" }, "合并后只保留一条素材，另一条的原文会完整并入；合并来源会记录在详情里。"),
      h("div", { class: "mat-merge-list" }, rows),
      h("div", { class: "mat-merge-keep" },
        h("label", { class: "mat-radio" },
          h("input", {
            type: "radio", name: "mat-merge-keep", value: "this", checked: keep === "this",
            onchange: () => { flags.mergeKeep = "this"; if (flags.mergeConfirm) paint(); },
          }),
          h("span", null, "保留本条")
        ),
        h("label", { class: "mat-radio" },
          h("input", {
            type: "radio", name: "mat-merge-keep", value: "other", checked: keep === "other",
            onchange: () => { flags.mergeKeep = "other"; if (flags.mergeConfirm) paint(); },
          }),
          h("span", null, "保留对方")
        )
      ),
      confirming
        ? h("div", { class: "mat-confirm" },
          h("span", null, `将只保留「${keepM.title}」，「${absorbM.title}」的原文并入。`),
          h("button", {
            class: "btn btn-primary btn-sm", type: "button",
            onclick: () => {
              const saved = performMerge(keepM.id, absorbM.id);
              if (!saved) return;
              flags.mergeConfirm = false;
              flags.editor = "";
              flags.mergeTarget = "";
              flags.mergeKeep = "";
              view.detailId = saved.id;
              paint();
            },
          }, "确认合并"),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { flags.mergeConfirm = false; paint(); } }, "取消")
        )
        : null,
      h("div", { class: "btn-row" },
        !confirming
          ? h("button", {
            class: "btn btn-primary", type: "button",
            onclick: () => {
              const t = document.querySelector('input[name="mat-merge-target"]:checked');
              const k = document.querySelector('input[name="mat-merge-keep"]:checked');
              if (!t) { toast("请选择要合并的素材", "warn"); return; }
              if (t.value === m.id) { toast("请选择另一条素材", "warn"); return; }
              flags.mergeTarget = t.value;
              flags.mergeKeep = k ? k.value : "this";
              flags.mergeConfirm = true;
              paint();
            },
          }, icon("spark"), "合并")
          : null,
        h("button", { class: "btn btn-ghost", type: "button", onclick: () => { flags.editor = ""; flags.mergeConfirm = false; paint(); } }, "取消")
      )
    );
    return panel({ title: "合并到其他素材", body });
  }

  function regenerateMaterial(m, newRaw, titleOverride) {
    const raw = S(newRaw).trim();
    if (!raw) throw new Error("原文为空");
    const analyzeF = fn("analyze");
    if (!analyzeF) throw new Error("引擎未就绪");

    let draft = null;
    const recomposeF = fn("recompose");
    if (recomposeF) {
      try {
        draft = recomposeF({ ...m, rawInput: raw, title: S(titleOverride) || m.title });
      } catch (err) {
        console.warn("[materials] recompose failed, fallback analyze", err);
        draft = null;
      }
    }
    if (!draft || typeof draft !== "object") draft = analyzeF(raw);

    const d = normalizeDraft(draft, raw, S(titleOverride) || m.title);
    const next = {
      ...m,
      ...d,
      id: m.id,
      createdAt: m.createdAt || d.createdAt,
      mergedFrom: A(m.mergedFrom),
      mergeNote: S(m.mergeNote),
      title: S(titleOverride) || m.title || d.title,
      rawInput: raw,
    };
    const saved = store.saveMaterial(next);
    pairCache = { sig: "", pairs: [] };
    matchCache.clear();
    return saved;
  }

  function exportMaterial(m) {
    const safe = S(m.title).replace(/[\\/:*?"<>|\n\r]+/g, " ").trim().slice(0, 36) || "material";
    download(`${safe}.md`, markdownFor(m), "text/markdown");
    toast("已导出 Markdown", "ok");
  }

  /* ---------- 详情分区 ---------- */

  function pointsPanel(m, flags) {
    const editing = !!flags.pointsEdit;
    const body = h("div", { class: "mat-points-body" });

    if (editing) {
      const rows = h("div", { class: "mat-point-edits" });
      const addRow = (value = "") => {
        const ta = h("textarea", { class: "textarea mat-point-edit", rows: 2, "aria-label": "中文要点" });
        ta.value = value;
        rows.append(h("div", { class: "mat-point-row" },
          h("span", { class: "mat-point-num" }, "•"),
          ta
        ));
      };
      m.points.forEach((p) => addRow(p));
      if (!m.points.length) addRow("");

      const save = () => {
        const vals = [...body.querySelectorAll(".mat-point-edit")].map((t) => t.value.trim()).filter(Boolean);
        if (!vals.length) { toast("至少保留一条要点", "warn"); return; }
        try {
          store.saveMaterial({ ...m, points: [...new Set(vals)] });
          pairCache = { sig: "", pairs: [] };
          matchCache.clear();
          flags.pointsEdit = false;
          app.refreshChrome();
          toast("中文要点已保存", "ok");
          paint();
        } catch (err) {
          console.warn(err);
          toast("保存要点失败", "bad");
        }
      };

      body.append(rows,
        h("div", { class: "btn-row mat-point-actions" },
          h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { addRow(""); } }, icon("plus"), "添加一条"),
          h("button", { class: "btn btn-primary btn-sm", type: "button", onclick: save }, icon("check"), "保存要点"),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { flags.pointsEdit = false; paint(); } }, "取消")
        )
      );
    } else if (m.points.length) {
      body.append(h("ol", { class: "mat-points" },
        m.points.map((p, i) => h("li", { class: "mat-point" },
          h("span", { class: "mat-point-num" }, String(i + 1).padStart(2, "0")),
          h("span", null, p)
        ))
      ));
    } else {
      body.append(h("p", { class: "mat-note" }, "还没有中文要点。点「编辑要点」手动补充。"));
    }

    return panel({
      title: "中文要点",
      actions: editing
        ? h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { flags.pointsEdit = false; paint(); } }, "取消编辑")
        : h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => { flags.pointsEdit = true; paint(); } }, icon("edit"), "编辑要点"),
      body,
    });
  }

  function englishPanel(m) {
    const active = ["p1", "p2", "p3"].includes(view.detailTab) ? view.detailTab : "p2";
    const labels = { p1: "P1 · 问答", p2: "P2 · 陈述", p3: "P3 · 讨论" };
    const ranges = { p1: [55, 85], p2: [165, 205], p3: [90, 120] };
    const text = S(m.english[active]);
    const wc = m.wordCount[active] || countWords(text);
    const [lo, hi] = ranges[active];
    const inRange = wc >= lo && wc <= hi;

    const tabs = h("div", { class: "tabbar mat-en-tabs", role: "tablist" },
      ...["p1", "p2", "p3"].map((key) => h("button", {
        class: `tab${key === active ? " is-active" : ""}`, type: "button",
        role: "tab", "aria-selected": String(key === active),
        onclick: () => { view.detailTab = key; paint(); },
      }, labels[key]))
    );

    const body = h("div", { class: "mat-en-body" },
      h("div", { class: "mat-en-head" },
        h("div", { class: "mat-en-meta" },
          badge(`${wc} 词`, inRange ? "ok" : "warn"),
          h("span", { class: "mat-note" }, `建议 ${lo}–${hi} 词`)
        ),
        h("button", {
          class: "btn btn-ghost btn-sm", type: "button",
          onclick: () => copyWithFeedback(text, `已复制 ${active.toUpperCase()} 素材`),
        }, icon("download"), "复制")
      ),
      text
        ? h("div", { class: "mat-en-text" }, text)
        : h("div", { class: "mat-en-empty" },
          h("p", { class: "mat-note" }, "这一档英文素材还没有生成。可以重新生成，或先补充原文细节。"),
          h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => retryEnglish(m) }, icon("spark"), "重新生成")
        )
    );

    return panel({
      title: "英文素材",
      actions: h("span", { class: "mat-note" }, "本地生成 · 建议按经历微调"),
      body: h("div", null, tabs, body),
    });
  }

  function retryEnglish(m) {
    try {
      regenerateMaterial(m, m.rawInput, m.title);
      app.refreshChrome();
      toast("英文素材已重新生成", "ok");
      paint();
    } catch (err) {
      console.warn(err);
      toast("重新生成失败：引擎暂时不可用", "bad");
    }
  }

  function questionsPanel(m) {
    const matches = matchFor(m, 6);
    const partKind = { 1: "acc", 2: "warn", 3: "ok" };
    return panel({
      title: "匹配真题",
      actions: h("span", { class: "mat-note" }, `${matches.length} 道`),
      body: matches.length
        ? h("div", { class: "mat-q-list" }, matches.map((q) => h("div", { class: "mat-q" },
          h("div", { class: "mat-q-main" },
            h("div", { class: "mat-q-head" },
              badge(`Part ${q.part}`, partKind[q.part] || "acc"),
              q.category ? badge(q.category, "acc") : null,
              q.score != null ? h("span", { class: "mat-note" }, `匹配度 ${pct(q.score)}%`) : null
            ),
            h("div", { class: "mat-q-text" }, S(q.question))
          ),
          h("a", { class: "btn btn-ghost btn-sm", href: "#/speaking" }, "去口语题库")
        )))
        : h("p", { class: "mat-note" }, "暂时没有匹配到真题。补充更具体的时间、人物或主题词后再重新生成试试。")
    });
  }

  function polishPanel(m) {
    const prompt = polishPromptFor(m);
    return panel({
      title: "交给 AI 润色",
      body: h("div", { class: "mat-polish" },
        h("p", { class: "mat-note" }, "本页的英文由本地引擎生成，只是素材骨架。把下面这段中文提示词复制到任意 AI 工具，可以让它按你的真实经历润色。"),
        prompt
          ? h("details", { class: "mat-details" },
            h("summary", null, "展开润色提示词"),
            h("pre", { class: "mat-polish-prompt" }, prompt)
          )
          : h("p", { class: "mat-note mat-warn" }, "提示词暂未生成，可以稍后重试。"),
        h("div", { class: "btn-row mat-polish-actions" },
          prompt ? h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => copyWithFeedback(prompt, "润色提示词已复制") }, "复制提示词") : null,
          h("button", { class: "btn btn-ghost btn-sm", type: "button", onclick: () => exportMaterial(m) }, icon("download"), "导出 Markdown")
        )
      )
    });
  }

  function polishPromptFor(m) {
    const f = fn("buildPolishPrompt");
    if (!f) return "";
    try { return S(f(m)); } catch (err) { console.warn("[materials] buildPolishPrompt failed", err); return ""; }
  }

  function topicsPanel(m) {
    return panel({
      title: "主题与关键词",
      body: h("div", { class: "mat-side-stack" },
        m.topics.length
          ? h("div", { class: "mat-tags" }, m.topics.map((t) => h("span", { class: "mat-chip" },
            t.label,
            h("b", { class: "mat-chip-score" }, `${pct(t.score)}%`)
          )))
          : h("p", { class: "mat-note" }, "未识别到明确主题。"),
        m.keywords.length
          ? h("div", { class: "mat-tags mat-kw" }, m.keywords.slice(0, 12).map((k) => h("span", { class: "mat-keyword" },
            k.zh || k.en,
            k.zh && k.en ? h("em", null, k.en) : null
          )))
          : null
      ),
    });
  }

  function vocabPanel(m) {
    const up = m.upgrades;
    const lex = m.lexical;
    if (!up.length && !lex.length) {
      return panel({ title: "词汇升级", body: h("p", { class: "mat-note" }, "暂未识别到可升级的简单表达。") });
    }
    return panel({
      title: "词汇升级",
      body: h("div", { class: "mat-side-stack" },
        up.length
          ? h("div", null,
            h("div", { class: "mat-subhead" }, "简单表达 → 高分表达"),
            h("ul", { class: "mat-upgrades" }, up.map((u) => h("li", { class: "mat-upgrade" },
              h("span", { class: "mat-upgrade-from" }, u.from),
              h("span", { class: "mat-upgrade-arrow" }, "→"),
              h("span", { class: "mat-upgrade-to" }, u.to)
            )))
          )
          : null,
        lex.length
          ? h("div", null,
            h("div", { class: "mat-subhead" }, "Band 7–8 词汇"),
            h("div", { class: "mat-lexical" }, lex.map((l) => h("div", { class: "mat-lex" },
              h("div", { class: "mat-lex-head" },
                h("strong", null, l.term),
                l.cn ? h("span", null, l.cn) : null
              ),
              l.example ? h("div", { class: "mat-lex-ex" }, l.example) : null
            )))
          )
          : null
      ),
    });
  }

  function collocationsPanel(m) {
    return panel({
      title: "高分搭配",
      body: m.collocations.length
        ? h("div", { class: "mat-tags" }, m.collocations.map((c) => h("span", { class: "mat-chip" }, c)))
        : h("p", { class: "mat-note" }, "暂无搭配，补充更具体的原文后重新生成。"),
    });
  }

  function framesPanel(m) {
    return panel({
      title: "句式框架",
      body: m.frames.length
        ? h("div", { class: "mat-frames" }, m.frames.map((f) => h("div", { class: "mat-frame" }, f)))
        : h("p", { class: "mat-note" }, "暂无句式框架。"),
    });
  }

  function outlinePanel(m) {
    return panel({
      title: "中文提纲",
      body: m.outline.length
        ? h("ol", { class: "mat-outline" }, m.outline.map((o) => h("li", null, o)))
        : h("p", { class: "mat-note" }, "暂无提纲。"),
    });
  }

  function sourcesPanel(m) {
    return panel({
      title: "合并来源与历史",
      body: h("div", { class: "mat-side-stack" },
        m.mergeNote ? h("p", { class: "mat-note" }, m.mergeNote) : null,
        m.mergedFrom.length
          ? h("ul", { class: "mat-sources" }, m.mergedFrom.map((s) => h("li", { class: "mat-source" },
            icon("check"),
            h("div", null,
              h("div", { class: "mat-source-title" }, s.title || "并入的素材"),
              h("div", { class: "mat-source-time" }, fmtWhenTime(s.at))
            )
          )))
          : h("p", { class: "mat-note" }, "这条素材还没有归纳过。之后输入主题相近的内容并勾选自动归纳，它会合并到这里。"),
        h("details", { class: "mat-details mat-raw" },
          h("summary", null, "查看完整原文（含并入内容）"),
          h("pre", { class: "mat-raw-text" }, m.rawInput || "—")
        ),
        h("p", { class: "mat-source-time" }, `创建于 ${fmtWhenTime(m.createdAt)}`)
      ),
    });
  }

  /* ---------- 启动 ---------- */

  paint();
}
