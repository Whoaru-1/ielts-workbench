/* ============================================================
 * material-engine.js — 个人素材模块的离线语言引擎
 *
 * 数据流向：
 *   1. analyze(input)
 *        → detectTopics / detectType / extractKeywords / buildPoints
 *        → buildContext 从 material-lexicon 取话题搭配、理由句、模板
 *        → composePart 依次生成 p1 / p2 / p3，再做字数修补与断言
 *   2. similarMaterials / similarity 用于发现主题相近的素材
 *   3. mergeMaterials 把两条素材归纳成一条（保留原文与合并历史）
 *   4. matchQuestions 用英文关键词 + 主题别名匹配口语真题
 *   5. buildPolishPrompt 生成可复制到 ChatGPT / DeepSeek 的中文提示词
 *
 * 原则：纯函数、可重入、无 DOM、无网络、无随机数。
 * 所有输出只由 input 的 hash 决定，同一输入永远得到同一份结果。
 * ============================================================ */

import {
  TOPIC_DATA,
  TOPICS,
  TYPES,
  TYPE_LABELS,
  TYPE_CUES,
  TYPE_TEMPLATES,
  ZH_EN,
  EN_UPGRADES,
  STOPWORDS,
} from "./material-lexicon.js";

export { TOPICS, TYPES };

/* ------------------------------------------------------------
 * 0. 常量与基础工具
 * ------------------------------------------------------------ */

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const WORD_RANGES = {
  p1: [55, 85],
  p2: [165, 205],
  p3: [90, 120],
};
// 逐句累加的目标值。故意略高于下限，保证再加一句也不会超过上限。
const WORD_TARGETS = { p1: 66, p2: 172, p3: 96 };

