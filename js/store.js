/* ============================================================
 * store.js — 数据层：localStorage 持久化 + JSON 导入/导出
 * 本地优先：所有数据属于用户浏览器，导出 JSON 即可备份/迁移
 * ============================================================ */

const STORAGE_KEY = "ielts-workbench:v1";
const SCHEMA = 1;
const LOG_CAP = 200;

const emptyState = () => ({
  meta: { schema: SCHEMA, createdAt: null, updatedAt: null },
  settings: {
    targetBand: 6.5,
    examDate: "",
    dailyGoalMin: 30,
    dailyGoalTasks: 3,
  },
  vocab: [],        // {id, word, phonetic, meaning, example, status:'new'|'learning'|'mastered', addedAt, correct, wrong}
  practices: [],    // {id, module:'listening'|'reading'|'writing'|'speaking', title, date, correct, total, band, minutes, notes}
  writing: [],      // {id, date, taskType:'task1'|'task2', topic, essay, score, notes}
  speaking: [],     // {id, date, part:1|2|3, topic, notes, score}
  tasks: {},        // {'YYYY-MM-DD': [{id, text, done}]}
  checkins: {},     // {'YYYY-MM-DD': true}
  log: [],          // {at, module, msg, kind}
});

let state = load();

/* ---------- 基础持久化 ---------- */

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.meta?.schema !== SCHEMA) return emptyState();
    const base = emptyState();
    return {
      ...base,
      ...parsed,
      meta: { ...base.meta, ...parsed.meta },
      settings: { ...base.settings, ...(parsed.settings || {}) },
    };
  } catch {
    return emptyState();
  }
}

function save() {
  state.meta.updatedAt = new Date().toISOString();
  if (!state.meta.createdAt) state.meta.createdAt = state.meta.updatedAt;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("save failed", e);
    return false;
  }
  return true;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addLog(module, msg, kind = "") {
  state.log.unshift({ at: Date.now(), module, msg, kind });
  if (state.log.length > LOG_CAP) state.log.length = LOG_CAP;
}

/* ---------- 活动日志 ---------- */

export function logEntries(n = 12) {
  return state.log.slice(0, n);
}

/* ---------- 词汇 ---------- */

export function addWord({ word, phonetic = "", meaning = "", example = "", status = "new" }) {
  const w = { id: uid(), word: word.trim(), phonetic, meaning, example, status, addedAt: new Date().toISOString(), correct: 0, wrong: 0 };
  state.vocab.unshift(w);
  addLog("词汇", `新增单词「${w.word}」`, "ok");
  save();
  return w;
}

export function updateWord(id, patch) {
  const w = state.vocab.find((x) => x.id === id);
  if (!w) return;
  Object.assign(w, patch);
  save();
}

export function deleteWord(id) {
  const w = state.vocab.find((x) => x.id === id);
  state.vocab = state.vocab.filter((x) => x.id !== id);
  if (w) addLog("词汇", `删除单词「${w.word}」`, "bad");
  save();
}

export function recordQuiz(id, correct) {
  const w = state.vocab.find((x) => x.id === id);
  if (!w) return;
  if (correct) {
    w.correct++;
    if (w.status === "new" && w.correct >= 2) w.status = "learning";
    if (w.status === "learning" && w.correct - w.wrong >= 3) w.status = "mastered";
  } else {
    w.wrong++;
    if (w.status === "mastered") w.status = "learning";
    if (w.status === "learning" && w.wrong >= 3) w.status = "new";
  }
  save();
}

export function vocabList(filter = "all", query = "") {
  const q = query.trim().toLowerCase();
  return state.vocab.filter((w) => {
    if (filter !== "all" && w.status !== filter) return false;
    if (!q) return true;
    return w.word.toLowerCase().includes(q) || w.meaning.includes(query.trim()) || w.example.toLowerCase().includes(q);
  });
}

