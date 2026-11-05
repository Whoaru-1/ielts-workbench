/* ============================================================
 * mock-llm.mjs — 本地 OpenAI 兼容 mock（默认 8799 端口）
 *
 * 用途：没有真实 API Key 时联调 AI 助手 UI / Playwright。
 *   GET  /v1/models             → 模型列表
 *   POST /v1/chat/completions   → 首轮返回 tool_calls；
 *                                 收到 role:"tool" 后返回最终中文回答
 *
 * 启动：node scripts/mock-llm.mjs
 *       MOCK_PORT=8799 node scripts/mock-llm.mjs
 *
 * 仅本地开发使用；不校验 API Key，也不会记录 Key。
 * ============================================================ */

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const DEFAULT_PORT = 8799;
const DEFAULT_HOST = "127.0.0.1";
const MODEL = "deepseek-chat";
const TOOL_NAMES = [
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
  "search_writing",
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function lastUserText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.role === "user" && typeof message.content === "string") return message.content;
  }
  return "";
}

function findQuestionId(text) {
  const match = text.match(/\bp[123]-[a-z0-9-]+-\d+\b/i);
  return match ? match[0] : "p2-person-01";
}

function pickTool(text) {
  const content = String(text || "");
  const lower = content.toLowerCase();
  const explicit = TOOL_NAMES.find((name) => lower.includes(name.toLowerCase()));
  if (explicit) return explicit;
  if (/答案|answer/.test(content) && /口语|speaking|part/i.test(content)) return "get_speaking_answer";
  if (/口语|speaking|part\s*[123]|题库/.test(content)) return "search_speaking";
  if (/写作|writing|task\s*[12]|范文/.test(content)) return "search_writing";
  if (/素材|material/.test(content)) {
    if (/列表|看看|有哪些|list/.test(content)) return "list_materials";
    return "create_material";
  }
  if (/加.*词|新增.*词|背.*词|add.*vocab/i.test(content)) return "add_vocab";
  if (/词|vocab/i.test(content)) return "search_vocab";
  if (/任务|计划|task|plan/i.test(content)) {
    if (/看看|查看|列表|有什么|哪些|list/i.test(content)) return "list_tasks";
    return "add_task";
  }
  if (/练习|模考|做题|practice|mock/i.test(content)) return "log_practice";
  if (/概览|进度|统计|目标|今天该练|overview|progress/i.test(content)) return "get_overview";
  return "get_overview";
}

function pickArgs(name, text) {
  const content = String(text || "");
  switch (name) {
    case "search_speaking": {
      let query = "hometown";
      if (/旅行|travel/i.test(content)) query = "travel";
      else if (/工作|work/i.test(content)) query = "work";
      else if (/家庭|family/i.test(content)) query = "family";
      else if (/教育|education|学习/i.test(content)) query = "education";
      const partMatch = content.match(/part\s*([123])|p([123])\b/i);
      const part = partMatch ? Number(partMatch[1] || partMatch[2]) : 2;
      return { query, part, limit: 6 };
    }
    case "get_speaking_answer":
      return { id: findQuestionId(content) };
    case "search_writing": {
      const taskMatch = content.match(/task\s*([12])/i);
      return {
        query: /教育|education/i.test(content) ? "education" : "",
        task: taskMatch ? Number(taskMatch[1]) : 2,
        limit: 6,
      };
    }
    case "search_vocab":
      return { query: /教育|education/i.test(content) ? "education" : "abandon", limit: 8 };
    case "add_vocab":
      return {
        word: "diligent",
        meaning: "勤奋的",
        example: "She is a diligent student who reviews her notes every evening.",
        category: "education",
      };
    case "create_material":
      return {
        text: "外婆的针线盒，她用了四十年，缝过我的校服，也补过爸爸的衬衫。盒子是旧铁皮的，里面还有一张她年轻时的照片。",
        title: "外婆的针线盒",
        autoMerge: true,
      };
    case "add_task":
      return { text: /计划/.test(content) ? "制定本周学习计划" : "完成一套剑桥雅思听力练习" };
    case "list_tasks":
      return {};
    case "list_materials":
      return { limit: 8 };
    case "log_practice":
      return {
        module: /口语|speaking/i.test(content) ? "speaking" : "reading",
        title: "Mock 阅读模考",
        correct: 30,
        total: 40,
        minutes: 60,
        notes: "由 mock-llm 生成的演示记录",
      };
    case "get_overview":
    default:
      return {};
  }
}

