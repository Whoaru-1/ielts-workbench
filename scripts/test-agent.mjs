/* ============================================================
 * test-agent.mjs — AI Agent 核心自测（Node）
 *
 * 运行：node scripts/test-agent.mjs
 *
 * 说明：store.js 在模块加载时读取 localStorage，因此必须先
 * 安装内存 shim，再动态 import store / tools / agent-core。
 * ============================================================ */

import assert from "node:assert/strict";

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  get length() {
    return this.map.size;
  }
  key(index) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  getItem(key) {
    const value = this.map.get(String(key));
    return value === undefined ? null : value;
  }
  setItem(key, value) {
    this.map.set(String(key), String(value));
  }
  removeItem(key) {
    this.map.delete(String(key));
  }
  clear() {
    this.map.clear();
  }
}

globalThis.localStorage = new MemoryStorage();

const store = await import("../js/store.js");
store.resetAll();
const { TOOL_DEFINITIONS, executeTool, toolLabel, toolSummary } = await import("../js/agent/tools.js");
const core = await import("../js/agent/agent-core.js");
const { buildSystemPrompt } = await import("../js/agent/prompts.js");

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

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function toolCallPayload(name, args, id = "call_1") {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            { id, type: "function", function: { name, arguments: JSON.stringify(args) } },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
  };
}

function finalPayload(content) {
  return {
    id: "chatcmpl-final",
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
  };
}