const TOPIC_BY_ID = new Map(TOPIC_DATA.map((topic) => [topic.id, topic]));
const ZH_EN_MAP = new Map();
for (const pair of ZH_EN) {
  if (pair && pair.zh && !ZH_EN_MAP.has(pair.zh)) ZH_EN_MAP.set(pair.zh, pair.en);
}
const EN_ZH_MAP = new Map();
for (const pair of ZH_EN) {
  if (!pair || !pair.en) continue;
  const value = String(pair.en).trim();
  if (/\s/.test(value)) continue; // 短语只做整条匹配，避免 small → 小镇 这类误映射
  const token = value.toLowerCase();
  if (/^[a-z][a-z'-]*$/.test(token) && !EN_ZH_MAP.has(token)) EN_ZH_MAP.set(token, pair.zh);
}
const STOP_ZH = new Set(STOPWORDS.zh);
const STOP_EN = new Set(STOPWORDS.en);

/** 各类型的英文泛指名词短语（槽位 {NP} 用，保证任何输入都能拼出合法句） */
const FALLBACK_NPS = {
  person: ["a close family member", "an old friend", "someone I respect"],
  place: ["a quiet place near my home", "a small town", "a local spot"],
  object: ["a small keepsake", "a gift", "something I use almost every day"],
  event: ["an unforgettable experience", "a memorable celebration", "a turning point"],
  activity: ["a hobby", "an activity", "something I do in my free time"],
  media: ["a film", "a book", "a piece of music"],
  idea: ["an idea", "a belief", "a lesson"],
};

/** P1 里把话题搭配放进句子的固定框架（按类型换主语） */
const P1_COLLOC_FRAME = {
  person: "In many ways, this person's story is connected with the theme of {COLLOC}.",
  place: "In many ways, this place is connected with the theme of {COLLOC}.",
  object: "In many ways, this object is connected with the theme of {COLLOC}.",
  event: "In many ways, this experience is connected with the theme of {COLLOC}.",
  activity: "In many ways, this activity is connected with the theme of {COLLOC}.",
  media: "In many ways, this piece of media is connected with the theme of {COLLOC}.",
  idea: "In many ways, this idea is connected with the theme of {COLLOC}.",
};

/** P2 固定连接句（规范要求至少出现其中 2 个，这里默认全部出现） */
const P2_CONN = {
  begin: "To begin with, it all started in a fairly ordinary way, and I had no idea it would stay with me for so long.",
  stand: "What makes it stand out is the theme of {COLLOC}, which is something I had never really appreciated before.",
  look: "Looking back, I realise that the value of this experience lies in the connections it created rather than in anything material.",
  why: "So that's why this memory still means so much to me, and why I often bring it up when friends ask about my background.",
  link: "It is also closely connected with the theme of {COLLOC2}, and that connection has become clearer to me over time.",
  p3: "From a broader perspective, the role of {COLLOC} deserves more attention than it usually gets.",
};

/** 没有识别出话题时的通用语料 */
const GENERAL_TOPIC = {
  id: "general",
  label: "通用",
  collocations: [
    "personal experience",
    "everyday life",
    "a lasting impression",
    "a small but meaningful detail",
    "a familiar routine",
    "a sense of connection",
  ],
  reasons: [
    "Small experiences often shape people more than dramatic events do.",
    "A detail only becomes meaningful when it is connected to a person or a moment.",
    "Looking closely at ordinary life usually reveals more than people expect.",
    "The value of an experience depends partly on the people who share it.",
  ],
  feelings: [
    "It gives me a sense of continuity that is difficult to explain.",
    "Looking back, I feel grateful for the way that period shaped me.",
    "The memory stays with me because it was simple and genuine.",
  ],
  abstract: [
    "Personal stories matter because they connect individual lives to wider changes.",
    "What people choose to remember says a lot about what they value.",
  ],
  lexical: [
    { term: "meaningful", cn: "有意义的", example: "Even a small routine can become meaningful over time." },
    { term: "lasting", cn: "持久的", example: "The experience had a lasting effect on the way I see things." },
    { term: "ordinary", cn: "普通的", example: "Ordinary moments often carry the strongest memories." },
    { term: "connection", cn: "联系", example: "The connection between the object and the person is what matters." },
    { term: "continuity", cn: "连续性", example: "Family routines provide a sense of continuity." },
  ],
};

/** 类别 → 话题，用于 matchQuestions 的中文类别匹配 */
const CATEGORY_TOPICS = {
  "教育": ["education"],
  "儿童教育": ["education", "society"],
  "语言学习": ["education", "culture"],
  "工作学习": ["work", "education"],
  "学习经历": ["education"],
  "工作": ["work"],
  "环境": ["environment"],
  "自然动物": ["environment"],
  "天气季节": ["environment"],
  "园艺与植物": ["environment", "health"],
  "宠物": ["environment"],
  "科技": ["technology"],
  "科技与社会": ["technology", "society"],
  "手机使用习惯": ["technology"],
  "数字与年龄": ["technology", "society"],
  "科技使用": ["technology"],
  "健康": ["health"],
  "运动健康": ["health"],
  "日常作息": ["health"],
  "睡眠": ["health"],
  "社会": ["society"],
  "城市生活": ["society"],
  "城市与乡村": ["society", "travel"],
  "老年人": ["society", "health"],
  "家庭": ["society", "culture"],
  "朋友": ["society"],
  "家乡": ["society", "travel"],
  "住所": ["society"],
  "理想住所": ["society", "travel"],
  "文化": ["culture"],
  "节庆": ["culture"],
  "童年记忆": ["culture", "society"],
  "兴趣爱好": ["society", "culture"],
  "活动习惯": ["society", "health"],
  "媒体": ["media"],
  "新闻媒体": ["media"],
  "思考电影": ["media"],
  "电影": ["media", "culture"],
  "音乐": ["culture", "media"],
  "阅读": ["education", "media"],
  "消费": ["economy"],
  "消费观": ["economy"],
  "购物": ["economy"],
  "购物消费": ["economy"],
  "衣服时尚": ["economy", "culture"],
  "旅行": ["travel"],
  "假期旅行": ["travel"],
  "交通": ["travel", "government"],
  "交通出行": ["travel"],
  "地点": ["travel"],
  "安静场所": ["travel", "society"],
  "物品": ["economy", "culture"],
  "餐饮": ["culture", "health"],
  "食物烹饪": ["culture", "health"],
  "早餐饮食": ["culture", "health"],
  "志愿服务": ["society"],
  "人物": ["society"],
  "名人偶像": ["society", "media"],
  "事件经历": ["society"],
  "重要时刻": ["society"],
  "快乐小事": ["society"],
  "改变决定": ["society"],
  "沟通交流": ["society"],
  "建议": ["education", "society"],
  "团队合作": ["work"],
  "新技能": ["education", "work"],
  "冒险经历": ["travel"],
  "全球化": ["society", "economy"],
};

/** 素材类型 → 常见 P2 题目类别 */
const TYPE_CATEGORIES = {
  person: ["人物", "家庭", "朋友", "名人偶像", "老年人"],
  place: ["地点", "安静场所", "理想住所", "假期旅行", "城市生活", "城市与乡村", "家乡"],
  object: ["物品", "购物消费", "礼物"],
  event: ["事件经历", "重要时刻", "快乐小事", "冒险经历", "童年记忆", "节庆", "改变决定"],
  activity: ["活动习惯", "兴趣爱好", "运动健康", "新技能", "志愿服务", "学习经历", "日常作息"],
  media: ["媒体", "思考电影", "电影", "音乐", "阅读", "新闻媒体"],
  idea: ["教育", "社会", "科技", "文化", "环境", "工作", "消费观", "全球化", "科技与社会"],
};

const FALLBACK_KEYWORDS = [
  ["经历", "experience"],
  ["感受", "feeling"],
  ["变化", "change"],
  ["意义", "meaning"],
];

/** FNV-1a 32 位 hash：用来稳定地选择模板变体 */
function hash32(str) {
  let hash = 2166136261 >>> 0;
  const text = String(str ?? "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function countWords(text) {
  const trimmed = String(text ?? "").trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}

function hasCJK(text) {
  return CJK_RE.test(String(text ?? ""));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeToken(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePointText(value) {
  return normalizeToken(value).replace(/\s+/g, "");
}

function pickByHash(list, hash, salt) {
  if (!Array.isArray(list) || list.length === 0) return "";
  return list[hash32(`${hash}|${salt}`) % list.length];
}

function pickManyByHash(list, hash, salt, count) {
  const out = [];
  if (!Array.isArray(list) || list.length === 0) return out;
  const start = hash32(`${hash}|${salt}`) % list.length;
  const seen = new Set();
  for (let step = 0; step < list.length && out.length < count; step += 1) {
    const index = (start + step * 3) % list.length;
    if (seen.has(index)) continue;
    seen.add(index);
    out.push(list[index]);
  }
  return out;
}

/** 中文按子串、英文按词边界（允许简单的复数后缀）判断线索词是否命中 */
function cueHit(lowerText, cue) {
  if (!cue) return false;
  const text = String(lowerText ?? "").toLowerCase();
  const needle = String(cue).toLowerCase();
  if (CJK_RE.test(needle)) return text.includes(needle);
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:s|es)?(?:$|[^a-z0-9])`, "i");
  return pattern.test(text);
}

/** 拆成句子 / 中文要点用的短句（不修改入参） */
function splitClauses(text) {
  const source = String(text ?? "").replace(/\r/g, "");
  const out = [];
  for (const line of source.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const rawPiece of trimmed.split(/[。！？；;!?]+/)) {
      if (!rawPiece.trim()) continue;
      const pieces = hasCJK(rawPiece) ? rawPiece.split(/[，,]/) : [rawPiece];
      for (const piece of pieces) {
        const segment = piece.trim();
        if (!segment) continue;
        const sentences = segment.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [segment];
        for (const sentence of sentences) out.push(sentence);
      }
    }
  }
  return out.map(cleanPointText).filter(Boolean);
}

function cleanPointText(value) {
  return String(value ?? "")
    .replace(/^[\s\-–—•·*#>]+/, "")
    .replace(/^\d+[.、)）]\s*/, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim()
    .replace(/[。，,；;：:]+$/g, "")
    .trim();
}

/** 英文句子的拆分（生成结果里只有句号、问号、感叹号） */
function splitEnglishSentences(text) {
  const matches = String(text ?? "").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return matches.map((sentence) => sentence.trim()).filter(Boolean);
}

/** 统一清理英文：空格、标点、首字母、结尾句号 */
function cleanEnglish(text) {
  let out = String(text ?? "").replace(/\s+/g, " ").trim();
  out = out
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])(?=[^\s])/g, "$1 ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+\./g, ".")
    .trim();
  if (!out) return "";
  out = out.replace(/^([a-z])/, (match) => match.toUpperCase());
  if (!/[.!?]$/.test(out)) out += ".";
  return out;
}


/* ------------------------------------------------------------
 * 1. 主题识别
 * ------------------------------------------------------------ */

/** 内部打分：返回带命中信息的主题对象，供 detectTopics 与关键词提取复用 */
function scoreTopics(text) {
  const lower = String(text ?? "").toLowerCase();
  const scored = TOPIC_DATA.map((topic, index) => {
    let rawScore = 0;
    const hits = [];
    for (const [zh, en] of topic.keywords) {
      let weight = 0;
      if (zh && lower.includes(zh.toLowerCase())) {
        weight += 1 + Math.min(0.5, Math.max(0, zh.length - 2) * 0.12);
        hits.push(zh);
      }
      if (en && cueHit(lower, en)) {
        weight += 1;
        hits.push(en);
      }
      if (weight > 0) rawScore += Math.min(1.8, weight);
    }
    for (const alias of topic.aliases || []) {
      if (alias && alias.length >= 2 && lower.includes(alias.toLowerCase())) rawScore += 0.12;
    }
    return {
      id: topic.id,
      label: topic.label,
      data: topic,
      index,
      raw: rawScore,
      hits,
      score: rawScore > 0 ? 1 - Math.exp(-0.55 * rawScore) : 0,
    };
  });
  return scored;
}

/**
 * 主题识别，按得分降序，最多 3 条；无匹配时返回通用主题。
 * @param {string} text
 * @returns {{id:string,label:string,score:number}[]}
 */
export function detectTopics(text) {
  const scored = scoreTopics(text)
    .filter((topic) => topic.score > 0.14)
    .sort((a, b) => b.raw - a.raw || a.index - b.index)
    .slice(0, 3)
    .map((topic) => ({ id: topic.id, label: topic.label, score: round2(topic.score) }));
  if (scored.length === 0) return [{ id: "general", label: "通用", score: 0.3 }];
  return scored;
}

/* ------------------------------------------------------------
 * 2. 类型识别
 * ------------------------------------------------------------ */

/**
 * 类型识别。
 * @param {string} text
 * @returns {{type:string,label:string,scores:Record<string,number>}}
 */
export function detectType(text) {
  const rawText = String(text ?? "");
  const lower = rawText.toLowerCase();
  const scores = {};
  const rank = {};
  TYPES.forEach((type) => {
    let hits = 0;
    for (const cue of TYPE_CUES[type.id] || []) {
      if (!cueHit(lower, cue)) continue;
      if (CJK_RE.test(cue)) {
        hits += 1 + Math.min(0.5, Math.max(0, cue.length - 2) * 0.15);
      } else {
        hits += 1 + (String(cue).includes(" ") ? 0.25 : 0);
      }
      if (hits >= 12) break;
    }
    const base = hits / (hits + 2);
    scores[type.id] = round2(base);
    rank[type.id] = base;
  });

  // 人物词只有在「指人 + 人物行为」时才真正加权；亲属只作伴随出现时降权
  const strongPerson = CJK_RE.test(rawText)
    ? /(?:他|她)(?:是|叫|来自|住在|教|给|对|带|说|帮|让)|(?:我的|我)(?:外婆|外公|奶奶|爷爷|妈妈|爸爸|母亲|父亲|哥哥|姐姐|弟弟|妹妹|老师|导师|教练|朋友|邻居|同事|老板|医生|伴侣)|(?:外婆|外公|奶奶|爷爷|妈妈|爸爸|老师|朋友|邻居|同事|老板)(?:是|叫|教|给|对|带|帮)/.test(rawText)
    : /(?:my|his|her|our)\s+(?:grandfather|grandmother|father|mother|teacher|friend|neighbour|colleague|boss|brother|sister)/i.test(rawText);

  const eventHits = [
    ...new Set(
      rawText.match(
        /(去年|前年|今年|那天|当时|第一次|有一次|曾经|发生|经历|遇到|去了|到了|开始学|三个月|两年|三天|每年|都会|暑假|寒假|中秋节|春节|端午|毕业|婚礼|做完)/g
      ) || []
    ),
  ].length;
  const activityHits = [
    ...new Set(
      rawText.match(
        /(每(?:周|天|月|年)|每天|通常|经常|定期|坚持|习惯|爱好|开始学|练习|做志愿者|志愿服务|志愿者|参加|报名|两次|三次|打卡|攀岩|瑜伽|健身|跑步)/g
      ) || []
    ),
  ].length;

  if (eventHits > 0) rank.event += Math.min(0.9, eventHits * 0.18);
  if (activityHits > 0) rank.activity += Math.min(0.9, activityHits * 0.18);
  if (!strongPerson && (eventHits > 0 || activityHits > 0)) rank.person *= 0.5;

  // 所有线索都没命中时回退到「想法」，而不是因为遍历顺序误判成「人物」
  let best = { type: "idea", label: "想法", score: 0 };
  TYPES.forEach((type) => {
    const finalScore = clamp(rank[type.id] || 0, 0, 1);
    scores[type.id] = round2(finalScore);
    if (finalScore > best.score + 1e-9) best = { type: type.id, label: type.label, score: finalScore };
  });
  return { type: best.type, label: best.label, scores };
}

/* ------------------------------------------------------------
 * 3. 关键词提取
 * ------------------------------------------------------------ */

function addKeywordCandidate(list, zh, en, weight, order) {
  const cleanZh = String(zh ?? "").trim();
  const cleanEn = String(en ?? "").trim();
  if (!cleanZh && !cleanEn) return;
  list.push({ zh: cleanZh, en: cleanEn, weight, order });
}

/**
 * 关键词（4–12 个，尽量带英文）。
 * @param {string} text
 * @returns {{zh:string,en:string,weight:number}[]}
 */
export function extractKeywords(text) {
  const raw = String(text ?? "");
  const lower = raw.toLowerCase();
  const candidates = [];
  let order = 0;

  // 3.1 先按中文词对匹配（长词优先，避免「针线」盖住「针线盒」）
  const pairHits = ZH_EN.filter((pair) => pair.zh && lower.includes(pair.zh)).sort(
    (a, b) => b.zh.length - a.zh.length
  );
  for (const pair of pairHits) {
    addKeywordCandidate(candidates, pair.zh, pair.en, 1 + Math.min(0.6, pair.zh.length * 0.07), order++);
  }

  // 3.2 话题关键词（中文命中或英文命中）
  const scoredTopics = scoreTopics(raw)
    .filter((topic) => topic.score > 0.14)
    .sort((a, b) => b.raw - a.raw || a.index - b.index)
    .slice(0, 3);
  for (const topic of scoredTopics) {
    for (const [zh, en] of topic.data.keywords) {
      const zhHit = zh && lower.includes(zh.toLowerCase());
      const enHit = en && cueHit(lower, en);
      if (zhHit || enHit) {
        let weight = 1 + topic.score * 0.6;
        const enLower = String(en || "").toLowerCase();
        if (ACTIVITY_EN.has(enLower) || /ing$/.test(enLower)) weight += 0.2;
        addKeywordCandidate(candidates, zh, en, weight, order++);
      }
    }
  }

  // 3.3 输入里已有的英文词
  const englishWords = Array.from(
    new Set((raw.match(/[A-Za-z][A-Za-z'-]{2,}/g) || []).map((word) => word.toLowerCase().replace(/^'+|'+$/g, "")))
  );
  for (const word of englishWords) {
    if (word.length < 3 || STOP_EN.has(word)) continue;
    const zh = EN_ZH_MAP.get(word) || EN_ZH_MAP.get(word.replace(/s$/g, "")) || "";
    if (!zh) continue; // 没有可靠中文映射的英文泛词不进关键词
    addKeywordCandidate(candidates, zh, word, 1.35, order++);
  }

  // 3.4 去重：相同英文、或中文互相包含时只留更具体的一条
  candidates.sort(
    (a, b) =>
      b.weight - a.weight ||
      (b.zh ? b.zh.length : 0) - (a.zh ? a.zh.length : 0) ||
      a.order - b.order
  );
  const picked = [];
  for (const candidate of candidates) {
    if (picked.length >= 12) break;
    const zhKey = candidate.zh ? normalizePointText(candidate.zh) : "";
    const enKey = candidate.en ? normalizeToken(candidate.en) : "";
    let duplicateIndex = -1;
    picked.forEach((item, index) => {
      if (duplicateIndex >= 0) return;
      const itemZh = item.zh ? normalizePointText(item.zh) : "";
      const itemEn = item.en ? normalizeToken(item.en) : "";
      if (enKey && itemEn && enKey === itemEn) duplicateIndex = index;
      else if (zhKey && itemZh && (zhKey === itemZh || itemZh.includes(zhKey))) duplicateIndex = index;
      else if (zhKey && itemZh && zhKey.includes(itemZh)) duplicateIndex = index;
    });
    if (duplicateIndex >= 0) {
      const existing = picked[duplicateIndex];
      const existingZh = existing.zh ? normalizePointText(existing.zh) : "";
      // 同一事物只留更具体的一条，例如「针线盒」优先于「针线」
      if (zhKey && existingZh && zhKey.includes(existingZh) && zhKey.length > existingZh.length) {
        picked[duplicateIndex] = candidate;
      }
      continue;
    }
    picked.push(candidate);
  }

  picked.sort(
    (a, b) =>
      b.weight - a.weight ||
      (b.zh ? b.zh.length : 0) - (a.zh ? a.zh.length : 0) ||
      a.order - b.order
  );

  // 3.5 不足 4 个时，只从「输入里真实出现过」的主题词补足；绝不凭空编造关键词
  const primaryTopic = scoredTopics[0]?.data;
  const fillPool = (primaryTopic ? primaryTopic.keywords : FALLBACK_KEYWORDS)
    .map(([zh, en]) => ({ zh, en }))
    .filter((item) => (item.zh && raw.includes(item.zh)) || (item.en && cueHit(lower, item.en)));
  for (const item of fillPool) {
    if (picked.length >= 4) break;
    const zhKey = normalizePointText(item.zh);
    const enKey = normalizeToken(item.en);
    const duplicate = picked.some((existing) => {
      const existingZh = normalizePointText(existing.zh);
      const existingEn = normalizeToken(existing.en);
      return (enKey && existingEn === enKey) || (zhKey && existingZh === zhKey);
    });
    if (!duplicate) picked.push({ zh: item.zh, en: item.en, weight: 0.5, order: order++ });
  }

  if (picked.length === 0) {
    return FALLBACK_KEYWORDS.slice(0, 4).map(([zh, en], index) => ({
      zh,
      en,
      weight: round2(0.4 - index * 0.05),
    }));
  }

  return picked.slice(0, 12).map((item) => ({
    zh: item.zh,
    en: item.en,
    weight: round2(item.weight),
  }));
}

/* ------------------------------------------------------------
 * 4. 标题 / 中文要点 / 中文提纲
 * ------------------------------------------------------------ */

function makeTitle(rawInput, type) {
  const firstClause = splitClauses(rawInput)[0] || cleanPointText(rawInput);
  let title = String(firstClause || "").split(/[，,：:]/)[0].trim();
  if (!title) title = `${TYPE_LABELS[type] || "素材"}素材`;
  if (hasCJK(title)) {
    if (title.length > 24) title = `${title.slice(0, 24)}…`;
  } else {
    const cleaned = title.replace(/[.!?]+$/g, "").trim();
    let phrase = "";
    // 优先提取 "Volunteering at a community library" 这类动名词短语
    const gerund = cleaned.match(
      /\b([A-Za-z]+ing)\s+(at|in|on|for|with)\s+((?:a|an|the|my|our|his|her|their)\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)/i
    );
    if (gerund) {
      const candidate = `${gerund[1]} ${gerund[2]} ${gerund[3] || ""}${gerund[4]}`.replace(/\s+/g, " ").trim();
      if (candidate.split(/\s+/).filter(Boolean).length <= 6) phrase = candidate;
    }
    if (!phrase) {
      let words = cleaned.split(/\s+/).filter(Boolean).slice(0, 6);
      while (
        words.length > 2 &&
        STOP_EN.has(words[words.length - 1].toLowerCase().replace(/[^a-z'-]/g, ""))
      ) {
        words.pop();
      }
      phrase = words.join(" ");
    }
    title = phrase ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : "未命名素材";
  }
  return title.replace(/[。！？!?；;：:]+$/g, "").trim() || `${TYPE_LABELS[type] || "素材"}素材`;
}

function bigramSet(text) {
  const normalized = normalizePointText(text);
  const set = new Set();
  if (normalized.length <= 2) {
    if (normalized) set.add(normalized);
    return set;
  }
  for (let i = 0; i < normalized.length - 1; i += 1) set.add(normalized.slice(i, i + 2));
  return set;
}

function setJaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function isSamePoint(a, b) {
  const left = normalizePointText(a);
  const right = normalizePointText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 4 && right.length >= 4 && (left.includes(right) || right.includes(left))) return true;
  return setJaccard(bigramSet(left), bigramSet(right)) >= 0.78;
}

function isMetaPoint(text) {
  const value = String(text ?? "").trim();
  if (!value) return true;
  if (value.includes("【并入】")) return true;
  if (/^(?:主题|关键词|类型|素材类型|Topic|Keywords?)\s*[：:]/i.test(value)) return true;
  if (/^[^\p{L}\p{N}]+$/u.test(value)) return true;
  return false;
}

function buildPoints(rawInput, meta) {
  const points = [];
  for (const clause of splitClauses(rawInput)) {
    if (points.length >= 8) break;
    if (isMetaPoint(clause)) continue;
    const cjkCount = (clause.match(/[\u3400-\u9fff]/g) || []).length;
    const englishCount = (clause.match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
    if (cjkCount < 2 && englishCount < 2) continue;
    if (points.some((existing) => isSamePoint(existing, clause))) continue;
    points.push(clause);
  }
  return points.slice(0, 8).map((point) => {
    if (point.length <= 90) return point;
    const cut = point.slice(0, 90);
    const lastSpace = cut.lastIndexOf(" ");
    return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  });
}

/* ------------------------------------------------------------
 * 5. 英文生成
 * ------------------------------------------------------------ */

function extractEnglishSentences(text) {
  const raw = String(text ?? "").replace(/\r/g, "");
  const pieces = raw.split(/\n+/).flatMap((line) => splitEnglishSentences(line));
  const out = [];
  for (const piece of pieces) {
    if (hasCJK(piece)) continue;
    const cleaned = cleanEnglish(piece);
    const words = countWords(cleaned);
    if (words < 5 || words > 30) continue;
    if (!/[A-Za-z]{3,}/.test(cleaned)) continue;
    if (out.some((existing) => isSamePoint(existing, cleaned))) continue;
    out.push(cleaned);
  }
  return out;
}


const CONNECTOR_MARKERS = ["To begin with", "What makes it stand out is", "Looking back", "So that's why"];

function connectorKeyOf(sentence) {
  const text = String(sentence ?? "").trim().toLowerCase();
  for (let index = 0; index < CONNECTOR_MARKERS.length; index += 1) {
    if (text.startsWith(CONNECTOR_MARKERS[index].toLowerCase())) return index;
  }
  return -1;
}

function relativeClauseOf(sentence) {
  const match = String(sentence ?? "").match(/\b(?:which|who|that|where)\s+[^.,;!?]{18,80}/i);
  return match ? normalizePointText(match[0]) : "";
}

/** 去重：完全重复句、重复模板连接句、重复关系从句都只保留第一次出现 */
function sanitizeEnglish(text) {
  const sentences = splitEnglishSentences(text);
  const out = [];
  const sentenceKeys = new Set();
  const connectorKeys = new Set();
  const relativeKeys = new Set();
  for (const rawSentence of sentences) {
    const sentence = cleanEnglish(rawSentence);
    if (!sentence) continue;
    const key = normalizePointText(sentence);
    if (!key || sentenceKeys.has(key)) continue;
    if (out.some((existing) => isSamePoint(existing, sentence))) continue;
    const connectorKey = connectorKeyOf(sentence);
    if (connectorKey >= 0) {
      if (connectorKeys.has(connectorKey)) continue;
      connectorKeys.add(connectorKey);
    }
    const relative = relativeClauseOf(sentence);
    if (relative) {
      if (relativeKeys.has(relative)) continue;
      relativeKeys.add(relative);
    }
    sentenceKeys.add(key);
    out.push(sentence);
  }
  return cleanEnglish(out.join(" "));
}

function detectPronoun(raw) {
  const text = String(raw ?? "");
  const female = /外婆|奶奶|妈妈|母亲|姐姐|妹妹|阿姨|她|grandmother|mother|sister|aunt|\bshe\b/i.test(text);
  const male = /外公|爷爷|爸爸|父亲|哥哥|弟弟|叔叔|他|grandfather|father|brother|uncle|\bhe\b/i.test(text);
  if (female && !male) return "she";
  if (male && !female) return "he";
  return "they";
}

function detectPersonEn(raw) {
  const text = String(raw ?? "");
  const relations = [
    ["外婆", "grandmother"], ["奶奶", "grandmother"],
    ["外公", "grandfather"], ["爷爷", "grandfather"],
    ["妈妈", "mother"], ["母亲", "mother"],
    ["爸爸", "father"], ["父亲", "father"],
    ["哥哥", "older brother"], ["姐姐", "older sister"],
    ["弟弟", "younger brother"], ["妹妹", "younger sister"],
    ["阿姨", "aunt"], ["叔叔", "uncle"], ["朋友", "friend"],
    ["老师", "teacher"], ["邻居", "neighbour"], ["同事", "colleague"],
  ];
  for (const [zh, en] of relations) {
    if (text.includes(zh)) return en;
  }
  const lower = text.toLowerCase();
  for (const [, en] of relations) {
    if (cueHit(lower, en)) return en;
  }
  return "";
}

function conjugateThirdPerson(verb) {
  const lower = String(verb ?? "").toLowerCase();
  if (["can", "could", "will", "would", "should", "may", "might", "must"].includes(lower)) return verb;
  if (lower === "have") return "has";
  if (lower === "do") return "does";
  if (lower === "be") return "is";
  if (lower === "go") return "goes";
  if (/(s|x|z|ch|sh|o)$/.test(lower)) return `${verb}es`;
  if (/[^aeiou]y$/.test(lower)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

/** 输入里已经出现具体人物时，把模板里的 this person / someone close to me 换成具体人称 */
function personalizeSentence(sentence, ctx) {
  let out = String(sentence ?? "");
  const pronoun = ctx.pronoun || "they";
  const objectPronoun = pronoun === "she" ? "her" : pronoun === "he" ? "him" : "them";
  const possessive = pronoun === "she" ? "her" : pronoun === "he" ? "his" : "their";
  const keepCase = (match, replacement) =>
    /^[A-Z]/.test(match) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
  if (ctx.personEn) {
    out = out.replace(/\bsomeone close to me\b/gi, `my ${ctx.personEn}`);
  }
  out = out
    .replace(/\bthis person's\b/gi, (match) => keepCase(match, possessive))
    .replace(/\bwhat makes this person\b/gi, `what makes ${objectPronoun}`)
    .replace(/\bthe way this person\b/gi, `the way ${pronoun}`)
    .replace(/\b(with|to|about|of|for|from|known|around|help) this person\b/gi, (match, prep) => `${prep} ${objectPronoun}`);
  out = out.replace(/\bthis person\b/gi, (match) => keepCase(match, pronoun));
  if (ctx.type === "person" && pronoun !== "they") {
    out = out
      .replace(/\bthey\s+([a-z]+)/gi, (match, verb) => `${keepCase(match, pronoun)} ${conjugateThirdPerson(verb)}`)
      .replace(/\btheir\b/gi, (match) => keepCase(match, possessive))
      .replace(/\bthem\b/gi, (match) => keepCase(match, objectPronoun))
      .replace(/\bthey\b/gi, (match) => keepCase(match, pronoun));
  }
  return out;
}

function fillSentence(sentence, ctx) {
  const filled = String(sentence ?? "")
    .replace(/\{NP\}/g, ctx.np)
    .replace(/\{COLLOC2\}/g, ctx.colloc2)
    .replace(/\{COLLOC\}/g, ctx.colloc1);
  return personalizeSentence(filled, ctx);
}


/** 形容词/评价词不能直接当主语名词使用 */
const BAD_SUBJECT_EN = new Set([
  "important", "meaningful", "unforgettable", "special", "precious", "interesting",
  "useful", "beautiful", "quiet", "liveliness", "convenient", "easy", "worthwhile",
  "modern", "real", "warmth", "joy", "happiness", "pride", "nervousness", "fear",
  "sadness", "nostalgia", "gratitude", "regret", "surprise", "relaxation",
  "satisfaction", "loneliness", "stress", "friendly", "kind", "honest",
  "hard-working", "humorous", "confident", "brave", "optimistic", "tidy",
  "crowded", "cheap", "expensive", "fresh", "healthy", "delicious",
  "moving", "a moving feeling", "missing someone",
]);

/** 不可数名词：加冠词或构句时要特殊处理 */
const UNCOUNTABLE_EN = new Set([
  "education", "learning", "knowledge", "health", "exercise", "stress", "sleep",
  "nutrition", "fitness", "medicine", "treatment", "pollution", "plastic",
  "recycling", "energy", "air", "nature", "sustainability", "protection",
  "traffic", "transport", "infrastructure", "welfare", "healthcare", "safety",
  "governance", "taxation", "planning", "happiness", "joy", "nostalgia",
  "gratitude", "fear", "sadness", "warmth", "loneliness", "advice",
  "information", "data", "privacy", "security", "software", "music", "art",
  "culture", "tradition", "heritage", "craftsmanship", "needlework",
  "handiwork", "sewing", "calligraphy", "opera", "tea", "coffee", "milk",
  "sugar", "salt", "oil", "rice", "meat", "bread", "food", "water", "scenery",
  "tourism", "travel", "research", "evidence", "science", "technology",
  "innovation", "automation", "intelligence", "society", "community",
  "family", "childhood", "memory", "experience", "change", "success",
  "failure", "freedom", "responsibility", "courage", "confidence", "patience",
  "kindness", "friendship", "love", "respect", "trust", "rain", "snow",
  "wind", "weather", "cycling", "trekking", "camping", "hiking", "fishing",
  "cooking", "baking", "reading", "writing", "photography", "painting",
  "drawing", "singing", "dancing", "gardening", "volunteering", "shopping",
  "travelling", "yoga", "meditation", "chess",
]);

const MY_PERSON_EN = new Set([
  "grandmother", "grandfather", "mother", "father", "parent", "teacher",
  "mentor", "coach", "colleague", "boss", "neighbour", "neighbor", "friend",
  "classmate", "partner", "relative", "brother", "sister", "aunt", "uncle",
]);

const FAMILY_PERSON_EN = new Set([
  ...MY_PERSON_EN, "volunteer", "doctor", "child",
]);

const PLACE_EN = new Set([
  "park", "library", "museum", "city", "town", "village", "hometown", "school",
  "campus", "beach", "mountain", "river", "lake", "street", "community",
  "garden", "office", "gym", "cinema", "room", "balcony", "countryside",
  "old town", "seaside", "station", "airport", "restaurant", "cafe",
  "bookstore", "supermarket", "market", "playground", "temple", "square",
]);

const ACTIVITY_EN = new Set([
  "cycling", "running", "swimming", "hiking", "camping", "fishing", "cooking",
  "baking", "reading", "writing", "photography", "painting", "drawing",
  "singing", "dancing", "gardening", "volunteering", "shopping", "travelling",
  "travel", "yoga", "meditation", "chess", "badminton", "basketball",
  "football", "tennis", "walking", "making rice dumplings",
]);

const CONCRETE_MEDIA_EN = new Set([
  "film", "movie", "book", "novel", "song", "album", "video", "game", "app",
  "website", "programme", "podcast", "documentary", "newspaper", "magazine",
]);

const PROPER_EN = new Set([
  "chengdu", "dujiangyan", "beijing", "shanghai", "guangzhou", "shenzhen",
  "hangzhou", "xi'an", "nanjing", "chongqing", "wuhan", "suzhou", "lijiang",
  "sanya", "xiamen", "qingdao", "yunnan", "sichuan", "tibet", "hong kong",
  "taiwan", "great wall", "west lake", "forbidden city",
]);

/** 中文所有者 → 英文所有格前缀 */
const OWNER_POSSESSIVE = {
  "我": "my", "我的": "my", "我们": "our", "我们的": "our",
  "外婆": "my grandmother", "奶奶": "my grandmother",
  "外公": "my grandfather", "爷爷": "my grandfather",
  "妈妈": "my mother", "母亲": "my mother",
  "爸爸": "my father", "父亲": "my father",
  "哥哥": "my older brother", "姐姐": "my older sister",
  "弟弟": "my younger brother", "妹妹": "my younger sister",
  "朋友": "my friend", "老师": "my teacher", "邻居": "my neighbour",
  "同事": "my colleague", "老板": "my boss",
};

const CN_DIGITS = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const UNIT_EN = {
  "公里": ["kilometre", "kilometres"],
  "千米": ["kilometre", "kilometres"],
  "小时": ["hour", "hours"],
  "分钟": ["minute", "minutes"],
  "天": ["day", "days"],
  "周": ["week", "weeks"],
  "年": ["year", "years"],
  "个月": ["month", "months"],
};


function isProperEnglish(en) {
  const value = String(en ?? "").trim();
  if (!value) return false;
  if (/^[A-Z]/.test(value)) return true;
  return PROPER_EN.has(value.toLowerCase());
}

function isPluralNoun(en) {
  const value = String(en ?? "").trim().toLowerCase();
  if (!value || value.includes(" ")) return false;
  return /[^s]s$/.test(value) && !/(ss|us|is)$/.test(value);
}

function withArticle(en) {
  const value = String(en ?? "").trim();
  if (!value) return "";
  if (/^(a|an|the|my|our|his|her|their|this|that|these|those)\b/i.test(value)) return value;
  if (isPluralNoun(value)) return `the ${value}`;
  if (/^[aeiou]/i.test(value)) return `an ${value}`;
  return `a ${value}`;
}

function findEnglishPossessivePhrase(raw, en) {
  const text = String(raw ?? "");
  if (!text || !en || hasCJK(text)) return "";
  const suffix = escapeRegExp(en);
  const patterns = [
    new RegExp(`((?:my|our|his|her|their)\\s+[a-z]+'s\\s+)${suffix}\\b`, "i"),
    new RegExp(`((?:my|our|his|her|their)\\s+)${suffix}\\b`, "i"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const phrase = match[0].trim();
    return /^(My|Our|His|Her|Their)\b/.test(phrase)
      ? phrase.charAt(0).toLowerCase() + phrase.slice(1)
      : phrase;
  }
  return "";
}

function findChineseOwner(raw, keywordZh) {
  const text = String(raw ?? "");
  const zh = String(keywordZh ?? "").trim();
  if (!text || !zh) return "";
  const pattern = new RegExp(`([\\u3400-\\u9fff]{1,4})的${escapeRegExp(zh)}`);
  const match = text.match(pattern);
  return match ? match[1] : "";
}

function ownerPrefix(ownerZh) {
  const owner = String(ownerZh ?? "").trim();
  if (!owner) return "";
  if (OWNER_POSSESSIVE[owner]) return OWNER_POSSESSIVE[owner];
  const en = ZH_EN_MAP.get(owner);
  if (!en) return "";
  if (/^(my|our|his|her|their)\b/i.test(en)) return en;
  return `my ${en}`;
}

/** 从最高权重关键词构造「主体英文名词短语」，保证首句有具体主体 */
function buildSubjectNP(keyword, type, raw, hash) {
  const en = String((keyword && keyword.en) || "").trim();
  const zh = String((keyword && keyword.zh) || "").trim();
  if (!en) return "";
  const lower = en.toLowerCase();
  if (BAD_SUBJECT_EN.has(lower)) return "";

  const englishPhrase = findEnglishPossessivePhrase(raw, en);
  if (englishPhrase) return englishPhrase;

  const owner = findChineseOwner(raw, zh);
  if (owner) {
    const prefix = ownerPrefix(owner);
    if (prefix) {
      if (prefix === "my" || prefix === "our") return `${prefix} ${en}`;
      return `${prefix}'s ${en}`;
    }
  }

  if (type === "person") {
    if (isPluralNoun(en) && /parents|relatives|children/.test(lower)) return `my ${en}`;
    if (MY_PERSON_EN.has(lower) && !isPluralNoun(en)) return `my ${en}`;
    if (isProperEnglish(en)) return en;
    if (isPluralNoun(en)) return `someone connected with ${en}`;
    return withArticle(en);
  }
  if (type === "place") {
    if (isProperEnglish(en)) return en;
    if (UNCOUNTABLE_EN.has(lower)) return `the ${en}`;
    if (ACTIVITY_EN.has(lower)) return `a place connected with ${en}`;
    return withArticle(en);
  }
  if (type === "object") {
    if (UNCOUNTABLE_EN.has(lower) || ACTIVITY_EN.has(lower) || isProperEnglish(en)) {
      return `an object connected with ${en}`;
    }
    return withArticle(en);
  }
  if (type === "media") {
    if (CONCRETE_MEDIA_EN.has(lower)) return withArticle(en);
    return `a piece of media about ${en}`;
  }
  if (type === "activity") {
    if (lower === "volunteer" || lower === "volunteers") return "volunteering";
    if (ACTIVITY_EN.has(lower) || UNCOUNTABLE_EN.has(lower) || isPluralNoun(en)) return en;
    return `something connected with ${withArticle(en)}`;
  }
  if (type === "event") {
    if (isProperEnglish(en) || ACTIVITY_EN.has(lower) || /ing$/.test(lower) || UNCOUNTABLE_EN.has(lower)) {
      return `an experience connected with ${en}`;
    }
    return `an experience connected with ${withArticle(en)}`;
  }
  return `the idea of ${en}`;
}

function chooseSubjectKeyword(keywords, type) {
  let best = null;
  let bestScore = -Infinity;
  keywords.forEach((keyword, index) => {
    if (!keyword || !keyword.en) return;
    const en = String(keyword.en).trim();
    const lower = en.toLowerCase();
    if (BAD_SUBJECT_EN.has(lower)) return;
    let score = Number(keyword.weight) || 0;
    if (type === "person" && FAMILY_PERSON_EN.has(lower)) score += 0.8;
    if ((type === "activity" || type === "event") && (ACTIVITY_EN.has(lower) || /ing$/.test(lower))) score += 0.8;
    if (type === "place" && (PLACE_EN.has(lower) || isProperEnglish(en))) score += 0.8;
    if (type === "object" && !ACTIVITY_EN.has(lower) && !isProperEnglish(en) && !PLACE_EN.has(lower)) score += 0.5;
    if (type === "media" && CONCRETE_MEDIA_EN.has(lower)) score += 0.7;
    if (Number(keyword.weight) < 0.6) score -= 1;
    if (score > bestScore) {
      bestScore = score;
      best = { ...keyword, index };
    }
  });
  return best;
}

function parseChineseNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  if (text === "半") return 0.5;
  if (/^\d+$/.test(text)) return Number(text);
  let total = 0;
  let section = 0;
  let number = 0;
  for (const ch of text) {
    if (Object.prototype.hasOwnProperty.call(CN_DIGITS, ch)) {
      number = CN_DIGITS[ch];
      continue;
    }
    if (ch === "十" || ch === "百" || ch === "千") {
      const unit = ch === "十" ? 10 : ch === "百" ? 100 : 1000;
      if (number === 0) number = 1;
      section += number * unit;
      number = 0;
      continue;
    }
    if (ch === "万") {
      section += number;
      total += section * 10000;
      section = 0;
      number = 0;
    }
  }
  return total + section + number;
}

function numberToEnglish(value) {
  const n = Math.round(Number(value) || 0);
  if (n < 20) return EN_ONES[n] || "zero";
  if (n < 100) {
    const rest = n % 10;
    return `${EN_TENS[Math.floor(n / 10)]}${rest ? `-${EN_ONES[rest]}` : ""}`;
  }
  if (n < 1000) {
    const rest = n % 100;
    return `${EN_ONES[Math.floor(n / 100)]} hundred${rest ? ` and ${numberToEnglish(rest)}` : ""}`;
  }
  if (n < 10000) {
    const rest = n % 1000;
    return `${EN_ONES[Math.floor(n / 1000)]} thousand${rest ? ` ${numberToEnglish(rest)}` : ""}`;
  }
  return String(n);
}

function extractChineseDetails(raw, type, np) {
  const text = String(raw ?? "");
  const details = [];
  const numbers = [];
  const pattern = /([0-9]+|[一二三四五六七八九十百千万两]+)\s*个?\s*(公里|千米|小时|分钟|天|周|年|个月)/g;
  let match = pattern.exec(text);
  while (match) {
    numbers.push({ value: parseChineseNumber(match[1]), unit: match[2], index: match.index });
    match = pattern.exec(text);
  }
  const distance = numbers.find((item) => item.unit === "公里" || item.unit === "千米");
  const hours = numbers.find((item) => item.unit === "小时");
  const minutes = numbers.find((item) => item.unit === "分钟");
  const years = numbers.find((item) => item.unit === "年");
  const route = text.match(/从([\u3400-\u9fff]{2,6}?)(?:骑到|开车到|坐车到|走到|飞到|到)([\u3400-\u9fff]{2,6})/);
  let routeEn = "";
  if (route) {
    const from = ZH_EN_MAP.get(route[1]);
    const to = ZH_EN_MAP.get(route[2]);
    if (from && to) routeEn = `from ${from} to ${to}`;
  }
  const cycling = /骑(?:行|到|了|车)|自行车/.test(text);

  if (distance && hours) {
    details.push(
      `It took about ${numberToEnglish(hours.value)} hours to cover ${numberToEnglish(distance.value)} kilometres${routeEn ? ` ${routeEn}` : ""}.`
    );
  } else if (distance) {
    details.push(`The route covered about ${numberToEnglish(distance.value)} kilometres${routeEn ? ` ${routeEn}` : ""}.`);
  } else if (hours) {
    details.push(`It took about ${numberToEnglish(hours.value)} hours${routeEn ? ` ${routeEn}` : ""} from start to finish.`);
  } else if (minutes) {
    details.push(`The whole thing lasted about ${numberToEnglish(minutes.value)} minutes.`);
  } else if (routeEn) {
    details.push(`I ${cycling ? "cycled" : "travelled"} ${routeEn}, and the journey was full of small surprises.`);
  }

  if (/半小时|半个小时/.test(text) && /(躲|等|停|休息)/.test(text)) {
    details.push("We sheltered under a bridge for about half an hour when the heavy rain hit.");
  } else if (/下雨|大雨|暴雨/.test(text)) {
    details.push("We had to wait for a while when the heavy rain started.");
  }

  if (years && years.value >= 5 && type !== "event" && type !== "place" && type !== "media") {
    details.push(`It has been part of my life for about ${numberToEnglish(years.value)} years.`);
  }

  if (/(校服|衬衫|衣服)/.test(text) && /(缝|补|针线)/.test(text)) {
    const pronoun = /外婆|奶奶|妈妈|她/.test(text) ? "She" : "This person";
    details.push(`${pronoun} mended clothes for the whole family, including my school uniform.`);
  }

  if (/照片/.test(text) && /(盒|里面|里头)/.test(text)) {
    const objectPronoun = /外婆|奶奶|妈妈|她/.test(text) ? "her" : "the person";
    details.push(`There is an old photo of ${objectPronoun} when she was young inside it.`);
  }

  if (/冰粉/.test(text)) details.push("We stopped for a bowl of local ice jelly from a street vendor.");
  if (/(腿|终点)/.test(text) && /(抖|软|酸)/.test(text)) {
    details.push("By the end my legs were shaking, but I felt genuinely proud.");
  }
  if (/露营/.test(text)) details.push("We set up a tent and spent the night outdoors.");
  if (/徒步/.test(text)) details.push("We walked for hours along a narrow mountain path.");
  if (/(每周|每天|坚持|习惯|定期)/.test(text)) {
    details.push("I try to keep this routine every week, even when I am busy.");
  }
  if (/(摄影|拍照)/.test(text)) details.push("I took a lot of photos to remember the places I passed.");

  const out = [];
  for (const detail of details) {
    const cleaned = cleanEnglish(detail);
    if (!cleaned) continue;
    if (out.some((existing) => isSamePoint(existing, cleaned))) continue;
    out.push(cleaned);
  }
  return out.slice(0, 3);
}

function rewriteEnglishDetail(sentence) {
  let out = cleanEnglish(sentence);
  out = out.replace(/^(and|but|so|because|then)\s+/i, "");
  out = cleanEnglish(out);
  if (!out) return "";
  if (/^(fixing|making|taking|learning|helping|riding|running|cooking|playing|visiting|keeping|cleaning|repairing)\b/i.test(out)) {
    out = cleanEnglish(`I remember ${out.charAt(0).toLowerCase()}${out.slice(1)}`);
  }
  return out;
}

function extractEnglishDetails(sentences, usedSentence) {
  const out = [];
  for (const sentence of sentences || []) {
    if (!sentence) continue;
    if (usedSentence && isSamePoint(sentence, usedSentence)) continue;
    if (/To begin with|What makes it stand out is|Looking back|So that's why/i.test(sentence)) continue;
    const rewritten = rewriteEnglishDetail(sentence);
    if (!rewritten) continue;
    if (out.some((existing) => isSamePoint(existing, rewritten))) continue;
    out.push(rewritten);
  }
  return out.slice(0, 3);
}

function buildContext(rawInput, hash, type, topics, keywords) {
  const primary = topics[0] && topics[0].id !== "general" ? TOPIC_BY_ID.get(topics[0].id) : null;
  const secondary = topics[1] && topics[1].id !== "general" ? TOPIC_BY_ID.get(topics[1].id) : null;
  const template = TYPE_TEMPLATES[type] || TYPE_TEMPLATES.idea;
  const collocationPool =
    primary && primary.collocations.length ? primary.collocations : GENERAL_TOPIC.collocations;
  const colloc1 = pickByHash(collocationPool, hash, "colloc-1");
  let colloc2 = pickByHash(collocationPool, hash, "colloc-2");
  if (colloc2 === colloc1 && collocationPool.length > 1) {
    colloc2 = collocationPool[(collocationPool.indexOf(colloc1) + 1) % collocationPool.length];
  }
  const lexicalPool = [
    ...(primary ? primary.lexical : []),
    ...(secondary ? secondary.lexical : []),
  ];
  const lexical = pickManyByHash(lexicalPool.length ? lexicalPool : GENERAL_TOPIC.lexical, hash, "lexical", 5).map(
    (item) => ({ term: item.term, cn: item.cn, example: item.example })
  );

  const englishSentences = extractEnglishSentences(rawInput);
  const subjectKeyword = chooseSubjectKeyword(keywords, type);
  const subjectNp = buildSubjectNP(subjectKeyword, type, rawInput, hash);
  const np = subjectNp || pickByHash(FALLBACK_NPS[type] || FALLBACK_NPS.idea, hash, `np-${type}`);
  const p1English = englishSentences.length >= 2 ? englishSentences[0] : null;
  const details = [];
  const addDetail = (detail) => {
    if (!detail) return;
    if (details.some((existing) => isSamePoint(existing, detail))) return;
    details.push(detail);
  };
  if (hasCJK(rawInput)) {
    for (const detail of extractChineseDetails(rawInput, type, np)) addDetail(detail);
    for (const detail of extractEnglishDetails(englishSentences, p1English)) addDetail(detail);
  } else {
    for (const detail of extractEnglishDetails(englishSentences, p1English)) addDetail(detail);
  }

  return {
    rawInput,
    hash,
    type,
    topics,
    keywords,
    template,
    primary,
    secondary,
    collocationPool,
    colloc1,
    colloc2,
    reasons: primary ? primary.reasons : GENERAL_TOPIC.reasons,
    feelings: primary ? primary.feelings : GENERAL_TOPIC.feelings,
    abstracts: primary ? primary.abstracts : GENERAL_TOPIC.abstracts,
    lexical: lexical.length ? lexical : GENERAL_TOPIC.lexical.slice(0, 5),
    np,
    subjectEn: (subjectKeyword && subjectKeyword.en) || "",
    personEn:
      detectPersonEn(rawInput) ||
      (type === "person" && subjectKeyword && subjectKeyword.en) ||
      "",
    pronoun: detectPronoun(rawInput),
    englishSentences,
    p1English,
    details: details.slice(0, 3),
  };
}

function buildCandidates(part, ctx) {
  const variantIndex = hash32(`${ctx.rawInput}|${part}|${ctx.type}`) % ctx.template[part].length;
  const variant = ctx.template[part][variantIndex].map((sentence) => fillSentence(sentence, ctx));
  const reason = pickByHash(ctx.reasons, ctx.hash, `${part}-reason`);
  const feeling = pickByHash(ctx.feelings, ctx.hash, `${part}-feeling`);
  const abstract = pickByHash(ctx.abstracts, ctx.hash, `${part}-abstract`);
  const pads = (ctx.template.pad && ctx.template.pad[part]) || [];
  const candidates = [];

  if (part === "p1") {
    candidates.push({ text: variant[0], mandatory: true });
    candidates.push({ text: variant[1], mandatory: true });
    candidates.push({ text: variant[2], mandatory: true });
    if (ctx.p1English) candidates.push({ text: ctx.p1English, mandatory: false });
    candidates.push({
      text: fillSentence(P1_COLLOC_FRAME[ctx.type] || P1_COLLOC_FRAME.idea, ctx),
      mandatory: false,
    });
    candidates.push({ text: feeling, mandatory: false });
    for (const pad of pads) candidates.push({ text: pad, mandatory: false });
  } else if (part === "p2") {
    candidates.push({ text: variant[0], mandatory: true });
    candidates.push({ text: variant[1], mandatory: true });
    candidates.push({ text: fillSentence(P2_CONN.begin, ctx), mandatory: true });
    if (ctx.details[0]) candidates.push({ text: ctx.details[0], mandatory: true });
    if (ctx.details[1]) candidates.push({ text: ctx.details[1], mandatory: false });
    candidates.push({ text: variant[2], mandatory: true });
    candidates.push({ text: fillSentence(P2_CONN.stand, ctx), mandatory: true });
    candidates.push({ text: reason, mandatory: true });
    candidates.push({ text: feeling, mandatory: true });
    candidates.push({ text: fillSentence(P2_CONN.link, ctx), mandatory: false });
    candidates.push({ text: fillSentence(P2_CONN.look, ctx), mandatory: true });
    candidates.push({ text: fillSentence(P2_CONN.why, ctx), mandatory: true });
    for (const pad of pads) candidates.push({ text: pad, mandatory: false });
  } else {
    candidates.push({ text: variant[0], mandatory: true });
    candidates.push({ text: variant[1], mandatory: true });
    candidates.push({ text: variant[2], mandatory: true });
    candidates.push({ text: reason, mandatory: true });
    candidates.push({ text: fillSentence(P2_CONN.p3, ctx), mandatory: false });
    candidates.push({ text: abstract, mandatory: true });
    for (const pad of pads) candidates.push({ text: pad, mandatory: false });
  }

  return candidates
    .filter((candidate) => candidate.text)
    .map((candidate, index) => ({ ...candidate, index }));
}

function assemblePart(part, candidates) {
  const [low, high] = WORD_RANGES[part];
  const target = WORD_TARGETS[part];
  const chosen = [];
  let words = 0;

  // 5.1 按候选顺序累加，达到目标值就停
  for (const candidate of candidates) {
    if (words >= target) break;
    const size = countWords(candidate.text);
    if (words + size <= high) {
      chosen.push(candidate);
      words += size;
    }
  }

  // 5.2 强制补齐标记为 mandatory 的句子（连接词、感受句等）
  for (const candidate of candidates) {
    if (!candidate.mandatory || chosen.includes(candidate)) continue;
    const size = countWords(candidate.text);
    if (words + size <= high) {
      chosen.push(candidate);
      words += size;
      continue;
    }
    // 空间不够时先移除最后一条非必需句，再尝试
    for (let i = chosen.length - 1; i >= 0; i -= 1) {
      if (chosen[i].mandatory) continue;
      words -= countWords(chosen[i].text);
      chosen.splice(i, 1);
      break;
    }
    if (words + size <= high) {
      chosen.push(candidate);
      words += size;
    }
  }

  // 5.3 仍然太短时继续补（通常不会走到这里）
  for (const candidate of candidates) {
    if (words >= low) break;
    if (chosen.includes(candidate)) continue;
    const size = countWords(candidate.text);
    if (words + size <= high) {
      chosen.push(candidate);
      words += size;
    }
  }

  // 5.4 太长时删掉最后一句可选句
  while (words > high) {
    let removed = false;
    for (let i = chosen.length - 1; i >= 0; i -= 1) {
      if (chosen[i].mandatory) continue;
      words -= countWords(chosen[i].text);
      chosen.splice(i, 1);
      removed = true;
      break;
    }
    if (!removed) break;
  }

  chosen.sort((a, b) => a.index - b.index);
  const sentences = [];
  for (const candidate of chosen) {
    const sentence = cleanEnglish(candidate.text);
    if (!sentence) continue;
    if (sentences.some((existing) => isSamePoint(existing, sentence))) continue;
    sentences.push(sentence);
  }
  return sentences.join(" ");
}

/** 自动修补：不足补一句、超出删一句；最后断言词数合法 */
const FILLERS = {
  p1: [
    "There are also smaller details that I have not forgotten.",
    "I suppose that is what makes it feel personal.",
    "It is difficult to explain fully, but the feeling is still clear.",
    "The memory has stayed with me much longer than I expected.",
    "I would not change that part of my life.",
    "Even now, the small details come back to me quite easily.",
  ],
  p2: [
    "There are also smaller details that I have not forgotten.",
    "The memory has stayed with me much longer than I expected.",
    "I did not realise at the time how much that moment would matter.",
    "It is the kind of detail that becomes clearer with age.",
    "I would not change that part of my life.",
    "The people involved made the whole thing feel effortless.",
    "Even now, I can picture the scene quite clearly.",
  ],
  p3: [
    "This is why the issue deserves more careful discussion.",
    "The answer is rarely simple, and that is part of the difficulty.",
    "In the end, both sides have something important to say.",
    "A balanced view is more useful than a quick judgement.",
    "That tension is exactly what makes the question interesting.",
    "The same principle applies to many other areas of life.",
  ],
};

/** 最终的硬性兜底：只补安全句 / 删最后一句，任何情况下都不抛错 */
function hardFit(part, text) {
  const [low, high] = WORD_RANGES[part];
  const sentences = splitEnglishSentences(sanitizeEnglish(text));
  let words = countWords(sentences.join(" "));
  const fillers = FILLERS[part] || [];
  let index = 0;
  while (words < low && index < fillers.length) {
    const candidate = cleanEnglish(fillers[index]);
    index += 1;
    if (!candidate) continue;
    if (connectorKeyOf(candidate) >= 0) continue;
    if (sentences.some((existing) => isSamePoint(existing, candidate))) continue;
    const size = countWords(candidate);
    if (size > 0 && words + size <= high) {
      sentences.push(candidate);
      words += size;
    }
  }
  while (words > high && sentences.length > 1) {
    let removed = false;
    for (let i = sentences.length - 1; i >= 1; i -= 1) {
      const size = countWords(sentences[i]);
      if (words - size >= low) {
        sentences.splice(i, 1);
        words -= size;
        removed = true;
        break;
      }
    }
    if (!removed) break;
  }
  return sanitizeEnglish(sentences.join(" "));
}

function repairToRange(text, part, spare) {
  const [low, high] = WORD_RANGES[part];
  const sentences = splitEnglishSentences(sanitizeEnglish(text));
  let words = countWords(sentences.join(" "));
  let index = 0;
  while (words < low && index < spare.length) {
    const candidate = cleanEnglish(spare[index]);
    index += 1;
    if (!candidate) continue;
    if (connectorKeyOf(candidate) >= 0) continue;
    if (sentences.some((existing) => isSamePoint(existing, candidate))) continue;
    const size = countWords(candidate);
    if (size > 0 && words + size <= high) {
      sentences.push(candidate);
      words += size;
    }
  }
  while (words > high && sentences.length > 1) {
    const removed = sentences[sentences.length - 1];
    const size = countWords(removed);
    if (words - size < low) break;
    sentences.pop();
    words -= size;
  }
  const out = cleanEnglish(sentences.join(" "));
  return hardFit(part, out);
}

function composePart(part, ctx) {
  const candidates = buildCandidates(part, ctx);
  const draft = sanitizeEnglish(assemblePart(part, candidates));
  const spare = [
    ...((ctx.template.pad && ctx.template.pad[part]) || []),
    pickByHash(ctx.feelings, ctx.hash, `${part}-spare-feel`),
    pickByHash(ctx.reasons, ctx.hash, `${part}-spare-reason`),
    pickByHash(ctx.abstracts, ctx.hash, `${part}-spare-abstract`),
  ];
  return repairToRange(draft, part, spare);
}

/* ------------------------------------------------------------
 * 6. analyze：完整草稿
 * ------------------------------------------------------------ */

function buildDraft(rawInput, forcedType) {
  const cleanedInput = String(rawInput ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  const hash = hash32(cleanedInput);
  const topics = detectTopics(cleanedInput);
  const detectedType =
    forcedType && TYPE_LABELS[forcedType]
      ? { type: forcedType, label: TYPE_LABELS[forcedType], scores: { [forcedType]: 0.6 } }
      : detectType(cleanedInput);
  const keywords = extractKeywords(cleanedInput);
  const points = buildPoints(cleanedInput, {
    topics,
    keywords,
    type: detectedType.type,
    typeLabel: detectedType.label,
  });
  const title = makeTitle(cleanedInput, detectedType.type);
  const ctx = buildContext(cleanedInput, hash, detectedType.type, topics, keywords);
  const english = {
    p1: composePart("p1", ctx),
    p2: composePart("p2", ctx),
    p3: composePart("p3", ctx),
  };
  const wordCount = {
    p1: countWords(english.p1),
    p2: countWords(english.p2),
    p3: countWords(english.p3),
  };

  const topScore = topics[0] && topics[0].id !== "general" ? topics[0].score : 0;
  const confidence = round2(
    clamp(
      0.34 + topScore * 0.32 + Math.min(1, keywords.length / 8) * 0.2 + (detectedType.scores[detectedType.type] || 0) * 0.16,
      0.35,
      0.96
    )
  );

  return {
    title,
    type: detectedType.type,
    typeLabel: detectedType.label,
    rawInput: cleanedInput,
    points,
    keywords,
    topics,
    english,
    lexical: ctx.lexical,
    collocations: (ctx.primary ? ctx.primary.collocations : GENERAL_TOPIC.collocations).slice(0, 6),
    frames: (ctx.template.frames || []).slice(0, 5),
    outline: (ctx.template.outline || []).slice(0, 6),
    upgrades: upgradePhrases(cleanedInput),
    confidence,
    wordCount,
  };
}

/**
 * 分析输入，返回可直接保存的草稿（不含 id / 时间戳）。
 * @param {string} input 用户的中文 / 英文 / 中英混合笔记
 * @returns {object} Draft
 */
export function analyze(input) {
  return buildDraft(input);
}

/* ------------------------------------------------------------
 * 7. 相似度 / 相近素材 / 合并
 * ------------------------------------------------------------ */

function topicsOf(material) {
  const source = material && Array.isArray(material.topics) && material.topics.length
    ? material.topics
    : detectTopics(material && material.rawInput);
  return new Set(source.map((topic) => topic && topic.id).filter((id) => id && id !== "general"));
}

function keywordSetOf(material) {
  const set = new Set();
  const keywords = material && Array.isArray(material.keywords) && material.keywords.length
    ? material.keywords
    : extractKeywords(material && material.rawInput);
  for (const keyword of keywords) {
    if (!keyword) continue;
    if (keyword.zh) set.add(`zh:${normalizePointText(keyword.zh)}`);
    if (keyword.en) {
      for (const token of normalizeToken(keyword.en).split(" ")) {
        if (token) set.add(`en:${token}`);
      }
    }
  }
  return set;
}

function jaccardOfSets(a, b) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

/**
 * 相似度 0–1：0.45 * 主题 Jaccard + 0.40 * 关键词 Jaccard + 0.15 * 类型匹配。
 * @param {object} a material 或 draft
 * @param {object} b material 或 draft
 * @returns {number}
 */
export function similarity(a, b) {
  if (!a || !b) return 0;
  const topicScore = jaccardOfSets(topicsOf(a), topicsOf(b));
  const keywordScore = jaccardOfSets(keywordSetOf(a), keywordSetOf(b));
  const leftType = a.type || detectType(a.rawInput).type;
  const rightType = b.type || detectType(b.rawInput).type;
  const typeScore = leftType && rightType && leftType === rightType ? 1 : 0;
  return round2(0.45 * topicScore + 0.4 * keywordScore + 0.15 * typeScore);
}

function sharedTopicLabels(a, b) {
  const left = topicsOf(a);
  const right = topicsOf(b);
  const labels = [];
  for (const id of left) {
    if (!right.has(id)) continue;
    const topic = TOPIC_BY_ID.get(id);
    if (topic) labels.push(topic.label);
  }
  return labels;
}

function sharedKeywordLabels(a, b) {
  const labels = [];
  const right = keywordSetOf(b);
  const keywords = a && Array.isArray(a.keywords) && a.keywords.length
    ? a.keywords
    : extractKeywords(a && a.rawInput);
  for (const keyword of keywords) {
    if (!keyword) continue;
    const zhKey = keyword.zh ? `zh:${normalizePointText(keyword.zh)}` : "";
    const enKeys = normalizeToken(keyword.en).split(" ").filter(Boolean).map((token) => `en:${token}`);
    if ((zhKey && right.has(zhKey)) || enKeys.some((key) => right.has(key))) {
      const label = keyword.zh || keyword.en;
      if (label && !labels.includes(label)) labels.push(label);
    }
  }
  return labels;
}

/**
 * 找相近素材；每个结果带中文原因。
 * @param {object} candidate
 * @param {object[]} list
 * @param {number} [threshold=0.45]
 * @returns {{material:object,score:number,reasons:string[]}[]}
 */
export function similarMaterials(candidate, list, threshold = 0.45) {
  if (!candidate || !Array.isArray(list)) return [];
  const results = [];
  for (const material of list) {
    if (!material) continue;
    if (candidate.id && material.id && candidate.id === material.id) continue;
    const score = similarity(candidate, material);
    if (score < threshold) continue;
    const reasons = [];
    const topics = sharedTopicLabels(candidate, material);
    if (topics.length) reasons.push(`同属「${topics.join("、")}」主题`);
    const keywords = sharedKeywordLabels(candidate, material);
    if (keywords.length) reasons.push(`共享关键词：${keywords.slice(0, 3).join("、")}`);
    const candidateType = candidate.type || detectType(candidate.rawInput).type;
    const materialType = material.type || detectType(material.rawInput).type;
    if (candidateType && materialType && candidateType === materialType) {
      reasons.push(`类型相同：${TYPE_LABELS[candidateType] || candidateType}`);
    }
    reasons.push(`整体相似度 ${Math.round(score * 100)}%，建议合并`);
    results.push({ material, score, reasons });
  }
  return results.sort((a, b) => b.score - a.score || String(a.material.id || "").localeCompare(String(b.material.id || "")));
}

function mergePointLists(left, right, fallback) {
  const all = [...(left || []), ...(right || []), ...(fallback || [])].filter(
    (point) => typeof point === "string" && point.trim()
  );
  const out = [];
  for (const rawPoint of all) {
    if (out.length >= 8) break;
    const point = cleanPointText(rawPoint);
    if (isMetaPoint(point)) continue;
    const existingIndex = out.findIndex((item) => isSamePoint(item, point));
    if (existingIndex >= 0) {
      // 两边都提到的同一件事，保留更具体（更长）的一条
      if (point.length > out[existingIndex].length) out[existingIndex] = point;
      continue;
    }
    out.push(point);
  }
  return out;
}

function mergeKeywordLists(left, right) {
  const map = new Map();
  for (const keyword of [...(left || []), ...(right || [])]) {
    if (!keyword) continue;
    const key = normalizeToken(keyword.zh || keyword.en);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        zh: keyword.zh || "",
        en: keyword.en || "",
        weight: Number(keyword.weight) || 0.5,
      });
      continue;
    }
    if (!existing.zh && keyword.zh) existing.zh = keyword.zh;
    if (!existing.en && keyword.en) existing.en = keyword.en;
    existing.weight = Math.max(existing.weight, Number(keyword.weight) || 0.5);
  }
  return Array.from(map.values())
    .sort((a, b) => b.weight - a.weight || String(a.zh).localeCompare(String(b.zh)))
    .slice(0, 12)
    .map((keyword) => ({ zh: keyword.zh, en: keyword.en, weight: round2(keyword.weight) }));
}

function uniqueByTitle(records) {
  const out = [];
  const seen = new Set();
  for (const record of records) {
    if (!record || !record.title) continue;
    const key = `${record.title}|${record.at || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: record.title, at: record.at || "" });
  }
  return out;
}

/**
 * 归纳合并：保留 keep，吸收 absorb，返回新的完整 material。
 * 保留 keep.id / keep.createdAt / keep.title；原文拼接后重新生成英文。
 * @param {object} keep
 * @param {object} absorb
 * @returns {object}
 */
export function mergeMaterials(keep, absorb) {
  const left = keep || {};
  const right = absorb || {};
  const rawInput = [left.rawInput, right.rawInput].filter((part) => part && String(part).trim()).join("\n\n【并入】\n");
  const mergedDraft = buildDraft(rawInput, left.type || undefined);
  const now = new Date().toISOString();
  const mergedFrom = uniqueByTitle([
    ...(Array.isArray(left.mergedFrom) ? left.mergedFrom : []),
    ...(Array.isArray(right.mergedFrom) ? right.mergedFrom : []),
    { title: right.title || mergedDraft.title, at: now },
  ]);
  const titles = [];
  for (const title of [left.title, ...mergedFrom.map((record) => record.title)]) {
    if (title && !titles.includes(title)) titles.push(title);
  }

  const merged = {
    ...mergedDraft,
    id: left.id,
    title: left.title || mergedDraft.title,
    rawInput,
    createdAt: left.createdAt,
    updatedAt: now,
    points: mergePointLists(left.points, right.points, mergedDraft.points),
    keywords: mergeKeywordLists(left.keywords, right.keywords),
    topics: detectTopics(rawInput),
    mergedFrom,
    mergeNote: `归纳自：${titles.join("、")}`,
  };
  if (merged.points.length === 0) merged.points = mergedDraft.points;
  return merged;
}

/**
 * 给一条 material 重新生成英文素材（用于内容追加后刷新）。
 * 保留 id / createdAt / title / mergedFrom / mergeNote。
 * @param {object} material
 * @returns {object}
 */
export function recompose(material) {
  const source = material || {};
  const draft = buildDraft(source.rawInput, source.type || undefined);
  const out = {
    ...draft,
    title: source.title || draft.title,
  };
  if (source.id) out.id = source.id;
  if (source.createdAt) out.createdAt = source.createdAt;
  if (source.updatedAt) out.updatedAt = source.updatedAt;
  if (Array.isArray(source.mergedFrom) && source.mergedFrom.length) {
    out.mergedFrom = source.mergedFrom.map((record) => ({ ...record }));
  } else {
    out.mergedFrom = [];
  }
  out.mergeNote = source.mergeNote || "";
  return out;
}

/* ------------------------------------------------------------
 * 8. 真题匹配
 * ------------------------------------------------------------ */

function keywordTokensOf(material) {
  const tokens = new Set();
  const keywords = material && Array.isArray(material.keywords) && material.keywords.length
    ? material.keywords
    : extractKeywords(material && material.rawInput);
  for (const keyword of keywords) {
    if (!keyword || !keyword.en) continue;
    for (const token of normalizeToken(keyword.en).split(" ")) {
      if (token.length >= 3 && !STOP_EN.has(token)) tokens.add(token);
    }
  }
  return tokens;
}

/**
 * 匹配真题；questions: [{id, part, category, question}]。
 * @param {object} material
 * @param {object[]} questions
 * @param {number} [limit=6]
 * @returns {{id:string,part:number|string,category:string,question:string,score:number,reason:string}[]}
 */
export function matchQuestions(material, questions, limit = 6) {
  const source = material || {};
  const list = Array.isArray(questions) ? questions : [];
  const topics = topicsOf(source);
  const directTokens = keywordTokensOf(source);
  // 素材主题自带的常用词只做弱匹配（如 culture → tradition / heritage）
  const topicTokens = new Set();
  for (const id of topics) {
    const topic = TOPIC_BY_ID.get(id);
    if (!topic) continue;
    for (const [, en] of topic.keywords.slice(0, 12)) {
      for (const token of normalizeToken(en).split(" ")) {
        if (token.length >= 3 && !STOP_EN.has(token) && !directTokens.has(token)) topicTokens.add(token);
      }
    }
  }
  const results = [];

  for (const question of list) {
    if (!question || !question.question) continue;
    const questionLower = String(question.question).toLowerCase();
    const questionTokens = new Set(questionLower.match(/[a-z][a-z'-]{2,}/g) || []);
    const matchedDirect = Array.from(directTokens).filter((token) => questionTokens.has(token));
    const matchedTopic = Array.from(topicTokens).filter((token) => questionTokens.has(token));
    const matched = [...matchedDirect, ...matchedTopic];
    const overlapScore = Math.min(1, matchedDirect.length / 2 + matchedTopic.length / 4);
    const categoryTopics = CATEGORY_TOPICS[question.category] || [];
    const topicHits = categoryTopics.filter((id) => topics.has(id));
    const catHit = topicHits.length > 0;
    const typeHit = (TYPE_CATEGORIES[source.type] || []).includes(question.category);
    const score = round2(
      clamp(
        0.08 + 0.38 * overlapScore + 0.32 * (catHit ? 1 : 0) + 0.22 * (typeHit ? 1 : 0),
        0,
        0.99
      )
    );
    if (score < 0.18) continue;

    const reasons = [];
    if (matched.length) reasons.push(`命中关键词：${matched.slice(0, 3).join("、")}`);
    if (catHit) {
      const labels = topicHits
        .map((id) => TOPIC_BY_ID.get(id))
        .filter(Boolean)
        .map((topic) => topic.label);
      reasons.push(`主题「${labels.join("、")}」与题目类别「${question.category}」相近`);
    }
    if (typeHit) {
      reasons.push(`素材类型「${TYPE_LABELS[source.type] || source.type}」与题目类别「${question.category}」匹配`);
    }
    if (!reasons.length) reasons.push("题干与素材内容存在弱关联");

    results.push({
      id: question.id,
      part: question.part,
      category: question.category,
      question: question.question,
      score,
      reason: reasons.join("；"),
    });
  }

  return results
    .sort(
      (a, b) =>
        b.score - a.score ||
        (Number(a.part) || 0) - (Number(b.part) || 0) ||
        String(a.id).localeCompare(String(b.id))
    )
    .slice(0, Math.max(0, limit));
}

/* ------------------------------------------------------------
 * 9. 复制到外部 AI 的润色提示词
 * ------------------------------------------------------------ */

/**
 * 生成「交给 ChatGPT / DeepSeek 润色」的中文提示词（可直接整段复制）。
 * @param {object} material
 * @returns {string}
 */
export function buildPolishPrompt(material) {
  const source = material || {};
  const rawInput = String(source.rawInput || "").trim();
  const points = Array.isArray(source.points) && source.points.length ? source.points : [];
  const english = source.english || {};
  const topics = Array.isArray(source.topics)
    ? source.topics.map((topic) => topic.label || topic.id).filter(Boolean)
    : [];
  const keywords = Array.isArray(source.keywords)
    ? source.keywords
        .map((keyword) => {
          if (!keyword) return "";
          const en = keyword.en || "";
          const zh = keyword.zh || "";
          if (zh && en) return `${zh} / ${en}`;
          return zh || en;
        })
        .filter(Boolean)
    : [];
  const wordCounts = source.wordCount || {
    p1: countWords(english.p1),
    p2: countWords(english.p2),
    p3: countWords(english.p3),
  };
  const pointLines = points.length ? points.map((point, index) => `${index + 1}. ${point}`).join("\n") : "（暂无）";
  const keywordLine = keywords.length ? keywords.join("；") : "（暂无）";
  const topicLine = topics.length ? topics.join("、") : "通用";

  return [
    "你是一名雅思口语考官兼口语教练。下面是我自己的一条素材笔记，请帮我把它改写成可以直接背诵的 Band 8 口语素材。",
    "",
    "【原始输入】",
    rawInput || "（暂无）",
    "",
    "【中文要点】",
    pointLines,
    "",
    "【本地引擎已生成的英文骨架】",
    `Part 1（${wordCounts.p1} 词）：${english.p1 || ""}`,
    "",
    `Part 2（${wordCounts.p2} 词）：${english.p2 || ""}`,
    "",
    `Part 3（${wordCounts.p3} 词）：${english.p3 || ""}`,
    "",
    "【主题与关键词】",
    `主题：${topicLine}`,
    `关键词：${keywordLine}`,
    "",
    "【要求】",
    "1. 请重写为 Band 8 口语素材，保留我的真实细节，不要编造新的人名或事件。",
    "2. Part 1 控制在 55–85 词，Part 2 控制在 165–205 词，Part 3 控制在 90–120 词，语法必须正确，表达要口语自然。",
    "3. 请给出 10 个话题词汇（英文 + 词性 + 中文 + 一个例句），并额外列出 3 个可替换的高分表达。",
    "4. 用 Markdown 输出：先分 P1 / P2 / P3 三段，再附词汇表；不要输出与素材无关的通用模板。",
  ].join("\n");
}

/* ------------------------------------------------------------
 * 10. 表达升级
 * ------------------------------------------------------------ */

/**
 * 检测可升级的简单表达，返回 0–5 条。
 * @param {string} text
 * @returns {{from:string,to:string}[]}
 */
export function upgradePhrases(text) {
  const lower = String(text ?? "").toLowerCase();
  if (!lower) return [];
  const found = [];
  for (const upgrade of EN_UPGRADES) {
    if (found.length >= 5) break;
    const from = String(upgrade.from || "").toLowerCase();
    if (!from) continue;
    // 长短语优先；已经被更长表达覆盖的短词不再重复提示
    if (found.some((item) => item.from.toLowerCase().includes(from))) continue;
    const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(from)}(?:$|[^a-z0-9])`, "i");
    if (pattern.test(lower)) found.push({ from: upgrade.from, to: upgrade.to });
  }
  return found;
}
