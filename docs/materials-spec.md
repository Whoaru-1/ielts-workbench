# 个人素材模块（Personal Material Studio）· 技术契约与设计规范

> 目标：让用户把自己零散的中文/英文笔记**输入**进来，模块自动完成：
> **识别主题 → 提取关键词 → 生成英文高分素材（P1/P2/P3）→ 匹配相关真题 → 把主题相近的素材归纳成一条**。
> 全部离线、纯前端、无第三方依赖、无网络请求。

## 0. 分工与文件所有权

| 角色 | 只允许改这些文件 |
|---|---|
| Lead | `js/store.js`、`js/app.js`、`index.html`、`js/ui.js`、`js/modules/speaking.js`、`README.md`、`docs/*`、`scripts/verify-speaking.mjs` |
| 引擎开发 | `js/data/material-lexicon.js`、`js/data/material-engine.js`、`js/data/material-seeds.js`、`scripts/selftest-materials.mjs` |
| UI 开发 | `js/modules/materials.js`、`css/materials.css` |
| 写手 | `js/data/speaking-*-2026.js`、`js/data/answers-speaking-*-2026.js` |

**不要修改别人负责的文件。** 需要 Lead 改动（路由、store、图标）时，在交付说明里写清楚。

## 1. 数据模型

```js
// localStorage 中的 material（由 store.js 持久化）
{
  id: "m_xxx",
  title: "外婆的针线盒",
  type: "object",              // person|place|object|event|activity|media|idea
  typeLabel: "物品",
  rawInput: "用户输入的原文（合并后保留全部原文）",
  points: ["中文要点1", "中文要点2"],       // 2–6 条
  keywords: [{ zh: "外婆", en: "grandmother" }],
  topics: [{ id: "culture", label: "文化", score: 0.82 }],
  english: { p1: "...", p2: "...", p3: "..." },
  lexical: [{ term: "hand down", cn: "传承", example: "..." }],
  collocations: ["a family heirloom", "..."],
  frames: ["What makes it stand out is ..."],
  outline: ["开场：点明对象/时间", "细节：..."],
  upgrades: [{ from: "very good", to: "exceptional" }],
  confidence: 0.76,
  wordCount: { p1: 68, p2: 188, p3: 104 },
  mergeNote: "",               // 例如「归纳自：外婆的针线盒、外婆教我包粽子」
  mergedFrom: [{ title: "外婆教我包粽子", at: "2026-11-04T..." }],
  createdAt: "...", updatedAt: "..."
}
```

## 2. 引擎 API（`js/data/material-engine.js`）

纯函数、可重入、无 DOM、无网络。所有函数导出如下（签名与返回结构不可改，UI 依赖）：

```js
/** 分析输入，返回可直接保存的草稿（不含 id/时间戳） */
export function analyze(input) -> Draft

/** 主题识别，按得分降序，最多 3 条；无匹配时返回 [{id:'general',label:'通用',score:0.3}] */
export function detectTopics(text) -> [{ id, label, score }]

/** 类型识别 */
export function detectType(text) -> { type, label, scores }

/** 关键词（1–12 个，只取输入里真实出现的词，尽量带英文） */
export function extractKeywords(text) -> [{ zh, en, weight }]

/** 相似度 0–1 */
export function similarity(a, b) -> number   // a/b: material 或 draft

/** 找相近素材；每个结果带原因 */
export function similarMaterials(candidate, list, threshold = 0.45) -> [{ material, score, reasons: [string] }]

/** 归纳合并：保留 keep，吸收 absorb，返回新的完整 material（保留 keep.id/createdAt） */
export function mergeMaterials(keep, absorb) -> material

/** 给一条 material 重新生成英文素材（用于内容追加后刷新） */
export function recompose(material) -> material

/** 匹配真题；questions: [{id, part, category, question}] */
export function matchQuestions(material, questions, limit = 6) -> [{ id, part, category, question, score, reason }]

/** 生成「交给 ChatGPT/DeepSeek 润色」的中文提示词 */
export function buildPolishPrompt(material) -> string

/** 检测可升级的简单表达，返回 [{from,to}]（0–5 条） */
export function upgradePhrases(text) -> [{ from, to }]

export const TOPICS // 12 个话题元数据，供 UI 下拉/筛选
export const TYPES  // [{id,label}]，供 UI 类型下拉
```

### Draft 结构（`analyze` 返回）

```js
{
  title, type, typeLabel, rawInput,
  points, keywords, topics,
  english: { p1, p2, p3 },
  lexical, collocations, frames, outline, upgrades,
  confidence, wordCount: { p1, p2, p3 }
}
```

### 字数目标（硬性）

- `english.p1`：55–85 词（Part 1 长度）
- `english.p2`：165–205 词（Part 2 长度）
- `english.p3`：90–120 词（Part 3 长度）

## 3. 语言能力实现要求（引擎开发）

### 3.1 词库 `material-lexicon.js`