function makeUsage(round) {
  return {
    prompt_tokens: 120 + round * 40,
    completion_tokens: 20 + round * 10,
    total_tokens: 140 + round * 50,
  };
}

function toolCallResponse(name, args) {
  return {
    id: `chatcmpl-mock-${Date.now().toString(36)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: MODEL,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: `call_${Date.now().toString(36)}_1`,
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: makeUsage(0),
  };
}

function finalResponse(messages) {
  const toolMessages = messages.filter((message) => message && message.role === "tool");
  const lastTool = toolMessages[toolMessages.length - 1];
  let parsed = null;
  try {
    parsed = lastTool ? JSON.parse(lastTool.content) : null;
  } catch {
    parsed = null;
  }
  let detail = "";
  if (parsed && parsed.ok) {
    const data = parsed.data || {};
    if (data.action === "merged") detail = `素材已归纳到「${data.title}」，相似度 ${Math.round((data.similarity || 0) * 100)}%。`;
    else if (data.title) detail = `素材「${data.title}」已保存。`;
    else if (data.word) detail = `单词「${data.word}」已处理。`;
    else if (data.task && data.task.text) detail = `任务「${data.task.text}」已加入计划。`;
    else if (data.vocab && data.targetBand != null) {
      detail = `目标 ${data.targetBand} 分，词汇 ${data.vocab.total} 个，连续打卡 ${data.streakDays ?? 0} 天，今日任务 ${(data.todayTasks || []).length} 条。`;
    } else if (Array.isArray(data.items)) detail = `共查到 ${data.total ?? data.items.length} 条结果。`;
    else if (data.total != null) detail = `共查到 ${data.total} 条结果。`;
    else detail = "工具已经返回结果。";
  } else if (parsed && parsed.error) {
    detail = `工具执行失败：${parsed.error}`;
  } else {
    detail = "工具已经返回结果。";
  }
  return {
    id: `chatcmpl-mock-${Date.now().toString(36)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: MODEL,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: `已经帮你处理好了。${detail}需要我继续安排下一步吗？`,
        },
        finish_reason: "stop",
      },
    ],
    usage: makeUsage(1),
  };
}

export function createMockServer() {
  return createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
      response.writeHead(204, CORS_HEADERS);
      response.end();
      return;
    }
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && (url.pathname === "/v1/models" || url.pathname === "/models")) {
      sendJson(response, 200, {
        object: "list",
        data: [
          { id: MODEL, object: "model", owned_by: "mock" },
          { id: "mock-chat", object: "model", owned_by: "mock" },
        ],
      });
      return;
    }
    if (request.method === "POST" && (url.pathname === "/v1/chat/completions" || url.pathname === "/chat/completions")) {
      let body;
      try {
        body = await readBody(request);
      } catch {
        sendJson(response, 400, { error: { message: "Invalid JSON body", type: "invalid_request_error" } });
        return;
      }
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const toolMessages = messages.filter((message) => message && message.role === "tool");
      if (toolMessages.length > 0) {
        sendJson(response, 200, finalResponse(messages));
        return;
      }
      const name = pickTool(lastUserText(messages));
      sendJson(response, 200, toolCallResponse(name, pickArgs(name, lastUserText(messages))));
      return;
    }
    sendJson(response, 404, { error: { message: "Not found", type: "invalid_request_error" } });
  });
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const port = Number(process.env.MOCK_PORT) || DEFAULT_PORT;
  const host = process.env.MOCK_HOST || DEFAULT_HOST;
  const server = createMockServer();
  server.listen(port, host, () => {
    console.log(`Mock OpenAI-compatible LLM listening on http://${host}:${port}/v1`);
    console.log(`Base URL: http://${host}:${port}/v1 · Model: ${MODEL}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
