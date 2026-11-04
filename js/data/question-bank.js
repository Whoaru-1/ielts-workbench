/* ============================================================
 * question-bank.js — 口语题库统一索引（原始题库 + 2026 扩充题）
 * 供「个人素材」模块做真题匹配，避免各模块重复拼装
 * ============================================================ */
import part1 from "./speaking-part1.js";
import part2 from "./speaking-part2.js";
import part3 from "./speaking-part3.js";
import part1New from "./speaking-part1-2026.js";
import part2New from "./speaking-part2-2026.js";
import part3New from "./speaking-part3-2026.js";

export const QUESTION_BANK = [
  ...part1New.map((q) => ({ ...q, part: 1 })),
  ...part1.map((q) => ({ ...q, part: 1 })),
  ...part2New.map((q) => ({ ...q, part: 2 })),
  ...part2.map((q) => ({ ...q, part: 2 })),
  ...part3New.map((q) => ({ ...q, part: 3 })),
  ...part3.map((q) => ({ ...q, part: 3 })),
];

export const QUESTION_COUNT = {
  part1: part1.length + part1New.length,
  part2: part2.length + part2New.length,
  part3: part3.length + part3New.length,
  total: part1.length + part2.length + part3.length + part1New.length + part2New.length + part3New.length,
  fresh: part1New.length + part2New.length + part3New.length,
};