export function vocabStats() {
  const c = { new: 0, learning: 0, mastered: 0 };
  for (const w of state.vocab) c[w.status] = (c[w.status] || 0) + 1;
  return { total: state.vocab.length, ...c };
}

/* ---------- 真题模考 ---------- */

const BAND_TABLE = {
  listening: [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3]],
  reading: [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3]],
};

export function bandEstimate(module, correct, total) {
  if (!total) return null;
  const table = BAND_TABLE[module];
  if (!table) return null;
  const raw = Math.round((correct / total) * 40);
  for (const [min, band] of table) if (raw >= min) return band;
  return 2.5;
}

export function addPractice({ module, title, date, correct, total, band = null, minutes = 0, notes = "" }) {
  const est = band ?? bandEstimate(module, Number(correct), Number(total));
  const p = { id: uid(), module, title: title.trim() || "未命名练习", date, correct: Number(correct), total: Number(total), band: est, minutes: Number(minutes), notes, addedAt: new Date().toISOString() };
  state.practices.unshift(p);
  addLog("真题", `记录 ${moduleLabel(module)} 练习「${p.title}」`, "ok");
  save();
  return p;
}

export function deletePractice(id) {
  state.practices = state.practices.filter((x) => x.id !== id);
  addLog("真题", "删除一条练习记录", "bad");
  save();
}

export function practiceList(module = "all") {
  return module === "all" ? state.practices : state.practices.filter((p) => p.module === module);
}

export function practiceStats() {
  const by = { listening: [], reading: [], writing: [], speaking: [] };
  for (const p of state.practices) (by[p.module] ||= []).push(p);
  const out = { total: state.practices.length, byModule: {}, avgBand: null };
  const bands = [];
  for (const [m, list] of Object.entries(by)) {
    const b = list.filter((p) => p.band != null).map((p) => p.band);
    const avg = b.length ? +(b.reduce((a, x) => a + x, 0) / b.length).toFixed(2) : null;
    out.byModule[m] = { count: list.length, avgBand: avg, last: list[0]?.date || null };
    if (avg != null) bands.push(avg);
  }
  if (bands.length) out.avgBand = +(bands.reduce((a, x) => a + x, 0) / bands.length).toFixed(2);
  return out;
}

/* ---------- 写作 ---------- */

export function addWriting({ taskType, topic, essay, score = null, notes = "" }) {
  const w = { id: uid(), date: todayKey(), taskType, topic: topic.trim(), essay, score: score === "" ? null : Number(score), notes, addedAt: new Date().toISOString() };
  state.writing.unshift(w);
  addLog("写作", `新增写作记录「${w.topic}」`, "ok");
  save();
  return w;
}

export function deleteWriting(id) {
  state.writing = state.writing.filter((x) => x.id !== id);
  addLog("写作", "删除一条写作记录", "bad");
  save();
}

export function writingList() { return state.writing; }

/* ---------- 口语 ---------- */

export function addSpeaking({ part, topic, notes = "", score = null }) {
  const s = { id: uid(), date: todayKey(), part: Number(part), topic: topic.trim(), notes, score: score === "" ? null : Number(score), addedAt: new Date().toISOString() };
  state.speaking.unshift(s);
  addLog("口语", `新增口语记录 P${s.part}「${s.topic}」`, "ok");
  save();
  return s;
}

export function deleteSpeaking(id) {
  state.speaking = state.speaking.filter((x) => x.id !== id);
  addLog("口语", "删除一条口语记录", "bad");
  save();
}

export function speakingList() { return state.speaking; }

/* ---------- 计划与打卡 ---------- */

export function tasksOf(date = todayKey()) {
  return state.tasks[date] || [];
}

export function addTask(text, date = todayKey()) {
  (state.tasks[date] ||= []).push({ id: uid(), text: text.trim(), done: false });
  addLog("计划", `添加任务「${text.trim()}」`);
  save();
}

export function toggleTask(date, id) {
  const t = (state.tasks[date] || []).find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) checkIn(date);
  addLog("计划", t.done ? `完成「${t.text}」` : `取消完成「${t.text}」`, t.done ? "ok" : "warn");
  save();
}

