# 站内 AI Agent · 技术契约与 UI 规范

> 目标：给 IELTS 工作台增加一个侧栏「AI 助手」模块。它不是普通聊天框，而是**能调用工具、真正读写工作台数据**的 Agent：
> 查进度、搜题库、加单词、建素材、排任务、记练习。
> 纯前端实现，DeepSeek API 已确认支持浏览器 CORS（`https://api.deepseek.com`），无需后端。

## 0. 分工与文件所有权

| 角色 | 只允许改这些文件 |
|---|---|
| Lead | `js/app.js`、`index.html`、`js/ui.js`、`js/modules/dashboard.js`、`README.md`、`version.json`、`docs/*`、最终 QA 脚本 |
| Agent Core | `js/agent/agent-core.js`、`js/agent/tools.js`、`js/agent/prompts.js`、`scripts/test-agent.mjs`、`scripts/mock-llm.mjs` |
| Agent UI | `js/modules/agent.js`、`css/agent.css` |

不要改别人的文件；需要 Lead 改动时写进交付说明。

## 1. 设置与存储

```js
// js/agent/agent-core.js
export const DEFAULT_AGENT_CONFIG = {
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  apiKey: "",
  temperature: 0.7,
  maxToolRounds: 6
};
export function normalizeAgentConfig(raw) -> config  // 去空格、补默认、校验 http(s)
```

- 配置存在 `localStorage["ielts-workbench:agent-config-v1"]`（含 apiKey）。
- **apiKey 只存浏览器本地**，不进入 `store.exportJSON()`；设置里必须提示这一点。
- 对话存在 `localStorage["ielts-workbench:agent-chat-v1"]`，只保留最近 40 条消息。
- 不允许把 apiKey 写进日志、toast、消息内容或 URL。

## 2. 核心 API（Agent UI 只依赖这些）

```js
/**
 * 跑一轮 Agent（可能包含多轮工具调用）。
 * @param {object} opts
 * @param {object} opts.config   已经 normalize 的配置
 * @param {Array<{role:'user'|'assistant',content:string}>} opts.history 完整对话（不含 system/tool）
 * @param {(event:object)=>void} opts.onEvent
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{
 *   content: string,                 // 最终中文回答
 *   history: Array,                  // 输入 history + 最终 assistant 消息
 *   usage: {prompt_tokens,completion_tokens,total_tokens}|null,
 *   steps: number,                   // 实际工具轮次
 *   toolCalls: Array<{name,args,ok,summary}>
 * }>}
 */
export async function runAgent({ config, history, onEvent, signal }) { ... }
```

事件类型：

```js
{ type: "status", text: "正在思考…" }
{ type: "tool-start", name: "search_speaking", args: {...} }
{ type: "tool-end", name: "search_speaking", ok: true, summary: "找到 6 道题" }
{ type: "usage", usage: {...} }
```

错误统一抛出 `Error`，message 为中文可读文案：
- 401 → `API Key 无效或已过期，请在设置里重新填写`
- 429 → `请求过于频繁或余额不足，请稍后再试`
- 网络/CORS → `无法连接模型服务（检查 Base URL 与网络）`
- 工具轮次超限 → `工具调用轮次过多，已停止`

实现要求：
- 非流式 `POST {baseUrl}/chat/completions`，`Authorization: Bearer <key>`；
- `tools` 用 OpenAI 格式，`tool_choice:"auto"`；
- 最多 `maxToolRounds` 轮；每轮把 `tool_calls` 逐个执行，结果以 `{role:"tool", tool_call_id, content}` 回填；
- 工具返回给模型的 JSON 必须精简（≤ 2000 字符），避免上下文爆炸；
- `signal` 要透传给 fetch；abort 时抛 `AbortError`。

## 3. 工具（`js/agent/tools.js`）

导出：

```js
export const TOOL_DEFINITIONS = [ { type:"function", function:{ name, description, parameters } } ];
export async function executeTool(name, args) -> { ok:true, data } | { ok:false, error };
export function toolLabel(name) -> string; // 中文名，UI 显示用
```

工具清单（全部基于现有 `store` / `question-bank` / 素材引擎）：

| name | 参数 | 作用 |
|---|---|---|
| `get_overview` | — | 目标分、考试日/倒计时、词汇统计、练习统计、口语/写作/素材数量、连续打卡、今日任务、最近日志 |
| `search_vocab` | `query?`, `status?`(new/learning/mastered), `category?`, `limit?` | 搜索/筛选词汇 |
| `add_vocab` | `word*`, `meaning*`, `example?`, `category?` | 新增单词；已存在则返回 duplicate |
| `search_speaking` | `query?`, `part?`(1/2/3), `limit?` | 搜口语题库（含是否已练/是否有答案） |
| `get_speaking_answer` | `id*` | 取某题高分答案 |
| `list_materials` | `query?`, `limit?` | 素材列表摘要 |
| `create_material` | `text*`, `title?`, `autoMerge?`(默认 true) | 调 `analyze` 生成素材；命中相近素材时按 autoMerge 合并；返回标题/主题/相似度 |
| `add_task` | `text*`, `date?`(YYYY-MM-DD，默认今天) | 添加今日/指定日计划 |
| `list_tasks` | `date?` | 查看任务与完成状态 |
| `log_practice` | `module*`(listening/reading/writing/speaking), `title*`, `correct*`, `total*`, `minutes?`, `notes?` | 记录一次练习（听读自动估分） |

