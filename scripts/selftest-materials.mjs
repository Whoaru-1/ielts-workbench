/* ============================================================
 * selftest-materials.mjs — 个人素材模块离线引擎自测
 *
 * 运行：node scripts/selftest-materials.mjs
 * 失败时 process.exit(1)；成功时逐条打印断言摘要。
 * 覆盖：词库深度、五类输入、确定性、纯函数、相似度、合并、
 *       真题匹配、润色提示词、词汇升级、极端输入不抛错。
 * ============================================================ */

import assert from "node:assert/strict";

import * as engine from "../js/data/material-engine.js";
import {
  TOPIC_DATA,
  TOPICS,
  TYPES,
  TYPE_CUES,
  TYPE_TEMPLATES,
  ZH_EN,
  EN_UPGRADES,
  STOPWORDS,
} from "../js/data/material-lexicon.js";
import SEEDS from "../js/data/material-seeds.js";
import speakingPart1 from "../js/data/speaking-part1.js";
import speakingPart2 from "../js/data/speaking-part2.js";
import speakingPart3 from "../js/data/speaking-part3.js";

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const RANGES = { p1: [55, 85], p2: [165, 205], p3: [90, 120] };
const TYPE_IDS = new Set(TYPES.map((type) => type.id));

let passed = 0;

function ok(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`✓ ${message}`);
}

function eq(actual, expected, message) {
  assert.equal(actual, expected, message);
  passed += 1;
  console.log(`✓ ${message}（${actual}）`);
}

function countWords(text) {
  const value = String(text ?? "").trim();
  return value ? value.split(/\s+/).filter(Boolean).length : 0;
}

function sentencesOf(text) {
  return (String(text ?? "").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []).map((s) => s.trim()).filter(Boolean);
}

