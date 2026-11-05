/* ============================================================
 * tools.js — AI Agent 的 11 个本地工具
 *
 * 数据流向：
 *   agent-core.runAgent()
 *     → executeTool(name, args)
 *     → 读：store / QUESTION_BANK / answers-*.js / question-bank
 *     → 写：store.addWord / addTask / addPractice / saveMaterial
 *     → 返回 {ok:true,data} 或 {ok:false,error}
 *
 * 约束：
 *   - executeTool 永不向模型抛错；所有异常转成中文 error；
 *   - 写操作只走 store 既有函数（自动持久化 + 活动日志）；
 *   - 搜索/答案统一截断，避免上下文爆炸；
 *   - 不提供删除工具。
 * ============================================================ */

import * as store from "../store.js";
import { QUESTION_BANK } from "../data/question-bank.js";
import speakingAnswersP1 from "../data/answers-speaking-p1.js";
import speakingAnswersP2 from "../data/answers-speaking-p2.js";
import speakingAnswersP3 from "../data/answers-speaking-p3.js";
import speakingAnswersP1New from "../data/answers-speaking-p1-2026.js";
import speakingAnswersP2New from "../data/answers-speaking-p2-2026.js";
import speakingAnswersP3New from "../data/answers-speaking-p3-2026.js";
import writingBank from "../data/writing-bank.js";
import writingAnswersT1 from "../data/answers-writing-t1.js";
import writingAnswersT2A from "../data/answers-writing-t2-a.js";
import writingAnswersT2B from "../data/answers-writing-t2-b.js";
import { analyze, similarMaterials, mergeMaterials } from "../data/material-engine.js";

const SPEAKING_ANSWERS = {
  ...speakingAnswersP1,
  ...speakingAnswersP2,
  ...speakingAnswersP3,
  ...speakingAnswersP1New,
  ...speakingAnswersP2New,
  ...speakingAnswersP3New,
};

const WRITING_ANSWERS = {
  ...writingAnswersT1,
  ...writingAnswersT2A,
  ...writingAnswersT2B,
};

const SPEAKING_BY_ID = new Map(QUESTION_BANK.map((question) => [question.id, question]));
const VALID_MODULES = new Set(["listening", "reading", "writing", "speaking"]);
const VALID_STATUS = new Set(["new", "learning", "mastered"]);

class ToolError extends Error {}

function fail(error) {
  return { ok: false, error: String(error || "工具执行失败") };
}

function success(data) {
  return { ok: true, data };
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function truncate(value, maxLength) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function requireString(args, key) {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new ToolError(`缺少参数 ${key}`);
  return value.trim();
}

function optionalString(args, key, fallback = "") {
  const value = args[key];
  if (value == null) return fallback;
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function limitOf(args, fallback = 10, max = 30) {
  const value = Number(args.limit);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(value)));
}

function partOf(args) {
  if (args.part == null || args.part === "") return null;
  const part = Number(args.part);
  if (![1, 2, 3].includes(part)) throw new ToolError("part 必须是 1、2 或 3");
  return part;
}

function dateOf(args) {
  const raw = optionalString(args, "date", "");
  if (!raw) return store.todayKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new ToolError("日期格式应为 YYYY-MM-DD");
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new ToolError("日期不是有效日期");
  return raw;
}

function statusOf(args) {
  const status = optionalString(args, "status", "");
  if (!status || status === "all") return "all";
  if (!VALID_STATUS.has(status)) throw new ToolError("status 必须是 new、learning 或 mastered");
  return status;
}

function taskPreview(list) {
  return list.map((task) => ({ id: task.id, text: truncate(task.text, 120), done: Boolean(task.done) }));
}