- 关键词只从输入原文中提取，**不得为了凑数编造**（如"经历/感受/变化"）。
- `TOPICS` 12 个，与现有词库标签一致：education/教育、environment/环境、technology/科技、health/健康、society/社会、work/工作、economy/经济、culture/文化、science/科学、travel/旅行、government/政府、media/媒体。
- 每个话题至少：
  - 18 个中英关键词（中英混合，覆盖常见具体词与抽象词）
  - 6 条高分搭配（collocations）
  - 8 个 Band 7–8 词汇（term / 中文义 / 完整例句）
  - 4 句「为什么它重要」的英文理由句（可插入 P2/P3）
  - 3 句感受/影响句
  - 2 句抽象讨论句（P3 用）
- `TYPE_CUES`：7 种类型的判定线索词（人物/地点/物品/事件/活动/媒体/想法），每种 ≥ 20 个线索（中英）。
- `TYPE_TEMPLATES`：每种类型 × P1/P2/P3 各 ≥ 3 套句式模板 + 中文提纲 4–6 步 + 5 条句式框架。
- `ZH_EN`：≥ 260 条中→英词对（覆盖人物、地点、物品、活动、学习工作、家庭、旅行、科技、情绪、评价等），用于把用户输入的具体名词换成英文。
- `EN_UPGRADES`：≥ 50 组「简单表达 → 高分表达」。
- `STOPWORDS`：中英停用词，避免把「我觉得/然后/那个」当关键词。

### 3.2 中英混写

- 输入里已有的英文句子/短语要尽量**原样保留**并复用（不要翻译成更差的英文）。
- 若输入是纯英文：直接以英文为主料，跳过中文翻译，关键词仍要映射到话题。
- 若输入是纯中文：用 `ZH_EN` 把具体名词、活动、地点换成英文；无法映射时使用安全的泛指（"something I care about" / "this experience"），**绝不能**把中文原样塞进英文句子。

### 3.3 生成质量（重要）

- 模板固定、槽位只插「名词短语 / 完整短句」，保证语法正确。
- 同一素材的多次生成必须**稳定**（用 `hash(rawInput)` 选择模板变体），不能每次刷新都变。
- P2 必须是有信息量的叙述：开场 + 时间/人物 + 2–3 个具体细节 + 为什么重要 + 收尾，段落之间用连接词（To begin with / What makes it stand out is / Looking back / So that's why）。
- 生成文本要包含至少 3 个话题搭配或 Band 7 词汇，避免小学英语。
- **诚实标注**：UI 上必须写「本地引擎生成 · 素材骨架，建议按自己的经历微调」，不得暗示是 AI 大模型联网生成。提供 `buildPolishPrompt` 供用户复制到任意 AI 工具润色。
- 生成结果里不能出现 `{slot}`、`undefined`、`null`、连续两个空格、重复句号。

### 3.4 主题归纳（合并）

`similarMaterials` 判定相近后，UI 默认自动合并（用户可关闭）。合并语义：

1. **要点归纳**：合并两边 `points`，按规范化文本去重，最多保留 8 条；两边都提到的同一件事只留一条更具体的。
2. **关键词/主题**：取并集，重新跑 `detectTopics` 打分，最多 3 个主题。
3. **原文保留**：`rawInput` 追加吸收方原文（用 `\n\n【并入】\n` 分隔），不丢信息。
4. **英文素材**：基于合并后的原文重新 `analyze` 生成（`recompose`），标题沿用保留方。
5. **来源记录**：`mergedFrom` 追加 `{title, at}`；`mergeNote` 形如「归纳自：A、B」。
6. **合并历史**：不得覆盖用户手工改过的标题。

### 3.5 相似度与原因

```
sim = 0.45 * 主题Jaccard + 0.40 * 关键词Jaccard + 0.15 * 类型匹配
```

- 主题 Jaccard 用 `topics` id 集合（权重按 score 归一化也可）。
- 关键词 Jaccard 用 `keywords.zh/en` 归一化集合。
- `reasons` 用中文短语，例如 `["同属「家庭」主题", "共享关键词：外婆、针线、手工"]`。
- 默认阈值 0.45；≥ 0.62 视为「高度相近」，建议直接合并。

## 4. 持久化 API（Lead 实现，UI 直接用）

```js
import * as store from "../store.js";

store.materialsList()            // -> material[]（按 updatedAt 倒序）
store.getMaterial(id)            // -> material | null
store.saveMaterial(material)     // upsert，自动补 id/createdAt/updatedAt，写活动日志
store.deleteMaterial(id)         // 删除，写日志
store.seedMaterials(list)        // 仅在素材库为空时批量写入演示素材
store.materialStats()            // -> { total, topicCount, topics: {topicId: count}, merged }
```

`saveMaterial` 返回保存后的完整对象（含 id）。

## 5. UI 要求（`js/modules/materials.js` + `css/materials.css`）

### 5.1 页面结构（`render(root, app)`，与现有模块一致）