约束：
- 所有写操作必须调用 `store` 的既有函数（自动写活动日志、持久化）。
- `executeTool` 不抛错给模型；任何异常转成 `{ok:false,error:"中文原因"}`。
- 参数校验严格；缺必填返回 `{ok:false,error:"缺少参数 word"}`。
- 搜索结果做摘要（题干截断 160 字符、答案截断 1200 字符）。
- 不要提供删除工具。
- 日期工具默认用 `store.todayKey()`。

## 4. 系统提示词（`js/agent/prompts.js`）

```js
export function buildSystemPrompt() -> string
```

必须包含：
- 角色：IELTS 备考教练 + 工作台助手，中文回答（英文例句除外）。
- 当前用户数据摘要（目标分、考试日、词汇量、练习次数、素材数、今日任务、连续打卡）。
- 规则：
  1. 任何数据变更必须先调用对应工具，禁止“假装已完成”；
  2. 不编造用户数据，不确定时先 `get_overview` / `search_*`；
  3. 没有删除工具，用户要删除时引导去对应页面；
  4. 给素材/范文时提醒“英文是脚手架，按自己的经历微调”；
  5. 回答简洁、可执行，优先列表；一次最多问一个澄清问题；
  6. 永不输出 API Key。
- 今天的日期（`new Date()` 本地日期）。

## 5. UI 要求（`js/modules/agent.js` + `css/agent.css`）

### 5.1 页面结构

1. **页头**：标题「AI 助手」+ 副标题；右侧「设置」按钮与模型徽章（`deepseek-chat`）。
2. **会话区**：
   - 空状态：一句说明 + 5 个快捷提示 chips：
     「今天该练什么？」「帮我制定本周计划」「给我 3 个 Part 2 素材」「检查我的词汇进度」「批改这段作文：」
   - 消息气泡：用户右侧（蓝底白字），助手左侧（白瓷卡）；支持轻量 Markdown（**粗体**、`代码`、有序/无序列表、换行）；所有文本先 `esc()`。
   - 工具轨迹：助手消息下方可折叠「调用了 N 个工具」，列出 `toolLabel · 参数摘要 · 结果摘要`。
   - 正在运行：显示「正在思考…」/「正在调用 search_speaking…」；有「停止」按钮（AbortController）。
   - 每条助手消息右下角显示 token 用量（若返回）。
3. **输入区**：多行 textarea 自适应高度；`Enter` 发送、`Shift+Enter` 换行；发送按钮；运行中禁用。
4. **设置面板**（同页右侧抽屉或内联卡）：
   - Base URL（默认 `https://api.deepseek.com/v1`，提示可填任意 OpenAI 兼容端点，如本地 Ollama）
   - 模型（默认 `deepseek-chat`）
   - API Key（password 输入）
   - 温度（0–1.5，默认 0.7）
   - 「保存」「测试连接」「清除 Key」
   - 隐私提示：Key 只存在本浏览器，不会进导出 JSON、不会上传到本项目服务器。
   - 获取 Key 的链接：`https://platform.deepseek.com/api_keys`
5. **会话操作**：「清空对话」；刷新后保留最近 40 条。

### 5.2 无 Key / 出错

- 无 Key：顶部显示设置引导卡（不白屏），快捷提示仍可点但发送时提示先填 Key。
- 401/429/网络错误：在对话流里插入一条红色系统提示，保留用户消息，可重试。
- 「测试连接」：`GET {baseUrl}/models`（带 Bearer），200 显示「连接成功 · 模型可用」，失败显示可读原因。

### 5.3 视觉

- 沿用白瓷气泡：白面板、天青蓝用户气泡、胶囊按钮、柔和投影。
- 类名前缀 `agent-`；样式全部写在 `css/agent.css`，不改 `style.css`。
- 桌面：聊天区 + 右侧设置栏（≥1100px 双栏，窄屏设置折叠成抽屉/卡片）。
- 移动端：单列，输入区吸底（不要遮住底部导航，预留 88px）。
- 尊重 `prefers-reduced-motion`。
- 不要引入第三方库；用 `ui.js` 的 `h / panel / badge / icon / esc / toast / emptyState`。

## 6. 交付与验收

Agent Core：
- [ ] `node scripts/test-agent.mjs` 通过（tools 全量 + runAgent 假 fetch 工具循环 + 错误映射）
- [ ] `node scripts/mock-llm.mjs` 可在 8799 启动，模拟工具调用
- [ ] 不改其他文件；工具不抛错；apiKey 不进日志

Agent UI：
- [ ] `node --check js/modules/agent.js`
- [ ] 输入 → 发送 → 工具轨迹 → 最终回答；停止按钮有效；刷新后对话保留
- [ ] 设置保存/测试连接/清空 Key/清空对话
- [ ] 1440 / 390 宽度无横向滚动

Lead：
- [ ] `js/app.js` 路由 `agent` + 导航图标；`index.html` 引入 `css/agent.css`；看板加入「AI 助手」气泡
- [ ] 浏览器端到端（mock LLM）截图验收
- [ ] README、version.json 1.2.0
