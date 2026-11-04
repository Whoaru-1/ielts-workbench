#!/usr/bin/env node
/* ============================================================
 * scripts/verify-speaking.mjs — 口语题库数据校验
 * 用法：node scripts/verify-speaking.mjs [p1|p2|p3|all]
 * 检查：ID 唯一 / 题目与答案配对 / 词数区间 / 中文残留 / 占位符 / 开头重复
 * ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const which = (process.argv[2] || "all").toLowerCase();

const SETS = {
  p1: {
    part: 1,
    questions: "js/data/speaking-part1-2026.js",
    answers: "js/data/answers-speaking-p1-2026.js",
    words: [55, 90],
    baselineQuestions: "js/data/speaking-part1.js",
  },
  p2: {
    part: 2,
    questions: "js/data/speaking-part2-2026.js",
    answers: "js/data/answers-speaking-p2-2026.js",
    words: [165, 220],
    baselineQuestions: "js/data/speaking-part2.js",
  },
  p3: {
    part: 3,
    questions: "js/data/speaking-part3-2026.js",
    answers: "js/data/answers-speaking-p3-2026.js",
    words: [88, 130],
    baselineQuestions: "js/data/speaking-part3.js",
  },
};

const errors = [];
const warnings = [];
const report = [];

const load = async (rel) => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return undefined;
  const mod = await import(new URL(`file://${abs}`).href + `?t=${Date.now()}`);
  return mod.default;
};

const wordCount = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const hasChinese = (s) => /[\u4e00-\u9fff]/.test(s);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff ]/g, " ").replace(/\s+/g, " ").trim();

const allIds = new Set();
const allQuestions = new Map();

async function checkSet(key) {
  const cfg = SETS[key];
  if (!cfg) throw new Error(`未知参数 ${key}`);
  const qs = await load(cfg.questions);
  const ans = await load(cfg.answers);
  if (!Array.isArray(qs)) { errors.push(`${cfg.questions}: 未导出数组（仍是占位？）`); return; }
  if (!ans || typeof ans !== "object" || Array.isArray(ans)) { errors.push(`${cfg.answers}: 未导出对象`); return; }

  const base = (await load(cfg.baselineQuestions)) || [];
  for (const q of base) { allIds.add(q.id); allQuestions.set(norm(q.question), `原有 ${q.id}`); }

  const localIds = new Set();
  for (const q of qs) {
    if (!q || !q.id || !q.question || !q.category) { errors.push(`${cfg.questions}: 存在缺字段的题目 ${JSON.stringify(q).slice(0, 80)}`); continue; }
    if (localIds.has(q.id)) errors.push(`${cfg.questions}: 重复 id ${q.id}`);
    if (allIds.has(q.id)) errors.push(`${cfg.questions}: id 与题库其他题冲突 ${q.id}`);
    localIds.add(q.id);
    if (q.isNew !== true) errors.push(`${cfg.questions}: ${q.id} 缺少 isNew: true`);
    if (hasChinese(q.question)) errors.push(`${cfg.questions}: ${q.id} 题干含中文`);
    const nq = norm(q.question);
    if (allQuestions.has(nq)) errors.push(`${cfg.questions}: ${q.id} 题干与 ${allQuestions.get(nq)} 重复`);
    allQuestions.set(nq, q.id);
    if (cfg.part === 2 && q.question.split(/\s+/).length < 20) warnings.push(`${q.id} 题卡提示语偏短（${q.question.split(/\s+/).length} 词），确认已补 You should say: ...`);
  }

  const keys = Object.keys(ans);
  if (keys.length !== qs.length) errors.push(`${cfg.answers}: 答案 ${keys.length} 条，题目 ${qs.length} 条`);
  for (const id of localIds) if (!(id in ans)) errors.push(`${cfg.answers}: 缺少答案 ${id}`);
  for (const id of keys) if (!localIds.has(id)) errors.push(`${cfg.answers}: 多余答案 ${id}`);

  const starts = new Map();
  for (const [id, text] of Object.entries(ans)) {
    if (typeof text !== "string") { errors.push(`${cfg.answers}: ${id} 答案不是字符串`); continue; }
    const wc = wordCount(text);
    if (wc < cfg.words[0] || wc > cfg.words[1]) errors.push(`${id}: ${wc} 词，超出 ${cfg.words[0]}–${cfg.words[1]}`);
    if (hasChinese(text)) errors.push(`${id}: 答案含中文`);
    if (/\b(TODO|Lorem|placeholder|undefined|null)\b/i.test(text)) errors.push(`${id}: 含占位符/空值`);
    if (/[{}]/.test(text)) errors.push(`${id}: 含模板花括号`);
    const start = text.trim().split(/\s+/).slice(0, 5).join(" ").toLowerCase().replace(/[^a-z ]/g, "");
    starts.set(start, (starts.get(start) || 0) + 1);
    if (!/[.!?]$/.test(text.trim())) warnings.push(`${id}: 答案未以句末标点结束`);
  }
  const worst = [...starts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] > Math.max(3, Math.ceil(qs.length * 0.25))) {
    warnings.push(`${cfg.answers}: 有 ${worst[1]} 条答案以「${worst[0]}...」开头，可能句式同质化`);
  }
  report.push(`Part ${cfg.part}: 题目 ${qs.length} / 答案 ${keys.length}`);
}

for (const key of which === "all" ? Object.keys(SETS) : [which]) await checkSet(key);

console.log(report.join("\n"));
if (warnings.length) {
  console.log(`\n⚠ 提醒 ${warnings.length} 条：`);
  for (const w of warnings) console.log("  - " + w);
}
if (errors.length) {
  console.log(`\n✗ 错误 ${errors.length} 条：`);
  for (const e of errors) console.log("  - " + e);
  process.exit(1);
}
console.log("\n✓ 校验通过");