/* ------------------------------------------------------------
 * 工具定义（OpenAI function calling 格式）
 * ------------------------------------------------------------ */

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "get_overview",
      description: "获取学习概览：目标分、考试倒计时、词汇统计、练习统计、口语/写作/素材数量、连续打卡、今日任务、最近日志。",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_vocab",
      description: "搜索或筛选词汇，返回单词、中文释义、例句摘要与掌握状态。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "按单词/释义/例句搜索" },
          status: { type: "string", enum: ["new", "learning", "mastered"], description: "按掌握状态筛选" },
          category: { type: "string", description: "按话题分类筛选" },
          limit: { type: "number", description: "返回条数，默认 10，最多 30" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_vocab",
      description: "新增一个单词到词汇库；如果已存在则返回 duplicate，不重复添加。",
      parameters: {
        type: "object",
        properties: {
          word: { type: "string", description: "英文单词" },
          meaning: { type: "string", description: "中文释义" },
          example: { type: "string", description: "英文例句" },
          category: { type: "string", description: "话题分类，默认 general" },
        },
        required: ["word", "meaning"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_speaking",
      description: "搜索口语题库，返回题目、Part、类别、是否已练、是否有高分答案。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "按题干或类别搜索" },
          part: { type: "number", enum: [1, 2, 3], description: "口语 Part" },
          limit: { type: "number", description: "返回条数，默认 10，最多 30" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_speaking_answer",
      description: "按题目 id 获取口语高分参考答案（答案截断到 1200 字符）。",
      parameters: {
        type: "object",
        properties: { id: { type: "string", description: "题目 id，例如 p2-person-01" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_materials",
      description: "列出个人素材摘要：标题、类型、主题、要点预览、合并来源数量。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "按标题/原文/主题搜索" },
          limit: { type: "number", description: "返回条数，默认 10，最多 30" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_material",
      description: "把一段中文/英文笔记分析成个人素材；自动识别主题与类型并生成 P1/P2/P3 英文骨架。命中相近素材时默认自动归纳合并。",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "用户原始笔记" },
          title: { type: "string", description: "可选标题" },
          autoMerge: { type: "boolean", description: "命中相近素材时是否自动合并，默认 true" },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_task",
      description: "在指定日期（默认今天）添加一条学习计划任务。",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "任务内容" },
          date: { type: "string", description: "YYYY-MM-DD，默认今天" },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "查看指定日期（默认今天）的任务与完成状态。",
      parameters: {
        type: "object",
        properties: { date: { type: "string", description: "YYYY-MM-DD，默认今天" } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_practice",
      description: "记录一次练习（听力/阅读/写作/口语）；听力与阅读会根据正确率自动估算 Band 分。",
      parameters: {
        type: "object",
        properties: {
          module: { type: "string", enum: ["listening", "reading", "writing", "speaking"] },
          title: { type: "string", description: "练习/模考名称" },
          correct: { type: "number", description: "正确题数" },
          total: { type: "number", description: "总题数" },
          minutes: { type: "number", description: "用时分钟" },
          notes: { type: "string", description: "备注" },
        },
        required: ["module", "title", "correct", "total"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_writing",
      description: "搜索写作题库，返回题目、Task 类型、类别与是否有高分范文。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "按题干或类别搜索" },
          task: { type: "number", enum: [1, 2], description: "Task 1 或 Task 2" },
          category: { type: "string", description: "按类别筛选" },
          limit: { type: "number", description: "返回条数，默认 10，最多 30" },
        },
        additionalProperties: false,
      },
    },
  },
];

const TOOL_NAMES = new Set(TOOL_DEFINITIONS.map((definition) => definition.function.name));

/* ------------------------------------------------------------
 * 工具实现
 * ------------------------------------------------------------ */

async function getOverview() {
  const settings = store.settings();
  const tasks = store.tasksOf();
  const recentLogs = store.logEntries(5).map((entry) => ({
    module: entry.module,
    msg: truncate(entry.msg, 120),
    kind: entry.kind || "",
    at: entry.at,
  }));
  return success({
    today: store.todayKey(),
    targetBand: settings.targetBand,
    examDate: settings.examDate || null,
    countdownDays: store.countdown(),
    vocab: store.vocabStats(),
    practice: store.practiceStats(),
    speakingRecords: store.speakingList().length,
    writingRecords: store.writingList().length,
    materials: store.materialStats(),
    todayTasks: taskPreview(tasks),
    streakDays: store.streakDays(),
    recentLogs,
  });
}

async function searchVocab(args) {
  const list = store.vocabList(statusOf(args), optionalString(args, "query", ""), optionalString(args, "category", "all") || "all");
  const items = list.slice(0, limitOf(args)).map((word) => ({
    id: word.id,
    word: word.word,
    meaning: truncate(word.meaning, 100),
    example: truncate(word.example, 160),
    status: word.status,
    category: word.category || "general",
  }));
  return success({ total: list.length, items });
}

async function addVocab(args) {
  const word = requireString(args, "word");
  const meaning = requireString(args, "meaning");
  const example = optionalString(args, "example", "");
  const category = optionalString(args, "category", "general") || "general";
  const existing = store
    .vocabList("all", word)
    .find((item) => item.word.toLowerCase() === word.toLowerCase());
  if (existing) {
    return success({ duplicate: true, id: existing.id, word: existing.word, message: "单词已存在，未重复添加" });
  }
  const added = store.addWord({ word, meaning, example, category, status: "new" });
  return success({
    duplicate: false,
    id: added.id,
    word: added.word,
    meaning: added.meaning,
    category: added.category,
  });
}

async function searchSpeaking(args) {
  const part = partOf(args);
  const query = optionalString(args, "query", "").toLowerCase();
  const filtered = QUESTION_BANK.filter((question) => {
    if (part && question.part !== part) return false;
    if (!query) return true;
    return (
      String(question.question).toLowerCase().includes(query) ||
      String(question.category).toLowerCase().includes(query) ||
      String(question.id).toLowerCase().includes(query)
    );
  });
  const items = filtered.slice(0, limitOf(args)).map((question) => ({
    id: question.id,
    part: question.part,
    category: question.category,
    question: truncate(question.question, 160),
    practiced: store.isSpeakingPracticed(question.id),
    hasAnswer: Boolean(SPEAKING_ANSWERS[question.id]),
  }));
  return success({ total: filtered.length, items });
}

async function getSpeakingAnswer(args) {
  const id = requireString(args, "id");
  const question = SPEAKING_BY_ID.get(id);
  if (!question) throw new ToolError(`未找到题目：${id}`);
  const answer = SPEAKING_ANSWERS[id] || "";
  return success({
    id,
    part: question.part,
    category: question.category,
    question: truncate(question.question, 160),
    hasAnswer: Boolean(answer),
    answer: truncate(answer, 1200),
  });
}

async function listMaterials(args) {
  const query = optionalString(args, "query", "").toLowerCase();
  const list = store.materialsList().filter((material) => {
    if (!query) return true;
    const topicText = (material.topics || []).map((topic) => topic.label || topic.id).join(" ");
    return (
      String(material.title || "").toLowerCase().includes(query) ||
      String(material.rawInput || "").toLowerCase().includes(query) ||
      topicText.toLowerCase().includes(query)
    );
  });
  const items = list.slice(0, limitOf(args)).map((material) => ({
    id: material.id,
    title: material.title,
    typeLabel: material.typeLabel || material.type,
    topics: (material.topics || []).map((topic) => topic.label || topic.id),
    points: (material.points || []).slice(0, 2).map((point) => truncate(point, 80)),
    mergedFromCount: Array.isArray(material.mergedFrom) ? material.mergedFrom.length : 0,
    updatedAt: material.updatedAt || material.createdAt || "",
  }));
  return success({ total: list.length, items });
}

async function createMaterial(args) {
  const text = requireString(args, "text");
  if (text.length < 4) throw new ToolError("素材原文太短，至少需要 4 个字符");
  const requestedTitle = optionalString(args, "title", "");
  const autoMerge = args.autoMerge !== false && args.autoMerge !== "false";
  const draft = analyze(text);
  const candidate = requestedTitle ? { ...draft, title: requestedTitle } : draft;
  const nearby = similarMaterials(candidate, store.materialsList(), 0.45);

  if (autoMerge && nearby.length > 0) {
    const best = nearby[0];
    const merged = mergeMaterials(best.material, candidate);
    const saved = store.saveMaterial(merged);
    return success({
      action: "merged",
      id: saved.id,
      title: saved.title,
      typeLabel: saved.typeLabel,
      topics: (saved.topics || []).map((topic) => topic.label || topic.id),
      similarity: best.score,
      mergeNote: saved.mergeNote,
      wordCount: saved.wordCount,
    });
  }

  const saved = store.saveMaterial(candidate);
  return success({
    action: "created",
    id: saved.id,
    title: saved.title,
    typeLabel: saved.typeLabel,
    topics: (saved.topics || []).map((topic) => topic.label || topic.id),
    wordCount: saved.wordCount,
    nearby: nearby.slice(0, 3).map((item) => ({
      id: item.material.id,
      title: item.material.title,
      score: item.score,
    })),
  });
}

async function addTask(args) {
  const text = requireString(args, "text");
  const date = dateOf(args);
  store.addTask(text, date);
  const tasks = store.tasksOf(date);
  const task = tasks[tasks.length - 1];
  return success({
    date,
    task: task ? { id: task.id, text: task.text, done: task.done } : { text, done: false },
    total: tasks.length,
  });
}

async function listTasks(args) {
  const date = dateOf(args);
  const tasks = store.tasksOf(date);
  return success({
    date,
    total: tasks.length,
    done: tasks.filter((task) => task.done).length,
    tasks: taskPreview(tasks),
  });
}

async function logPractice(args) {
  const module = requireString(args, "module");
  if (!VALID_MODULES.has(module)) throw new ToolError("module 必须是 listening、reading、writing 或 speaking");
  const title = requireString(args, "title");
  const correct = Number(args.correct);
  const total = Number(args.total);
  if (!Number.isFinite(correct) || !Number.isFinite(total)) throw new ToolError("correct 和 total 必须是数字");
  if (total <= 0) throw new ToolError("total 必须大于 0");
  if (correct < 0 || correct > total) throw new ToolError("correct 必须在 0 到 total 之间");
  const minutesValue = args.minutes == null ? 0 : Number(args.minutes);
  if (!Number.isFinite(minutesValue) || minutesValue < 0) throw new ToolError("minutes 必须是非负数字");
  const practice = store.addPractice({
    module,
    title,
    date: store.todayKey(),
    correct,
    total,
    minutes: minutesValue,
    notes: optionalString(args, "notes", ""),
  });
  return success({
    id: practice.id,
    module: practice.module,
    title: practice.title,
    correct: practice.correct,
    total: practice.total,
    band: practice.band,
    minutes: practice.minutes,
    date: practice.date,
  });
}

async function searchWriting(args) {
  const task = args.task == null || args.task === "" ? null : Number(args.task);
  if (task != null && ![1, 2].includes(task)) throw new ToolError("task 必须是 1 或 2");
  const query = optionalString(args, "query", "").toLowerCase();
  const category = optionalString(args, "category", "");
  const filtered = writingBank.filter((item) => {
    if (task != null && Number(item.task) !== task) return false;
    if (category && String(item.category) !== category) return false;
    if (!query) return true;
    return (
      String(item.question).toLowerCase().includes(query) ||
      String(item.category).toLowerCase().includes(query) ||
      String(item.id).toLowerCase().includes(query)
    );
  });
  const items = filtered.slice(0, limitOf(args)).map((item) => ({
    id: item.id,
    task: item.task,
    category: item.category,
    question: truncate(item.question, 160),
    hasAnswer: Boolean(WRITING_ANSWERS[item.id]),
  }));
  return success({ total: filtered.length, items });
}

const HANDLERS = {
  get_overview: getOverview,
  search_vocab: searchVocab,
  add_vocab: addVocab,
  search_speaking: searchSpeaking,
  get_speaking_answer: getSpeakingAnswer,
  list_materials: listMaterials,
  create_material: createMaterial,
  add_task: addTask,
  list_tasks: listTasks,
  log_practice: logPractice,
  search_writing: searchWriting,
};

/**
 * 执行工具。任何情况下都不向模型抛错。
 * @param {string} name
 * @param {object} [args]
 * @returns {Promise<{ok:true,data:object}|{ok:false,error:string}>}
 */
export async function executeTool(name, args) {
  try {
    if (typeof name !== "string" || !TOOL_NAMES.has(name)) return fail(`未知工具：${name}`);
    if (args != null && (typeof args !== "object" || Array.isArray(args))) return fail("工具参数必须是对象");
    const handler = HANDLERS[name];
    if (!handler) return fail(`工具未实现：${name}`);
    return await handler(args || {});
  } catch (error) {
    if (error instanceof ToolError) return fail(error.message);
    return fail(`工具执行失败：${error && error.message ? error.message : "未知错误"}`);
  }
}

/** 中文工具名，UI 显示用 */
export function toolLabel(name) {
  const labels = {
    get_overview: "学习概览",
    search_vocab: "搜索词汇",
    add_vocab: "新增单词",
    search_speaking: "搜索口语题库",
    get_speaking_answer: "查看口语答案",
    list_materials: "素材列表",
    create_material: "生成素材",
    add_task: "添加任务",
    list_tasks: "查看任务",
    log_practice: "记录练习",
    search_writing: "搜索写作题库",
  };
  return labels[name] || String(name || "工具");
}

/** 生成 UI/事件用的中文结果摘要 */
export function toolSummary(name, result) {
  if (!result) return "无结果";
  if (!result.ok) return result.error || "执行失败";
  const data = result.data || {};
  switch (name) {
    case "get_overview":
      return `目标 ${data.targetBand ?? "—"} 分 · 词汇 ${data.vocab?.total ?? 0} · 今日任务 ${data.todayTasks?.filter((task) => task.done).length ?? 0}/${data.todayTasks?.length ?? 0}`;
    case "search_vocab":
      return `找到 ${data.total ?? 0} 个词`;
    case "add_vocab":
      return data.duplicate ? "单词已存在" : `已添加「${data.word || ""}」`;
    case "search_speaking":
      return `找到 ${data.total ?? 0} 道口语题`;
    case "get_speaking_answer":
      return data.hasAnswer ? `答案 ${cleanText(data.answer).length} 字符` : "暂无参考答案";
    case "list_materials":
      return `共 ${data.total ?? 0} 条素材`;
    case "create_material":
      return data.action === "merged"
        ? `已归纳到「${data.title}」（相似度 ${Math.round((data.similarity || 0) * 100)}%）`
        : `已创建素材「${data.title}」`;
    case "add_task":
      return `已添加任务（${data.date} 共 ${data.total ?? 0} 条）`;
    case "list_tasks":
      return `${data.done ?? 0}/${data.total ?? 0} 已完成`;
    case "log_practice":
      return `已记录练习${data.band != null ? `，估分 ${data.band}` : ""}`;
    case "search_writing":
      return `找到 ${data.total ?? 0} 道写作题`;
    default:
      return "完成";
  }
}