1. **页头**：标题「素材库」+ 副标题说明能力；右侧按钮「新建素材」「手动合并」。
2. **能力条**（3–4 个 stat 小块）：素材总数 / 覆盖主题数 / 已归纳合并数 / 关联真题数。
3. **输入面板**（composer）：
   - 大 textarea（6–8 行），placeholder 给出示例（"外婆的针线盒 / 大学骑行 / 社区图书馆志愿者"）
   - 可选标题输入 + 类型下拉（默认「自动识别」）
   - 复选「主题相近时自动归纳」（默认勾选）
   - 按钮：「生成素材」「仅预览」
   - 预览区：流水线四步（识别主题 / 提取关键词 / 生成英文 / 匹配真题），300ms 内完成，无需 loading 态超过一瞬；
     结果 chips（主题、类型、置信度条）、相近素材提示（含相似度百分比）、「保存」按钮。
4. **筛选条**：搜索、主题下拉、类型下拉、排序（最近更新 / 主题）。
5. **归纳建议条**：启动时扫描全部素材，若存在 ≥ 0.45 的相近对，显示「发现 N 组主题相近的素材」+「查看」→ 弹出合并确认（保留哪条用单选框，默认较早创建的那条）。
6. **素材列表**：卡片显示标题、类型/主题 chips、要点摘要（2 条）、更新时间、关联真题数；点击进入详情。
7. **详情视图**：返回按钮 + 标题 + 元信息；分区展示：
   - 中文要点（可直接编辑并保存）
   - 英文素材：P1 / P2 / P3 三个 tab，显示词数 + 复制按钮
   - 主题与关键词、词汇升级（from → to）、高分搭配、句式框架、中文提纲
   - **匹配真题**：显示 Part 徽章 + 题干 + 「去口语题库」链接（`location.hash = "#/speaking"`）
   - 合并来源与合并历史
   - 操作：编辑原文并重新生成 / 追加内容（把新文本合并进本条）/ 合并到其他素材 / 删除（二次确认）
8. **演示素材**：首次进入且素材库为空时，调用 `store.seedMaterials(SEEDS)`（`material-seeds.js` 导出的原始输入数组 `[{title, input}]`，UI 侧用 `analyze` 生成完整素材），至少 4 条，其中 2 条主题相近，用于展示归纳功能。

### 5.2 交互细节

- 复制用 `navigator.clipboard.writeText`，成功后 `toast("已复制", "ok")`；失败降级为选中文本提示。
- 所有删除/合并都要二次确认（用 `confirmInline` 或自研内联确认），不允许 `window.confirm`。
- 空状态用 `emptyState("material", ...)`（Lead 会加 `material` 图标）。
- 任何 store 写入后调用 `app.refreshChrome()`。
- 键盘可达：tab 顺序合理，按钮有 `aria-label`，展开项用 `<details>` 或 `aria-expanded`。
- 不引入第三方库；只用 `ui.js` 的 `h / panel / badge / icon / esc / emptyState / toast / slicePage / pager / PER_PAGE / statCard / download`。

### 5.3 视觉

- 沿用「白瓷气泡」：白面板 + 天青蓝，圆角胶囊按钮，柔和投影；**不新增颜色**，只用 `--blue / --ok / --warn / --bad / --ink-*` 等 token。
- CSS 全部写在 `css/materials.css`，类名前缀 `mat-`；不要改 `css/style.css`。
- composer 是页面主角：浮起白瓷板，textarea 内高光，生成按钮为蓝色胶囊。
- 英文素材用 `--mono`? 不：正文英文用 `--sans`，行高 1.75，最大宽度 68ch，便于朗读。
- 移动端：单列、按钮换行不溢出；≤430px 时把底部导航气泡缩到 36px（见下）。
- 底部导航新增第 7 个模块后，手机上会挤：在 `css/materials.css` 末尾加：
  ```css
  @media (max-width: 430px) {
    .dock-orb { width: 36px; height: 36px; flex-basis: 36px; }
    .dock-orb .icon svg { width: 18px; height: 18px; }
    .dock-label { font-size: 9px; }
  }
  ```
- 尊重 `prefers-reduced-motion`。

## 6. 验收清单

引擎（`scripts/selftest-materials.mjs`，必须可运行通过）：

- [ ] 5 条样例输入（纯中文 / 纯英文 / 中英混合 / 极短 / 超长）都能返回完整 Draft，无 `undefined`、无空英文
- [ ] P1/P2/P3 词数落在区间内，P2 含 ≥ 2 个连接词
- [ ] 同输入两次 `analyze` 结果完全一致（确定性）
- [ ] 两条明显相近的输入 `similarity ≥ 0.45`；明显无关的两条 `< 0.3`
- [ ] `mergeMaterials` 后 points 去重、rawInput 保留双方、mergedFrom 有记录、英文重新生成且词数合法
- [ ] `matchQuestions` 对「外婆的针线盒」能匹配到「家庭/传统/物品」类真题
- [ ] `buildPolishPrompt` 含原文与三条要求，可直接复制
- [ ] 所有导出函数不修改入参

UI：

- [ ] 输入 → 生成 → 保存 → 列表出现 → 详情可看三档英文 + 匹配真题
- [ ] 输入第二条相近内容 → 自动归纳提示 → 合并后只留一条，原文可在详情里看到
- [ ] 追加内容 → 重新生成 → 词数仍合法
- [ ] 刷新页面后素材仍在（localStorage）
- [ ] 桌面 1440 / 手机 390 宽度下无横向滚动、按钮不重叠