function normalized(text) {
  return String(text ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function connectorCounts(text) {
  return ["To begin with", "What makes it stand out is", "Looking back", "So that's why"].map((phrase) => ({
    phrase,
    count: (String(text).match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length,
  }));
}

function assertCleanPart(text, part, label) {
  ok(typeof text === "string" && text.trim().length > 0, `${label} ${part} 非空`);
  ok(!CJK_RE.test(text), `${label} ${part} 不含中文`);
  ok(!/[{}]/.test(text) && !/\bundefined\b|\bnull\b/.test(text), `${label} ${part} 无 undefined / 花括号`);
  ok(!/ {2,}/.test(text) && !/\.\./.test(text), `${label} ${part} 无重复空格 / 重复句号`);
  const [low, high] = RANGES[part];
  const words = countWords(text);
  ok(words >= low && words <= high, `${label} ${part} 词数 ${words} 在 ${low}–${high}`);
  const keys = sentencesOf(text).map(normalized);
  ok(new Set(keys).size === keys.length, `${label} ${part} 无重复句子`);
}

function assertP2Shape(text, label) {
  const counts = connectorCounts(text);
  for (const item of counts) {
    ok(item.count <= 1, `${label} P2 连接句「${item.phrase}」最多 1 次（实际 ${item.count}）`);
  }
  const distinct = counts.filter((item) => item.count === 1).length;
  ok(distinct >= 2, `${label} P2 至少含 2 个不同连接词（实际 ${distinct}）`);
  const clauses = (String(text).match(/\b(?:which|who|that|where)\s+[^.,;!?]{18,80}/gi) || []).map(normalized);
  ok(new Set(clauses).size === clauses.length, `${label} P2 无重复关系从句`);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object") return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

function snapshot(value) {
  return JSON.stringify(value);
}

function buildQuestionBank() {
  return [
    ...speakingPart1.map((question) => ({ ...question, part: 1 })),
    ...speakingPart2.map((question) => ({ ...question, part: 2 })),
    ...speakingPart3.map((question) => ({ ...question, part: 3 })),
  ];
}

function analyzeNoThrow(input, label) {
  let draft = null;
  try {
    draft = engine.analyze(input);
  } catch (error) {
    assert.fail(`${label} analyze 抛错：${error.message}`);
  }
  ok(Boolean(draft), `${label} analyze 不抛错`);
  return draft;
}

function main() {
  /* ------------------------------------------------------------
   * 1. 词库深度
   * ------------------------------------------------------------ */
  eq(TOPIC_DATA.length, 12, "话题数量");
  eq(TOPICS.length, 12, "TOPICS 元数据数量");
  eq(TYPES.length, 7, "素材类型数量");
  const expectedTopicIds = ["education", "environment", "technology", "health", "society", "work", "economy", "culture", "science", "travel", "government", "media"];
  ok(expectedTopicIds.every((id) => TOPIC_DATA.some((topic) => topic.id === id)), "12 个话题 id 齐全");
  for (const topic of TOPIC_DATA) {
    ok(topic.keywords.length >= 18, `${topic.id} 关键词 ≥18（${topic.keywords.length}）`);
    ok(topic.collocations.length >= 6, `${topic.id} 搭配 ≥6（${topic.collocations.length}）`);
    ok(topic.lexical.length >= 8, `${topic.id} Band 词汇 ≥8（${topic.lexical.length}）`);
    ok(topic.lexical.every((item) => item.term && item.cn && item.example), `${topic.id} Bank 词汇字段完整`);
    ok(topic.reasons.length >= 4, `${topic.id} 理由句 ≥4（${topic.reasons.length}）`);
    ok(topic.feelings.length >= 3, `${topic.id} 感受句 ≥3（${topic.feelings.length}）`);
    ok(topic.abstract.length >= 2, `${topic.id} P3 抽象句 ≥2（${topic.abstract.length}）`);
  }
  for (const type of TYPES) {
    ok((TYPE_CUES[type.id] || []).length >= 20, `类型 ${type.id} 线索词 ≥20（${(TYPE_CUES[type.id] || []).length}）`);
    const template = TYPE_TEMPLATES[type.id];
    ok(Boolean(template), `类型 ${type.id} 有模板`);
    for (const part of ["p1", "p2", "p3"]) {
      ok(template[part].length >= 3, `类型 ${type.id} ${part} 模板 ≥3 套（${template[part].length}）`);
      ok(template[part].every((variant) => Array.isArray(variant) && variant.length >= 3), `类型 ${type.id} ${part} 每套 ≥3 句`);
    }
    ok(template.outline.length >= 4 && template.outline.length <= 6, `类型 ${type.id} 中文提纲 4–6 步`);
    ok(template.frames.length >= 5, `类型 ${type.id} 句式框架 ≥5`);
  }
  ok(ZH_EN.length >= 260, `ZH_EN ≥260（${ZH_EN.length}）`);
  ok(new Set(ZH_EN.map((pair) => pair.zh)).size === ZH_EN.length, "ZH_EN 中文键无重复");
  ok(ZH_EN.every((pair) => pair.zh && pair.en), "ZH_EN 每条都有中英文");
  ok(EN_UPGRADES.length >= 50, `EN_UPGRADES ≥50（${EN_UPGRADES.length}）`);
  ok(STOPWORDS.zh.length >= 20 && STOPWORDS.en.length >= 20, "中英停用词表齐全");

  /* ------------------------------------------------------------
   * 2. 五类输入：完整 Draft + 字数 + 清洁度
   * ------------------------------------------------------------ */
  const needleInput = SEEDS[0].input;
  const englishInput = "My grandfather taught me to repair bicycles in his workshop. Every Sunday morning we would fix punctured tyres for neighbours, and he never charged anyone. I learned patience more than mechanics.";
  const mixedInput = "外婆的针线盒 my grandmother's sewing box is a family heirloom. I keep it on my desk. 里面有一张旧照片。";
  const tinyInput = "外婆的针线盒";
  const longInput = SEEDS[3].input.repeat(12);

  const samples = [
    { label: "纯中文", input: needleInput },
    { label: "纯英文", input: englishInput },
    { label: "中英混合", input: mixedInput },
    { label: "极短", input: tinyInput },
    { label: "超长", input: longInput },
  ];

  const drafts = {};
  for (const sample of samples) {
    const draft = analyzeNoThrow(sample.input, sample.label);
    drafts[sample.label] = draft;
    ok(typeof draft.title === "string" && draft.title.length > 0, `${sample.label} 标题非空`);
    ok(TYPE_IDS.has(draft.type), `${sample.label} 类型合法（${draft.type}）`);
    ok(typeof draft.typeLabel === "string" && draft.typeLabel.length > 0, `${sample.label} typeLabel 非空`);
    ok(draft.topics.length >= 1 && draft.topics.length <= 3, `${sample.label} 主题 1–3 个`);
    ok(draft.keywords.length >= 1 && draft.keywords.length <= 12, `${sample.label} 关键词 1–12 个（${draft.keywords.length}）`);
    ok(draft.points.length <= 8, `${sample.label} 中文要点 ≤8（${draft.points.length}）`);
    ok(draft.points.every((point) => !String(point).includes("【并入】") && !/^(主题|关键词|类型)[：:]/.test(String(point))), `${sample.label} 要点无元信息污染`);
    ok(draft.confidence >= 0 && draft.confidence <= 1, `${sample.label} 置信度 0–1`);
    ok(Array.isArray(draft.lexical) && draft.lexical.length >= 4, `${sample.label} 词汇 ≥4`);
    ok(draft.collocations.length >= 6, `${sample.label} 搭配 ≥6`);
    ok(draft.frames.length >= 5, `${sample.label} 句式框架 ≥5`);
    ok(draft.outline.length >= 4 && draft.outline.length <= 6, `${sample.label} 中文提纲 4–6 步`);
    for (const part of ["p1", "p2", "p3"]) {
      assertCleanPart(draft.english[part], part, sample.label);
      eq(draft.wordCount[part], countWords(draft.english[part]), `${sample.label} ${part} wordCount 一致`);
    }
    assertP2Shape(draft.english.p2, sample.label);
  }

  /* ------------------------------------------------------------
   * 3. 确定性 & 极端输入不抛错
   * ------------------------------------------------------------ */
  for (const sample of samples) {
    const first = JSON.stringify(engine.analyze(sample.input));
    const second = JSON.stringify(engine.analyze(sample.input));
    ok(first === second, `${sample.label} 同输入两次 analyze 完全一致`);
  }
  const extremes = [
    ["重复长文本", "我的大学四年。".repeat(60)],
    ["纯标点", "。".repeat(500)],
    ["纯 emoji", "😀🎉📚".repeat(100)],
    ["5000 字符单词", "a".repeat(5000)],
    ["空字符串", ""],
  ];
  for (const [label, input] of extremes) {
    const draft = analyzeNoThrow(input, label);
    for (const part of ["p1", "p2", "p3"]) {
      const [low, high] = RANGES[part];
      const words = countWords(draft.english[part]);
      ok(words >= low && words <= high, `${label} ${part} 词数合法（${words}）`);
      ok(!CJK_RE.test(draft.english[part]), `${label} ${part} 不含中文`);
    }
    ok(JSON.stringify(engine.analyze(input)) === JSON.stringify(engine.analyze(input)), `${label} 结果确定`);
  }

  /* ------------------------------------------------------------
   * 4. 纯函数：不修改入参
   * ------------------------------------------------------------ */
  const materialA = {
    ...engine.analyze(SEEDS[0].input),
    id: "m_test_a",
    title: "外婆的针线盒",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
  const materialB = {
    ...engine.analyze(SEEDS[1].input),
    id: "m_test_b",
    title: "外婆教我包粽子",
    createdAt: "2026-11-02T00:00:00.000Z",
  };
  const questions = buildQuestionBank();
  const freezable = deepFreeze(JSON.parse(JSON.stringify({ materialA, materialB, questions })));
  const snapshotBefore = snapshot(freezable);
  engine.detectTopics(materialA.rawInput);
  engine.detectType(materialA.rawInput);
  engine.extractKeywords(materialA.rawInput);
  engine.similarity(freezable.materialA, freezable.materialB);
  engine.similarMaterials(freezable.materialA, [freezable.materialB]);
  engine.mergeMaterials(freezable.materialA, freezable.materialB);
  engine.recompose(freezable.materialA);
  engine.matchQuestions(freezable.materialA, freezable.questions, 6);
  engine.buildPolishPrompt(freezable.materialA);
  engine.upgradePhrases(materialA.rawInput);
  ok(snapshot(freezable) === snapshotBefore, "所有导出函数均未修改入参（深拷贝快照一致）");

  /* ------------------------------------------------------------
   * 5. 相似度
   * ------------------------------------------------------------ */
  const closeScore = engine.similarity(materialA, materialB);
  ok(closeScore >= 0.45, `相近素材 similarity ≥0.45（${closeScore}）`);
  const unrelatedInput = "人工智能正在改变工作方式，很多公司开始用算法筛选简历，也引发了隐私和公平的讨论。";
  const unrelatedDraft = engine.analyze(unrelatedInput);
  const unrelatedScore = engine.similarity(materialA, unrelatedDraft);
  ok(unrelatedScore < 0.3, `无关素材 similarity <0.30（${unrelatedScore}）`);
  const similar = engine.similarMaterials(materialA, [materialB]);
  ok(similar.length === 1 && similar[0].score >= 0.45, "similarMaterials 返回带分数的相近素材");
  ok(similar[0].reasons.length > 0 && similar[0].reasons.every((reason) => CJK_RE.test(reason)), "相近原因均为中文");

  /* ------------------------------------------------------------
   * 6. 合并
   * ------------------------------------------------------------ */
  const merged = engine.mergeMaterials(materialA, materialB);
  eq(merged.id, materialA.id, "合并保留 keep.id");
  eq(merged.createdAt, materialA.createdAt, "合并保留 keep.createdAt");
  eq(merged.title, materialA.title, "合并保留 keep.title");
  ok(merged.rawInput.includes(materialA.rawInput) && merged.rawInput.includes(materialB.rawInput), "合并 rawInput 保留双方原文");
  ok(merged.rawInput.includes("【并入】"), "合并 rawInput 使用【并入】分隔");
  ok(merged.mergedFrom.length >= 1 && merged.mergedFrom.some((record) => record.title === materialB.title), "mergedFrom 记录吸收方");
  ok(merged.mergeNote === "归纳自：外婆的针线盒、外婆教我包粽子", `mergeNote 格式正确（${merged.mergeNote}）`);
  ok(merged.points.length <= 8, `合并后要点 ≤8（${merged.points.length}）`);
  ok(
    merged.points.every((point) => !point.includes("【并入】") && !/^(主题|关键词|类型)[：:]/.test(point)),
    "合并后要点无分隔符 / 元信息污染"
  );
  const pointKeys = merged.points.map(normalized);
  ok(new Set(pointKeys).size === pointKeys.length, "合并后要点已去重");
  for (const part of ["p1", "p2", "p3"]) {
    const [low, high] = RANGES[part];
    const words = countWords(merged.english[part]);
    ok(words >= low && words <= high, `合并后重新生成 ${part} 词数合法（${words}）`);
  }
  const mergedAgain = engine.mergeMaterials(merged, engine.analyze(SEEDS[4].input));
  ok(mergedAgain.points.length <= 8, "二次合并后要点 ≤8");
  ok(
    mergedAgain.points.every((point) => !point.includes("【并入】") && !/^(主题|关键词|类型)[：:]/.test(point)),
    "二次合并后要点仍干净"
  );
  ok((mergedAgain.rawInput.match(/【并入】/g) || []).length === 2, "二次合并 rawInput 保留三段原文");
  ok(mergedAgain.rawInput.includes(materialA.rawInput) && mergedAgain.rawInput.includes(materialB.rawInput), "二次合并仍保留前两段原文");

  /* ------------------------------------------------------------
   * 7. 真题匹配 / 润色提示词 / 词汇升级
   * ------------------------------------------------------------ */
  const matches = engine.matchQuestions(materialA, questions, 6);
  ok(matches.length === 6, `matchQuestions 返回 6 条（${matches.length}）`);
  ok(matches.every((match) => match.score > 0 && CJK_RE.test(match.reason)), "匹配结果带分数与中文原因");
  ok(
    matches.some((match) => ["家庭", "节庆", "物品", "老年人"].includes(match.category)),
    "外婆的针线盒能匹配到家庭 / 传统 / 物品类真题"
  );
  ok(
    matches.some((match) => /tradition|family|own|important|object/i.test(match.question)),
    "匹配题干包含传统 / 家庭 / 物品语义"
  );

  const prompt = engine.buildPolishPrompt(materialA);
  ok(prompt.includes(materialA.rawInput.trim()), "buildPolishPrompt 含原文");
  ok(prompt.includes("Band 8"), "buildPolishPrompt 要求 Band 8");
  ok(prompt.includes("10 个话题词汇"), "buildPolishPrompt 要求 10 个话题词汇");
  ok(prompt.includes("Part 1") && prompt.includes("Part 2") && prompt.includes("Part 3"), "buildPolishPrompt 含三档英文");
  ok(prompt.includes("中文要点"), "buildPolishPrompt 含中文要点区");

  const upgrades = engine.upgradePhrases("This is very good and very important, and I feel very tired.");
  ok(upgrades.some((item) => item.from === "very good" && item.to === "exceptional"), "upgradePhrases 识别 very good → exceptional");
  ok(upgrades.length <= 5, `upgradePhrases 最多 5 条（${upgrades.length}）`);

  /* ------------------------------------------------------------
   * 8. Lead 验收：主体注入 / 具体细节 / 连接词 / 代词一致
   * ------------------------------------------------------------ */
  const needleDraft = engine.analyze(needleInput);
  const needleP1First = sentencesOf(needleDraft.english.p1)[0] || "";
  const needleP2First = sentencesOf(needleDraft.english.p2)[0] || "";
  ok(/sewing box/i.test(needleP1First), `针线盒 P1 首句含主体（${needleP1First}）`);
  ok(/sewing box/i.test(needleP2First), `针线盒 P2 首句含主体（${needleP2First}）`);
  ok(!/a small object that has been in my family/i.test(needleDraft.english.p1 + needleDraft.english.p2), "针线盒不再使用泛指关系从句");
  ok(!/someone I have known for years/i.test(needleDraft.english.p1 + needleDraft.english.p2), "针线盒不再使用泛指人物开头");
  ok(/forty years/i.test(needleDraft.english.p2), "针线盒 P2 含具体年份细节（forty years）");
  ok(/school uniform/i.test(needleDraft.english.p2), "针线盒 P2 含具体动作细节（school uniform）");
  ok(!/this person/i.test(needleDraft.english.p2), "针线盒 P2 不出现 this person");

  const grandpaDraft = engine.analyze(englishInput);
  const grandpaP1First = sentencesOf(grandpaDraft.english.p1)[0] || "";
  const grandpaP2First = sentencesOf(grandpaDraft.english.p2)[0] || "";
  ok(/grandfather/i.test(grandpaP1First), `外公 P1 首句含主体（${grandpaP1First}）`);
  ok(/grandfather/i.test(grandpaP2First), `外公 P2 首句含主体（${grandpaP2First}）`);
  ok(/punctured tyres/i.test(grandpaDraft.english.p2), "外公 P2 含用户具体细节（punctured tyres）");
  ok(!/this person/i.test(grandpaDraft.english.p2), "外公 P2 不出现 this person");
  ok(/he handles/i.test(grandpaDraft.english.p2) && !/he handle\b/i.test(grandpaDraft.english.p2), "外公 P2 第三人称单数一致（handles）");
  ok(/he shares/i.test(grandpaDraft.english.p2) && !/he share\b/i.test(grandpaDraft.english.p2), "外公 P2 第三人称单数一致（shares）");
  const grandpaP2Sentences = sentencesOf(grandpaDraft.english.p2);
  const detailIndex = grandpaP2Sentences.findIndex((sentence) => /Every Sunday morning/i.test(sentence));
  ok(detailIndex >= 0 && detailIndex < grandpaP2Sentences.length - 1, "英文输入的具体细节被插入正文而非粘在结尾");

  const cycleInput = SEEDS[3].input;
  const cycleDraft = engine.analyze(cycleInput);
  ok(cycleDraft.topics.some((topic) => ["travel", "health"].includes(topic.id)), `骑行主题命中 travel / health（${cycleDraft.topics.map((t) => t.id).join("/")}）`);
  ok(["event", "activity"].includes(cycleDraft.type), `骑行类型为 event / activity（${cycleDraft.type}）`);
  const cycleP1First = sentencesOf(cycleDraft.english.p1)[0] || "";
  const cycleP2First = sentencesOf(cycleDraft.english.p2)[0] || "";
  ok(/cycling|Chengdu|Dujiangyan/i.test(cycleP1First), `骑行 P1 首句含主体（${cycleP1First}）`);
  ok(/cycling|Chengdu|Dujiangyan/i.test(cycleP2First), `骑行 P2 首句含主体（${cycleP2First}）`);
  ok(/six hours|seventy kilometres/i.test(cycleDraft.english.p2), "骑行 P2 含时间 / 距离细节");
  ok(/bridge|rain/i.test(cycleDraft.english.p2), "骑行 P2 含下雨 / 桥洞细节");
  ok(!CJK_RE.test(cycleDraft.english.p2), "骑行 P2 不含中文");

  const tripDraft = engine.analyze("去年那天我们从成都坐车到都江堰，路上大概两个小时，中途还下了雨。");
  ok(tripDraft.type === "event", `含「去年 / 从…到… / 小时 / 下雨」判为 event（${tripDraft.type}）`);
  ok(tripDraft.topics.some((topic) => ["travel", "health"].includes(topic.id)), "旅行叙述命中 travel / health");
  const runDraft = engine.analyze("我每周坚持跑步，已经成了习惯，也很喜欢这个爱好。通常下班后在小区附近跑五公里。");
  ok(runDraft.type === "activity", `含「每周 / 习惯 / 坚持 / 爱好」判为 activity（${runDraft.type}）`);

  const libraryDraft = engine.analyze("我在社区图书馆做了两年志愿者，每周六整理捐来的书，也给小朋友读绘本。");
  ok(["activity", "event"].includes(libraryDraft.type), `图书馆志愿者判为 activity / event（${libraryDraft.type}）`);
  ok(libraryDraft.topics.some((topic) => ["society", "education"].includes(topic.id)), "图书馆志愿者命中社会 / 教育主题");

  const mooncakeDraft = engine.analyze("我们家每年中秋节都会自己做月饼，奶奶和面，我和弟弟压模，烤箱一开整个楼道都是香味。");
  ok(mooncakeDraft.type === "event", `家庭中秋做月饼判为 event（${mooncakeDraft.type}）`);
  ok(mooncakeDraft.topics.some((topic) => ["society", "culture"].includes(topic.id)), "中秋做月饼命中社会 / 文化主题");

  const climbingDraft = engine.analyze("去年冬天我开始学攀岩，每周去两次岩馆。第一次上墙手抖得厉害，三个月后才完成第一条 5.10a 线路。");
  ok(climbingDraft.type === "event", `攀岩经历判为 event（${climbingDraft.type}）`);
  ok(climbingDraft.topics.some((topic) => ["health", "travel"].includes(topic.id)), "攀岩命中健康 / 旅行主题");

  const businessTripDraft = engine.analyze("公司派我去深圳出差三天，住在会展中心附近，晚上一个人去了海边栈道。");
  ok(businessTripDraft.topics.some((topic) => ["travel", "work"].includes(topic.id)), "深圳出差命中旅行 / 工作主题");

  const englishVolunteerDraft = engine.analyze("I spent two years volunteering at a community library every week, sorting donated books and reading to children.");
  ok(englishVolunteerDraft.type === "activity", `英文志愿经历判为 activity（${englishVolunteerDraft.type}）`);
  const englishTitleWords = String(englishVolunteerDraft.title || "").split(/\s+/).filter(Boolean);
  ok(englishTitleWords.length > 0 && englishTitleWords.length <= 6, `纯英文标题 ≤6 词（${englishVolunteerDraft.title}）`);
  ok(!/\bcommunity$/i.test(englishVolunteerDraft.title || ""), "纯英文标题不在半句处截断");

  /* 8.6 短输入 / 无线索输入不得误判、不得凭空造关键词 */
  const coffeeDraft = engine.analyze("咖啡");
  ok(coffeeDraft.type !== "person", `无人物线索的短输入不判为人物（${coffeeDraft.type}）`);
  ok(coffeeDraft.keywords.every((item) => "咖啡".includes(item.zh) || "咖啡".includes(item.en)), "关键词只来自输入原文");
  const shortKw = engine.analyze("我每天早上喝一杯咖啡。").keywords.map((item) => item.zh);
  ok(!shortKw.includes("经历") && !shortKw.includes("感受"), `短输入不虚构关键词（${shortKw.join("、")}）`);

  /* ------------------------------------------------------------
   * 9. 演示素材
   * ------------------------------------------------------------ */
  ok(Array.isArray(SEEDS) && SEEDS.length >= 4 && SEEDS.length <= 6, `演示素材 4–6 条（${SEEDS.length}）`);
  ok(SEEDS.every((seed) => seed && typeof seed.title === "string" && typeof seed.input === "string" && seed.input.length > 20), "演示素材字段完整");
  const seedDrafts = SEEDS.map((seed) => engine.analyze(seed.input));
  const seedClose = engine.similarity(seedDrafts[0], seedDrafts[1]);
  ok(seedClose >= 0.45, `演示素材前两条主题相近（${seedClose}）`);

  console.log(`\n全部通过：${passed} 项断言 ✓`);
}

try {
  main();
} catch (error) {
  console.error("\n✗ 自测失败：", error && error.message ? error.message : error);
  if (error && error.stack) console.error(error.stack);
  process.exit(1);
}