async function main() {
  /* ------------------------------------------------------------
   * 1. 配置归一化 / 存取
   * ------------------------------------------------------------ */
  const normalized = core.normalizeAgentConfig({
    baseUrl: "  http://localhost:8799/v1/  ",
    model: "  ",
    apiKey: "  sk-test-config  ",
    temperature: 9,
    maxToolRounds: 99,
  });
  eq(normalized.baseUrl, "http://localhost:8799/v1", "配置 Base URL 去空格去尾斜杠");
  eq(normalized.model, "deepseek-chat", "配置缺模型时补默认值");
  eq(normalized.apiKey, "sk-test-config", "配置 API Key 去空格");
  eq(normalized.temperature, 1.5, "temperature 上限 1.5");
  eq(normalized.maxToolRounds, 6, "maxToolRounds 上限 6");

  const invalidUrl = core.normalizeAgentConfig({ baseUrl: "ftp://example.com" });
  eq(invalidUrl.baseUrl, "https://api.deepseek.com/v1", "非法 Base URL 回退默认值");
  eq(core.normalizeAgentConfig({ maxToolRounds: 0 }).maxToolRounds, 1, "maxToolRounds 下限 1");
  eq(core.normalizeAgentConfig({ temperature: -1 }).temperature, 0, "temperature 下限 0");

  core.saveAgentConfig({ ...normalized, apiKey: "sk-storage-secret" });
  eq(core.loadAgentConfig().apiKey, "sk-storage-secret", "配置写入并可读回");
  ok(!store.exportJSON().includes("sk-storage-secret"), "API Key 不进入 store.exportJSON()");
  core.clearAgentConfig();
  eq(core.loadAgentConfig().apiKey, "", "清除配置后 Key 为空");

  /* ------------------------------------------------------------
   * 2. 工具定义
   * ------------------------------------------------------------ */
  eq(TOOL_DEFINITIONS.length, 11, "工具数量为 11");
  const toolNames = TOOL_DEFINITIONS.map((definition) => definition.function.name);
  const requiredTools = [
    "get_overview",
    "search_vocab",
    "add_vocab",
    "search_speaking",
    "get_speaking_answer",
    "list_materials",
    "create_material",
    "add_task",
    "list_tasks",
    "log_practice",
  ];
  ok(requiredTools.every((name) => toolNames.includes(name)), "spec 中的 10 个工具全部存在");
  ok(toolNames.includes("search_writing"), "额外只读工具 search_writing 存在");
  ok(!toolNames.some((name) => /delete|remove/i.test(name)), "不提供删除工具");
  ok(
    TOOL_DEFINITIONS.every(
      (definition) =>
        definition.type === "function" &&
        definition.function &&
        typeof definition.function.description === "string" &&
        definition.function.parameters &&
        definition.function.parameters.type === "object"
    ),
    "所有工具定义符合 OpenAI function 格式"
  );
  eq(toolLabel("get_overview"), "学习概览", "toolLabel 返回中文名");
  eq(toolLabel("unknown_tool"), "unknown_tool", "未知 toolLabel 回退原名");

  /* ------------------------------------------------------------
   * 3. 所有工具读写（写操作走 store）
   * ------------------------------------------------------------ */
  store.updateSettings({ targetBand: 7, examDate: "2026-12-01" });

  const overview = await executeTool("get_overview", {});
  ok(overview.ok, "get_overview 执行成功");
  eq(overview.data.vocab.total, 0, "初始词汇量为 0");
  eq(overview.data.targetBand, 7, "概览读取目标分");
  eq(overview.data.todayTasks.length, 0, "概览读取今日任务");

  const addWord = await executeTool("add_vocab", {
    word: "abandon",
    meaning: "放弃",
    example: "He abandoned the plan after one week.",
    category: "education",
  });
  ok(addWord.ok && addWord.data.duplicate === false, "add_vocab 新增单词");
  eq(store.vocabStats().total, 1, "新增单词已写入 store");

  const duplicate = await executeTool("add_vocab", { word: "Abandon", meaning: "放弃" });
  ok(duplicate.ok && duplicate.data.duplicate === true, "add_vocab 对重复单词返回 duplicate");

  const searchVocab = await executeTool("search_vocab", { query: "aband", limit: 5 });
  ok(searchVocab.ok && searchVocab.data.total === 1, "search_vocab 能搜到新增单词");
  ok(searchVocab.data.items[0].example.length <= 160, "search_vocab 例句已截断");
  eq((await executeTool("search_vocab", { status: "bad" })).ok, false, "search_vocab 拒绝非法 status");

  const addTask = await executeTool("add_task", { text: "练习 Part 2 描述人物" });
  ok(addTask.ok, "add_task 添加任务");
  eq(store.tasksOf().length, 1, "任务已写入 store");
  const listTasks = await executeTool("list_tasks", {});
  ok(listTasks.ok && listTasks.data.tasks[0].text.includes("Part 2"), "list_tasks 能读回任务");
  ok((await executeTool("add_task", { text: "x", date: "2026/01/01" })).ok === false, "add_task 拒绝非法日期");

  const practice = await executeTool("log_practice", {
    module: "reading",
    title: "剑桥雅思 18 Test 1",
    correct: 30,
    total: 40,
    minutes: 60,
  });
  ok(practice.ok, "log_practice 记录练习");
  eq(practice.data.band, 7, "阅读 30/40 自动估分 7.0");
  eq(store.practiceList().length, 1, "练习记录已写入 store");
  ok((await executeTool("log_practice", { module: "reading", title: "x", correct: 50, total: 40 })).ok === false, "log_practice 校验 correct ≤ total");

  const materialText = "外婆的针线盒，她用了四十年，缝过我的校服，也补过爸爸的衬衫。盒子是旧铁皮的，里面还有一张她年轻时的照片。";
  const created = await executeTool("create_material", { text: materialText, title: "测试针线盒", autoMerge: false });
  ok(created.ok && created.data.action === "created", "create_material 创建素材");
  eq(store.materialsList().length, 1, "素材已写入 store");
  const merged = await executeTool("create_material", { text: materialText, title: "测试针线盒二", autoMerge: true });
  ok(merged.ok && merged.data.action === "merged", "create_material 命中相近素材时自动归纳");
  eq(store.materialsList().length, 1, "自动归纳后素材仍为 1 条");
  ok(merged.data.similarity >= 0.45, "归纳结果带相似度");
  const materials = await executeTool("list_materials", {});
  ok(materials.ok && materials.data.total === 1, "list_materials 能列出素材");

  const speaking = await executeTool("search_speaking", { query: "hometown", part: 1, limit: 5 });
  ok(speaking.ok && speaking.data.items.length > 0, "search_speaking 能搜到题目");
  ok(speaking.data.items[0].question.length <= 160, "search_speaking 题干已截断");
  const answer = await executeTool("get_speaking_answer", { id: speaking.data.items[0].id });
  ok(answer.ok && answer.data.hasAnswer === true, "get_speaking_answer 返回高分答案");
  ok(answer.data.answer.length <= 1200, "口语答案截断到 1200 字符");
  eq((await executeTool("get_speaking_answer", { id: "no-such-id" })).ok, false, "get_speaking_answer 对未知 id 返回错误");

  const writing = await executeTool("search_writing", { query: "education", task: 2, limit: 5 });
  ok(writing.ok && writing.data.items.length > 0, "search_writing 能搜到写作题");
  ok(writing.data.items.every((item) => item.task === 2), "search_writing 按 Task 过滤");

  eq((await executeTool("not_a_tool", {})).ok, false, "未知工具返回 ok:false");
  eq((await executeTool("add_vocab", {})).ok, false, "缺少必填参数返回 ok:false");
  eq((await executeTool("get_overview", "bad-args")).ok, false, "非对象参数返回 ok:false");

  for (const definition of TOOL_DEFINITIONS) {
    let result;
    try {
      result = await executeTool(definition.function.name, {});
    } catch (error) {
      assert.fail(`${definition.function.name} 抛错：${error.message}`);
    }
    ok(result && typeof result.ok === "boolean", `${definition.function.name} 永不抛错`);
  }

  /* ------------------------------------------------------------
   * 4. 系统提示词
   * ------------------------------------------------------------ */
  const prompt = buildSystemPrompt();
  for (const keyword of ["目标分", "考试日", "词汇", "练习", "素材", "今日任务", "连续打卡", "get_overview", "API Key", "六条"]) {
    ok(prompt.includes(keyword), `系统提示词包含「${keyword}」`);
  }
  ok(prompt.includes("2026-12-01"), "系统提示词包含考试日");

  /* ------------------------------------------------------------
   * 5. runAgent 两轮工具循环（假 fetch）
   * ------------------------------------------------------------ */
  const config = core.normalizeAgentConfig({
    baseUrl: "http://mock.local/v1",
    model: "deepseek-chat",
    apiKey: "sk-secret-test-key",
    maxToolRounds: 6,
  });
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    if (requests.length === 1) {
      return jsonResponse(toolCallPayload("get_overview", {}, "call_overview"));
    }
    if (requests.length === 2) {
      return jsonResponse(toolCallPayload("add_task", { text: "练习 Part 2 描述人物" }, "call_task"));
    }
    return jsonResponse(finalPayload("已经帮你把任务加好了。"));
  };

  const events = [];
  const result = await core.runAgent({
    config,
    history: [{ role: "user", content: "先看进度，再帮我加一个 Part 2 任务" }],
    onEvent: (event) => events.push(event),
    signal: undefined,
  });
  eq(result.content, "已经帮你把任务加好了。", "runAgent 返回最终中文回答");
  eq(result.steps, 2, "runAgent 实际工具轮次为 2");
  eq(result.toolCalls.length, 2, "runAgent 累计 2 个工具调用");
  eq(result.toolCalls[0].name, "get_overview", "第 1 个工具是 get_overview");
  eq(result.toolCalls[1].name, "add_task", "第 2 个工具是 add_task");
  ok(result.toolCalls.every((call) => call.ok === true), "两轮工具调用均成功");
  eq(result.history.length, 2, "返回 history = 原 history + assistant");
  eq(result.history[1].role, "assistant", "history 最后一条是 assistant");
  eq(result.usage.total_tokens, 290, "usage 累计了三次模型调用（110 + 110 + 70）");
  ok(store.tasksOf().some((task) => task.text.includes("Part 2")), "runAgent 的工具写操作真实生效");

  const expectedEvents = [
    "status",
    "tool-start",
    "tool-end",
    "usage",
    "status",
    "tool-start",
    "tool-end",
    "usage",
    "status",
    "usage",
  ];
  eq(events.map((event) => event.type).join(","), expectedEvents.join(","), "runAgent 事件序列正确");
  ok(events.filter((event) => event.type === "tool-start").every((event) => typeof event.name === "string"), "tool-start 事件带工具名");
  ok(events.filter((event) => event.type === "tool-end").every((event) => typeof event.summary === "string"), "tool-end 事件带中文摘要");

  eq(requests.length, 3, "两轮工具循环共 3 次模型请求");
  ok(requests.every((request) => request.url.endsWith("/chat/completions")), "请求地址为 /chat/completions");
  ok(requests.every((request) => request.body.tool_choice === "auto"), "请求携带 tool_choice:auto");
  eq(requests[0].body.tools.length, 11, "请求携带 11 个工具定义");
  eq(requests[0].body.messages[0].role, "system", "请求首条消息是 system");
  ok(requests[1].body.messages.some((message) => message.role === "tool" && message.tool_call_id === "call_overview"), "工具结果以 role:tool 回填");
  ok(requests[1].body.messages.some((message) => message.role === "assistant" && Array.isArray(message.tool_calls)), "assistant tool_calls 回填到请求");
  ok(requests.every((request) => request.options.headers.Authorization === "Bearer sk-secret-test-key"), "Authorization 只在请求头");
  ok(
    requests.every((request) => !JSON.stringify(request.body).includes("sk-secret-test-key")),
    "apiKey 不出现在任何 message content / 请求体"
  );
  ok(!JSON.stringify(result.history).includes("sk-secret-test-key"), "apiKey 不出现在返回 history");
  ok(
    requests.every((request) =>
      request.body.messages.filter((message) => message.role === "tool").every((message) => message.content.length <= 2000)
    ),
    "工具结果 JSON 不超过 2000 字符"
  );

  /* ------------------------------------------------------------
   * 6. abort
   * ------------------------------------------------------------ */
  let fetchCalled = 0;
  globalThis.fetch = async () => {
    fetchCalled += 1;
    return jsonResponse(finalPayload("不应该到这里"));
  };
  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(
    () => core.runAgent({ config, history: [], signal: preAborted.signal }),
    (error) => error && error.name === "AbortError",
    "已 aborted 的 signal 直接抛 AbortError"
  );
  eq(fetchCalled, 0, "预中止时不会发起网络请求");
  ok(true, "runAgent 支持预中止");

  globalThis.fetch = (url, options = {}) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(jsonResponse(finalPayload("迟到"))), 1000);
      options.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  const controller = new AbortController();
  const pending = core.runAgent({ config, history: [], signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, (error) => error && error.name === "AbortError", "运行中 abort 抛 AbortError");
  ok(true, "runAgent 支持运行中 abort");

  /* ------------------------------------------------------------
   * 7. 错误映射 / 轮次超限
   * ------------------------------------------------------------ */
  globalThis.fetch = async () => jsonResponse({ error: { message: "unauthorized" } }, 401);
  await assert.rejects(
    () => core.runAgent({ config, history: [] }),
    (error) => error.message === "API Key 无效或已过期，请在设置里重新填写",
    "401 映射为 Key 无效文案"
  );
  ok(true, "401 错误映射正确");

  globalThis.fetch = async () => jsonResponse({ error: { message: "rate limit" } }, 429);
  await assert.rejects(
    () => core.runAgent({ config, history: [] }),
    (error) => error.message === "请求过于频繁或余额不足，请稍后再试",
    "429 映射为频率/余额文案"
  );
  ok(true, "429 错误映射正确");

  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(
    () => core.runAgent({ config, history: [] }),
    (error) => error.message === "无法连接模型服务（检查 Base URL 与网络）",
    "网络错误映射为连接文案"
  );
  ok(true, "网络错误映射正确");

  let limitCalls = 0;
  globalThis.fetch = async () => {
    limitCalls += 1;
    return jsonResponse(toolCallPayload("get_overview", {}));
  };
  await assert.rejects(
    () => core.runAgent({ config: { ...config, maxToolRounds: 2 }, history: [] }),
    (error) => error.message === "工具调用轮次过多，已停止",
    "工具轮次超限抛出中文错误"
  );
  eq(limitCalls, 3, "maxToolRounds=2 时最多执行 2 轮工具调用");
  ok(true, "工具轮次超限已停止");

  const noKey = core.normalizeAgentConfig({ ...config, apiKey: "" });
  await assert.rejects(
    () => core.runAgent({ config: noKey, history: [] }),
    (error) => error.message.includes("API Key"),
    "缺少 API Key 时给出中文提示"
  );
  ok(true, "无 Key 错误提示正确");

  globalThis.fetch = async () => jsonResponse({ object: "list", data: [{ id: "deepseek-chat" }] });
  const connection = await core.testAgentConnection(config);
  ok(connection.ok && connection.models.includes("deepseek-chat"), "testAgentConnection 能读取 /models");

  console.log(`\n全部通过：${passed} 项断言 ✓`);
}

try {
  await main();
} catch (error) {
  console.error("\n✗ Agent 自测失败：", error && error.message ? error.message : error);
  if (error && error.stack) console.error(error.stack);
  process.exit(1);
}
