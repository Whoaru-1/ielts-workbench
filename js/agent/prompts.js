/* ============================================================
 * prompts.js — AI Agent 的系统提示词
 *
 * 数据流向：
 *   agent-core.runAgent()
 *     → buildSystemPrompt() 读取 store 的实时数据摘要
 *     → 作为 messages[0]（role: "system"）发给模型
 *
 * 提示词只包含统计数据与任务/日志摘要，不包含 API Key。
 * ============================================================ */

import * as store from "../store.js";

/** 六条行为规则（供测试与系统提示词共用） */
export const SYSTEM_RULES = [
  "任何数据变更必须先调用对应工具，禁止“假装已完成”。",
  "不编造用户数据；不确定时先调用 get_overview 或 search_* 工具确认。",
  "没有删除工具；用户要求删除时，引导去对应页面手动操作。",
  "给素材或范文时，提醒用户“英文是脚手架，请按自己的经历微调”。",
  "回答简洁、可执行，优先使用列表；一次最多问一个澄清问题。",
  "永不输出 API Key，也不要复述用户填写的 Key。",
];

function taskSummary(tasks) {
  if (!tasks.length) return "今天还没有任务";
  const done = tasks.filter((task) => task.done).length;
  const preview = tasks
    .slice(0, 5)
    .map((task) => `${task.done ? "✓" : "○"} ${task.text}`)
    .join("；");
  return `${done}/${tasks.length} 已完成：${preview}${tasks.length > 5 ? "；…" : ""}`;
}

function logSummary(logs) {
  if (!logs.length) return "暂无活动记录";
  return logs
    .slice(0, 3)
    .map((entry) => `[${entry.module || "记录"}] ${String(entry.msg || "").slice(0, 80)}`)
    .join("；");
}

/**
 * 生成系统提示词。
 * 每次调用都读取最新 store 数据，保证模型看到的是实时摘要。
 * @returns {string}
 */
export function buildSystemPrompt() {
  const settings = store.settings();
  const vocab = store.vocabStats();
  const practice = store.practiceStats();
  const materials = store.materialStats();
  const tasks = store.tasksOf();
  const streak = store.streakDays();
  const countdown = store.countdown();
  const examDate = settings.examDate || "未设置";
  const countdownText = countdown == null ? "未设置考试日" : `还有 ${countdown} 天`;
  const byModule = Object.entries(practice.byModule || {})
    .map(([module, item]) => `${store.moduleLabel(module)} ${item.count} 次${item.avgBand != null ? `（均分 ${item.avgBand}）` : ""}`)
    .join("、");
  const today = store.todayKey();

  return [
    `你是一名 IELTS 备考教练，也是这个本地 IELTS 工作台的 AI 助手。请用中文回答（英文例句、范文除外）。今天是 ${today}。`,
    "",
    "【当前用户数据摘要】",
    `- 目标分：${settings.targetBand ?? "未设置"}`,
    `- 考试日：${examDate}（${countdownText}）`,
    `- 词汇：共 ${vocab.total} 个（新词 ${vocab.new} / 学习中 ${vocab.learning} / 已掌握 ${vocab.mastered}）`,
    `- 练习记录：共 ${practice.total} 次；${byModule || "暂无分项数据"}${practice.avgBand != null ? `；综合均分 ${practice.avgBand}` : ""}`,
    `- 口语记录 ${store.speakingList().length} 条，写作记录 ${store.writingList().length} 条`,
    `- 素材：共 ${materials.total} 条，覆盖 ${materials.topicCount} 个主题，已归纳 ${materials.merged} 条`,
    `- 今日任务：${taskSummary(tasks)}`,
    `- 连续打卡：${streak} 天`,
    `- 最近活动：${logSummary(store.logEntries(5))}`,
    "",
    "【可用工具】",
    "get_overview、search_vocab、add_vocab、search_speaking、get_speaking_answer、list_materials、create_material、add_task、list_tasks、log_practice、search_writing。",
    "查询类工具先用来确认事实；写操作只能通过工具执行，不能只在回复里说“已完成”。",
    "",
    "【必须遵守的六条规则】",
    ...SYSTEM_RULES.map((rule, index) => `${index + 1}. ${rule}`),
    "",
    "回答时优先给出下一步可执行的建议；涉及数字时引用上面的实时摘要或工具结果，不要凭印象编造。",
  ].join("\n");
}