export function deleteTask(date, id) {
  state.tasks[date] = (state.tasks[date] || []).filter((x) => x.id !== id);
  save();
}

export function checkIn(date = todayKey()) {
  if (!state.checkins[date]) {
    state.checkins[date] = true;
    addLog("打卡", `完成今日打卡`, "ok");
    save();
  }
}

export function dayMet(date) {
  if (state.checkins[date]) return true;
  const t = state.tasks[date];
  return !!t && t.length > 0 && t.every((x) => x.done);
}

export function streakDays() {
  let n = 0;
  const cursor = new Date();
  if (!dayMet(todayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dayMet(todayKey(cursor))) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

export function weekGrid(days = 14) {
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = todayKey(d);
    const t = state.tasks[key] || [];
    out.push({ key, met: dayMet(key), taskCount: t.length, doneCount: t.filter((x) => x.done).length });
  }
  return out;
}

/* ---------- 设置 ---------- */

export function settings() { return state.settings; }

export function updateSettings(patch) {
  Object.assign(state.settings, patch);
  save();
}

export function countdown() {
  const d = state.settings.examDate;
  if (!d) return null;
  const target = new Date(d + "T00:00:00");
  const diff = Math.ceil((target - new Date()) / 86400000);
  return Number.isFinite(diff) ? diff : null;
}

/* ---------- 导入 / 导出 ---------- */

export function exportJSON() {
  save();
  return JSON.stringify(state, null, 2);
}

/** 校验导入内容；返回 {ok, error} 或 {ok:true, data} */
export function validateImport(raw) {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || !Array.isArray(data.vocab) || !data.settings || typeof data.settings !== "object") {
      return { ok: false, error: "文件不是有效的 IELTS 工作台进度文件（缺少必要字段）" };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "文件无法解析为 JSON，请检查文件内容" };
  }
}

export function importMerge(incoming) {
  const base = emptyState();
  const src = { ...base, ...incoming };
  const dedupe = (arr) => {
    const seen = new Set();
    return arr.filter((x) => {
      if (!x || x.id == null || seen.has(x.id)) return false;
      seen.add(x.id);
      return true;
    });
  };
  src.vocab = dedupe(src.vocab);
  src.practices = dedupe(src.practices);
  src.writing = dedupe(src.writing);
  src.speaking = dedupe(src.speaking);
  const oldIds = {
    vocab: new Set(state.vocab.map((x) => x.id)),
    practices: new Set(state.practices.map((x) => x.id)),
    writing: new Set(state.writing.map((x) => x.id)),
    speaking: new Set(state.speaking.map((x) => x.id)),
  };
  state.vocab = [...state.vocab, ...src.vocab.filter((x) => !oldIds.vocab.has(x.id))];
  state.practices = [...state.practices, ...src.practices.filter((x) => !oldIds.practices.has(x.id))];
  state.writing = [...state.writing, ...src.writing.filter((x) => !oldIds.writing.has(x.id))];
  state.speaking = [...state.speaking, ...src.speaking.filter((x) => !oldIds.speaking.has(x.id))];
  state.tasks = { ...src.tasks, ...state.tasks };
  state.checkins = { ...src.checkins, ...state.checkins };
  state.log = [...src.log, ...state.log].slice(0, LOG_CAP);
  save();
}

export function importReplace(incoming) {
  const base = emptyState();
  state = { ...base, ...incoming, meta: { ...base.meta, ...(incoming.meta || {}), schema: SCHEMA } };
  save();
}

export function resetAll() {
  state = emptyState();
  save();
}

export function rawState() { return state; }

/* ---------- 辅助 ---------- */

export function moduleLabel(m) {
  return { listening: "听力", reading: "阅读", writing: "写作", speaking: "口语" }[m] || m;
}

export function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = String(d).split("-");
  return `${y}.${m}.${day}`;
}

export function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export { todayKey };
